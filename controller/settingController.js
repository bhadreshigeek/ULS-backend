const { Setting , User, subscriptionPlans} = require("../database/database")

exports.addSetting = async (req, res) => {
    try {
        const parent_id = req.body.parent_id
        const store_button_link = req.body.store_button_link
        const store_button_text = req.body.store_button_text
        const active_product_button_text = req.body.active_product_button_text
        const inactive_product_button_text = req.body.inactive_product_button_text
        const active_product_text = req.body.active_product_text
        const inactive_product_text = req.body.inactive_product_text
        const product_display_order = req.body.product_display_order
        const promotional_text = req.body.promotional_text
        const promotional_text_font_size = req.body.promotional_text_font_size
        const success_message = req.body.success_message
        const default_number_of_case = req.body.default_number_of_case
        const default_code_length = req.body.default_code_length
        const code_characters = req.body.code_characters
        const default_purchase_location = req.body.default_purchase_location
        const is_deleted = req.body.is_deleted || false

        if(!parent_id){
            return res.status(400).json({
                error: "Please enter parent_id",
                success: false
            })
        }

        const setting = await Setting.add({
            parent_id,
            store_button_link,
            store_button_text,
            active_product_button_text,
            inactive_product_button_text,
            active_product_text,
            inactive_product_text,
            product_display_order,
            promotional_text,
            promotional_text_font_size,
            success_message,
            default_number_of_case,
            default_code_length,
            code_characters,
            default_purchase_location,
            is_deleted
        })
        return res.status(200).json({
            data: "Setting added",
            success: true
        })
    } catch (error) {
        return res.status(400).json({
            error: error.message,
            success: false
        });
    }
}

exports.getSetting = async (req, res) => {
    try {
        const setting = await Setting.where("is_deleted","==",false).get()
        let array = []
        setting.forEach((i) => {
            const datas = {
                id: i.id, ...i.data()
            }
            array.push(datas)
        })
        const subsPlans = await subscriptionPlans.get();

        const subsData = subsPlans.docs.map((a)=>{
            return{
                id:a.id,
                ...a.data()
            }
        })
        let plans = [];

        if(subsData.length > 0){
            if(subsData[0].pricing_options){
                plans = subsData[0].pricing_options.map((a)=>{
                    return a.time_option;
                })
            }
        }
        if(array.length > 0){
            return res.status(200).json({
                data: {
                    ...array[0],
                    available_subscription_plans:plans
                },
                success: true
            })
        }else{
            return res.status(400).json({
                error: "Setting not found",
                success: false
            })
        }
    } catch (error) {
        return res.status(400).json({
            error: error.message,
            success: false
        })
    }
}

exports.updateSetting = async (req, res) => {
    try {
        const tokenData = req.user
        if(tokenData.role === 1){
            const settingId = req.query.setting_id
            const data = req.body
            if(!settingId){
                return res.status(400).json({
                    error: "Please eneter setting_id",
                    success: false
                })
            }
            await Setting.doc(settingId).update(data)
            return res.status(200).json({
                data: "Setting updated",
                success: true
            })
        }
    } catch (error) {
        return res.status(400).json({
            error: error.message,
            success: false
        })
    }
}
