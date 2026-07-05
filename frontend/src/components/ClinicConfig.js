import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { supabase } from '../supabaseClient';
import { authHeaders } from '../api/authHeaders';
import {
  LuFacebook, LuSmartphone, LuUsers, LuPlus, LuRefreshCw,
  LuCheck, LuInfo, LuExternalLink
} from 'react-icons/lu';
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
    setSubTab('fb');
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
      <div className="dc-overlay" onClick={() => setShowFbPageModal(false)}>
        <div className="dc-modal dc-modal--sm" onClick={(e) => e.stopPropagation()}>
          <h3 className="dc-modal-title">Select a Facebook Page to connect</h3>
          <ul className="cc-fbpage-list">
            {fbPages.map(page => (
              <li key={page.id}>
                <button
                  onClick={() => handleFbPageSelect(page)}
                  className="cc-fbpage-btn"
                  disabled={fbConnecting}
                >
                  {page.picture
                    ? <img src={page.picture.data.url} alt={page.name} className="cc-fbpage-avatar" />
                    : <span className="cc-fbpage-avatar cc-fbpage-avatar--fallback"><LuFacebook /></span>}
                  <span className="cc-fbpage-name">{page.name}</span>
                  <LuCheck className="cc-fbpage-check" />
                </button>
              </li>
            ))}
          </ul>
          <div className="dc-modal-actions">
            <button onClick={() => setShowFbPageModal(false)} className="dc-btn dc-btn--ghost">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const connected = !!formData.fb_page_id;
  const smsActive = formData.sms_provider !== 'none';
  const smsProviderLabel =
    formData.sms_provider === 'semaphore' ? 'Semaphore'
      : formData.sms_provider === 'twilio' ? 'Twilio'
        : 'Disabled';

  const isLowBalance = smsBalance !== null && (
    formData.sms_provider === 'semaphore'
      ? parseFloat(smsBalance) < 500
      : parseFloat(smsBalance) < 5
  );

  // Health-meter fill: proportional up to the "comfortable" threshold (the same
  // line that triggers the low-balance warning). At/above the line → full bar.
  const smsThreshold = formData.sms_provider === 'semaphore' ? 500 : 5;
  const meterPct = smsBalance !== null
    ? Math.max(4, Math.min(100, (parseFloat(smsBalance) / smsThreshold) * 100))
    : 0;

  const canManageUsers = user.role === 'superadmin' || user.role === 'admin';
  const currentClinicName = clinics.find(c => String(c.id) === String(selectedClinicId))?.name;

  const RAIL = [
    {
      key: 'fb',
      icon: <LuFacebook />,
      label: 'Facebook Messenger',
      sub: 'Booking bot connection',
      dot: connected ? 'ok' : 'off',
      show: true
    },
    {
      key: 'sms',
      icon: <LuSmartphone />,
      label: 'SMS Reminders',
      sub: smsActive ? `${smsProviderLabel} active` : 'Not configured',
      dot: !smsActive ? 'off' : (isLowBalance ? 'warn' : 'ok'),
      show: true
    },
    {
      key: 'users',
      icon: <LuUsers />,
      label: 'Users & Roles',
      sub: 'Staff & permissions',
      dot: null,
      show: canManageUsers
    }
  ].filter(item => item.show);

  return (
    <div className="dc-page cc-page">
      <header className="dc-page-header">
        <div className="dc-page-titlewrap">
          <div className="dc-page-eyebrow">Configuration</div>
          <h1 className="dc-page-title">Clinic Settings</h1>
          <div className="dc-page-subtitle">
            {isNew
              ? 'Adding a new clinic'
              : (currentClinicName ? `Managing ${currentClinicName}` : 'Integrations & staff')}
          </div>
        </div>

        {user.role === 'superadmin' && (
          <div className="dc-page-header-actions">
            <div className="cc-switcher">
              <span className="cc-switcher-label">Clinic</span>
              <select
                className="cc-switcher-select"
                value={selectedClinicId}
                onChange={(e) => setSelectedClinicId(e.target.value)}
              >
                {clinics.map((clinic) => (
                  <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
                ))}
                <option value="new">＋ Add Clinic…</option>
              </select>
            </div>
            <button className="dc-btn dc-btn--primary" type="button" onClick={handleAddClinic}>
              <LuPlus /> Add Clinic
            </button>
          </div>
        )}
      </header>

      <div className="cc-shell">
        {/* LEFT SECTION RAIL */}
        <nav className="cc-rail" aria-label="Settings sections">
          {RAIL.map(item => (
            <button
              key={item.key}
              type="button"
              className={`cc-rail-item${subTab === item.key ? ' active' : ''}`}
              onClick={() => setSubTab(item.key)}
            >
              <span className="cc-rail-ico">{item.icon}</span>
              <span className="cc-rail-text">
                <span className="cc-rail-label">{item.label}</span>
                <span className="cc-rail-sub">{item.sub}</span>
              </span>
              {item.dot && <span className={`cc-dot cc-dot--${item.dot}`} title={item.sub} />}
            </button>
          ))}
        </nav>

        {/* RIGHT PANEL */}
        <section className="cc-panel">
          {renderFbPageModal()}

          {/* ── FACEBOOK ── */}
          {subTab === 'fb' && (
            <>
              <div className="cc-panel-head">
                <div className="cc-panel-eyebrow">Facebook Messenger</div>
                <h2 className="cc-panel-title">Page &amp; Clinic Profile</h2>
              </div>

              {(!user.role || clinics.length === 0) ? (
                <div className="dc-empty">
                  <span className="dc-empty-icon">🏥</span>
                  <span className="dc-empty-title">No clinic selected</span>
                  <span className="dc-empty-hint">Select or add a clinic to configure it.</span>
                </div>
              ) : (
                <>
                  {/* Integration status card */}
                  <div className={`cc-integration${connected ? ' is-on' : ' is-off'}`}>
                    <div className="cc-integration-ico"><LuFacebook /></div>
                    <div className="cc-integration-body">
                      <div className="cc-integration-status">
                        <span className="cc-statusdot" />
                        {connected ? 'Connected' : 'Not connected'}
                      </div>
                      <div className="cc-integration-detail">
                        {connected
                          ? `Page ID: ${formData.fb_page_id}`
                          : 'Link a Facebook Page to enable the Ate Claire booking bot.'}
                      </div>
                    </div>
                    {!isNew && (
                      <button
                        type="button"
                        className={`dc-btn ${connected ? 'dc-btn--ghost' : 'dc-btn--primary'}`}
                        onClick={handleConnectFBPage}
                        disabled={fbConnecting}
                      >
                        {fbConnecting
                          ? 'Connecting…'
                          : (connected ? 'Reconnect' : 'Connect Facebook Page')}
                      </button>
                    )}
                  </div>
                  <p className="cc-hint"><LuInfo /> The access token is stored securely on the server and is never displayed here.</p>

                  <form className="cc-form" onSubmit={handleSubmit} autoComplete="off">
                    <fieldset className="cc-group">
                      <legend>Clinic Identity</legend>
                      <div className="cc-grid">
                        <label className="dc-field">
                          <span>Clinic Name *</span>
                          <input type="text" name="name" value={formData.name} onChange={handleFieldChange} required />
                        </label>
                        <label className="dc-field">
                          <span>Reminder Time *</span>
                          <input type="time" name="reminder_time" value={formData.reminder_time} onChange={handleFieldChange} required />
                        </label>
                      </div>
                    </fieldset>

                    <fieldset className="cc-group">
                      <legend>Contact</legend>
                      <div className="cc-grid cc-grid--3">
                        <label className="dc-field">
                          <span>Address</span>
                          <input type="text" name="address" value={formData.address} onChange={handleFieldChange} />
                        </label>
                        <label className="dc-field">
                          <span>Contact Email</span>
                          <input type="email" name="contact_email" value={formData.contact_email} onChange={handleFieldChange} />
                        </label>
                        <label className="dc-field">
                          <span>Contact Phone</span>
                          <input type="text" name="contact_phone" value={formData.contact_phone} onChange={handleFieldChange} />
                        </label>
                      </div>
                    </fieldset>

                    <fieldset className="cc-group">
                      <legend>Messenger IDs</legend>
                      <div className="cc-grid">
                        <label className="dc-field">
                          <span>Facebook Page ID</span>
                          <input type="text" name="fb_page_id" value={formData.fb_page_id} onChange={handleFieldChange} readOnly />
                        </label>
                        <label className="dc-field">
                          <span>Messenger Page ID</span>
                          <input type="text" name="messenger_page_id" value={formData.messenger_page_id} onChange={handleFieldChange} readOnly />
                        </label>
                      </div>
                      <p className="cc-hint cc-hint--muted">These are populated automatically when a page is connected.</p>
                    </fieldset>

                    <div className="cc-actions">
                      <button type="submit" className="dc-btn dc-btn--primary" disabled={loading}>
                        {loading ? 'Saving…' : (isNew ? 'Save Clinic' : 'Update Clinic')}
                      </button>
                      <button type="button" className="dc-btn dc-btn--ghost" onClick={handleBack}>Back</button>
                    </div>
                  </form>
                </>
              )}
            </>
          )}

          {/* ── SMS ── */}
          {subTab === 'sms' && !isNew && (
            <>
              <div className="cc-panel-head">
                <div className="cc-panel-eyebrow">SMS Reminders</div>
                <h2 className="cc-panel-title">Provider &amp; Credits</h2>
              </div>

              {/* Balance meter */}
              {(formData.sms_provider === 'semaphore' || formData.sms_provider === 'twilio') && (
                <div className={`cc-meter${isLowBalance ? ' is-low' : ''}`}>
                  <div className="cc-meter-top">
                    <span className="cc-meter-label">
                      <LuSmartphone /> {smsProviderLabel} balance
                    </span>
                    <button
                      type="button"
                      className="cc-meter-refresh"
                      onClick={fetchSmsBalance}
                      disabled={balanceLoading}
                    >
                      <LuRefreshCw /> {balanceLoading ? 'Checking…' : 'Refresh'}
                    </button>
                  </div>
                  <div className="cc-meter-value">
                    {balanceLoading
                      ? 'Checking…'
                      : smsBalance !== null
                        ? (formData.sms_provider === 'semaphore'
                          ? `${Number(smsBalance).toLocaleString()} credits`
                          : `${smsBalance} ${smsBalanceCurrency}`)
                        : 'Unable to fetch'}
                    <span className="cc-meter-suffix">remaining</span>
                  </div>
                  <div className="cc-meter-bar">
                    <span className="cc-meter-fill" style={{ width: `${meterPct}%` }} />
                  </div>
                  {isLowBalance && (() => {
                    const topUpUrl = formData.sms_provider === 'semaphore' ? 'https://semaphore.co' : 'https://console.twilio.com';
                    const topUpLabel = formData.sms_provider === 'semaphore' ? 'semaphore.co' : 'console.twilio.com';
                    return (
                      <div className="cc-meter-warn">
                        <LuInfo /> Low balance — top up at{' '}
                        <a href={topUpUrl} target="_blank" rel="noreferrer">{topUpLabel} <LuExternalLink /></a>
                      </div>
                    );
                  })()}
                </div>
              )}

              <form className="cc-form" onSubmit={handleSaveSms} autoComplete="off">
                <fieldset className="cc-group">
                  <legend>Provider</legend>
                  <div className="cc-grid">
                    <label className="dc-field">
                      <span>SMS Provider</span>
                      <select name="sms_provider" value={formData.sms_provider} onChange={handleFieldChange}>
                        <option value="none">None (disabled)</option>
                        <option value="semaphore">Semaphore (Philippines)</option>
                        <option value="twilio">Twilio (International)</option>
                      </select>
                    </label>
                  </div>
                </fieldset>

                {formData.sms_provider !== 'none' && (
                  <fieldset className="cc-group">
                    <legend>Credentials</legend>
                    <div className="cc-grid">
                      <label className="dc-field">
                        <span>{formData.sms_provider === 'semaphore' ? 'Semaphore API Key' : 'Twilio Account SID'}</span>
                        <input
                          type="text"
                          name="sms_api_key"
                          value={formData.sms_api_key}
                          onChange={handleFieldChange}
                          placeholder={formData.sms_provider === 'semaphore' ? 'Enter key to set/change (blank = keep existing)' : 'ACxxxx… (blank = keep existing)'}
                          autoComplete="off"
                        />
                      </label>
                      {formData.sms_provider === 'twilio' && (
                        <label className="dc-field">
                          <span>Twilio Auth Token</span>
                          <input
                            type="password"
                            name="sms_api_secret"
                            value={formData.sms_api_secret}
                            onChange={handleFieldChange}
                            placeholder="Your Twilio auth token"
                          />
                        </label>
                      )}
                    </div>

                    <div className="cc-grid">
                      <label className="dc-field">
                        <span>{formData.sms_provider === 'twilio' ? 'Twilio Phone Number' : 'Sender Name'}</span>
                        <input
                          type="text"
                          name="sms_sender"
                          value={formData.sms_sender}
                          onChange={handleFieldChange}
                          placeholder={formData.sms_provider === 'twilio' ? '+1xxxxxxxxxx' : 'e.g. PALODENT'}
                        />
                      </label>
                    </div>

                    {formData.sms_provider === 'semaphore' && (
                      <p className="cc-hint">
                        <LuInfo /> Get your API key from{' '}
                        <a href="https://semaphore.co" target="_blank" rel="noreferrer">semaphore.co</a> → Account → API.
                        Sender name must be registered and approved in your Semaphore account.
                      </p>
                    )}
                    {formData.sms_provider === 'twilio' && (
                      <p className="cc-hint">
                        <LuInfo /> Get your credentials from{' '}
                        <a href="https://console.twilio.com" target="_blank" rel="noreferrer">console.twilio.com</a> → Account Info.
                      </p>
                    )}
                  </fieldset>
                )}

                <div className="cc-actions">
                  <button type="submit" className="dc-btn dc-btn--primary" disabled={smsLoading}>
                    {smsLoading ? 'Saving…' : 'Save SMS Settings'}
                  </button>
                  {formData.sms_provider !== 'none' && (
                    <button type="button" className="dc-btn dc-btn--ghost" onClick={handleTestSms}>
                      Send Test SMS
                    </button>
                  )}
                  <button type="button" className="dc-btn dc-btn--ghost" onClick={handleBack}>Back</button>
                </div>
              </form>
            </>
          )}

          {subTab === 'sms' && isNew && (
            <>
              <div className="cc-panel-head">
                <div className="cc-panel-eyebrow">SMS Reminders</div>
                <h2 className="cc-panel-title">Provider &amp; Credits</h2>
              </div>
              <div className="dc-empty">
                <span className="dc-empty-icon">💾</span>
                <span className="dc-empty-title">Save the clinic first</span>
                <span className="dc-empty-hint">Add and save this clinic before configuring SMS.</span>
              </div>
            </>
          )}

          {/* ── USERS ── */}
          {subTab === 'users' && canManageUsers && (
            <div className="cc-users">
              <AdminUsersRoles clinicId={selectedClinicId} currentUser={user} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default ClinicConfig;
