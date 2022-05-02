const {
  User,
  Product,
  CodeHistory,
  Code,
  Shopify,
  Setting,
} = require("../database/database");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { sendMail } = require("../utils/sendMail");
const moment = require("moment");
const htmlMail = require("../utils/htmlMail");
const { addToMailchimpList } = require("../utils/mailchimp");
const { fullfillOrder } = require("../utils/shopifyReq");

exports.orderPaidShopify = async (req, res) => {
  try {
    console.log("🎉 We got an order!");
    // It's a match! All good
    console.log("Phew, it came from Shopify!");
    const order = req.body;
    console.log(order);
    const ShopifyDoc = await Shopify.add({
      request_object: order,
      timestamp: new Date(),
      email: order.email,
      order_id: order.id,
      order_number: "INV" + order.name,
    });
    if (order.financial_status !== "paid") {
      console.log("order payment is " + order.financial_status);

      await Shopify.doc(ShopifyDoc.id).update({
        success: false,
        reason: "order payment is " + order.financial_status,
      });

      return res.status(200).json({
        error: "order payment is " + order.financial_status,
        success: false,
      });
    }
    // if(order.financial_status === "paid"){
    let email = order.email.toLowerCase();
    console.log(email);
    // email = "vivek.igeek@gmail.com";
    const sku = order.line_items.map((item) => item.sku).filter((a) => a != "");
    // console.log(sku);
    let unFulfilledSKUs = [];
    // sku.push("TestingSKU");
    if (!(sku.length > 0)) {
      console.log("no sku found in request object");
      await Shopify.doc(ShopifyDoc.id).update({
        success: false,
        reason: "no sku found in request object",
      });
      return res.status(200).json({
        error: "no sku found in request object",
        success: false,
      });
    }
    const duration = 9999; // in months

    const existCodedoc = await Code.where("is_deleted", "==", false)
      .where("shopify_order_id", "==", order.id)
      .get();
    console.log("shopify_order_id", order.id);
    const existCode = existCodedoc.docs.map((c) => {
      return {
        id: c.id,
        ...c.data(),
      };
    });

    if (existCode && existCode.length > 0) {
      console.log("already code redeemed!!!");
      await Shopify.doc(ShopifyDoc.id).update({
        success: false,
        reason: "already redeemed code for this order.",
      });
      return res.status(200).json({
        error: "already redeemed code for this order.",
        success: false,
      });
    }

    const users = await User.where("email", "==", email)
      .where("is_deleted", "==", false)
      .get();

    const userdoc = users.docs.map((u) => {
      return { id: u.id, ...u.data() };
    });

    //generate Unique Code
    const generateUniqueCode = async (firstname, lastname) => {
      let textArray = settings.code_characters.split("");
      const codeLength = Number(settings.default_code_length);
      let code = "";
      while (1) {
        code = "";
        while (code.length < codeLength) {
          var randomNumber = Math.floor(
            Math.random(codeLength) * textArray.length
          );
          code += textArray[randomNumber];
        }
        const alreadyExistCodedoc = await Code.where("code", "==", code)
          .where("is_deleted", "==", false)
          .get();
        const alreadyExistCode = alreadyExistCodedoc.docs.map((codeD) => {
          return {
            id: codeD.id,
            ...codeD.data(),
          };
        });
        if (alreadyExistCode && alreadyExistCode.length > 0) {
        } else {
          await Code.add({
            activated_at: new Date(),
            activated_by: email,
            activation: false,
            code: code,
            codePrefix: code,
            created_at: new Date().toString(),
            duration: `${duration} month`,
            firstname,
            lastname,
            is_deleted: false,
            shopify_order_id: order.id,
            shopify_order_name: order.name,
            notes: `email : ${email} \nShopify : INV${order.name}`,
            parent_id: "",
            products_to_activate: products_to_activate,
            purchase_location: settings.default_purchase_location,
          });
          break;
        }
      }
      // if (codeLength > 13) {
      //   code += generateId(codeLength - 13);
      // }
      return code;
    };

    //function to add user with random password
    const addUser = async (email, firstname, lastname) => {
      const password = (Math.random() + 1).toString(36).substring(2);
      const authuser = await admin
        .auth()
        .createUser({ email: email, password: password });
      await User.doc(authuser.uid).set({
        firstname,
        lastname,
        account_notes: "",
        subscription_data: {
          active: false,
          activated_at: "",
          expiration_date: "",
          comments: "",
        },
        email,
        password,
        devices: [],
        purchased: [],
        role: 3,
        resetPasswordToken: "",
        expire_on: "",
        created_at: new Date(),
        updated_at: new Date(),
        activated_at: new Date().toISOString(),
        is_deleted: false,
        active_subscription: false,
        auto_product_active: false,
      });
      return authuser.uid;
    };

    const userExist = userdoc.length > 0 ? true : false;
    let user = null;

    if (!userExist) {
      const newUserId = await addUser(
        email,
        order.customer.first_name,
        order.customer.last_name
      );
      const newUserDoc = await User.doc(newUserId).get();
      user = {
        id: newUserDoc.id,
        ...newUserDoc.data(),
      };
    } else {
      user = userdoc[0];
    }

    const { firstname, lastname } = user;

    let product = await Product.where("is_deleted", "==", false).get();
    let appToActive = [];
    let featureToActive = [];
    let productIDs = [];

    let expiryDate = moment().add(duration, "M").format("YYYY-MM-DD");
    let activatedAt = moment().format("YYYY-MM-DD");

    let products = product.docs
      .map((p) => {
        const productData = {
          id: p.id,
          ...p.data(),
        };

        const appExist = productData.apps.filter((app) => {
          const skus = app.shopify_SKU.split(",").map((a) => a.trim());
          let skus2 = [];
          if(app.shopify_unfulfill_SKU){
            skus2 = app.shopify_unfulfill_SKU.split(",").map((a) => a.trim());
          }
          
          skus2.map((element)=> {
            if(sku.includes(element.trim())){
              unFulfilledSKUs.push(element)
            }
          })
          const existOne = [...skus,...skus2].filter(
            (element) => element && sku.includes(element.trim())
          );
          console.log(existOne);
          return existOne.length > 0 ? true : false;
        });

        const featureExist = productData.features.filter((feature) => {
          const skus = feature.shopify_SKU.split(",").map((a) => a.trim());
          let skus2 = [];
          if(feature.shopify_unfulfill_SKU){
            skus2 = feature.shopify_unfulfill_SKU.split(",").map((a) => a.trim());
          }
          skus2.map((element)=> {
            if(sku.includes(element.trim())){
              unFulfilledSKUs.push(element)
            }
          })
          const existOne = [...skus,...skus2].filter(
            (element) => element && sku.includes(element.trim())
          );
          return existOne.length > 0 ? true : false;
        });

        if (appExist.length > 0 || featureExist.length > 0) {
          if (appExist.length > 0) {
            console.log("appExist", appExist);
            appToActive.push(...appExist);
          }
          if (featureExist.length > 0) {
            console.log("featureExist", featureExist);
            featureToActive.push(...featureExist);
          }
          return productData;
        }
      })
      .filter((p) => {
        if (p) {
          productIDs.push(p.id);
          return p;
        }
      });

    
    if (!(products.length > 0)) {
      console.log("no products found in our database matches this SKU");
      await Shopify.doc(ShopifyDoc.id).update({
        reason: "no products found in our database matches this SKU.",
        success: false,
      });

      return res.status(200).json({
        error: "no products found in our database matches this SKU.",
        success: false,
      });
    }

    await Shopify.doc(ShopifyDoc.id).update({
      apps: appToActive,
      features: featureToActive,
    });
    let products_to_activate = products.map((pro) => {
      return {
        id: pro.id,
        title: pro.title,
        apps: pro.apps.map((aap) => {
          return {
            id: aap.id,
            isChecked: appToActive.find((a) => a.id === aap.id) ? true : false,
            title: aap.title,
          };
        }),
        features: pro.features.map((ffa) => {
          return {
            id: ffa.id,
            isChecked: featureToActive.find((a) => a.id === ffa.id)
              ? true
              : false,
            title: ffa.title,
          };
        }),
      };
    });
    products_to_activate = products_to_activate.map((pro) => {
      return {
        ...pro,
        activeCount:
          pro.apps.filter((a) => a.isChecked).length +
          pro.features.filter((f) => f.isChecked).length,
      };
    });

    const settingDoc = await Setting.where("is_deleted", "==", false).get();
    const settingData = settingDoc.docs.map((a) => {
      return {
        id: a.id,
        ...a.data(),
      };
    });

    const settings = settingData[0];

    const redeemCode = await generateUniqueCode(firstname, lastname);
    console.log("redeem code is....", redeemCode);

    //adding products of code to user's account
    let newPurchased = user.purchased.map((p) => {
      if (productIDs.includes(p.id)) {
        products = products.slice(productIDs.indexOf(p.id), 1);
        productIDs = productIDs.slice(productIDs.indexOf(p.id), 1);
        return {
          ...p,
          apps: p.apps.map((ap) => {
            const appIsActive = appToActive.find((app) => app.id === ap.id);

            if (!ap.active && !!appIsActive) {
              console.log(email);
              return {
                ...ap,
                active: true,
                activated_on: new Date(),
                code_used: redeemCode,
                notes: `email: ${email},\nShopify : INV${order.name}`,
              };
            } else {
              return ap;
            }
          }),
          features: p.features.map((fa) => {
            const featureIsActive = featureToActive.find(
              (feature) => feature.id === fa.id
            );

            if (!fa.active && !!featureIsActive) {
              return {
                ...fa,
                active: true,
                activated_on: new Date(),
                code_used: redeemCode,
                notes: `email: ${email},\nShopify : INV${order.name}`,
              };
            } else {
              return fa;
            }
          }),
        };
      } else {
        return p;
      }
    });
    console.log(productIDs);
    if (products.length > 0) {
      const newProducts = products.map((prod) => {
        return {
          id: prod.id,
          activeCount: 0,
          title: prod.title,
          apps: prod.apps.map((oneApp, i) => {
            console.log("appToActive", i, "number", appToActive, oneApp.id);
            if (appToActive.find((a) => a.id === oneApp.id)) {
              return {
                activated_on: new Date().toString(),
                active: true,
                code_used: redeemCode,
                id: oneApp.id,
                launches_since_activation: 0,
                notes: `email: ${email},\nShopify : INV${order.name}`,
                title: oneApp.title,
              };
            } else {
              return {
                activated_on: "",
                active: false,
                code_used: "",
                id: oneApp.id,
                launches_since_activation: 0,
                notes: "",
                title: oneApp.title,
              };
            }
          }),
          features: prod.features.map((onefeature) => {
            if (featureToActive.find((f) => f.id === onefeature.id)) {
              return {
                activated_on: new Date(),
                active: true,
                code_used: redeemCode,
                id: onefeature.id,
                launches_since_activation: 0,
                notes: `email: ${email},\nShopify : INV${order.name}`,
                title: onefeature.title,
              };
            } else {
              return {
                activated_on: "",
                active: false,
                code_used: "",
                id: onefeature.id,
                launches_since_activation: 0,
                notes: "",
                title: onefeature.title,
              };
            }
          }),
        };
      });
      console.log(newProducts);
      newPurchased = [...newPurchased, ...newProducts];
    }
    newPurchased = newPurchased.map((e) => {
      return {
        ...e,
        activeCount:
          e.apps.filter((a) => a.active).length +
          e.features.filter((f) => f.active).length,
      };
    });

    console.log("remaining product ids", productIDs);

    const mailChimpDetails = {
      purchased: newPurchased,
      email,
      firstname,
      lastname,
      custId: order.customer.id
    };

    addToMailchimpList(mailChimpDetails);
    await Shopify.doc(ShopifyDoc.id).update({
      mailchimptags: "mailchimp added for "+email,
    });
    await User.doc(user.id).update({
      purchased: newPurchased,
    });
   

    //fulll filling orders which are digital
    const orderid = order.id;
    console.log("unFulfilledSKUs",unFulfilledSKUs)
    const line_items = order.line_items.filter((item) => unFulfilledSKUs.includes(item.sku)).map((el)=>{
      return{
        id: el.id,
      }
    });
    if(line_items && line_items.length > 0){
      var data = {
        fulfillment: {
          location_id: 5069865020,
          line_items,
          notify_customer: false,
        }
      };
      fullfillOrder(orderid,data);
      await Shopify.doc(ShopifyDoc.id).update({
        fullFilled_line_items: line_items,
      });
    }


    console.log("purchased successfull");

    await Shopify.doc(ShopifyDoc.id).update({
      purchased: "purchased successfull",
    });

    let codeHistory = await CodeHistory.where("code", "==", redeemCode)
      .where("user_id", "==", user.id)
      .get();

    codeHistory = codeHistory.docs.map(async (history) => {
      const codeHistoryData = {
        id: history.id,
        ...history.data(),
      };
      let updatedExpiryDate =
        codeHistoryData.expiry_date > expiryDate
          ? codeHistoryData.expiry_date
          : expiryDate;
      await CodeHistory.doc(codeHistoryData.id).update({
        expiry_date: updatedExpiryDate,
        activation: true,
        activated_at: activatedAt,
        product_activated: products_to_activate,
      });
      return codeHistoryData;
    });

    if (!(codeHistory.length > 0)) {
      await CodeHistory.add({
        code: redeemCode,
        expiry_date: expiryDate,
        activation: true,
        activated_at: activatedAt,
        product_activated: products_to_activate,
        purchase_location: settings.default_purchase_location,
        user_id: user.id,
        special_code: false,
      });
    }

    if (userExist) {
      await Shopify.doc(ShopifyDoc.id).update({
        user_exist: true,
      });

      const body =
        "<p>Hi " +
        firstname +
        ",</p>" +
        "<p>Thank you for your purchase from ThoughtCast Magic. For the items in your most recent order </p>" +
        "<h3>INV" +
        order.name +
        "</h3>" +
        "We have found your account in our system and activated your products automatically. Please log into https://thoughtcastmagic.com/owners to find the instructions for any products you have just purchased. " +
        "<p>And, as always, if you have any issues just hit reply to this email and we'll help you out.</p>" +
        "<p>Thank you again!</p>";

      const message = {
        to: email,
        subject: "ThoughtCast Product Activation",
        html: htmlMail("ThoughtCast Product Activation", body),
      };

      sendMail(message);

      await Shopify.doc(ShopifyDoc.id).update({
        mail:
          "mail has been sent to" + email + "to inform product is activated",
      });
    } else {
      await Shopify.doc(ShopifyDoc.id).update({
        user_exist: false,
      });
      console.log("user not found");

      //send mail when user not exist and we created one for them.

      if (products_to_activate.length > 0) {
        function generateResetPasswordToken() {
          const resetToken = crypto.randomBytes(15).toString("hex");
          this.passwordResetToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");
          return resetToken;
        }

        const resetPasswordToken = generateResetPasswordToken();
        const resetPasswordLink =
          "https://thoughtcastowners.com/changepassword/" + resetPasswordToken;
        const link_expire_on = moment().add(1, "days").format();

        const updateData = {
          resetPasswordToken: resetPasswordToken,
          expire_on: link_expire_on,
          expired: false,
        };

        await User.doc(user.id).update(updateData);

        await Shopify.doc(ShopifyDoc.id).update({
          redeem_code: redeemCode,
        });

        const body =
          "<p>Hi " +
          firstname +
          ",</p>" +
          "<p>Thank you for your purchase from ThoughtCast Magic. For the items in your most recent order </p>" +
          "<h3>INV" +
          order.name +
          "</h3>" +
          "<p>We could not find an account in our system with your matching email address, so an account has been made for you and your products have been activated automatically. Please click the link below to set your password, then log in to our user portal to view the instructions for any products you have just purchased.</p>" +
          "<p>" +
          resetPasswordLink +
          "</p>" +
          "<p>And, as always, if you have any issues just hit reply to this email and we'll help you out.</p>" +
          "<p>Thank you again!</p>";

        const message = {
          to: email,
          subject: "ThoughtCast Product Activation",
          html: htmlMail("ThoughtCast Product Activation", body),
        };

        sendMail(message);

        await Shopify.doc(ShopifyDoc.id).update({
          success: true,
          mail:
            "mail has been sent to" + email + "to activate code instructions ",
        });

        console.log("product found and mail has been sent to " + email);
      } else {
        console.log("no products found");
      }

      return res.status(200).json({
        data: "mail has been sent to " + email,
        success: true,
      });
    }
    return res.status(200).json({
      data: "Successfully added products :)",
      success: true,
    });
    // }else{
    //     console.log( `order is still ${order.financial_status}`);
    //     return res.status(200).json({
    //         error: `order is still ${order.financial_status}`,
    //         success: false,
    //     });
    // }
  } catch (error) {
    console.error(error);
    return res.status(200).json({
      error: error.message,
      success: false,
    });
  }
};
