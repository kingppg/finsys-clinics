import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { supabase } from '../supabaseClient';
import { authHeaders } from '../api/authHeaders';
import AdminUsersRoles from './AdminUsersRoles';
import './ClinicConfig.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Columns the public anon key is allowed to read/write. Secrets
// (fb_page_access_token, sms_api_key, sms_api_secret) are intentionally excluded
// — they are read/written only server-side via the backend (service key).
const SAFE_CLINIC_COLUMNS =
  'id, name, address, contact_email, contact_phone, fb_page_id, created_at, ' +
  'updated_at, messenger_page_id, reminder_time, is_active, time_zone, ' +
  'queue_token, queue_stations, currency_symbol, currency_locale, ' +
  'sms_provider, sms_sender';

const initialClinicState = {
  name: '',
  fb_page_access_token: '',
  reminder_time: '',
  address: '',
  contact_email: '',
  contact_phone: '',
  fb_page_id: '',
  messenger_page_id: '',
  sms_provider: 'none',
  sms_api_key: '',
  sms_api_secret: '',
  sms_sender: ''
};

function ClinicConfig({ user, clinicId, onBack }) {
  const [clinics, setClinics] = useState([]);
  const [selectedClinicId, setSelectedClinicId] = useState(clinicId ?? '');
  const [formData, setFormData] = useState(initialClinicState);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fbConnecting, setFbConnecting] = useState(false);
  const [fbPages, setFbPages] = useState(null);
  const [showFbPageModal, setShowFbPageModal] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsBalance, setSmsBalance] = useState(null);
  const [smsBalanceCurrency, setSmsBalanceCurrency] = useState('credits');
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [subTab, setSubTab] = useState('fb');

  const fetchClinics = async (stayOnClinicId = null) => {
    setLoading(true);
    try {
      const { data: clinicsData } = await supabase
        .from('clinics')
        .select(SAFE_CLINIC_COLUMNS);
      setClinics(clinicsData || []);

      if (user.role === 'superadmin') {
        if (
          selectedClinicId === '' ||
          selectedClinicId === null ||
          selectedClinicId === undefined
        ) {
          setSelectedClinicId(clinicsData[0]?.id ?? '');
        }
        if (stayOnClinicId) {
          setSelectedClinicId(stayOnClinicId);
        }
      } else {
        setSelectedClinicId(clinicId ?? '');
      }
    } catch {
      setClinics([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClinics();
    // eslint-disable-next-line
  }, [user.role, clinicId]);

  useEffect(() => {
    if (!selectedClinicId || selectedClinicId === 'new') {
      setIsNew(true);
      setFormData(initialClinicState);
      return;
    }
    setIsNew(false);
    const clinic = clinics.find(
      (c) => String(c.id) === String(selectedClinicId)
    );
    if (clinic) {
      setFormData({
        name: clinic.name ?? '',
        fb_page_access_token: clinic.fb_page_access_token ?? '',
        reminder_time: clinic.reminder_time ?? '',
        address: clinic.address ?? '',
        contact_email: clinic.contact_email ?? '',
        contact_phone: clinic.contact_phone ?? '',
        fb_page_id: clinic.fb_page_id ?? '',
        messenger_page_id: clinic.messenger_page_id ?? '',
        sms_provider: clinic.sms_provider ?? 'none',
        sms_api_key: clinic.sms_api_key ?? '',
        sms_api_secret: clinic.sms_api_secret ?? '',
        sms_sender: clinic.sms_sender ?? ''
      });
    }
  }, [selectedClinicId, clinics]);

  // Auto-fetch balance when SMS tab opens
  useEffect(() => {
    if (
      subTab === 'sms' &&
      (formData.sms_provider === 'semaphore' || formData.sms_provider === 'twilio')
    ) {
      fetchSmsBalance();
    }
    // eslint-disable-next-line
  }, [subTab, selectedClinicId]);

  function handleFieldChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  }

  function handleAddClinic() {
    setSelectedClinicId('new');
    setIsNew(true);
    setFormData(initialClinicState);
  }

  function handleBack() {
    if (typeof onBack === 'function') {
      onBack();
    }
  }

  async function fetchSmsBalance() {
    if (
      !selectedClinicId ||
      (formData.sms_provider !== 'semaphore' && formData.sms_provider !== 'twilio')
    ) return;
    setBalanceLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/clinics/${selectedClinicId}/sms/balance`, {
        headers: await authHeaders()
      });
      const data = await res.json();
      setSmsBalance(data.credit_balance ?? null);
      setSmsBalanceCurrency(data.currency || 'credits');
    } catch {
      setSmsBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const result = await Swal.fire({
      title: isNew ? 'Add Clinic?' : 'Update Clinic Info?',
      text: isNew
        ? 'Do you want to add this new clinic?'
        : 'Do you want to update the clinic information?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: isNew ? 'Yes, Add' : 'Yes, Update',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      // Never send secret columns from the client — they're not granted to the
      // anon key and are managed server-side (FB token via /facebook/select-page,
      // SMS keys via /api/clinics/:id/sms).
      const { fb_page_access_token, sms_api_key, sms_api_secret, ...safeFields } = formData;

      let updatedClinicId = selectedClinicId;
      if (isNew) {
        const { data: newClinic, error } = await supabase
          .from('clinics')
          .insert([safeFields])
          .select(SAFE_CLINIC_COLUMNS)
          .single();
        if (error) throw error;
        updatedClinicId = newClinic.id;
      } else {
        const { error } = await supabase
          .from('clinics')
          .update(safeFields)
          .eq('id', selectedClinicId);
        if (error) throw error;
      }
      await fetchClinics(updatedClinicId);
      setIsNew(false);
      await Swal.fire({
        title: 'Success!',
        text: isNew ? 'New clinic has been added.' : 'Clinic information has been updated.',
        icon: 'success',
        confirmButtonText: 'OK'
      });
    } catch {
      Swal.fire({ title: 'Error', text: 'Failed to save clinic.', icon: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSms(e) {
    e.preventDefault();

    const result = await Swal.fire({
      title: 'Save SMS Settings?',
      text: 'Update SMS reminder configuration for this clinic?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Save',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true
    });

    if (!result.isConfirmed) return;

    setSmsLoading(true);
    try {
      // SMS credentials are secrets — saved server-side so they never pass
      // through (or get stored by) the public anon client. A blank key leaves
      // the existing one unchanged.
      const res = await fetch(`${API_BASE}/api/clinics/${selectedClinicId}/sms`, {
        method: 'PUT',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          sms_provider: formData.sms_provider,
          sms_api_key: formData.sms_api_key,
          sms_api_secret: formData.sms_api_secret,
          sms_sender: formData.sms_sender
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save SMS settings.');
      }
      // Clear the secret fields from local state after saving.
      setFormData((prev) => ({ ...prev, sms_api_key: '', sms_api_secret: '' }));
      await fetchClinics(selectedClinicId);
      await fetchSmsBalance();
      Swal.fire({ title: 'SMS Settings Saved!', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ title: 'Error', text: err.message || 'Failed to save SMS settings.', icon: 'error' });
    } finally {
      setSmsLoading(false);
    }
  }

  async function handleTestSms() {
    const { value: testNumber } = await Swal.fire({
      title: 'Test SMS',
      input: 'text',
      inputLabel: 'Enter a phone number to send a test SMS',
      inputPlaceholder: '09XXXXXXXXX or +639XXXXXXXXX',
      showCancelButton: true,
      confirmButtonText: 'Send Test',
      inputValidator: (value) => {
        if (!value) return 'Please enter a phone number.';
      }
    });

    if (!testNumber) return;

    try {
      const res = await fetch(`${API_BASE}/api/clinics/${selectedClinicId}/sms/test`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ phone: testNumber })
      });
      const data = await res.json();
      if (res.ok) {
        Swal.fire({ title: 'Test SMS Sent!', text: `Sent to ${testNumber}`, icon: 'success' });
        await fetchSmsBalance();
      } else {
        Swal.fire({ title: 'Failed', text: data.error || 'Could not send test SMS.', icon: 'error' });
      }
    } catch {
      Swal.fire({ title: 'Error', text: 'Could not reach the server.', icon: 'error' });
    }
  }

  async function handleConnectFBPage() {
    if (!selectedClinicId || isNew) {
      Swal.fire({
        title: 'Save Clinic First',
        text: 'Please save the clinic before connecting a Facebook page.',
        icon: 'info'
      });
      return;
    }
    setFbConnecting(true);
    setFbPages(null);

    const oauthWindow = window.open(
      `${API_BASE}/api/clinics/${selectedClinicId}/facebook/connect`,
      '_blank',
      'width=600,height=700'
    );

    let attempts = 0;
    const maxAttempts = 30;
    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${API_BASE}/api/clinics/${selectedClinicId}/facebook/pages`);
        if (res.status === 200) {
          const data = await res.json();
          if (Array.isArray(data.pages) && data.pages.length > 0) {
            setFbPages(data.pages);
            setShowFbPageModal(true);
            clearInterval(pollInterval);
            oauthWindow.close();
            setFbConnecting(false);
            return;
          }
        }
        const { data: updatedClinic } = await supabase
          .from('clinics')
          .select(SAFE_CLINIC_COLUMNS)
          .eq('id', selectedClinicId)
          .single();
        // We can't read the token (it's secret/server-side); fb_page_id being set
        // is the signal that the connection saved successfully.
        if (updatedClinic?.fb_page_id) {
          setFormData((prev) => ({
            ...prev,
            fb_page_id: updatedClinic.fb_page_id,
            messenger_page_id: updatedClinic.messenger_page_id ?? ''
          }));
          clearInterval(pollInterval);
          oauthWindow.close();
          Swal.fire({
            title: 'Facebook Page Connected',
            text: 'Your clinic is now connected to Facebook Messenger.',
            icon: 'success'
          });
          setFbConnecting(false);
        } else if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          oauthWindow.close();
          setFbConnecting(false);
          Swal.fire({
            title: 'Timeout',
            text: 'Facebook connect did not finish. Please try again.',
            icon: 'error'
          });
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
  }

  async function handleFbPageSelect(page) {
    setShowFbPageModal(false);
    setFbConnecting(true);
    try {
      setFormData((prev) => ({
        ...prev,
        fb_page_access_token: page.access_token,
        fb_page_id: page.id,
        messenger_page_id: page.id
      }));

      const res = await fetch(`${API_BASE}/api/clinics/${selectedClinicId}/facebook/select-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: page.id, pageAccessToken: page.access_token })
      });
      if (res.status === 200) {
        await fetchClinics(selectedClinicId);
        Swal.fire({ title: 'Facebook Page Connected!', text: `Connected to "${page.name}"`, icon: 'success' });
      } else {
        Swal.fire({ title: 'Error', text: 'Failed to connect selected Facebook page.', icon: 'error' });
      }
    } catch {
      Swal.fire({ title: 'Error', text: 'Failed to connect selected Facebook page.', icon: 'error' });
    } finally {
      setFbConnecting(false);
      setFbPages(null);
    }
  }

  function renderFbPageModal() {
    if (!showFbPageModal || !fbPages) return null;
    return (
      <div className="fb-page-modal-overlay">
        <div className="fb-page-modal">
          <h2>Select Facebook Page to Connect</h2>
          <ul className="fb-page-list">
            {fbPages.map(page => (
              <li key={page.id} className="fb-page-list-item">
                <button
                  onClick={() => handleFbPageSelect(page)}
                  className="fb-page-select-btn"
                  disabled={fbConnecting}
                >
                  {page.picture && (
                    <img src={page.picture.data.url} alt={page.name} className="fb-page-avatar" />
                  )}
                  <span>{page.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <button onClick={() => setShowFbPageModal(false)} className="fb-page-cancel-btn">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const tabStyle = (tab, position) => ({
    background: subTab === tab ? '#eaf2ff' : '#fff',
    color: subTab === tab ? '#185abd' : '#333',
    border: subTab === tab ? '2px solid #185abd' : '1px solid #bbb',
    borderRadius: position === 'left' ? '10px 0 0 10px' : position === 'right' ? '0 10px 10px 0' : '0',
    fontWeight: 700,
    padding: '7px 32px',
    cursor: 'pointer'
  });

  const isLowBalance = smsBalance !== null && (
    formData.sms_provider === 'semaphore'
      ? parseFloat(smsBalance) < 500
      : parseFloat(smsBalance) < 5
  );

  return (
    <div className="clinic-config-fullscreen">
      <div className="clinic-config-card">
        <h2>Clinic Configuration</h2>

        {user.role === 'superadmin' && (
          <div className="clinic-config-toolbar">
            <label className="clinic-select-label">Select Clinic:&nbsp;</label>
            <select
              className="clinic-select-dropdown"
              value={selectedClinicId}
              onChange={(e) => setSelectedClinicId(e.target.value)}
            >
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
              ))}
              <option value="new">➕ Add Clinic</option>
            </select>
            <button className="add-clinic-btn" type="button" onClick={handleAddClinic}>
              Add Clinic
            </button>
          </div>
        )}

        {/* SUBTABS */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, marginTop: 6 }}>
          <button type="button" style={tabStyle('fb', 'left')} onClick={() => setSubTab('fb')}>
            FB Page Config
          </button>
          <button type="button" style={tabStyle('sms', 'middle')} onClick={() => setSubTab('sms')}>
            SMS Config
          </button>
          {(user.role === 'superadmin' || user.role === 'admin') && (
            <button type="button" style={tabStyle('users', 'right')} onClick={() => setSubTab('users')}>
              Users Config
            </button>
          )}
        </div>

        {/* FB PAGE CONFIG TAB */}
        {subTab === 'fb' && (
          <>
            {renderFbPageModal()}
            {(!user.role || clinics.length === 0) ? (
              <p>No clinic selected or available.</p>
            ) : (
              <form className="clinic-form-modern" onSubmit={handleSubmit} autoComplete="off">
                <div className="clinic-form-row">
                  <div className="clinic-form-field">
                    <label>Clinic Name*</label>
                    <input type="text" name="name" value={formData.name} onChange={handleFieldChange} required />
                  </div>
                  <div className="clinic-form-field">
                    <label>Reminder Time*</label>
                    <input type="time" name="reminder_time" value={formData.reminder_time} onChange={handleFieldChange} required />
                  </div>
                </div>
                <div className="clinic-form-row">
                  <div className="clinic-form-field">
                    <label>Messenger Page Connection</label>
                    <div className="token-inline-row">
                      <span style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 6,
                        fontWeight: 600,
                        color: formData.fb_page_id ? '#2e7d32' : '#b26a00',
                        background: formData.fb_page_id ? '#e8f5e9' : '#fff8e1',
                        border: `1px solid ${formData.fb_page_id ? '#a5d6a7' : '#ffe082'}`
                      }}>
                        {formData.fb_page_id
                          ? `✓ Connected (Page ID: ${formData.fb_page_id})`
                          : 'Not connected'}
                      </span>
                      {!isNew && (
                        <button
                          type="button"
                          className="connect-fb-btn"
                          onClick={handleConnectFBPage}
                          disabled={fbConnecting}
                        >
                          {fbConnecting
                            ? 'Connecting...'
                            : (formData.fb_page_id ? 'Reconnect Facebook Page' : 'Connect Facebook Page')}
                        </button>
                      )}
                    </div>
                    <small style={{ color: '#888', marginTop: 4, display: 'block' }}>
                      The access token is stored securely on the server and is not displayed here.
                    </small>
                  </div>
                </div>
                <div className="clinic-form-row">
                  <div className="clinic-form-field">
                    <label>Address</label>
                    <input type="text" name="address" value={formData.address} onChange={handleFieldChange} />
                  </div>
                  <div className="clinic-form-field">
                    <label>Contact Email</label>
                    <input type="email" name="contact_email" value={formData.contact_email} onChange={handleFieldChange} />
                  </div>
                  <div className="clinic-form-field">
                    <label>Contact Phone</label>
                    <input type="text" name="contact_phone" value={formData.contact_phone} onChange={handleFieldChange} />
                  </div>
                </div>
                <div className="clinic-form-row">
                  <div className="clinic-form-field">
                    <label>Facebook Page ID</label>
                    <input type="text" name="fb_page_id" value={formData.fb_page_id} onChange={handleFieldChange} readOnly />
                  </div>
                  <div className="clinic-form-field">
                    <label>Messenger Page ID</label>
                    <input type="text" name="messenger_page_id" value={formData.messenger_page_id} onChange={handleFieldChange} readOnly />
                  </div>
                </div>
                <div className="clinic-form-actions">
                  <button type="submit" disabled={loading}>
                    {isNew ? 'Save Clinic' : 'Update Clinic'}
                  </button>
                  <button type="button" className="back-btn" onClick={handleBack}>Back</button>
                </div>
              </form>
            )}
          </>
        )}

        {/* SMS CONFIG TAB */}
        {subTab === 'sms' && !isNew && (
          <form className="clinic-form-modern" onSubmit={handleSaveSms} autoComplete="off">

            {/* BALANCE DISPLAY */}
            {(formData.sms_provider === 'semaphore' || formData.sms_provider === 'twilio') && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 16px',
                background: isLowBalance ? '#fff8e1' : '#f0f7ff',
                border: `1px solid ${isLowBalance ? '#ffe082' : '#b3d1f7'}`,
                borderRadius: 8,
                marginBottom: 20
              }}>
                <span style={{ fontSize: '1rem' }}>
                  {isLowBalance ? '⚠️' : '💳'}
                </span>
                <span style={{ fontWeight: 600, color: '#333' }}>
                  SMS Balance:&nbsp;
                  {balanceLoading
                    ? 'Checking...'
                    : smsBalance !== null
                      ? (
                        <span style={{ color: isLowBalance ? '#e65100' : '#185abd' }}>
                          {formData.sms_provider === 'semaphore'
                            ? `${Number(smsBalance).toLocaleString()} credits remaining`
                            : `${smsBalance} ${smsBalanceCurrency} remaining`
                          }
                        </span>
                      )
                      : 'Unable to fetch'
                  }
                </span>
                {isLowBalance && (() => {
                  const topUpUrl = formData.sms_provider === 'semaphore' ? 'https://semaphore.co' : 'https://console.twilio.com';
                  const topUpLabel = formData.sms_provider === 'semaphore' ? 'semaphore.co' : 'console.twilio.com';
                    return (
                    <span style={{ fontSize: '0.85rem', color: '#e65100' }}>
                      {'— Low balance! Top up at '}
                      <a href={topUpUrl} target="_blank" rel="noreferrer">{topUpLabel}</a>
                    </span>
                  );
                })()}
                <button
                  type="button"
                  onClick={fetchSmsBalance}
                  disabled={balanceLoading}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: '1px solid #b3d1f7',
                    borderRadius: 6,
                    padding: '4px 12px',
                    cursor: 'pointer',
                    color: '#185abd',
                    fontWeight: 600
                  }}
                >
                  {balanceLoading ? '...' : '↻ Refresh'}
                </button>
              </div>
            )}

            <div className="clinic-form-row">
              <div className="clinic-form-field">
                <label>SMS Provider</label>
                <select
                  name="sms_provider"
                  value={formData.sms_provider}
                  onChange={handleFieldChange}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #bbb', fontSize: '1rem' }}
                >
                  <option value="none">None (disabled)</option>
                  <option value="semaphore">Semaphore (Philippines)</option>
                  <option value="twilio">Twilio (International)</option>
                </select>
              </div>
            </div>

            {formData.sms_provider !== 'none' && (
              <>
                <div className="clinic-form-row">
                  <div className="clinic-form-field">
                    <label>
                      {formData.sms_provider === 'semaphore' ? 'Semaphore API Key' : 'Twilio Account SID'}
                    </label>
                    <input
                      type="text"
                      name="sms_api_key"
                      value={formData.sms_api_key}
                      onChange={handleFieldChange}
                      placeholder={formData.sms_provider === 'semaphore' ? 'Enter key to set/change (blank = keep existing)' : 'ACxxxx… (blank = keep existing)'}
                      autoComplete="off"
                    />
                    {formData.sms_provider === 'semaphore' && (
                      <small style={{ color: '#888', marginTop: 4, display: 'block' }}>
                        Get your API key from{' '}
                        <a href="https://semaphore.co" target="_blank" rel="noreferrer">semaphore.co</a>
                        {' '}→ Account → API
                      </small>
                    )}
                    {formData.sms_provider === 'twilio' && (
                      <small style={{ color: '#888', marginTop: 4, display: 'block' }}>
                        Get your credentials from{' '}
                        <a href="https://console.twilio.com" target="_blank" rel="noreferrer">console.twilio.com</a>
                        {' '}→ Account Info
                      </small>
                    )}
                  </div>

                  {formData.sms_provider === 'twilio' && (
                    <div className="clinic-form-field">
                      <label>Twilio Auth Token</label>
                      <input
                        type="password"
                        name="sms_api_secret"
                        value={formData.sms_api_secret}
                        onChange={handleFieldChange}
                        placeholder="Your Twilio auth token"
                      />
                    </div>
                  )}
                </div>

                <div className="clinic-form-row">
                  <div className="clinic-form-field">
                    <label>
                      {formData.sms_provider === 'twilio' ? 'Twilio Phone Number' : 'Sender Name'}
                    </label>
                    <input
                      type="text"
                      name="sms_sender"
                      value={formData.sms_sender}
                      onChange={handleFieldChange}
                      placeholder={formData.sms_provider === 'twilio' ? '+1xxxxxxxxxx' : 'e.g. PALODENT'}
                    />
                    {formData.sms_provider === 'semaphore' && (
                      <small style={{ color: '#888', marginTop: 4, display: 'block' }}>
                        Sender name must be registered and approved in your Semaphore account.
                      </small>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="clinic-form-actions">
              <button type="submit" disabled={smsLoading}>
                {smsLoading ? 'Saving...' : 'Save SMS Settings'}
              </button>
              {formData.sms_provider !== 'none' && (
                <button
                  type="button"
                  onClick={handleTestSms}
                  style={{
                    marginLeft: 12,
                    background: '#e8f5e9',
                    color: '#2e7d32',
                    border: '1px solid #a5d6a7',
                    borderRadius: 6,
                    padding: '8px 20px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Send Test SMS
                </button>
              )}
              <button type="button" className="back-btn" onClick={handleBack}>Back</button>
            </div>
          </form>
        )}

        {subTab === 'sms' && isNew && (
          <p style={{ color: '#888', marginTop: 16 }}>Please save the clinic first before configuring SMS.</p>
        )}

        {/* USERS CONFIG TAB */}
        {subTab === 'users' && (user.role === 'superadmin' || user.role === 'admin') && (
          <div style={{ marginTop: 24 }}>
            <AdminUsersRoles clinicId={selectedClinicId} currentUser={user} />
          </div>
        )}
      </div>
    </div>
  );
}

export default ClinicConfig;