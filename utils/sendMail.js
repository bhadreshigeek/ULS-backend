const nodemailer = require("nodemailer")

const sendMail = async (message) => {

    let mailTransporter = await nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: 'support@gmail.com',
            pass: "password"
        }
    })
    
    let mailDetails = {
    from: {
        address:'support@thoughtcastmagic.com',
        name:"ThoughtCast Magic"
    },
    to: message.to,
    subject: message.subject,
    html: message.html
    }
if(message.html){
    const res = await mailTransporter.sendMail(mailDetails, function(err, data) {
        if(err) {
            console.log(err.message);
            return false;
        } else {
            console.log(`Email sent successfully to ${mailDetails.to}`);
            return true;
        }
    })
    return res;
}
}

module.exports = {
    sendMail
}