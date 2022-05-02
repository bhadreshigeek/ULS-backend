const { apps } = require("firebase-admin");
const admin = require("firebase-admin");
const moment = require("moment");
const { base64encode, base64decode } = require('nodejs-base64');
const {
  Product,
  DisplayOrder,
  subscriptionPlans,
  User,
  UniqueId,
  StripePayment,
} = require("../database/database");
const stripe = require("stripe")(
  "sk_test_51JKKzMSHR9BxipxqxQzhrRb0clcRdxLMVkrqttME0VSCD5r2PifZ8LJ7wUqf0XhuZpQA0l2VNNrLq7osYw1WnXT700amRGEZ23",
  { apiVersion: "2020-08-27" }
);
const { addToMailchimpList } = require("../utils/mailchimp");

exports.addProduct = async (req, res) => {
  try {
    const title = req.body.title;
    const product_id = req.body.product_id || null;
    const description = req.body.description;
    const icon = req.body.icon;
    const learn_more = req.body.learn_more;
    const price = req.body.price;
    const purchase_link = null;
    const apps = req.body.apps || [];
    const features = req.body.features || [];
    const available = req.body.available;
    const deprecated = req.body.deprecated;
    const parent_id = req.body.parent_id;
    const type = req.body.type;
    const activated_at = new Date();
    const created_at = new Date();
    const updated_at = new Date();
    const is_deleted = false;

    let duplicateSKU = false;

    apps.forEach((app) => {
      if((app.shopify_SKU !== '') && (app.shopify_unfulfill_SKU !== '')){
        if((app.shopify_SKU).trim() === (app.shopify_unfulfill_SKU).trim()){
          duplicateSKU = true;     
        }
      }
    })
    
    features.forEach((app) => {
      if((app.shopify_SKU !== '') && (app.shopify_unfulfill_SKU !== '')){
        if((app.shopify_SKU).trim() === (app.shopify_unfulfill_SKU).trim()){
          duplicateSKU = true;
        }
      }
    })

    if(duplicateSKU){
      return res.status(400).json({
        error: "Some SKU's are duplicated in both fulfill and do not fulfill field. Please remove the duplicates and try saving again.",
        success: false
      })
    }
    
    const product = await Product.add({
      product_id,
      title,
      description,
      icon,
      learn_more,
      type,
      price,
      purchase_link,
      apps,
      parent_id,
      features,
      available,
      deprecated,
      activated_at,
      created_at,
      updated_at,
      is_deleted,
    });

    const newProduct = await Product.doc(product.id).get();
    const productDatas = {
      id: newProduct.id,
      ...newProduct.data(),
    };

    let array = [];
    let displayOrder = await DisplayOrder.where(
      "is_deleted",
      "==",
      false
    ).get();
    if (displayOrder && displayOrder.docs.length > 0) {
      array = displayOrder.docs.map((dOrder) => {
        return {
          id: dOrder.id,
          ...dOrder.data(),
        };
      });
    }

    let allUser = await User.where("auto_product_active", "==", true)
      .where("is_deleted", "==", false)
      .get();
    allUser = allUser.docs.map((i) => {
      return {
        id: i.id,
        ...i.data(),
      };
    });
    const updatedUsers = allUser.map((singleUser) => {
      const newActivateProduct = {
        id: newProduct.id,
        activeCount: apps.length + features.length,
        title: title,
        apps: apps.map((app) => {
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
        features: features.map((feature) => {
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
      let newPurchased = singleUser.purchased;
      newPurchased.push(newActivateProduct);

      return {
        ...singleUser,
        purchased: newPurchased,
      };
    });

    updatedUsers.forEach(async (i) => {
      const pproducts = i.purchased.filter((a) => a.activeCount > 0);
      const { email, firstname, lastname } = i;

      const mailChimpDetails = {
        purchased: pproducts,
        email,
        firstname,
        lastname,
      };
      addToMailchimpList(mailChimpDetails);
      await User.doc(i.id).update({ purchased: pproducts });
    });
    if (product_id) {
      await UniqueId.add({
        type: "product",
        id: product_id.toString(),
        firebase_id: product.id.toString(),
        parent_id: product.id.toString(),
      });
    }

    apps.forEach(async (ap) => {
      if (ap && ap.custom_id) {
        await UniqueId.add({
          type: "app",
          firebase_id: ap.id.toString(),
          id: ap.custom_id.toString(),
          parent_id: product.id.toString(),
        });
      }
    });

    features.forEach(async (fa) => {
      if (fa.custom_id) {
        await UniqueId.add({
          type: "feature",
          firebase_id: fa.id.toString(),
          id: fa.custom_id.toString(),
          parent_id: product.id.toString(),
        });
      }
    });

    if (array.length > 0) {
      const newArray = array[0].product_id;
      newArray.push(product.id);
      await DisplayOrder.doc(array[0].id).update({
        product_id: newArray,
        is_deleted: false,
      });

      res.status(200).json({
        data: productDatas,
        success: true,
      });
    } else {
      const added = await DisplayOrder.add({
        product_id: [product.id],
        is_deleted: false,
      });
      res.status(200).json({
        data: productDatas,
        success: true,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const tokenData = req.user;
    if (tokenData.role === 1) {
      let array = [];
      let newArray = [];
      const data = await Product.where("is_deleted", "==", false).get();
      for (i of data.docs) {
        if (i.data()) {
          if (i.data().type === "product") {
            const productDatas = {
              id: i.id,
              ...i.data(),
            };
            array.push(productDatas);
          } else if (i.data().type === "subscription") {
            const subscription = await subscriptionPlans
              .doc(i.data().subscription_id)
              .get();
            const subsData = subscription.data();
            const productDatas = {
              product: {
                id: i.id,
                ...i.data(),
              },
              id: subscription.id,
              ...subsData,
            };
            newArray.push(productDatas);
          }
        }
      }

      if (array.length > 0) {
        return res.status(200).json({
          data: {
            products: array || [],
            subscription: newArray || [],
          },
          success: true,
        });
      } else if (array.length === 0 && newArray.length === 0) {
        return res.status(400).json({
          error: "Product not found",
          success: false,
        });
      } else {
        return res.status(200).json({
          data: {
            products: array || [],
            subscription: newArray || [],
          },
          success: true,
        });
      }
    } else if (tokenData.role === 2) {
      let array = [];
      let newArray = [];
      const data = await Product.where("is_deleted", "==", false).get();

      for (i of data.docs) {
        if (i.data()) {
          if (i.data().type === "product") {
            const productDatas = {
              id: i.id,
              ...i.data(),
            };
            array.push(productDatas);
          } else if (i.data().type === "subscription") {
            const subscription = await subscriptionPlans
              .doc(i.data().subscription_id)
              .get();
            const subsData = subscription.data();
            const productDatas = {
              id: subscription.id,
              ...subsData,
            };
            newArray.push(productDatas);
          }
        }
      }
      if (array.length > 0) {
        return res.status(200).json({
          data: {
            products: array,
            subscription: newArray,
          },
          success: true,
        });
      } else if (array.length === 0 && newArray.length === 0) {
        return res.status(400).json({
          error: "Product not found",
          success: false,
        });
      } else {
        return res.status(200).json({
          data: {
            products: array,
            subscription: newArray,
          },
          success: true,
        });
      }
    } else if (tokenData.role === 3) {
      let array = [];
      let newArray = [];
      let productId = [];
      const displayOrder = await DisplayOrder.get();
      displayOrder.forEach((e) => {
        productId.push(e.data().product_id);
      });
      for (e of productId[0]) {
        const data = await Product.doc(e).get();
        let i = data;
        if (i.data() && i.data().type === "product") {
          if (i.data().available === true && i.data().is_deleted == false) {
            const productDatas = {
              id: i.id,
              ...i.data(),
            };
            array.push(productDatas);
          }
        }
      }
      const productData = await Product.where(
        "type",
        "==",
        "subscription"
      ).get();
      
      const productDatas = productData.docs.map((e) => e.data());
      const subscription = await subscriptionPlans
        .doc(productDatas[0].subscription_id)
        .get();
      const subsData = subscription.data();
      if (subsData.visible == true && subsData.is_deleted == false) {
        const newproductDatas = {
          id: subscription.id,
          ...subsData,
          product : productDatas[0]
        };
        newArray.push(newproductDatas);
      }
      return res.status(200).json({
        data: {
          products: array,
          subscription: newArray,
        },
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

exports.getProduct = async (req, res) => {
  try {
    const tokenData = req.user;
    const id = req.query.id;
    if (!id) {
      return res.status(400).json({
        error: "Please enter id",
        success: false,
      });
    }
    if (tokenData.role === 1) {
      const product = await Product.doc(id).get();
      const productData = product.data();
      if (productData.is_deleted === false && productData !== undefined) {
        return res.status(200).json({
          data: productData,
          success: true,
        });
      } else {
        return res.status(400).json({
          error: "Product not found",
          success: false,
        });
      }
    } else if (tokenData.role === 2) {
      const product = await Product.doc(id).get();
      const productData = product.data();
      if (
        productData.parent_id === tokenData.id &&
        productData.is_deleted === false &&
        productData !== undefined
      ) {
        return res.status(200).json({
          data: productData,
          success: true,
        });
      } else {
        return res.status(400).json({
          error: "Product not found",
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

exports.updateProduct = async (req, res) => {
  try {
    const tokenData = req.user;
    const productId = req.query.id;
    const data = req.body;

    let duplicateSKU = false;
    
    if (!productId) {
      return res.status(400).json({
        error: "Please provide id",
        success: false,
      });
    }

    data.apps.forEach((app) => {
      if((app.shopify_SKU !== '') && (app.shopify_unfulfill_SKU !== '')){
        if((app.shopify_SKU).trim() === (app.shopify_unfulfill_SKU).trim()){
          duplicateSKU = true;     
        }
      }
    })
    
    data.features.forEach((app) => {
      if((app.shopify_SKU !== '') && (app.shopify_unfulfill_SKU !== '')){
        if((app.shopify_SKU).trim() === (app.shopify_unfulfill_SKU).trim()){
          duplicateSKU = true;
        }
      }
    })

    if(duplicateSKU){
      return res.status(400).json({
        error: "Some SKU's are duplicated in both fulfill and do not fulfill field. Please remove the duplicates and try saving again.",
        success: false
      })
    }

    if (tokenData.role === 1) {
      const productDoc = await Product.doc(productId).get();

      const productData = {
        id: productDoc.id,
        ...productDoc.data(),
      };

      await Product.doc(productId).update(data);

      const database = admin.firestore();
      const idbatch = database.batch();
      const ids = await UniqueId.where("parent_id", "==", productId).get();
      ids.docs.map(async (d) => {
        idbatch.delete(UniqueId.doc(d.id));
      });
      await idbatch.commit();

      let users = await User.where("auto_product_active", "==", true)
        .where("is_deleted", "==", false)
        .get();

      users = users.docs.forEach(async (user) => {
        const uData = {
          id: user.id,
          ...user.data(),
        };
        let changes = false;
        const newPurchased = uData.purchased.map((p) => {
          if (
            p.id === productId &&
            (p.apps.length !== data.apps.length ||
              p.features.length !== data.features.length)
          ) {
            const newP = {
              ...p,
              activeCount: data.apps.length + data.features.length,
              apps: data.apps.map((ap) => {
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
              features: data.features.map((fa) => {
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
            changes = true;
            return newP;
          } else {
            return p;
          }
        });
        if (changes) {
          const { firstname, lastname, email } = uData;

          const mailChimpDetails = {
            purchased: newPurchased,
            email,
            firstname,
            lastname,
          };

          addToMailchimpList(mailChimpDetails);

          await User.doc(uData.id).update({
            purchased: newPurchased,
          });
          changes = false;
        }
      });

      const product_id = data.product_id;
      const apps = data.apps;
      const features = data.features;
      if (product_id) {
        await UniqueId.add({
          type: "product",
          id: product_id.toString(),
          firebase_id: productId.toString(),
          parent_id: productId.toString(),
        });
      }

      apps.forEach(async (ap) => {
        if (ap && ap.custom_id) {
          await UniqueId.add({
            type: "app",
            firebase_id: ap.id.toString(),
            id: ap.custom_id.toString(),
            parent_id: productId.toString(),
          });
        }
      });

      features.forEach(async (fa) => {
        if (fa && fa.custom_id) {
          await UniqueId.add({
            type: "feature",
            firebase_id: fa.id.toString(),
            id: fa.custom_id.toString(),
            parent_id: productId.toString(),
          });
        }
      });

      return res.status(200).json({
        data: "Record updated",
        success: true,
      });
    } else if (tokenData.role === 2) {
      const product = await Product.doc(productId).get();
      const productData = product.data();
      if (productData.parent_id === tokenData.id) {
        await Product.doc(productId).update(data);
        return res.status(200).json({
          data: "Record updated",
          success: true,
        });
      } else {
        return res.status(400).json({
          error: "Record not found",
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

exports.deleteMultipleProduct = async (req, res) => {
  try {
    const productId = req.body.id;
    if (!productId) {
      return res.status(200).json({
        error: "Please enter id",
        success: false,
      });
    }
    const database = admin.firestore();

    await productId.forEach(async (i) => {
      const idbatch = database.batch();
      const ids = await UniqueId.where("parent_id", "==", i).get();
      ids.docs.map(async (d) => {
        idbatch.delete(UniqueId.doc(d.id));
      });
      await idbatch.commit();
    });

    const batch = database.batch();
    const arr = productId.map((e) => Product.doc(e));
    arr.forEach((i) => {
      batch.update(i, { is_deleted: true });
    });

    await batch.commit();

    const deleteDisplayOrder = await DisplayOrder.get();
    const displayOrderData = deleteDisplayOrder.docs.map((e) => {
      return { id: e.id, ...e.data() };
    })[0];

    const productIds = displayOrderData.product_id;
    console.log(productId);
    const newOrderData = productIds.filter((i) => !productId.includes(i));
    await DisplayOrder.doc(displayOrderData.id).update({
      product_id: newOrderData,
    });

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

exports.addProductId = async (req, res) => {
  try {
    const tokenData = req.user;
    if (tokenData.role === 1) {
      const data = req.body;
      let array = [];
      const displayOrder = await DisplayOrder.where(
        "is_deleted",
        "==",
        false
      ).get();
      displayOrder.forEach((i) => {
        array.push(i.id);
      });
      await DisplayOrder.doc(array[0]).update(data);
      return res.status(200).json({
        data: "Order updated",
        success: true,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.getProductsId = async (req, res) => {
  try {
    let array = [];
    let arrayData = [];
    const displayOrder = await DisplayOrder.where(
      "is_deleted",
      "==",
      false
    ).get();
    displayOrder.forEach((i) => {
      array.push(i.data().product_id);
    });
    if (array.length > 0) {
      const displayOrderData = array[0];

      const products = await Promise.allSettled(displayOrderData.map(async (a)=>{
        return await Product.doc(a).get();
      }))
      console.log(products)
      const arrayDataa = products.map((p)=>{
        if(p.status === "fulfilled"){
          const pro = {
            id:p.value.id,
            ...p.value.data()
          }
          console.log(p.value.data())
          if (
            pro &&
            pro.is_deleted == false &&
            pro.type !== "subscription"
          ) {
            return pro;
          }
          
        }
      }).filter((a)=>a);
      console.log(arrayDataa);
      // for (const i of displayOrderData) {
      //   const product = await Product.doc(i).get();
      //   if (
      //     product.data() &&
      //     product.data().available == true &&
      //     product.data().is_deleted == false &&
      //     product.data().type !== "subscription"
      //   ) {
      //     arrayData.push({ id: product.id, ...product.data() });
      //   }
      // }
      return res.status(200).json({
        data: arrayDataa,
        success: true,
      });
    } else {
      return res.status(400).json({
        error: "Product not found",
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

exports.activeProduct = async (req, res) => {
  try {
    const product = await Product
      .where("is_deleted", "==", false)
      .get();
    let array = [];
    product.forEach((i) => {
      const datas = {
        id: i.id,
        ...i.data(),
      };
      array.push(datas);
    });
    return res.status(200).json({
      data: array,
      success,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.getAppDeviceId = async (req, res) => {
  try {
    const email = req.body.email;
    const appcustomId = req.body.appId;
    const password = req.body.password;

    if (!(email && appcustomId)) {
      return res.status(400).json({
        error: "Please enter email and appId",
        success: false,
      });
    }

    if(!password){
      return res.status(400).json({
        error: "password id is required!",
        success: false,
      });
    }

    let encodedPassword = base64decode(password);

    const ids = await UniqueId.where("id", "==", appcustomId).get();

    const idArray = ids.docs.map((e) => e.data());
    let appId = null;

    if (idArray.length > 0) {
      appId = idArray[0].firebase_id;
    }

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

    if(userData[0].password !== encodedPassword){
      return res.status(400).json({
        error: "Incorrect user password!",
        success: false,
      });
    }

    // if (userData[0].password === password) {
    const PurchasedData = Array.from(userData[0].purchased);
    let AppData = [];
    PurchasedData.map((allSingleData) => {
      allSingleData.apps.map((appValue) => {
        if (appValue.id == appId) {
          AppData.push(appValue);
        }
      });
    });
    if (AppData && AppData.length > 0) {
      if (AppData[0].active) {
        return res.status(200).json({
          data: {
            deviceId: AppData[0].deviceId || null,
          },
          success: true,
        });
      } else {
        return res.status(400).json({
          error: "You have to purchase this app",
          success: false,
        });
      }
    } else {
      return res.status(400).json({
        error: "App not found",
        success: false,
      });
    }
    // } else {
    //   return res.status(400).json({
    //     error: "Password does not match",
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

exports.EditAppDetails = async (req, res) => {
  try {
    const email = req.body.email;
    const appcustomId = req.body.appId;
    // const ftrCustomId = req.body.featureId;
    const deviceId = req.body.deviceId;
    const lastUsed = new Date();
    const launchesSinceActivation = null;

    if(!appcustomId && !ftrCustomId){
      return res.status(400).json({
        error: "Please provide atlist one app or feature id",
        success: false,
      });
    }
    const ids = await UniqueId.where("id", "in", [
      appcustomId,
      // ftrCustomId,
    ]).get();

    const idArray = ids.docs.map((e) => e.data());
    let appId = null;
    // let featureId = null;

    if (idArray.length > 0) {
      idArray.forEach((a) => {
        if (a.type === "app") {
          appId = a.firebase_id;
        }
        // if (a.type === "feature") {
        //   featureId = a.firebase_id;
        // }
      });
    }

    if (!email) {
      return res.status(400).json({
        error: "Please provide email",
        success: false,
      });
    }
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
    // if (userData[0].password === password) {
    let PurchasedData = Array.from(userData[0].purchased);
    let AppData = 0;
    let type = null;
    PurchasedData = PurchasedData.map((allSingleData) => {
      return {
        ...allSingleData,
        apps: allSingleData.apps.map((appValue) => {
          if (appValue.id == appId) {
            if (appValue.active === true) {
              AppData++;
              type = "app";
              return {
                ...appValue,
                deviceId: deviceId || appValue.deviceId,
                last_used: lastUsed || appValue.last_used,
                launches_since_activation:
                  launchesSinceActivation || appValue.launches_since_activation,
              };
            } else {
              return appValue;
            }
          } else {
            return appValue;
          }
        }),
        // features: allSingleData.features.map((featureValue) => {
        //   if (featureValue.id == featureId) {
        //     if (featureValue.active === true) {
        //       AppData++;
        //       type = "feature";
        //       return {
        //         ...featureValue,
        //         last_used: lastUsed || featureValue.last_used,
        //         launches_since_activation:
        //           launchesSinceActivation ||
        //           featureValue.launches_since_activation,
        //       };
        //     } else {
        //       return featureValue;
        //     }
        //   } else {
        //     return featureValue;
        //   }
        // }),
      };
    });
    if (AppData === 1 || AppData === 2) {
      await User.doc(userData[0].id).update({ purchased: PurchasedData });
      if (AppData === 2) {
        res.status(200).json({
          message: "app and feature details updated successfully",
          success: true,
        });
      } else if (AppData === 1) {
        res.status(200).json({
          message: `${type} details updated successfully`,
          success: true,
        });
      }
    } else {
      return res.status(400).json({
        error: "No app or feature found !",
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

exports.getActiveProducts = async (req, res) => {
  try {
    const email = req.body.email;
    const password = req.body.password;

    let productId = req.body.product_id;
    let featureId = req.body.feature_id;
    let appId = req.body.app_id;
    const queryArray = [];

    productId && queryArray.push(productId);
    featureId && queryArray.push(featureId);
    appId && queryArray.push(appId);

    if (!email) {
      return res.status(400).json({
        error: "Please enter email",
        success: false,
      });
    }
    if(!password){
      return res.status(400).json({
        error: "password id is required!",
        success: false,
      });
    }
    let encodedPassword = base64decode(password);
    if (!(productId || featureId || appId)) {
      return res.status(400).json({
        error: "Please enter product_id , app_id or feature_id",
        success: false,
      });
    }
    let user = await User.where("email", "==", email)
      .where("is_deleted", "==", false)
      .get();
    user = user.docs.map((e) => {
      return {
        id: e.id,
        ...e.data(),
      };
    });
    if (!user.length) {
      return res.status(400).json({
        error: "Email does not exist in our server",
        success: false,
      });
    }
    user = user[0];

    if(user.password !== encodedPassword){
      return res.status(400).json({
        error: "Incorrect user password!",
        success: false,
      });
    }

    const ids = await UniqueId.where("id", "in", queryArray).get();

    productId = null;
    appId = null;
    featureId = null;

    ids.docs.forEach((dd) => {
      const data = dd.data();

      if (data.type === "product") {
        productId = data.firebase_id;
      }
      if (data.type === "app") {
        appId = data.firebase_id;
        
      }
      if (data.type === "feature") {
        featureId = data.firebase_id;
      }
    });
    let featureArray = [];
    let AppArray = [];

    if (featureId || appId) {
      user.purchased.map(async (e) => {
        if (productId && e.id.toString() === productId.toString()) {
          e.apps.map((a) => {
            if (appId) {
              if (a.id.toString() === appId.toString() && a.active === true) {
                AppArray.push(a);
              }
            }
          });
          e.features.map((f) => {
            if (featureId) {
              if (
                f.id.toString() === featureId.toString() &&
                f.active === true
              ) {
                featureArray.push(f);
              }
            }
          });
        } else {
          e.apps.map((a) => {
            if (appId) {
              if (a.id.toString() === appId.toString() && a.active === true) {
                productId = e.id
                AppArray.push(a);
              }
            }
          });
          e.features.map((f) => {
            if (featureId) {
              if (
                f.id.toString() === featureId.toString() &&
                f.active === true
              ) {
                productId = e.id
                featureArray.push(f);
              }
            }
          });
        }
      });
    } else if (productId) {
      user.purchased.map((e) => {
        if (productId && e.id.toString() === productId.toString()) {
          e.apps.map((a) => {
            if (a.active === true) {
              AppArray.push(a);
            }
          });
          e.features.map((f) => {
            if (f.active === true) {
              featureArray.push(f);
            }
          });
        }
      });
    }

    if ((AppArray.length > 0 || featureArray.length > 0) && productId) {
      const product = await Product.doc(productId).get();
      const pdata = product.data();
      if (!pdata) {
        return res.status(400).json({
          error: "no products found",
          success: false,
        });
      }
      AppArray = AppArray.map((a) => {
        const app = pdata.apps.find((ap) => ap.id === a.id);
        return {
          id: app.custom_id,
          launches_since_activation: a.launches_since_activation,
          active: a.active,
          last_used: typeof(a.last_used) === "string" ? a.last_used : new Date(new Date().setTime(a.last_used._nanoseconds)),
          deviceId: a.deviceId || null,
          title: app.title,
        };
      });
      
      featureArray = featureArray.map((f) => {
        const feature = pdata.features.find((fa) => fa.id === f.id);
        return {
          id: feature.custom_id,
          launches_since_activation: f.launches_since_activation,
          active: f.active,
          last_used: typeof(f.last_used) === "string" ? f.last_used : new Date(new Date().setTime(f.last_used._nanoseconds)),
          title: feature.title,
        };
      });
      
      return res.status(200).json({
        apps: AppArray,
        features: featureArray,
        success: true,
      });
    } else {
      return res.status(400).json({
        error: "no active Apps or Feature found",
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

exports.checkSubscription = async (req, res) => {
  try {
    const email = req.body.email;
    const password = req.body.password;
    if (!email) {
      return res.status(400).json({
        error: "email is required!",
        success: false,
      });
    }
    if(!password){
      return res.status(400).json({
        error: "password is required!",
        success: false,
      });
    }
    let encodedPassword = base64decode(password);
    const userDoc = await User.where("email", "==", email)
      .where("is_deleted", "==", false)
      .get();
      
    let subsActive = false;
    if (!(userDoc.docs.length > 0)) {
      return res.status(400).json({
        error: "User not found!",
        success: false,
      });
    }
    const userData = userDoc.docs.map((a) => {
      
      return{
        id:a.id,
        ...a.data()
      }
    });
    const user = userData[0];
    if(user.password !== encodedPassword){
      return res.status(400).json({
        error: "Incorrect user password!",
        success: false,
      });
    }
    
    if (user.subscription_data) {
      if (user.subscription_data.active) {
        subsActive = true;
      }
    }
    
    if(!subsActive){
      const subsData = await StripePayment.where("user_id","==",user.id).where("active","==",true).get();
      const subsDetail = subsData.docs.map((a)=>{
        return{
          id:a.id,
          ...a.data()
        }
      });
      console.log(subsDetail);
      if(subsDetail.length > 0){
        const subscription = await stripe.subscriptions.retrieve(
          subsDetail[0].subscription_id
        );
        const expiryDate = moment
        .utc(subscription.current_period_end * 1000);
          console.log(expiryDate)
        if(expiryDate > moment()){
          subsActive = true;
        }
      }
    }
    const data = {
      subscription_active:subsActive,
      expiration_date: user.subscription_data.expiration_date,
    }
    return res.status(200).json({
      data: data,
      success: true,
    })

  } catch (error) {
    console.log(error)
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.checkProductId = async (req, res) => {
  try {
    const id = req.body.id;
    if (!id || id === "") {
      return res.status(400).json({
        error: "id is required !!",
        success: false,
      });
    }
    const idExist = await UniqueId.where("id", "==", id.toString()).get();
    const idArrayLength = idExist.docs.length;

    if (idArrayLength > 0) {
      return res.status(400).json({
        error: "Id already exist !!",
        success: false,
      });
    } else {
      return res.status(200).json({
        data: " Id is unique. ",
        success: true,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.checkSubscriptionExpiryDate = async (req, res) => {
  try {
    const userId = req.query.userId

    if(!userId){
      return res.status(400).json({
        error: "subsId is required !!",
        success: false,
      });
    }
    const userData = await User.doc(userId).get();
    const user = userData.data();
    if(!user){
      return res.status(400).json({
        error: "User not found !!",
        success: false,
      });
    }
    if(user.subscription_data){
      return res.status(200).json({
        data: user.subscription_data.expiration_date,
        success: true
      })
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false
    })
  }
}
