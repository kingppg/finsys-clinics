const axios = require("axios");

async function sendConfirmationButtonTemplate(sender_psid, summaryText, pageAccessToken) {
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`,
      {
        recipient: { id: sender_psid },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: summaryText + "\n\nPlease confirm your booking:",
              buttons: [
                {
                  type: "postback",
                  title: "Confirm",
                  payload: "CONFIRM_BOOKING"
                },
                {
                  type: "postback",
                  title: "Cancel",
                  payload: "CANCEL_BOOKING"
                }
              ]
            }
          }
        }
      }
    );
  } catch (err) {
    console.error("❌ Error sending confirmation button template:", err.response?.data || err.message);
  }
}

module.exports = sendConfirmationButtonTemplate;