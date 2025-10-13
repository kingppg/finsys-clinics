const axios = require("axios");

async function sendIntroMenu(sender_psid, pageAccessToken) {
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
              text: "Gandang buhay! 😊 Kumusta po kayo?\n\nPiliin ang nais na serbisyo:",
              buttons: [
                {
                  type: "postback",
                  title: "Book Appointment",
                  payload: "MENU_BOOK_APPOINTMENT"
                },
                {
                  type: "postback",
                  title: "Confirm Booking",
                  payload: "MENU_CONFIRM_BOOKING"
                },
                {
                  type: "postback",
                  title: "Cancel Appointment",
                  payload: "MENU_CANCEL_APPOINTMENT"
                }
              ]
            }
          }
        }
      }
    );
  } catch (err) {
    console.error("❌ Error sending intro menu:", err.response?.data || err.message);
  }
}

module.exports = sendIntroMenu;