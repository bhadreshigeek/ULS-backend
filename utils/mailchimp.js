const mailchimp = require('@mailchimp/mailchimp_marketing')
const {
    Product
  } = require("../database/database");

const { addTagsShopify } = require("../utils/shopifyReq");
//production keys

const list_id = "mailchimp list id";
const api_key = "mailchimp api key";
const server = "mailchimp server tag";

mailchimp.setConfig({
    apiKey: api_key,
    server: server,
});

const check = async (response) =>{
    const ress = await mailchimp.ping.get();
    console.log(ress);
}

const addToMailchimpList = ({
    purchased,
    email,
    firstname = "",
    lastname = "",
    custId = null
    })=>{
    if(purchased && purchased.length > 0){  
        purchased.filter((p) => (p.activeCount > 0)).map(async (p) => {+
            console.log("product id",p.id)
            const pro = await Product.doc(p.id).get();
            const proData = pro.data();
            let mailChimps = [];
            if(proData && proData.is_deleted === false){
                p.apps.forEach((pa)=>{
                    if(pa.active){
                        const app = proData.apps.find((a)=> a.id === pa.id);
                        if(app && app.mailchip_tag){
                            console.log("app ",email,app.mailchip_tag);
                            mailChimps.push(app.mailchip_tag);
                        }
                    }
                        })
                        p.features.forEach((pf)=>{
                            if(pf.active){
                                const feature = proData.features.find((a)=> a.id === pf.id);
                            if(feature && feature.mailchip_tag){
                                console.log("feature ",email,feature.mailchip_tag);
                                mailChimps.push(feature.mailchip_tag);
                            }
                            }
            })
            }
            
            if(mailChimps.length > 0){
                mailChimps = mailChimps.filter((a,i)=> mailChimps.indexOf(a) === i);
                
                addMailchimp(email,mailChimps,{firstname,lastname})
                
                if(custId){
                    addTagsShopify(custId,mailChimps.join(","));
                }
            }else{
                console.log("Not mailchimp tag found for given products")
            }
        })
    }else{
        console.log("Can't add mailchimp without active products")
    }
}

const addMailchimp = async (email,tags,metadata = {firstname:null,lastname:null}) => {
    try{
        console.log("started adding for "+email+"tags : "+tags.join(","));
        const resp = await mailchimp.lists.addListMember(list_id, {
            email_address: email,
            merge_fields: {
                FNAME: metadata.firstname,
                LNAME: metadata.lastname,
            },
            status: "subscribed",
            tags:tags
        });
        console.log("Mailchimp Successfully added "+ email +" to tag"+tags.join("|"))
        return resp;
    }catch(err){
        if(err && err.response && err.response.body){
            try{
                if(err.response.body.title === "Member Exists"){
                    console.log("Adding just tags to existing account "+ email +" to tag"+tags.join("|"))
                    await mailchimp.lists.updateListMemberTags(
                        list_id,
                        email,
                        { tags: tags.map((t)=>{
                            return { name: t, status: "active" }
                        }) }
                    );
                }else{
                    console.log("Mailchimp Error for "+ email+" : "+err.response.body.title)
                };
            }catch(err){
                console.log("Mailchimp Error for "+ email+" : "+err.response.body.title)
            }
        }else{
            console.log(err)
        }
        
    }
   
}

module.exports = {
    addToMailchimpList,
    check
}