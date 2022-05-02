const express = require("express")
const router = express.Router()

const UserSubscription = require("../controller/userSubscriptionController")

router.post("/add_user_subscription",UserSubscription.addUserSubscription)

module.exports =  router