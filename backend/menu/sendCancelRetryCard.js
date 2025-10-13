const axios = require("axios");

async function sendCancelRetryCard(sender_psid, promptText = "No appointment found with that code.", pageAccessToken) {
  await axios.post(
    `https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`,
    {
      recipient: { id: sender_psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: `${promptText}\n\nPlease choose an option:`,
            buttons: [
              {
                type: "postback",
                title: "Try Again",
                payload: "TRY_AGAIN_CANCEL_CODE"
              },
              {
                type: "postback",
                title: "Cancel",
                payload: "CANCEL_CANCEL_CODE"
              }
            ]
          }
        }
      }
    }
  );
}

module.exports = sendCancelRetryCard;