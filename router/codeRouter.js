const express = require("express")
const router = express.Router()

const codeController = require("../controller/codeController")
const { checkToken } = require("../middleware/checkToken")

router.post("/add_multi_code",checkToken,codeController.addCode)
router.get("/codes",checkToken,codeController.codes)
router.get("/code",checkToken,codeController.code)
router.post("/update_code",checkToken,codeController.updateCode)
router.post("/delete_multiple_code",checkToken,codeController.deleteMultipleCodes)
router.get("/check_code_is_active_or_not",codeController.checkCodeIsActiveOrNot)
router.get("/code_history",checkToken,codeController.getCodeHistory)
router.post("/code_activation",checkToken,codeController.activeDeactiveCode)
router.get("/cron_job_for_expire_code",codeController.cronJobForExpireCode)
router.get("/cron_job_for_expire_code_soon",codeController.crobnJobForExpireCodeSoon)
router.get("/cron_job_for_extend_auto_expiry",codeController.cronJobForExtendExpiryAutoPayment)

module.exports = router