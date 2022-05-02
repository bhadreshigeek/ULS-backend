const { UserSubscription,subscriptionPlans } = require("../database/database")

exports.addUserSubscription = async (req, res) => {
    try {
        const userId = req.body.user_id
        const active = true
        const expirationDate = req.body.expiration_date
        const comment = req.body.comment
        const productId = req.body.product_id
        const isDeleted = true

        const userSubs = await UserSubscription.add({
            user_id: userId,
            active: active,
            expiration_date: expirationDate,
            comment: comment,
            product_id: productId,
            is_deleted: isDeleted
        })
        const userSubsData = await UserSubscription.doc(userSubs.id).get()
        const datas = {
            id: userSubsData.id,...userSubsData.data()
        }
        return res.status(200).json({
            data: datas,
            success: true
        })
    } catch (error) {
        return res.status(400).json({
            error: error.message,
            success: false
        })
    }
}
