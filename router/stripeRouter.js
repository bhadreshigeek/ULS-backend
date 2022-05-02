const express = require("express")
const router = express.Router()

const stripeController = require("../controller/stripeController")
const { checkUserToken ,checkAllToken } = require("../middleware/checkToken")

router.post("/stripe_payment",stripeController.stripe_payment)
router.post("/make_payment",checkUserToken,stripeController.makePayment)
router.post("/add_subscription",stripeController.addSubscription)
router.post("/add_subscription_for_stripe",stripeController.addStripeSubs)
router.post("/cancel_subscription",checkAllToken,stripeController.cancelSubscription)

module.exports = router