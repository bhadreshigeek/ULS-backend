var admin = require("firebase-admin");

var serviceAccount = require("../admin-sdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://thoughtcast-magic.firebaseio.com",
  storageBucket: "gs://thoughtcast-magic.appspot.com"
});

const bucket = admin.storage().bucket()
const database = admin.firestore()
database.settings({ ignoreUndefinedProperties: true })

const User = database.collection("users")
const UniqueId = database.collection("uniqueId")
const Product = database.collection("products")
const Code = database.collection("codes")
const Setting = database.collection("settings")
const subscriptionPlans = database.collection("subscriptionPlans")
const StripePayment = database.collection("stripePayments")
const StripeSubscriptionPlan = database.collection("stripeSubscriptionPlans")
const DisplayOrder = database.collection("displayOrder")
const UserSubscription = database.collection("userSubscriptions")
const CodeHistory = database.collection("codeHistory")
const ApiKey = database.collection("apiKey")
const Shopify = database.collection("Shopify")

module.exports = {
    bucket,
    User,
    UniqueId,
    Product,
    Code,
    subscriptionPlans,
    Setting,
    StripePayment,
    StripeSubscriptionPlan,
    DisplayOrder,
    UserSubscription,
    CodeHistory,
    ApiKey,
    Shopify
}
