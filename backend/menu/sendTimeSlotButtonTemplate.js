const axios = require("axios");

async function sendTimeSlotButtonTemplate(sender_psid, date, availableSlots, pageAccessToken) {
  let batches = [];
  for (let i = 0; i < availableSlots.length; i += 3) {
    batches.push(availableSlots.slice(i, i + 3));
  }
  try {
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      await axios.post(
        `https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`,
        {
          recipient: { id: sender_psid },
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "button",
                text: batchIdx === 0
                  ? `Available slots for ${date}:`
                  : "More slots:",
                buttons: batch.map(slot => ({
                  type: "postback",
                  title: slot,
                  payload: `SLOT_${slot}`
                }))
              }
            }
          }
        }
      );
    }
  } catch (err) {
    // A transient FB failure must not throw into the state machine — the user
    // is already in awaiting_slot and can still type a slot number.
    console.error("❌ Error sending time slot template:", err.response?.data || err.message);
  }
}

module.exports = sendTimeSlotButtonTemplate;