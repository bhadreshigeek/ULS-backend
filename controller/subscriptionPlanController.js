const {subscriptionPlans} = require("../database/database")

exports.updateMainSubscription = async (req, res) => {
    try {
        const subscriptionId = req.query.id
        if(!subscriptionId){
            return res.status(400).json({
                error: "Please enter subscription_id",
                success: false
            })
        }
        const data = req.body
        await subscriptionPlans.doc(subscriptionId).update(data)
        return res.status(200).json({
            data: "subscriptionPlan updated",
            success: true
        })
    } catch (error) {
        return res.status(400).json({
            error: "Please enter subscription_id",
            success: false
        })
    }
}
