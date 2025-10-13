import React, { useState } from 'react';

function ClinicForm({ clinic, onSave }) {
  // Required fields
  const [name, setName] = useState(clinic?.name || '');
  const [fbPageAccessToken, setFbPageAccessToken] = useState(clinic?.fb_page_access_token || '');
  const [reminderTime, setReminderTime] = useState(clinic?.reminder_time || '');

  // Optional fields
  const [address, setAddress] = useState(clinic?.address || '');
  const [contactEmail, setContactEmail] = useState(clinic?.contact_email || '');
  const [contactPhone, setContactPhone] = useState(clinic?.contact_phone || '');
  const [fbPageId, setFbPageId] = useState(clinic?.fb_page_id || '');

  // Allow Messenger Page ID if needed
  const [messengerPageId, setMessengerPageId] = useState(clinic?.messenger_page_id || '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name,
      fb_page_access_token: fbPageAccessToken,
      reminder_time: reminderTime,
      address,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      fb_page_id: fbPageId,
      messenger_page_id: messengerPageId
    };
    await onSave(payload);
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 500 }}>
      <label>
        Clinic Name*<br />
        <input type="text" value={name} onChange={e => setName(e.target.value)} required />
      </label>
      <br />
      <label>
        Messenger Page Access Token*<br />
        <input type="text" value={fbPageAccessToken} onChange={e => setFbPageAccessToken(e.target.value)} required />
      </label>
      <br />
      <label>
        Reminder Time*<br />
        <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} required />
      </label>
      <br />
      <label>
        Address<br />
        <input type="text" value={address} onChange={e => setAddress(e.target.value)} />
      </label>
      <br />
      <label>
        Contact Email<br />
        <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
      </label>
      <br />
      <label>
        Contact Phone<br />
        <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
      </label>
      <br />
      <label>
        Facebook Page ID<br />
        <input type="text" value={fbPageId} onChange={e => setFbPageId(e.target.value)} />
      </label>
      <br />
      <label>
        Messenger Page ID<br />
        <input type="text" value={messengerPageId} onChange={e => setMessengerPageId(e.target.value)} />
      </label>
      <br />
      <button type="submit">Save Clinic</button>
    </form>
  );
}

export default ClinicForm;