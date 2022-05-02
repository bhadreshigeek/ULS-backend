const express = require("express")
const router = express.Router()

const settingController = require("../controller/settingController")
const {checkToken} = require("../middleware/checkToken")

router.post("/add_setting",settingController.addSetting)
router.get("/get_setting",settingController.getSetting)
router.post("/update_setting",checkToken,settingController.updateSetting)

module.exports = router