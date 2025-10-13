const axios = require("axios");

async function sendAppointmentForButtonTemplate(sender_psid, pageAccessToken) {
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
              text: "Who is this appointment for?\n\n",
              buttons: [
                {
                  type: "postback",
                  title: "For Me",
                  payload: "FOR_ME"
                },
                {
                  type: "postback",
                  title: "For Someone Else",
                  payload: "FOR_SOMEONE_ELSE"
                }
              ]
            }
          }
        }
      }
    );
  } catch (err) {
    console.error("❌ Error sending button template:", err.response?.data || err.message);
  }
}

module.exports = sendAppointmentForButtonTemplate;