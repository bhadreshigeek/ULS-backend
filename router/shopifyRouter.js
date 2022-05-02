const express = require("express")
const router = express.Router()

const shopifyController = require("../controller/shopifyController")
const { validateShopifySignature } = require("../middleware/checkShopify")

router.post("/webhook/orders/paid",validateShopifySignature,shopifyController.orderPaidShopify)

module.exports = router