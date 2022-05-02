const express = require("express");
const app = express();
const cors = require("cors");
const PORT = 9090;
const moment = require("moment");
const cron = require("node-cron");
const bodyParser = require("body-parser");

app.use(cors());
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(bodyParser.urlencoded({ extended: false, limit: "50mb" }));

app.use("/api", require("./router/userRouter"));
app.use("/api", require("./router/productRouter"));
app.use("/api", require("./router/codeRouter"));
app.use("/api", require("./imageUpload/imageUpload"));
app.use("/api", require("./router/settingRouter"));
app.use("/api", require("./router/stripeRouter"));
app.use("/api", require("./router/userSubscriptionRouter"));
app.use("/api", require("./router/subscriptionPlanRouter"));
app.use("/api", require("./router/shopifyRouter"));

const {
  cronJobForExpireCode,
  crobnJobForExpireCodeSoon,
  cronJobForExtendExpiryAutoPayment,
} = require("./controller/codeController");
// const { sendMail } = require("./utils/sendMail");
// const htmlMail = require("./utils/htmlMail");

cron.schedule("55 22 * * *", () => {
  try {
    cronJobForExpireCode();
  } catch (error) {
    console.log(error.message);
  }
});

cron.schedule("5 23 * * *", () => {
  try {
    crobnJobForExpireCodeSoon();
  } catch (error) {
    console.log(error.message);
  }
});

cron.schedule("5 23 * * *", () => {
  try {
    cronJobForExtendExpiryAutoPayment();
  } catch (error) {
    console.log(error.message);
  }
});

// console.log(String(moment("2022-03-07").add(6,"M").format("YYYY-MM-DD")))
// const body = "<p>Hi " +
// "Vivek" +
// ",</p>" +
// "<p>Thank you for your purchase from ThoughtCast Magic. For the items in your most recent order </p>" +
// "<h3>INV"+"#9222" +"</h3>"+
// "We have found your account in our system and activated your products automatically. Please log into https://thoughtcastmagic.com/owners to find the instructions for any products you have just purchased. " +
// "<p>And, as always, if you have any issues just hit reply to this email and we'll help you out.</p>" +
// "<p>Thank you again!</p>" ;

// const message = {
//   to: "sonanivatsal2@gmail.com",
//   subject: "ThoughtCast Product Activation",
//   html:htmlMail("ThoughtCast Product Activation",body)
// };

// sendMail(message);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
