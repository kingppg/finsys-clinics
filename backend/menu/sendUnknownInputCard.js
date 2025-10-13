const axios = require("axios");

module.exports = async function sendUnknownInputCard(sender_psid, pageAccessToken) {
  const response = {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: "Sorry, I didn't understand that.\nDo you want to go back to Main Menu?",
        buttons: [
          {
            type: "postback",
            title: "Yes",
            payload: "UNKNOWN_INPUT_YES"
          },
          {
            type: "postback",
            title: "No",
            payload: "UNKNOWN_INPUT_NO"
          }
        ]
      }
    }
  };

  await axios.post(
    `https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`,
    {
      recipient: { id: sender_psid },
      message: response,
    }
  );
};