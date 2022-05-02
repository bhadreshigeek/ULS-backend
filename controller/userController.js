const admin = require("firebase-admin");
const {
  User,
  Setting,
  Code,
  CodeHistory,
  Product,
  StripePayment,
  ApiKey,
} = require("../database/database");

const { sendMail } = require("../utils/sendMail");
const moment = require("moment");
const crypto = require("crypto");
const { addToMailchimpList } = require("../utils/mailchimp");
const htmlMail = require("../utils/htmlMail");
const { StripeClient } = require("./stripeController");
const { base64encode, base64decode } = require('nodejs-base64');

function generateResetPasswordToken() {
  const resetToken = crypto.randomBytes(15).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  return resetToken;
}

exports.singUp = async (req, res) => {
  try {
    const firstname = req.body.firstname;
    const lastname = req.body.lastname;
    const reqEmail = req.body.email;
    const accountNotes = "";
    // const subscription_data = req.body.subscription_data;
    const password = req.body.password;
    const devices = [];
    const purchased = [];
    const resetPasswordToken = "";
    const expire_on = "";
    const created_at = new Date();
    const updated_at = new Date();
    const is_deleted = false;
    const redeemCode = req.body.code.trim();
    const activatedAt = req.body.activated_at;
    
    if (!(reqEmail && password)) {
      return res.status(400).json({
        error: "Please provide credentials",
        success: false,
      });
    }
    const email = reqEmail.toLowerCase();
    const code = await Code.where("code", "==", redeemCode.trim())
      .where("is_deleted", "==", false)
      .get();
    const codeData = code.docs.map((e) => {
      return { ...e.data(), id: e.id };
    });
    if (codeData.length < 1) {
      return res.status(400).json({
        error: "code not found",
        success: false,
      });
    }
    const now = moment().format("YYYY-MM-DD");
    const codeHistory = await CodeHistory.where(
      "code",
      "==",
      redeemCode.trim()
    ).get();
    for (c of codeHistory.docs) {
      if (c.data().activation) {
        return res.status(400).json({
          error: "Code already in use",
          success: false,
        });
      }
    }

    const settings = await Setting.where("is_deleted", "==", false).get();
    const settingData = settings.docs.map((s) => {
      return {
        id: s.id,
        ...s.data(),
      };
    });

    const default_subscription =
      settingData[0].default_subscription_plan || "0 days";
    const default_duration = default_subscription
      .toLowerCase()
      .replace("s", "");
    const splitted_string = default_duration.split(" ");

    let subscriptioData = {
      active: false,
      activated_at: "",
      expiration_date: "",
      comments: "",
    };
    
    const products_to_activate = codeData[0].products_to_activate;
    const monthData = codeData[0].duration.toLowerCase().replace("s","");
    const month = monthData === "None" ? 0 : Number(monthData.split(" ")[0]);
    const unit = monthData === "None" ? null : monthData.split(" ")[1];
    
    let activeCount = [];
    if (month !== 0) {
      const product = products_to_activate.map((pTa) => {
        return {
          id: pTa.id,
          activeCount: 0,
          data: {},
          apps: pTa.apps.map((app) => {
            return {
              id: app.id,
              data: {},
              launches_since_activation: 0,
              last_used: new Date(),
              notes: "",
              code_used: app.isChecked ? redeemCode : "",
              activated_on: app.isChecked ? new Date() : "",
              active: app.isChecked,
            };
          }),
          features: pTa.features.map((feature) => {
            return {
              id: feature.id,
              data: {},
              launches_since_activation: 0,
              last_used: new Date(),
              notes: "",
              code_used: feature.isChecked ? redeemCode : "",
              activated_on: feature.isChecked ? new Date() : "",
              active: feature.isChecked,
            };
          }),
        };
      });
      activeCount = product.map((e) => {
        return {
          ...e,
          activeCount:
            e.apps.filter((a) => a.active).length +
            e.features.filter((f) => f.active).length,
        };
      });
    }
    let authuser = ""
    try {
      authuser = await admin
        .auth()
        .createUser({ email: email, password: password });
    } catch (error) {
      if(error.errorInfo.message === "The email address is already in use by another account."){
        return res.status(400).json({
          error: "This email already has an account associated with it, please try logging in or reset your password.",
          success: false
        })
      }
    }
    
    let expiryDate = moment().format("YYYY-MM-DD");

    if(unit && month){
      expiryDate = moment(expiryDate)
      .add(month, unit[0].toUpperCase())
      .format("YYYY-MM-DD");
    }

    if (
      unit && month !== 0
    ) {
      subscriptioData = {
        active: true,
        activated_at: String(moment().toISOString()),
        expiration_date: String(expiryDate),
        comments: "",
      };
      await CodeHistory.add({
        code: "Subscription",
        activation: true,
        special_code: true,
        product_activated: products_to_activate,
        activated_at: moment().format("YYYY-MM-DD"),
        expiry_date: moment()
          .add(Number(splitted_string[0]), splitted_string[1] + "s")
          .format("YYYY-MM-DD"),
        purchase_location: settingData[0].default_purchase_location,
        user_id: authuser.uid,
        is_email_send: false,
      });
    }

    await User.doc(authuser.uid).set({
      firstname,
      lastname,
      email,
      accountNotes,
      subscription_data: subscriptioData,
      password,
      devices,
      purchased,
      resetPasswordToken,
      expire_on,
      role: 3,
      created_at,
      updated_at,
      activated_at: activatedAt,
      is_deleted,
      active_subscription: false,
      auto_product_active: false,
    });

    const user = await User.doc(authuser.uid).get();
    const userData = user.data();
    await User.doc(authuser.uid).update({ purchased: activeCount });
   

    if (month !== 0) {
      await CodeHistory.add({
        code: redeemCode,
        activation: true,
        special_code: false,
        product_activated: products_to_activate,
        activated_at: moment().format("YYYY-MM-DD"),
        expiry_date: expiryDate,
        purchase_location: null,
        user_id: authuser.uid,
        is_email_send: false,
      });
    }

    const mailchimpDetails = {
      purchased: activeCount,
      email,
      firstname,
      lastname,
    };

    addToMailchimpList(mailchimpDetails);

    await Code.doc(codeData[0].id).set({
      ...codeData[0],
      activation: false,
      already_used: true,
      user_id: authuser.uid,
      activated_by: email,
    });

    const u = await User.doc(authuser.uid).get();
    const userDatas = {
      id: u.id,
      ...u.data(),
    };
    const newProduct = products_to_activate
      .filter((a) => a.activeCount > 0)
      .map((e) => {
        let productText = "Product Name : " + e.title;

        const activatedApps = e.apps
          .map((i) => i.isChecked && i.title)
          .filter((a) => a);

        const activatedFeatures = e.features
          .map((f) => f.isChecked && f.title)
          .filter((a) => a);

        if (activatedApps.length > 0) {
          productText += " <br/>Apps :  " + activatedApps.join();
        }
        if (activatedFeatures.length > 0) {
          productText += " <br/>Features : " + activatedFeatures.join();
        }
        return productText;
      });

    let body =
      "<p>Hello, and thanks for activating your ThoughtCast Magic account. From now on, you can visit thoughtcastmagic.com/owners to view your purchases, purchase other tricks from us, as well as access all of your instructions for any tricks you have purchased so far.  Also,  this username and password are the same ones you will use to log into the various ThoughtCast Magic apps you have purchased</p>" +
      "<p>If you have any questions at any time, just hit reply to this email, or email us at support@thoughtcastmagic.com and we'll get back to you as soon as possible.</p>" +
      "<p>Thanks again, and welcome to ThoughtCast!</p>" +
      "<h3>Products Activated:<br/><br/></h3>" +
      newProduct.join("<br/><br/>");

    const message = {
      to: u.data().email,
      html: htmlMail("New Account Activated", body),
      subject: "New Account Activated",
    };

    sendMail(message);
    let successMessage = null;

    if (settingData.length > 0) {
      successMessage = settingData[0].success_message;
    }

    return res.status(200).json({
      data: { ...userDatas, success_message: successMessage },
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.createUser = async (req, res) => {
  try {
    const tokenData = req.user;
    const firstname = req.body.firstname;
    const lastname = req.body.lastname;
    const subscriptionData = req.body.subscription_data;
    const autoProductActive =
      (subscriptionData && req.body.subscription_data.active) || false;
    const products_to_activate = req.body.products_to_activate;
    const accountNotes = req.body.account_notes || "";
    const is_hidden_subscription = req.body.is_hidden_subscription || false;
    let role = 3;

    const resetPasswordToken = "";
    const expire_on = "";
    const devices = req.body.devices || [];
    const purchased = req.body.purchased || [];
    const created_at = new Date();
    const updated_at = new Date();
    const activated_at = req.body.activated_at;
    const is_deleted = false;

    if (!(req.body.email && req.body.password)) {
      return res.status(400).json({
        error: "Please provide credentials",
        success: false,
      });
    }

    if(subscriptionData){
      if(new Date(subscriptionData.expiration_date) > new Date()){
        subscriptionData.active = true;
      }
    }
  
    
    const email = String(req.body.email).toLowerCase();
    const password = req.body.password;
    if (tokenData.role === 1) {
      role = Number(req.body.role);
    }
    let activeCount = 0;
    purchased.forEach((pro) => {
      activeCount += pro.activeCount;
    });
    if (
      role === 3 &&
      subscriptionData &&
      subscriptionData.active &&
      !(activeCount > 0)
    ) {
      return res.status(400).json({
        error: "Please select atleast one app or feature",
        success: false,
      });
    }

    const authuser = await admin
      .auth()
      .createUser({ email: email, password: password });
    console.log(authuser);
    await User.doc(authuser.uid).set({
      firstname,
      lastname,
      account_notes: accountNotes,
      subscription_data: subscriptionData,
      is_hidden_subscription,
      email,
      password,
      devices,
      purchased,
      role,
      resetPasswordToken,
      expire_on,
      created_at,
      updated_at,
      activated_at,
      is_deleted,
      active_subscription: role === 3 ? subscriptionData.active : false,
      auto_product_active: role === 3 ? autoProductActive : false,
    });

    const mailchimpDetails = {
      purchased,
      email,
      firstname,
      lastname,
    };
    role === 3 && addToMailchimpList(mailchimpDetails);

    const u = await User.doc(authuser.uid).get();
    let userDatas = {
      id: u.id,
      ...u.data(),
    };
    delete userDatas.password;
    if (role === 3) {
      const expiryDate = moment(subscriptionData.expiration_date).format(
        "YYYY-MM-DD"
      );
      const settingDoc = await Setting.where("is_deleted","==",false).get();
      const settingData = settingDoc.docs.map((a)=>{
        return{
          id:a.id,
          ...a.data()
        }
      })
      const settings = settingData[0];
      if (activeCount > 0) {
        await CodeHistory.add({
          code: subscriptionData.active ? "Subscription" : "activateByAdmin",
          activation: true,
          special_code: true,
          product_activated: products_to_activate,
          activated_at: moment().format("YYYY-MM-DD"),
          expiry_date: expiryDate,
          purchase_location: settings.default_purchase_location,
          user_id: u.id,
          is_email_send: false,
        });
      }
    }
    return res.status(200).json({
      data: userDatas,
      success: true,
    });
  } catch (error) {
    console.log("error",error);
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.login = async (req, res) => {
  try {
    const token = req.header("token");
    if (!token) {
      return res.status(400).json({
        error: "Please provide token",
        success: false,
      });
    }
    let array = [];

    await admin
      .auth()
      .verifyIdToken(token)
      .then(async (decodedToken) => {
        const uid = decodedToken.uid;
        const user = await User.doc(uid).get();
        const userData = user.data();

        if (userData && userData.is_deleted === true) {
          return res.status(400).json({
            error: "User not found",
            success: false,
          });
        }

        if (
          Number(userData.role) === Number(1) ||
          Number(userData.role) === Number(2)
        ) {
          const setting = await Setting.where("is_deleted", "==", false).get();
          if (setting) {
            setting.forEach((i) => {
              array.push({
                id: i.id,
                ...i.data(),
              });
            });
          }
          if (array.length > 0) {
            const data = {
              ...userData,
              id: user.id,
              token: token,
              setting: array[0],
            };
            res.status(200).json({
              data: data,
              success: true,
            });
          } else {
            const data = {
              ...userData,
              id: user.id,
              token: token,
            };
            res.status(200).json({
              data: data,
              success: true,
            });
          }
        } else {
          const stripePayment = await StripePayment.where("user_id", "==", uid)
            .where("active", "==", true)
            .get();
          const stripePaymentHistory = stripePayment.docs.map((i) => {
            return {
              id: i.id,
              ...i.data(),
            };
          });
          const setting = await Setting.where("is_deleted", "==", false).get();
          setting.forEach((i) => {
            array.push({
              id: i.id,
              ...i.data(),
            });
          });
          if (array.length > 0) {
            const data = {
              ...userData,
              id: user.id,
              token: token,
              setting: array[0],
              recursive: stripePaymentHistory[0] || null,
            };
            res.status(200).json({
              data: data,
              success: true,
            });
          } else {
            const data = {
              ...userData,
              id: user.id,
              token: token,
            };
            res.status(200).json({
              data: data,
              success: true,
            });
          }
        }
      })
      .catch((error) => {
        return res.status(400).json({
          error: error.message,
          success: false,
        });
      });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const data = await User.where("role", "==", 3)
      .where("is_deleted", "==", false)
      .get();
    const users = data.docs.map((i) => ({ id: i.id, ...i.data() }));

    const ids = users.map((i) => i.id);

    let index = 0;
    let recursiveData = [];
    let tenIds = [];
    do {
      tenIds = ids.slice(index, index + 10);
      if (tenIds.length) {
        let data = await StripePayment.where("user_id", "in", tenIds)
          .where("active", "==", true)
          .get();
        data = data.docs.map((doc) => {
          return {
            id: doc.id,
            ...doc.data(),
          };
        });

        tenIds.forEach((id) => {
          let udata = users.find((i) => i.id === id);
          delete udata.password;
          recursiveData.push({
            ...udata,
            recursive: data.find((i) => i.user_id === id) || null,
          });
        });
      }

      index += 10;
    } while (tenIds.length === 10);

    if (users) {
      return res.status(200).json({
        data: recursiveData,
        success: true,
      });
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.getAdmins = async (req, res) => {
  try {
    const tokenData = req.user;

    if (tokenData.role === 1) {
      const data = await User.where("is_deleted", "==", false).get();

      const users = data.docs
        .map((i) => {
          const role = i.data().role;
          if (Number(role) !== 3 && i.id !== tokenData.id) {
            return {
              id: i.id,
              ...i.data(),
            };
          }
        })
        .filter((f) => f);

      if (users.length) {
        return res.status(200).json({
          data: users,
          success: true,
        });
      } else {
        return res.status(200).json({
          data: "Record not found",
          success: true,
        });
      }
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.getUser = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      return res.status(400).json({
        error: "Please enter id",
        success: false,
      });
    }

    const user = await User.doc(id).get();
    const userData = user.data();

    if (
      userData !== undefined &&
      userData.role === 3 &&
      userData.is_deleted === false
    ) {
      return res.status(200).json({
        data: userData,
        success: true,
      });
    } else {
      return res.status(400).json({
        data: "Record not found",
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.query.id;
    const data = req.body;
    const firstname = req.body.firstname;
    const lastname = req.body.lastname;
    const subscriptionData = req.body.subscription_data;
    const accountNotes = req.body.account_notes;
    const email = req.body.email.toLowerCase();
    const role = Number(req.body.role) || 3;
    const devices = req.body.devices || null;
    let autoProductActive = subscriptionData
      ? (moment(subscriptionData.expiration_date).utc().format("YYYY-MM-DD") > moment().utc().format("YYYY-MM-DD") ? true : false)
      : false;
    const products_to_activate = req.body.products_to_activate;
    const updated_at = new Date();
    const is_deleted = false;
    const changesByAdmin = req.body.changes_by_admin;
    const is_hidden_subscription = req.body.is_hidden_subscription;

    if (!userId) {
      return res.status(400).json({
        error: "Please enter user_id",
        success: false,
      }); 
    }
    const userDoc = await User.doc(userId).get();
    const user = {
      id: userDoc.id,
      ...userDoc.data(),
    };

    if (user !== undefined) {
      if (user.active_subscription) {
        autoProductActive = true;
      }
      let newPurchased = [];
      if (user.role == 3) {
        const expiryDate = subscriptionData && subscriptionData.expiration_date;
        if(moment(expiryDate) > moment()){
          subscriptionData.active === true;
        }
        if (
          (subscriptionData &&
          user.subscription_data) &&
          (user.subscription_data.expiration_date !== subscriptionData.expiration_date)
        ) {
        } else {
          newPurchased = data.purchased;
        }

        if (autoProductActive !== user.auto_product_active) {
          if (autoProductActive) {
            let allProducts = await Product.where("is_deleted", "==", false)
              .where("type", "==", "product")
              .get();

            allProducts.forEach((doc) => {
              const product = {
                ...doc.data(),
                id: doc.id,
              };
              const activeProduct = product;

              //check if any new products added and auto adding it
              if (newPurchased.find((p) => p.id !== product.id)) {
                const newActivateProduct = {
                  id: product.id,
                  activeCount: product.apps.length + product.features.length,
                  title: product.title,
                  apps: product.apps.map((app) => {
                    return {
                      id: app.id,
                      active: true,
                      code_used: "Subscription",
                      launches_since_activation: 0,
                      notes: "",
                      data: {},
                      activated_on: new Date(),
                      last_used: new Date(),
                    };
                  }),
                  features: product.features.map((feature) => {
                    return {
                      id: feature.id,
                      active: true,
                      code_used: "Subscription",
                      launches_since_activation: 0,
                      notes: "",
                      data: {},
                      activated_on: new Date(),
                      last_used: new Date(),
                    };
                  }),
                };
                newPurchased.push(newActivateProduct);
              }

              //check if any app and features added new
              newPurchased = newPurchased.map((p) => {
                if (
                  p.id === activeProduct.id &&
                  (p.apps.length !== activeProduct.apps.length ||
                    p.features.length !== activeProduct.features.length)
                ) {
                  const newP = {
                    ...p,
                    activeCount:
                      activeProduct.apps.length + activeProduct.features.length,
                    apps: activeProduct.apps.map((ap) => {
                      const exist = p.apps.filter((a) => a.id === ap.id);

                      if (exist.length > 0) {
                        return exist[0];
                      } else {
                        return {
                          id: ap.id,
                          active: true,
                          activated_on: new Date(),
                          launches_since_activation: 0,
                          last_used: new Date(),
                          code_used: "Subscription",
                          data: {},
                        };
                      }
                    }),
                    features: activeProduct.features.map((fa) => {
                      const exist = p.features.filter((f) => f.id === fa.id);
                      if (exist.length > 0) {
                        return exist[0];
                      } else {
                        return {
                          id: fa.id,
                          active: true,
                          activated_on: new Date(),
                          launches_since_activation: 0,
                          last_used: new Date(),
                          code_used: "Subscription",
                          data: {},
                        };
                      }
                    }),
                  };
                  return newP;
                } else {
                  return p;
                }
              });
            });
          }
        }
        //check if activatedProductByAdmin or not
        if (changesByAdmin) {
          const activateByAdmin = "activateByAdmin";
          let pToAforAdmin = [];
          newPurchased = newPurchased.map((product) => {
            const activateMe = products_to_activate.find(
              (p) => p.id === product.id
            );

            if (activateMe) {
              let pToaProduct = {
                ...activateMe,
                apps: [],
                features: [],
              };
              const pApps = product.apps.map((ap) => {
                const activateApp = activateMe.apps.find(
                  (app) => app.id === ap.id && app.isChecked !== ap.active
                );
                if (activateApp) {
                  if (activateApp.isChecked) {
                    pToaProduct.apps.push(activateApp);
                  }
                  return {
                    ...ap,
                    active: activateApp.isChecked,
                    activated_on: activateApp.isChecked ? new Date() : "",
                    code_used: activateApp.isChecked ? activateByAdmin : "",
                  };
                } else {
                  if (ap.code_used === activateByAdmin && ap.active) {
                    pToaProduct.apps.push({
                      isChecked: ap.active,
                      title: ap.title,
                      id: ap.id,
                    });
                  }
                  return ap;
                }
              });

              const pFeatures = product.features.map((fa) => {
                const activateFeature = activateMe.features.find(
                  (feature) =>
                    feature.id === fa.id && feature.isChecked !== fa.active
                );
                if (activateFeature) {
                  if (activateFeature.isChecked) {
                    pToaProduct.features.push(activateFeature);
                  }
                  return {
                    ...fa,
                    active: activateFeature.isChecked,
                    activated_on: activateFeature.isChecked ? new Date() : "",
                    code_used: activateFeature.isChecked ? activateByAdmin : "",
                  };
                } else {
                  if (fa.code_used === activateByAdmin && fa.active) {
                    pToaProduct.features.push({
                      isChecked: fa.active,
                      title: fa.title,
                      id: fa.id,
                    });
                  }

                  return fa;
                }
              });

              pToAforAdmin.push(pToaProduct);
              return {
                ...product,
                apps: pApps,
                features: pFeatures,
              };
            } else {
              return product;
            }
          });

          let historyId = await CodeHistory.where("code", "==", activateByAdmin)
            .where("user_id", "==", userId)
            .where("activation", "==", true)
            .get();
          const historyIdData = historyId.docs.map((h) => {
            return h.id;
          });

          if (historyIdData.length > 0) {
            await CodeHistory.doc(historyIdData[0]).update({
              product_activated: pToAforAdmin,
              expiry_date: expiryDate,
            });
          } else {
            await CodeHistory.add({
              code: activateByAdmin,
              activation: true,
              special_code: true,
              product_activated: pToAforAdmin,
              activated_at: moment().format("YYYY-MM-DD"),
              expiry_date: expiryDate,
              purchase_location: null,
              user_id: userId,
              is_email_send: false,
            });
          }
        }
      }
      const activeCount = newPurchased.map((e) => {
        return {
          ...e,
          activeCount:
            e.apps.filter((a) => a.active).length +
            e.features.filter((f) => f.active).length,
        };
      });
      const mailchimpDetails = {
        purchased: activeCount,
        email,
        firstname,
        lastname,
      };
      user.role == 3 && addToMailchimpList(mailchimpDetails);

      const datas = {
        active: false,
        activated_at: "",
        expiration_date: "",
        comments: "",
      };

      await User.doc(userId).update({
        firstname,
        lastname,
        is_hidden_subscription,
        account_notes: accountNotes,
        subscription_data: user.role == 3 ? subscriptionData : datas,
        email,
        devices,
        purchased:
          user.role == 3 && activeCount.length > 0
            ? activeCount
            : user.purchased,
        role: user.role !== 3 ? role : 3,
        updated_at,
        is_deleted,
        active_subscription: user.role == 3 ? subscriptionData.active : false,
        auto_product_active: user.role === 3 ? autoProductActive : false,
      });
      if (email !== user.email) {
        await admin.auth().updateUser(userId, { email: email });
      }
      const newUser = await User.doc(userId).get();
      const newUserData = newUser.data();
      const newData = {
        id: newUser.id,
        ...newUserData,
      };
      res.status(200).json({
        data: newData,
        success: true,
      });
    } else {
      return res.status(400).json({
        error: "User not found ",
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.deleteMultipleUser = async (req, res) => {
  try {
    const id = req.body.id;
    if (!id) {
      return res.status(200).json({
        error: "Please enter id",
        success: false,
      });
    }
    const database = admin.firestore();
    const batch = database.batch();
    const arr = id.map((e) => User.doc(e));

    arr.forEach(async (i) => {
      batch.update(i, { is_deleted: true });
    });
    await admin.auth().deleteUsers(id);

    await batch.commit();
    return res.status(200).json({
      data: "Record deleted",
      success: true,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.resetPasswordToken = async (req, res) => {
  try {
    let email = req.body.email;
    if (!email) {
      return res.status(400).json({
        error: "Please enter email",
        status: false,
      });
    }
    email = email.toLowerCase();
    let array = [];
    let user = await User.where("email", "==", email)
      .where("is_deleted", "==", false)
      .get();

    user.forEach((i) => {
      const datas = {
        id: i.id,
        ...i.data(),
      };
      array.push(datas);
    });
    if (array.length > 0) {
      const resetPasswordLink = "https://thoughtcastowners.com/changepassword";
      const resetPasswordToken = generateResetPasswordToken();
      const body =
        "<p>Hi, you just recently requested a password reset from the ThoughtCast Magic Owners Portal.If you requested to reset your password, click on the link below to do so. If not, just ignore and/or delete this message.</p>" +
        "<p>Have any more questions? Just hit reply to this email and we'll be happy to help!</p>" +
        resetPasswordLink +
        "/" +
        resetPasswordToken +
        ".";

      const message = {
        subject: "ThoughtCast Owners Portal - Password Reset",
        to: email,
        html: htmlMail("ThoughtCast Owners Portal - Password Reset", body),
      };
      const link_expire_on = moment().add(1, "hours").format();
      const updateData = {
        resetPasswordToken: resetPasswordToken,
        expire_on: link_expire_on,
        expired: false,
      };
      await User.doc(array[0].id).update(updateData);
      sendMail(message);
      return res.status(200).json({
        data: "Mail send successfully",
        success: true,
      });
    } else {
      return res.status(400).json({
        error: "User not found",
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.verifyToken = async (req, res) => {
  try {
    const token = req.body.resetPasswordToken;
    const reqEmail = req.body.email;

    if (!(token && reqEmail)) {
      return res.status(400).json({
        error: "Please enter details",
        success: false,
      });
    }
    const email = reqEmail.toLowerCase();
    let array = [];
    const user = await User.where("email", "==", email)
      .where("is_deleted", "==", false)
      .get();
    user.forEach((i) => {
      array.push(i.data());
    });
    const userData = array[0];
    if (userData.resetPasswordToken == token) {
      return res.status(200).json({
        data: "Token verified",
        success: true,
      });
    } else {
      return res.status(400).json({
        error: "Token not verified",
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.updateResetPassword = async (req, res) => {
  try {
    const password = req.body.password;
    const confirmPassword = req.body.confirmPassword;
    const token = req.body.resetPasswordToken;

    if (!(password && confirmPassword && token)) {
      return res.status(400).json({
        error: "Please enter details",
        success: false,
      });
    }

    let user = await User.where("resetPasswordToken", "==", token)
      .where("is_deleted", "==", false)
      .get();
    user = user.docs.map((e) => {
      return {
        id: e.id,
        ...e.data(),
      };
    });

    if (!user.length > 0) {
      return res.status(400).json({
        error: "User not found with this resetPasswordToken",
        success: false,
      });
    }
    if (password === confirmPassword) {
      if (user.length > 0) {
        const now = moment().format();
        const expiredOn = moment(user[0].expire_on).format();
        if (expiredOn < now) {
          return res.status(400).json({
            error: "Link has been expired",
            success: false,
          });
        }
        admin.auth().updateUser(user[0].id, { password: password });
        await User.doc(user[0].id).update({
          password: password,
          resetPasswordToken: null,
          expire_on: null,
        });
        return res.status(200).json({
          data: "Password updated",
          success: true,
        });
      } else {
        return res.status(400).json({
          error: "Link has been expired",
          success: false,
        });
      }
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.redeemCode = async (req, res) => {
  try {
    const now = moment().format("YYYY-MM-DD");
    let redeemCode = req.body.code;
    const tokenData = req.user;
    redeemCode = redeemCode.trim();
    let expiryDate = moment().utc().format("YYYY-MM-DD");

    if (!redeemCode) {
      return res.status(400).json({
        error: "Please enter code",
        success: false,
      });
    }

    let array = [];

    const checkCode = await Code.where("code", "==", redeemCode)
      .where("is_deleted", "==", false)
      .where("activation", "==", true)
      .get();

    checkCode.forEach((e) => {
      const datas = {
        id: e.id,
        ...e.data(),
      };
      array.push(datas);
    });

    const user = await User.doc(tokenData.id).get();
    const userData = user.data();

    const code = await Code.where("code", "==", redeemCode).get();
    const codeData = code.docs.map((e) => e.data());
    if(!(codeData.length > 0)){
        return res.status(400).json({
          error: "Code not found !",
          success: false,
        });
    }

    const products_to_activate = codeData[0].products_to_activate || [];

    const monthData = String(codeData[0].duration).replace("s", "");
    const month = monthData === "None" ? 0 : Number(monthData.split(" ")[0]);
    const unit = monthData === "None" ? null : monthData.split(" ")[1];

    // if(array[0].duration.split(" "))
    if (array.length > 0) {
      if (array[0].already_used === true) {
        return res.status(400).json({
          error: "Code already in use",
          success: false,
        });
      }

      const codeHistoryDoc = await CodeHistory.where(
        "user_id",
        "==",
        tokenData.id
      )
        .where("code", "==", "Subscription")
        .where("activation", "==", true)
        .get();

      const codeHistoryData = codeHistoryDoc.docs
        .map((i) => {
          const expiryDateHistory = i.data().expiry_date;
          if (expiryDateHistory >= now) {
            return {
              id: i.id,
              ...i.data(),
            };
          }
        })
        .filter((a) => a);

      if (unit && month !== 0) {
        expiryDate = moment(expiryDate)
          .add(month, unit[0].toUpperCase())
          .format("YYYY-MM-DD");
      }
      // if subscription already active extend date of subscription
      if (codeHistoryData.length > 0 && monthData !== "None") {
        expiryDate = moment(codeHistoryData[0].expiry_date)
          .add(month, unit[0].toUpperCase())
          .format("YYYY-MM-DD");

        await CodeHistory.doc(codeHistoryData[0].id).update({
          expiry_date: expiryDate,
        });
        if (userData.active_subscription === true) {
          //checking id paided payment
          const subsData = await StripePayment.where("user_id", "==", user.id)
            .where("active", "==", true)
            .get();
          const subsDetail = subsData.docs.map((a) => {
            return {
              id: a.id,
              ...a.data(),
            };
          });

          if (subsDetail.length > 0) {
            const subscription = await StripeClient.subscriptions.retrieve(
              subsDetail[0].subscription_id
            );
            //if auto subscription active then deleting (cancelling subscription auto payment)
            if (subscription) {
              const deleteSubscription = await StripeClient.subscriptions.del(
                subsDetail[0].subscription_id
              );
              if (
                deleteSubscription &&
                deleteSubscription.status === "canceled"
              ) {
                await StripePayment.doc(subsDetail[0].id).update({
                  auto_subscription: false,
                  active: false,
                });
              }
            }
          }
        }
        // return res.status(400).json({
        //   error:
        //     "Previous subscription already activate till " +
        //     codeHistoryData[0].expiry_date,
        //   success: false,
        // });
      }else{
        if(expiryDate > now){
          await CodeHistory.add({
            code: "Subscription",
            special_code: true,
            activation: true,
            product_activated: products_to_activate,
            activated_at: moment().format("YYYY-MM-DD"),
            expiry_date: expiryDate,
            purchase_location: codeData[0].purchase_location,
            user_id: tokenData.id,
            is_email_send: false,
          });
        }
        
      }
    

    if (expiryDate > now) {
      await User.doc(tokenData.id).update({
        active_subscription: false,
        subscription_data: {
          active: true,
          activated_at: String(moment().toISOString()),
          expiration_date: String(expiryDate),
          comments: "",
        },
      });
    }
      const firstname = userData.firstname;
      const lastname = userData.lastname;
      const email = userData.email;

      let codeHistory = await CodeHistory.where("user_id", "==", tokenData.id)
        .where("special_code", "==", false)
        .get();
      codeHistory = codeHistory.docs
        .map((doc) => {
          return { id: doc.id, ...doc.data() };
        })
        .filter((ch) => ch.activation);
      let codeHistoryCodes = codeHistory.map((c) => c.code);

      let betterCodes = [];

      if (codeHistoryCodes.includes(redeemCode)) {
        return res.status(400).json({
          error: "Code already redeemed !!",
          success: false,
        });
      }

      const activeProductsDocArray = await Product.where(
        "is_deleted",
        "==",
        false
      )
        .where("type", "==", "product")
        .get();
      const activeProducts = activeProductsDocArray.docs.map((pdoc) => {
        return {
          ...pdoc.data(),
          id: pdoc.id,
        };
      });

      const p2a = activeProducts.map((p) => {
        const alreadyExistProduct = products_to_activate.filter(
          (e, i) => e.id === p.id
        );
        if (alreadyExistProduct.length > 0) {
          return {
            ...alreadyExistProduct[0],
            apps: p.apps.map((ap) => {
              const PurchasedApp = alreadyExistProduct[0].apps.filter(
                (a, i) => a.id === ap.id
              );
              if (PurchasedApp.length > 0) {
                return PurchasedApp[0];
              } else {
                return {
                  id: ap.id,
                  isChecked: false,
                  title: ap.title,
                };
              }
            }),
            features: p.features.map((fa) => {
              const PurchasedFeature = alreadyExistProduct[0].features.filter(
                (a, i) => a.id === fa.id
              );
              if (PurchasedFeature.length > 0) {
                return PurchasedFeature[0];
              } else {
                return {
                  id: fa.id,
                  isChecked: false,
                  title: fa.title,
                };
              }
            }),
          };
        } else {
          return {
            id: p.id,
            activeCount: 0,
            title: p.title,
            apps: p.apps.map((ap) => {
              return {
                id: ap.id,
                isChecked: false,
                title: ap.title,
              };
            }),
            features: p.features.map((fa) => {
              return {
                id: fa.id,
                isChecked: false,
                title: fa.title,
              };
            }),
          };
        }
      });
      let overlapped_codes = [];
      const product = p2a.map((pTa) => {
        const alreadyExistProduct = userData.purchased.filter(
          (e, i) => e.id === pTa.id
        );

        if (alreadyExistProduct.length > 0) {
          return {
            ...alreadyExistProduct[0],
            title: pTa.title,
            apps: pTa.apps.map((app) => {
              const PurchasedApp = alreadyExistProduct[0].apps.filter(
                (a, i) => a.id === app.id
              );
              if (PurchasedApp.length > 0) {
                if (
                  app.isChecked &&
                  PurchasedApp[0].active &&
                  (PurchasedApp[0].code_used !== "Subscription" ||
                    PurchasedApp[0].code_used !== "activateByAdmin")
                ) {
                  overlapped_codes.push(PurchasedApp[0].code_used);
                }
                return {
                  ...PurchasedApp[0],
                  code_used: betterCodes.includes(PurchasedApp[0].code_used)
                    ? PurchasedApp[0].code_used
                    : app.isChecked
                    ? redeemCode
                    : PurchasedApp[0].code_used,
                  active: betterCodes.includes(PurchasedApp[0].code_used)
                    ? PurchasedApp[0].active
                    : app.isChecked
                    ? app.isChecked
                    : PurchasedApp[0].active,
                  activated_on: betterCodes.includes(PurchasedApp[0].code_used)
                    ? PurchasedApp[0].activated_on
                    : app.isChecked
                    ? new Date()
                    : PurchasedApp[0].activated_on,
                  title: app.title,
                };
              } else {
                return {
                  id: app.id,
                  data: {},
                  launches_since_activation: 0,
                  last_used: new Date(),
                  notes: "",
                  title: app.title,
                  code_used: app.isChecked ? redeemCode : "",
                  active: app.isChecked,
                  activated_on: app.isChecked ? new Date() : "",
                };
              }
            }),
            features: pTa.features.map((feature) => {
              const PurchasedFeature = alreadyExistProduct[0].features.filter(
                (f, i) => f.id === feature.id
              );
              if (PurchasedFeature.length > 0) {
                if (
                  feature.isChecked &&
                  PurchasedFeature[0].active &&
                  (PurchasedFeature[0].code_used !== "Subscription" ||
                    PurchasedFeature[0].code_used !== "activateByAdmin")
                ) {
                  overlapped_codes.push(PurchasedFeature[0].code_used);
                }
                return {
                  ...PurchasedFeature[0],
                  code_used: betterCodes.includes(PurchasedFeature[0].code_used)
                    ? PurchasedFeature[0].code_used
                    : feature.isChecked
                    ? redeemCode
                    : PurchasedFeature[0].code_used,
                  active: betterCodes.includes(PurchasedFeature[0].code_used)
                    ? PurchasedFeature[0].active
                    : feature.isChecked
                    ? feature.isChecked
                    : PurchasedFeature[0].active,
                  activated_on: betterCodes.includes(
                    PurchasedFeature[0].code_used
                  )
                    ? PurchasedFeature[0].activated_on
                    : feature.isChecked
                    ? new Date()
                    : PurchasedFeature[0].activated_on,
                  title: feature.title,
                };
              } else {
                return {
                  id: feature.id,
                  data: {},
                  launches_since_activation: 0,
                  last_used: new Date(),
                  notes: "",
                  title: feature.title,
                  code_used: feature.isChecked ? redeemCode : "",
                  active: feature.isChecked,
                  activated_on: feature.isChecked ? new Date() : "",
                };
              }
            }),
          };
        } else {
          return {
            id: pTa.id,
            activeCount: 0,
            title: pTa.title,
            data: {},
            apps: pTa.apps.map((app) => {
              return {
                id: app.id,
                title: app.title,
                data: {},
                launches_since_activation: 0,
                last_used: new Date(),
                notes: "",
                code_used: app.isChecked ? redeemCode : "",
                active: app.isChecked,
                activated_on: app.isChecked ? new Date() : "",
              };
            }),
            features: pTa.features.map((feature) => {
              return {
                id: feature.id,
                title: feature.title,
                data: {},
                launches_since_activation: 0,
                last_used: new Date(),
                notes: "",
                code_used: feature.isChecked ? redeemCode : "",
                active: feature.isChecked,
                activated_on: feature.isChecked ? new Date() : "",
              };
            }),
          };
        }
      });

      const activeCount = product.map((e) => {
        return {
          ...e,
          activeCount:
            e.apps.filter((a) => a.active).length +
            e.features.filter((f) => f.active).length,
        };
      });

      const mailchimpDetails = {
        purchased: activeCount,
        email,
        firstname,
        lastname,
      };

      userData && userData.role === 3 && addToMailchimpList(mailchimpDetails);
      overlapped_codes = overlapped_codes.filter(
        (a, i) => overlapped_codes.indexOf(a) === i
      );
      // if (month > 0) {
        await CodeHistory.add({
          code: redeemCode,
          special_code: false,
          activation: true,
          product_activated: products_to_activate,
          activated_at: moment().format("YYYY-MM-DD"),
          expiry_date: expiryDate,
          purchase_location: codeData[0].purchase_location,
          user_id: tokenData.id,
          is_email_send: false,
          overlapped_codes: overlapped_codes,
        });
        await User.doc(tokenData.id).update({ purchased: activeCount });
      // }

      const u = await User.doc(tokenData.id).get();

      await Code.doc(array[0].id).set({
        ...array[0],
        activation: false,
        already_used: true,
        user_id: u.id,
        activated_by: userData.email,
        firstname,
        lastname,
      });

      const setting = await Setting.get();
      const set = setting.docs.map((e) => {
        return e.data();
      });

      const newProduct = p2a
        .filter((a) => a.activeCount > 0)
        .map((e) => {
          let productText = "Product Name : " + e.title;

          const activatedApps = e.apps
            .map((i) => i.isChecked && i.title)
            .filter((a) => a);

          const activatedFeatures = e.features
            .map((f) => f.isChecked && f.title)
            .filter((a) => a);

          if (activatedApps.length > 0) {
            productText += " <br/>Apps :  " + activatedApps.join();
          }
          if (activatedFeatures.length > 0) {
            productText += " <br/>Features : " + activatedFeatures.join();
          }
          return productText;
        });

      let body =
        `This email is to confirm you have activated the following products with the code <b>${redeemCode} </b> 
        <br/><br/><br/>` +
        newProduct.join("<br/><br/>")+
        "<br/><br/>If you have any questions, just hit reply to this email and we will help you out as soon as possible.";
      
      const message = {
        to: userData.email,
        html: htmlMail("Code Redeemed Successfully", body),
        subject: "Code Redeemed Successfully",
      };

      sendMail(message);

      const resDatas = {
        user: { id: u.id, ...u.data() },
        setting: set,
      };
      return res.status(200).json({
        data: resDatas,
        success: true,
      });
    } else {
      return res.status(400).json({
        error: "Code not found",
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.mergeSelectedUser = async (req, res) => {
  try {
    const date = new Date();
    const firstname = req.body.firstname;
    const lastname = req.body.lastname;
    const reqEmail = req.body.email;

    const activatedAt = req.body.activated_at;
    const userId = req.body.user_id;

    if (!reqEmail) {
      return res.status(400).json({
        error: "Please enter email and password",
        success: false,
      });
    }
    const email = reqEmail.toLowerCase();
    if (userId.length < 1) {
      return res.status(400).json({
        error: "Please enter user_id",
        success: false,
      });
    }
    const database = admin.firestore();
    const batch = database.batch();
    const arr = userId.map((e) => User.doc(e));

    arr.forEach(async (i) => {
      batch.update(i, { is_deleted: true });
    });
    await admin.auth().deleteUsers(userId);

    await batch.commit();

    let array = [];
    let password = null;
    for (i of userId) {
      const user = await User.doc(i).get();
      const userData = user.data();
      if (userData.email === email) {
        password = userData.password;
      }
      array.push(userData.purchased);
    }

    const user = await admin
      .auth()
      .createUser({ email: email, password: password });
    let arrayData = [];
    array.forEach((e) => {
      e.forEach((i) => {
        arrayData.push(i);
      });
    });
    let productIds = arrayData.map((p) => {
      if (p.activeCount > 0) {
        return p.id;
      } else {
        return false;
      }
    });

    productIds = productIds.filter((a, i) => a && productIds.indexOf(a) === i);

    const pData = await Promise.allSettled(
      productIds.map(async (pid) => {
        const p = await Product.doc(pid).get();
        return {
          id: p.id,
          ...p.data(),
        };
      })
    );

    const newArray = pData.map((pro) => {
      const oneProduct = arrayData.filter((a) => a.id === pro.value.id);
      if (oneProduct.length === 1) {
        return oneProduct[0];
      } else {
        let newPro = {
          ...oneProduct[0],
          apps: [],
          features: [],
        };
        for (const prd of oneProduct) {
          const newApp = prd.apps.filter((a) => a.active);
          const newFeature = prd.features.filter((f) => f.active);
          newPro.apps.push(...newApp);
          newPro.features.push(...newFeature);
        }
        return newPro;
      }
    });
    let historyIds = [];
    await Promise.allSettled(
      userId.map(async (uid) => {
        const p = await CodeHistory.where("user_id", "==", uid).get();
        if (p && p.docs.length > 0) {
          p.docs.map((a) => {
            historyIds.push(a.id);
          });
        }
      })
    );

    const batch1 = database.batch();

    const historyArray = historyIds.map((e) => CodeHistory.doc(e));
    historyArray.forEach((i) => {
      batch1.update(i, { user_id: user.uid });
    });

    await batch1.commit();

    await User.doc(user.uid).set({
      created_at: date,
      updated_at: date,
      email: email,
      purchased: newArray,
      firstname: firstname,
      lastname: lastname,
      activated_at: activatedAt,
      role: 3,
      password: password,
      is_deleted: false,
    });

    const mailchimpDetails = {
      purchased: newArray,
      email,
      firstname,
      lastname,
    };
    addToMailchimpList(mailchimpDetails);

    const newUser = await User.doc(user.uid).get();
    const newUserData = {
      id: newUser.id,
      ...newUser.data(),
    };
    return res.status(200).json({
      data: newUserData,
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.usersDataById = async (req, res) => {
  try {
    const userId = req.body.user_id;

    if (!userId) {
      return res.status(400).json({
        error: "Please enter user_id",
        success: false,
      });
    }
    let array = [];
    for (e of userId) {
      const user = await User.doc(e).get();
      let userData = user.data();
      delete userData.password;
      const datas = {
        id: user.id,
        ...userData,
      };
      array.push(datas);
    }
    return res.status(200).json({
      data: array,
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.deprecateProduct = async (req, res) => {
  try {
    const productId = req.body.product_id;
    const userId = req.body.user_id;
    const deprecated = req.body.deprecated;

    if (!productId || !userId) {
      return res.status(400).json({
        error: "required field missing !",
        success: false,
      });
    }

    let user = await User.doc(userId).get();
    user = {
      id: user.id,
      ...user.data(),
    };

    if (!user) {
      return res.status(400).json({
        error: "user not found",
        success: false,
      });
    }

    let changes = false;
    let purchased = user.purchased.map((p) => {
      if (p.id === productId) {
        changes = true;
        return {
          ...p,
          deprecated: deprecated,
        };
      } else {
        return p;
      }
    });

    if (changes) {
      await User.doc(user.id).update({
        purchased,
      });
    }

    let userData = {
      ...user,
      purchased: purchased,
    };
    delete userData.password;
    return res.status(200).json({
      data: userData,
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.makeSecretKey = async (req, res) => {
  try {
    const reqEmail = req.body.email;
    if (!reqEmail) {
      return res.status(400).json({
        error: "Please enter email",
        success: false,
      });
    }
    const email = reqEmail.toLowerCase();
    const exist = await ApiKey.where("email", "==", email).get();
    const existArray = exist.docs;

    if (existArray && existArray.length > 0) {
      return res.status(400).json({
        error: "Email already exist!",
        success: false,
      });
    }

    const apiKey = crypto.randomBytes(16).toString("hex");
    const data = {
      email: email,
      api_key: apiKey,
    };
    await ApiKey.add(data);
    return res.status(200).json({
      data: data,
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.deleteSecretKey = async (req, res) => {
  try {
    const reqEmail = req.body.email;
    if (!reqEmail) {
      return res.status(400).json({
        error: "Please enter email",
        success: false,
      });
    }
    const email = reqEmail.toLowerCase();
    const apiKey = await ApiKey.where("email", "==", email).get();
    const database = admin.firestore();
    const batch = database.batch();
    apiKey.docs.map((a) => {
      batch.delete(ApiKey.doc(a.id));
    });
    await batch.commit();
    return res.status(200).json({
      data: {
        email,
      },
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.toggleSubsVisibility = async (req, res) => {
  let user_id = req.body.user_id;
  let is_hidden = req.body.is_hidden;
  if (!user_id) {
    return res.status(400).json({
      error: "required field missing !",
      success: false,
    });
  }
  try {
    let user = await User.doc(user_id).get();
    user = {
      id: user.id,
      ...user.data(),
    };
    if (!user) {
      return res.status(400).json({
        error: "user not found",
        success: false,
      });
    }
    await User.doc(user.id).update({
      is_hidden_subscription: is_hidden,
    });
    return res.status(200).json({
      data: {
        user_id: user.id,
        is_hidden_subscription:is_hidden,
      },
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.getSecretKeys = async (req, res) => {
  try {
    let array = [];
    const apiKeys = await ApiKey.get();
    apiKeys.forEach(async (i) => {
      const datas = {
        id: i.id,
        ...i.data(),
      };
      array.push(datas);
    });
    if (array.length > 0) {
      return res.status(200).json({
        data: array,
        success: true,
      });
    } else {
      return res.status(400).json({
        error: "Record not found",
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.verifyUser = async (req, res) => {
  try {
    const token = req.query.token;
    const reqEmail = req.body.email;
    const password = req.body.password;

    if (!reqEmail) {
      return res.status(400).json({
        error: "Please provide email",
        success: false,
      });
    }
    if (!password) {
      return res.status(400).json({
        error: "password id is required!",
        success: false,
      });
    }
    let encodedPassword = base64decode(password); 
    const email = reqEmail.toLowerCase();
    const user = await User.where("email", "==", email)
      .where("is_deleted", "==", false)
      .get();
    const userData = user.docs.map((e) => {
      return { ...e.data(), id: e.id };
    });
    if (!userData.length) {
      return res.status(400).json({
        error: "Email does not exist in our server",
        success: false,
      });
    }

    if (userData[0].password !== encodedPassword) {
      return res.status(400).json({
        error: "Incorrect user password!",
        success: false,
      });
    }

    // if (userData[0].password === password) {
    return res.status(200).json({
      data: {
        message: "success",
      },
      success: true,
    });
    // }else{
    //   return res.status(400).json({
    //     error: "Password is incorrect, please enter valid password",
    //     success: false,
    //   });
    // }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.sendPasswordResetEmail = async (req, res) => {
  try {
    let email = req.body.email;
    if (!email) {
      return res.status(400).json({
        error: "Please enter email",
        status: false,
      });
    }
    email = email.toLowerCase();
    let array = [];
    let user = await User.where("email", "==", email)
      .where("is_deleted", "==", false)
      .get();

    user.forEach((i) => {
      const datas = {
        id: i.id,
        ...i.data(),
      };
      array.push(datas);
    });
    if (array.length > 0) {
      const resetPasswordLink = "https://thoughtcastowners.com/changepassword";
      const resetPasswordToken = generateResetPasswordToken();
      const body =
        "<p>Hi, you just recently requested a password reset from the ThoughtCast Magic Owners Portal.If you requested to reset your password, click on the link below to do so. If not, just ignore and/or delete this message.</p>" +
        "<p>Have any more questions? Just hit reply to this email and we'll be happy to help!</p>" +
        resetPasswordLink +
        "/" +
        resetPasswordToken +
        ".";

      const message = {
        subject: "ThoughtCast Owners Portal - Password Reset",
        to: email,
        html: htmlMail("ThoughtCast Owners Portal - Password Reset", body),
      };
      const link_expire_on = moment().add(1, "hours").format();
      const updateData = {
        resetPasswordToken: resetPasswordToken,
        expire_on: link_expire_on,
        expired: false,
      };
      await User.doc(array[0].id).update(updateData);
      sendMail(message);
      return res.status(200).json({
        data: "Mail send successfully",
        success: true,
      });
    } else {
      return res.status(400).json({
        error: "User not found",
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};