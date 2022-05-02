const { app, apps } = require("firebase-admin");
const {
  StripePayment,
  subscriptionPlans,
  Product,
  CodeHistory,
  StripeSubscriptionPlan,
} = require("../database/database");
const { User } = require("../database/database");
const moment = require("moment");
const stripe = require("stripe")(
  "sk_test_51JKKzMSHR9BxipxqxQzhrRb0clcRdxLMVkrqttME0VSCD5r2PifZ8LJ7wUqf0XhuZpQA0l2VNNrLq7osYw1WnXT700amRGEZ23",
  { apiVersion: "2020-08-27" }
);

exports.StripeClient = stripe;

const {addToMailchimpList} = require("../utils/mailchimp");

exports.stripe_payment = async (req, res) => {
  try {
    const cardDetails = req.body.card_details;
    const Currency = req.body.currency || "USD";
    const amount = req.body.amount;
    const paymentProvider = req.body.payment_provider;

    if (!cardDetails) {
      return res.status(400).json({
        error: "Please enter card_deatils",
        success: false,
      });
    }
    const newCardToken = await stripe.tokens.create({
      card: {
        number: cardDetails.number,
        exp_month: cardDetails.exp_month,
        exp_year: cardDetails.exp_year,
        cvc: cardDetails.cvc,
      },
    });
    if (newCardToken) {
      const options = {
        source: newCardToken.id,
        currency: Currency || "USD",
        amount: amount,
        description: "My First Test Charge (created for API docs)",
        shipping: {
          name: "Test Customer",
          address: {
            line1: "123 ABC Street",
            postal_code: "395005",
            city: "Surat",
            state: "CA",
            country: "US",
          },
        },
      };
      const charge = await stripe.charges.create(options);
      const paymentDetails = {
        payment_amt: amount,
        payment_currency: Currency,
        paymentId: charge.id,
        created_at: new Date(),
      };
      await StripePayment.add({
        amount: amount,
        reference_id: charge.id,
        currency: Currency,
        payment_provider: paymentProvider,
      });
      if (charge.status == "succeeded") {
        return res.status(400).json({
          data: paymentDetails,
          success: true,
        });
      } else {
        return res.status(400).json({
          error: "Payment cancle",
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

exports.makePayment = async (req, res) => {
  try {
    const userId = req.body.user_id;
    const stripeSubsId = req.body.product_id;
    const name = req.body.name;
    const address = req.body.address;
    const duration = req.body.duration && req.body.duration.toLowerCase().replace("s",'');
    const price = req.body.price;
    const cardDetails = req.body.card_details;
    const currency = req.body.currency || "usd";
    const payment_provider = req.body.payment_provider || "stripe";
    
    if (!(userId && stripeSubsId && duration && price && cardDetails && address && currency && payment_provider && name )) {
      return res.status(400).json({
        error: "Please enter all deatils",
        success: false,
      });
    }
    const now = moment().format("YYYY-MM-DD") 
    const codeHistory = await CodeHistory.where("user_id","==",userId).where("code","==","Subscription").where("activation","==",true).get()

    const codeHistoryData = codeHistory.docs.map((i) => {
      const expiryDate = moment(i.data().expiry_date).format("YYYY-MM-DD")
      if(expiryDate >= now){
        return {
          id: i.id,...i.data()
        }
      }
    }).filter((a) => a)

    if(codeHistoryData.length > 0){
      return res.status(400).json({
        error: "Previous subscription already activate till "+codeHistoryData[0].expiry_date,
        success: false
      })
    }
    let stripePayment = await StripePayment.where("user_id","==",userId).get()
    stripePayment = stripePayment.docs.map((e) => 
    {
      return {
        id: e.id,...e.data()
      }
    })
    if(stripePayment.length > 0){
      stripePayment = stripePayment[0] 
      if(stripePayment.auto_subscription === true){
        return res.status(400).json({
          error: "Subscrioption already active",
          success: false
        })
      }
    }

    const user = await User.doc(userId).get();
    const userData = user.data();

    const firstname = userData.firstname;
    const lastname = userData.lastname;
    const email = userData.email;

    if (userData.customer_id) {
      const split_string = duration.split(" ");
      const Amount = price * 100;
      const stripePrice = await stripe.prices.create({
        unit_amount: Amount,
        currency: currency,
        recurring: {
          interval: split_string[1],
          interval_count: split_string[0],
        },
        product: stripeSubsId,
      });

      const paymentMethod = await stripe.paymentMethods.create({
        type: "card",
        card: {
          number: cardDetails.number,
          exp_month: Number(cardDetails.exp_month),
          exp_year: Number(cardDetails.exp_year),
          cvc: Number(cardDetails.cvc),
        },
      });

      await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: userData.customer_id,
      });

      const subscription = await stripe.subscriptions.create({
        customer: userData.customer_id,
        default_payment_method: paymentMethod.id,
        items: [{ price: stripePrice.id }],
      });

      const expiryDate = moment.utc(subscription.current_period_end * 1000).format("YYYY-MM-DD");

      let products = await Product.where("is_deleted","==", false).where("type","==", "product").get();
      products = products.docs.map((pro1) => {
        return {
          id: pro1.id,
          ...pro1.data(),
        };
      });

      let redeemCode = "Subscription";
      let codeHistory = await CodeHistory.where("user_id", "==", userId).where("activation", "==", true).get();
      codeHistory = codeHistory.docs.map((doc) => {
        return { id: doc.id, ...doc.data() };
      });

      // let betterCodes = codeHistory
      //   .filter((c) => new Date(c.expiry_date) > new Date(expiryDate))
      //   .map((ccc) => ccc.code);

      let betterCodes = [];

      const products_to_activate = products.map((pro) => {
        return {
          id: pro.id,
          title: pro.title,
          activeCount: pro.apps.length + pro.features.length,
          apps: pro.apps.map((app) => {
            return {
              id: app.id,
              title: app.title,
              isChecked: true,
            };
          }),
          features: pro.features.map((feature) => {
            return {
              id: feature.id,
              title: feature.title,
              isChecked: true,
            };
          }),
        };
      });
      let newPurchased = products_to_activate.map((pTa) => {
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
                return {
                  ...PurchasedApp[0],
                  code_used: betterCodes.includes(PurchasedApp[0].code_used) ? PurchasedApp[0].code_used : app.isChecked ? redeemCode : PurchasedApp[0].code_used,
                  active: betterCodes.includes(PurchasedApp[0].code_used) ? PurchasedApp[0].active : app.isChecked ? app.isChecked : PurchasedApp[0].active,
                  activated_on: betterCodes.includes(PurchasedApp[0].code_used) ? PurchasedApp[0].activated_on : app.isChecked ? new Date() : PurchasedApp[0].activated_on,
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

      const activeCount = newPurchased.map((e) => {
        return {
          ...e,
          activeCount:
            e.apps.filter((a) => a.active).length +
            e.features.filter((f) => f.active).length,
        };
      });

      await CodeHistory.add({
        code: "Subscription",
        activation: true,
        special_code: true,
        product_activated: products_to_activate,
        activated_at: moment().format("YYYY-MM-DD"),
        expiry_date: expiryDate,
        purchase_location: null,
        user_id: userId,
        is_email_send: false,
      });



      await User.doc(userId).update({
        purchased: activeCount,
        active_subscription: true
      });
      
      const mailchimpDetails = {
        purchased:activeCount,
        email,
        firstname,
        lastname
      }
      addToMailchimpList(mailchimpDetails);

      await StripePayment.add({
        active: true,
        date: new Date(),
        user_id: userId,
        amount: Number(Amount) / 100,
        currency: currency,
        payment_provider: payment_provider,
        subscription_id: subscription.id,
        auto_subscription: true
      });

      res.status(200).json({
        data: subscription,
        success: true,
      });
    } else {
      const customer = await stripe.customers.create({
        name: name,
        address: {
          line1: address.line1,
          postal_code: address.postal_code,
          city: address.city,
          state: address.state,
          country: "US",
        },
        description: "My First Test Customer (created for API docs)",
      });
      await User.doc(userId).update({
        customer_id: customer.id,
      });

      const split_string = duration.split(" ");
      const Amount = price * 100;

      const stripePrice = await stripe.prices.create({
        unit_amount: Amount,
        currency: currency,
        recurring: {
          interval: split_string[1],
          interval_count: split_string[0],
        },
        product: stripeSubsId,
      });

      const paymentMethod = await stripe.paymentMethods.create({
        type: "card",
        card: {
          number: cardDetails.number,
          exp_month: Number(cardDetails.exp_month),
          exp_year: Number(cardDetails.exp_year),
          cvc: Number(cardDetails.cvc),
        },
      });

      await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: customer.id,
      });

      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        default_payment_method: paymentMethod.id,
        items: [{ price: stripePrice.id }],
      });

      let products = await Product
        .where("is_deleted", "==", false)
        .where("type", "==", "product")
        .get();
      products = products.docs.map((pro1) => {
        return {
          id: pro1.id,
          ...pro1.data(),
        };
      });

      let redeemCode = "Subscription";
      let codeHistory = await CodeHistory.where("user_id", "==", userId)
        .where("activation", "==", true)
        .get();
      codeHistory = codeHistory.docs.map((doc) => {
        return { id: doc.id, ...doc.data() };
      });
      const expiryDate = moment.utc(subscription.current_period_end * 1000).format("YYYY-MM-DD");
      // let betterCodes = codeHistory
      //   .filter((c) => new Date(c.expiry_date) > new Date(expiryDate))
      //   .map((ccc) => ccc.code);

      let betterCodes = [];

      const products_to_activate = products.map((pro) => {
        return {
          id: pro.id,
          title: pro.title,
          activeCount: pro.apps.length + pro.features.length,
          apps: pro.apps.map((app) => {
            return {
              id: app.id,
              title: app.title,
              isChecked: true,
            };
          }),
          features: pro.features.map((feature) => {
            return {
              id: feature.id,
              title: feature.title,
              isChecked: true,
            };
          }),
        };
      });
      let newPurchased = products_to_activate.map((pTa) => {
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

      const activeCount = newPurchased.map((e) => {
        return {
          ...e,
          activeCount:
            e.apps.filter((a) => a.active).length +
            e.features.filter((f) => f.active).length,
        };
      });

      await CodeHistory.add({
        code: "Subscription",
        activation: true,
        special_code: true,
        product_activated: products_to_activate,
        activated_at: moment().format("YYYY-MM-DD"),
        expiry_date: expiryDate,
        purchase_location: null,
        user_id: userId,
        is_email_send: false,
      });
      
      await User.doc(userId).update({
        purchased: activeCount,
        active_subscription: true,
        auto_product_active:true,
        subscription_data:{
          expiration_date: moment(expiryDate).utc().toISOString(),
          activated_at: moment().utc().toISOString(),
          active:true,
          comments:""
        }
      });

      const mailchimpDetails = {
        purchased:activeCount,
        email,
        firstname,
        lastname
      }
      addToMailchimpList(mailchimpDetails);

      await StripePayment.add({
        active: true,
        date: new Date(),
        user_id: userId,
        amount: Number(Amount) / 100,
        currency: currency,
        payment_provider: payment_provider,
        subscription_id: subscription.id,
        auto_subscription: true
      });

      res.status(200).json({
        data: subscription,
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

exports.addSubscription = async (req, res) => {
  try {
    const visible = req.body.visible;
    const description = req.body.description;
    const learn_more_link = req.body.learn_more_link;
    const icon = req.body.icon;
    const pricing_options = req.body.pricing_options;
    const active_url = req.body.active_url;
    const inactive = req.body.inactive;
    const mailchimp = req.body.mailchimp;
    const is_deleted = req.body.is_deleted || false;

    await subscriptionPlans.add({
      visible,
      description,
      learn_more_link,
      icon,
      pricing_options,
      active_url,
      inactive,
      mailchimp,
      is_deleted,
    });
    return res.status(200).json({
      data: "SubscriptionPlan added",
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.addStripeSubs = async (req, res) => {
  try {
    const data = req.body;
    const stripeSubscriptionPlan = await StripeSubscriptionPlan.add(data);

    const product = await stripe.products.create({
      name: data.name,
    });

    await StripeSubscriptionPlan.doc(stripeSubscriptionPlan.id).update({
      stripe_product_id: product.id,
    });
    return res.status(200).json({
      data: product.id,
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.query.user_id
    if(!userId){
      return res.status(400).json({
        error: "Please enter user_id",
        success: false
      })
    }
    let stripePayment = await StripePayment.where("user_id","==",userId).get()
    stripePayment = stripePayment.docs.map((e) => 
    {
      return {
        id: e.id,...e.data()
      }
    })
    stripePayment = stripePayment[0]

    const deleteSubscription = await stripe.subscriptions.del(
      stripePayment.subscription_id
    )
    
    if(deleteSubscription && deleteSubscription.status === "canceled"){
      await StripePayment.doc(stripePayment.id).update({auto_subscription: false, active: false})
    }

    let subsData = await StripePayment.doc(stripePayment.id).get();
    subsData = {
      ...subsData.data(),
      id: subsData.id
    }
    let uData = await User.doc(stripePayment.user_id).get();
    uData = {
      id: uData.id,...uData.data()
    }

    return res.status(200).json({
      data: {
        uData,
        recursive: subsData
      },
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false
    })
  }
}

