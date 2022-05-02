const express = require("express")
const router = express.Router()

const subscirptioPlanController = require("../controller/subscriptionPlanController")
const { checkSuperAdminToken } = require("../middleware/checkToken")

router.post("/update_subscription_plan",checkSuperAdminToken,subscirptioPlanController.updateMainSubscription)

module.exports = router