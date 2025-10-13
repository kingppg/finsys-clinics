const axios = require('axios');

async function sendBookingPromptButtonTemplate(sender_psid, statusMsg, pageAccessToken) {
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
              text: statusMsg,
              buttons: [
                {
                  type: "postback",
                  title: "Yes",
                  payload: "BOOK_ANOTHER_APPOINTMENT"
                },
                {
                  type: "postback",
                  title: "No",
                  payload: "DECLINE_BOOKING"
                }
              ]
            }
          }
        }
      }
    );
  } catch (err) {
    console.error("❌ Error sending booking prompt button template:", err.response?.data || err.message);
  }
}

module.exports = sendBookingPromptButtonTemplate;