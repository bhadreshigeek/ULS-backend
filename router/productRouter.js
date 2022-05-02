const express = require("express")
const router = express.Router()

const productController = require("../controller/productController")
const { checkSuperAdminToken,checkToken,checkAllToken,checkApiKey} = require("../middleware/checkToken")

router.post("/add_product",checkSuperAdminToken,productController.addProduct)
router.get("/products",checkAllToken,productController.getProducts)
router.get("/product",checkToken,productController.getProduct)
router.post("/update_product",checkToken,productController.updateProduct)
router.post("/delete_multiple_product",checkToken,productController.deleteMultipleProduct)
router.post("/add_display_order",checkToken,productController.addProductId)
router.get("/get_display_order",productController.getProductsId)
router.get("/active_products",productController.activeProduct)
router.post("/get_app_deviceid",checkApiKey,productController.getAppDeviceId)
router.post("/edit_app_details",checkApiKey,productController.EditAppDetails)
router.post("/get_active_products",checkApiKey,productController.getActiveProducts)
router.post("/check_Product_id",checkToken,productController.checkProductId)
router.post("/check_subscription",checkApiKey,productController.checkSubscription)
router.get("/get_subscription_expiry_date",checkApiKey,productController.checkSubscriptionExpiryDate)

module.exports = router