import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { supabase } from '../supabaseClient';
import { authHeaders } from '../api/authHeaders';
import {
  LuFacebook, LuSmartphone, LuUsers, LuPlus, LuRefreshCw,
  LuCheck, LuInfo, LuExternalLink, LuMessageSquare, LuReceipt
} from 'react-icons/lu';
import AdminUsersRoles from './AdminUsersRoles';
import { smsInfo } from '../utils/smsSegments';
import './ClinicConfig.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Columns the public anon key is allowed to read/write. Secrets
// (fb_page_access_token, sms_api_key, sms_api_secret) are intentionally excluded
// — they are read/written only server-side via the backend (service key).
const SAFE_CLINIC_COLUMNS =
  'id, name, address, contact_email, contact_phone, fb_page_id, created_at, ' +
  'updated_at, messenger_page_id, reminder_time, is_active, time_zone, ' +
  'queue_token, queue_stations, currency_symbol, currency_locale, ' +
  'sms_provider, sms_sender, reminder_template, status_templates, ' +
  'vat_registered, vat_rate';

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
  sms_sender: '',
  reminder_template: '',
  status_templates: {},
  vat_registered: false,
  vat_rate: 12
};

// The hardcoded fallback the backend uses when both the per-appointment message
// and the clinic template are blank. Mirrored here for "Reset to default" + preview.
const SYSTEM_DEFAULT_REMINDER =
  'Hello [PATIENT_NAME], this is a reminder for your dental clinic appointment on [DATE] at [TIME].';

// Status-change notifications. Defaults mirror statusNotifications.js (emoji-free
// so they stay cheap GSM); shown as placeholder/preview when not customized.
const STATUS_LIST = ['Scheduled', 'Confirmed', 'Checked-In', 'Completed', 'No Show', 'Cancelled'];
const STATUS_DEFAULTS = {
  'Scheduled':  'Hello [PATIENT_NAME], this is [CLINIC]. Your appointment has been scheduled for [DATE] at [TIME]. See you then!',
  'Confirmed':  'Hello [PATIENT_NAME], this is [CLINIC]. Your appointment on [DATE] at [TIME] has been confirmed. We look forward to seeing you!',
  'Checked-In': "Hi [PATIENT_NAME]! You're now checked in at [CLINIC]. Please have a seat and relax, we'll be with you shortly. Thank you for your patience!",
  'Completed':  'Hello [PATIENT_NAME], this is [CLINIC]. Thank you for coming to your appointment on [DATE]. We hope to see you again soon!',
  'No Show':    'Hello [PATIENT_NAME], this is [CLINIC]. We noticed you missed your appointment on [DATE] at [TIME]. You may reach us at [CLINIC_PHONE].',
  'Cancelled':  'Hello [PATIENT_NAME], this is [CLINIC]. Your appointment on [DATE] at [TIME] has been cancelled. You may reach us at [CLINIC_PHONE].',
};
const TEMPLATE_TOKENS = ['[PATIENT_NAME]', '[DATE]', '[TIME]', '[CLINIC]', '[CLINIC_PHONE]'];

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
  const [senderStatus, setSenderStatus] = useState(null);
  const [loadingSenderStatus, setLoadingSenderStatus] = useState(false);

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
        sms_sender: clinic.sms_sender ?? '',
        reminder_template: clinic.reminder_template ?? '',
        status_templates: clinic.status_templates ?? {},
        vat_registered: clinic.vat_registered ?? false,
        vat_rate: clinic.vat_rate ?? 12
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

  // Sender-name approval status (Semaphore). Re-runs when the provider changes
  // too, so switching to Semaphore checks immediately. Staggered ~900ms so it
  // doesn't fire in the same instant as the balance call (Semaphore throttles).
  useEffect(() => {
    if (subTab === 'sms' && formData.sms_provider === 'semaphore') {
      const t = setTimeout(() => fetchSenderStatus(), 900);
      return () => clearTimeout(t);
    }
    setSenderStatus(null);
    // eslint-disable-next-line
  }, [subTab, selectedClinicId, formData.sms_provider]);

  function handleFieldChange(e) {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
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

  async function fetchSenderStatus() {
    if (!selectedClinicId || formData.sms_provider !== 'semaphore') {
      setSenderStatus(null);
      return;
    }
    setLoadingSenderStatus(true);
    try {
      const res = await fetch(`${API_BASE}/api/clinics/${selectedClinicId}/sms/sender-status`, {
        headers: await authHeaders()
      });
      const data = await res.json();
      setSenderStatus(data);
    } catch {
      setSenderStatus({ state: 'error' });
    } finally {
      setLoadingSenderStatus(false);
    }
  }

  function senderStatusTone(state, loading) {
    if (loading) return 'muted';
    switch (state) {
      case 'approved': return 'ok';
      case 'pending':
      case 'not_found': return 'warn';
      case 'rejected': return 'err';
      default: return 'muted';
    }
  }

  function senderStatusMessage(s, loading) {
    if (loading) return 'Checking sender name status…';
    if (!s) return '';
    const name = s.sender ? `"${s.sender}"` : 'your sender name';
    switch (s.state) {
      case 'approved': return `✓ Sender ${name} is approved — ready to send.`;
      case 'pending': return `⏳ Sender ${name} is awaiting Semaphore approval. Sends are rejected until it is approved.`;
      case 'rejected': return `✗ Sender ${name} was rejected by Semaphore. Apply again or use a different name.`;
      case 'not_found': return `⚠ Sender ${name} is not registered on your Semaphore account. Apply for it in the Semaphore dashboard.`;
      case 'none': return 'No sender name set yet — add your approved Semaphore sender name above.';
      case 'no_key': return 'Save your Semaphore API key first to check sender-name status.';
      case 'error': return 'Couldn’t check sender status right now — try Refresh.';
      default: return s.provider_status ? `Sender ${name} status: ${s.provider_status}.` : `Sender ${name} status unknown.`;
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
      await fetchSenderStatus();
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

  function handleResetTemplate() {
    setFormData((prev) => ({ ...prev, reminder_template: SYSTEM_DEFAULT_REMINDER }));
  }

  function setStatusTemplate(status, value) {
    setFormData((prev) => ({
      ...prev,
      status_templates: { ...(prev.status_templates || {}), [status]: value }
    }));
  }

  function loadStatusDefault(status) {
    setStatusTemplate(status, STATUS_DEFAULTS[status]);
  }

  async function handleSaveTemplates() {
    const result = await Swal.fire({
      title: 'Save message templates?',
      text: 'Update the reminder and status-change messages for this clinic?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Save',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true
    });
    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      // Keep only non-blank status overrides; blank fields fall back to defaults.
      const st = {};
      STATUS_LIST.forEach((s) => {
        const v = (formData.status_templates?.[s] || '').trim();
        if (v) st[s] = formData.status_templates[s];
      });
      // Blank → store NULL so the backend cleanly falls through to the defaults.
      const { error } = await supabase
        .from('clinics')
        .update({
          reminder_template: formData.reminder_template?.trim() ? formData.reminder_template : null,
          status_templates: Object.keys(st).length ? st : null
        })
        .eq('id', selectedClinicId);
      if (error) throw error;
      await fetchClinics(selectedClinicId);
      Swal.fire({ title: 'Templates saved!', icon: 'success', timer: 1400, showConfirmButton: false });
    } catch {
      Swal.fire({ title: 'Error', text: 'Failed to save the templates.', icon: 'error' });
    } finally {
      setLoading(false);
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

  // Template preview (client-only): render the template with sample data so the
  // credit/encoding estimate matches what actually goes out. Blank template →
  // preview the system default so staff see what "blank" means.
  const currentClinicName = clinics.find(c => String(c.id) === String(selectedClinicId))?.name;

  // Fill [TOKENS] with sample values for live previews.
  const sampleFill = (tpl) => String(tpl || '')
    .replace(/\[PATIENT_NAME\]/g, 'Maria')
    .replace(/\[DATE\]/g, 'Jun 13, 2026')
    .replace(/\[TIME\]/g, '2:00 PM')
    .replace(/\[CLINIC\]/g, currentClinicName || 'your clinic')
    .replace(/\[CLINIC_PHONE\]/g, formData.contact_phone || 'the clinic');

  const templateIsBlank = !formData.reminder_template || !formData.reminder_template.trim();
  const templatePreview = sampleFill(templateIsBlank ? SYSTEM_DEFAULT_REMINDER : formData.reminder_template);
  const tcost = smsInfo(templatePreview);
  const estSends = smsBalance !== null && tcost.segments > 0
    ? Math.floor(parseFloat(smsBalance) / tcost.segments)
    : null;

  const canManageUsers = user.role === 'superadmin' || user.role === 'admin';

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
      key: 'templates',
      icon: <LuMessageSquare />,
      label: 'Message Templates',
      sub: 'Reminders & status messages',
      dot: null,
      show: true
    },
    {
      key: 'billing',
      icon: <LuReceipt />,
      label: 'Billing & Tax',
      sub: formData.vat_registered ? `VAT-registered (${parseFloat(formData.vat_rate) || 12}%)` : 'Non-VAT',
      dot: formData.vat_registered ? 'ok' : null,
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
                      <>
                        <p className="cc-hint">
                          <LuInfo /> Semaphore requires an <b>approved</b> sender name before it will send.
                          Apply for one in your Semaphore dashboard (approval can take ~1–2 business days),
                          then enter it here. Until it is approved, sends will be rejected.
                        </p>
                        {(loadingSenderStatus || (senderStatus && senderStatus.state !== 'na')) && (
                          <div className={`cc-sender-status cc-sender-status--${senderStatusTone(senderStatus?.state, loadingSenderStatus)}`}>
                            <span className="cc-sender-status-msg">{senderStatusMessage(senderStatus, loadingSenderStatus)}</span>
                            {!loadingSenderStatus && (
                              <button type="button" className="cc-status-refresh" onClick={fetchSenderStatus}>
                                <LuRefreshCw /> Refresh
                              </button>
                            )}
                          </div>
                        )}
                        <p className="cc-hint cc-hint--muted">
                          Get your API key from{' '}
                          <a href="https://semaphore.co" target="_blank" rel="noreferrer">semaphore.co</a> → Account → API.
                        </p>
                      </>
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

          {/* ── MESSAGE TEMPLATES ── */}
          {subTab === 'templates' && (
            <>
              <div className="cc-panel-head">
                <div className="cc-panel-eyebrow">Message Templates</div>
                <h2 className="cc-panel-title">Reminders &amp; Notifications</h2>
              </div>

              {(!user.role || clinics.length === 0) ? (
                <div className="dc-empty">
                  <span className="dc-empty-icon">💬</span>
                  <span className="dc-empty-title">No clinic selected</span>
                  <span className="dc-empty-hint">Select or add a clinic to edit its messages.</span>
                </div>
              ) : isNew ? (
                <div className="dc-empty">
                  <span className="dc-empty-icon">💾</span>
                  <span className="dc-empty-title">Save the clinic first</span>
                  <span className="dc-empty-hint">Add and save this clinic before editing its messages.</span>
                </div>
              ) : (
                <>
                  <div className="cc-token-row">
                    <span className="cc-token-hint">Tokens</span>
                    {TEMPLATE_TOKENS.map((tok) => (
                      <span key={tok} className="cc-token cc-token--static">{tok}</span>
                    ))}
                  </div>
                  <p className="cc-hint cc-hint--muted">
                    Tokens are filled in automatically when a message is sent. Leave a field blank to use the built-in default.
                  </p>

                  {/* Appointment reminder default */}
                  <div className="cc-tpl-block">
                    <div className="cc-tpl-head">
                      <span className="cc-tpl-title">Appointment reminder</span>
                      <button type="button" className="cc-load-default" onClick={handleResetTemplate}>Load default</button>
                    </div>
                    <textarea
                      className="cc-checker-input"
                      rows={3}
                      value={formData.reminder_template}
                      onChange={(e) => setFormData((p) => ({ ...p, reminder_template: e.target.value }))}
                      placeholder={SYSTEM_DEFAULT_REMINDER}
                    />
                    <div className="cc-preview">
                      <div className="cc-preview-label">Preview {templateIsBlank && <em>(default)</em>}</div>
                      <div className="cc-preview-bubble">{templatePreview}</div>
                      <div className="cc-checker-meta">
                        <span><b>{tcost.chars}</b> chars</span>
                        <span className="cc-sep">·</span>
                        <span><b>{tcost.segments}</b> credit{tcost.segments === 1 ? '' : 's'}</span>
                        <span className="cc-sep">·</span>
                        <span className={tcost.isUnicode ? 'cc-enc cc-enc--uni' : 'cc-enc cc-enc--gsm'}>{tcost.encoding}</span>
                        {estSends !== null && (
                          <span className="cc-checker-est">balance ≈ <b>{estSends.toLocaleString()}</b> sends</span>
                        )}
                      </div>
                      {tcost.isUnicode && (
                        <div className="cc-checker-warn">
                          <LuInfo />
                          <span>
                            Sends as <b>Unicode</b> (~2× the cost)
                            {tcost.offenders.length > 0 && (
                              <> because of {tcost.offenders.map((c, i) => (
                                <code key={i} className="cc-offender">{c === ' ' ? '␣' : c}</code>
                              ))}</>
                            )}. Swap <code>₱</code>→<code>PHP</code>, em dash <code>—</code>→<code>-</code>.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status-change messages */}
                  <div className="cc-tpl-section-label">Status-change messages</div>
                  <div className="cc-status-list">
                    {STATUS_LIST.map((status) => {
                      const val = formData.status_templates?.[status] || '';
                      const isBlank = !val.trim();
                      const info = smsInfo(sampleFill(isBlank ? STATUS_DEFAULTS[status] : val));
                      return (
                        <div className="cc-tpl-block" key={status}>
                          <div className="cc-tpl-head">
                            <span className="cc-tpl-title">
                              <span className="cc-status-pip" data-status={status} /> {status}
                            </span>
                            <button type="button" className="cc-load-default" onClick={() => loadStatusDefault(status)}>Load default</button>
                          </div>
                          <textarea
                            className="cc-checker-input"
                            rows={2}
                            value={val}
                            onChange={(e) => setStatusTemplate(status, e.target.value)}
                            placeholder={STATUS_DEFAULTS[status]}
                          />
                          <div className="cc-checker-meta">
                            {isBlank && <span className="cc-tpl-defaultflag">using default</span>}
                            <span><b>{info.chars}</b> chars</span>
                            <span className="cc-sep">·</span>
                            <span><b>{info.segments}</b> credit{info.segments === 1 ? '' : 's'}</span>
                            <span className="cc-sep">·</span>
                            <span className={info.isUnicode ? 'cc-enc cc-enc--uni' : 'cc-enc cc-enc--gsm'}>{info.encoding}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="cc-actions">
                    <button type="button" className="dc-btn dc-btn--primary" onClick={handleSaveTemplates} disabled={loading}>
                      {loading ? 'Saving…' : 'Save all templates'}
                    </button>
                    <button type="button" className="dc-btn dc-btn--ghost" onClick={handleBack}>Back</button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── BILLING & TAX ── */}
          {subTab === 'billing' && (
            <>
              <div className="cc-panel-head">
                <div className="cc-panel-eyebrow">Billing</div>
                <h2 className="cc-panel-title">Tax &amp; VAT</h2>
              </div>

              {(!user.role || clinics.length === 0) ? (
                <div className="dc-empty">
                  <span className="dc-empty-icon">🧾</span>
                  <span className="dc-empty-title">No clinic selected</span>
                  <span className="dc-empty-hint">Select or add a clinic to configure it.</span>
                </div>
              ) : (
                <form className="cc-form" onSubmit={handleSubmit} autoComplete="off">
                  <div className={`cc-integration${formData.vat_registered ? ' is-on' : ' is-off'}`}>
                    <div className="cc-integration-ico"><LuReceipt /></div>
                    <div className="cc-integration-body">
                      <div className="cc-integration-status">
                        <span className="cc-statusdot" />
                        {formData.vat_registered ? 'VAT-registered' : 'Non-VAT'}
                      </div>
                      <div className="cc-integration-detail">
                        {formData.vat_registered
                          ? `Invoices show a ${parseFloat(formData.vat_rate) || 12}% VAT breakdown; Senior/PWD sales are VAT-exempt, then 20% off.`
                          : 'No VAT on invoices. Senior/PWD discounts are a flat 20% off.'}
                      </div>
                    </div>
                  </div>
                  <p className="cc-hint"><LuInfo /> Turn this on only if the clinic is VAT-registered per its BIR Certificate of Registration (Form 2303). Most small clinics are Non-VAT.</p>

                  <fieldset className="cc-group">
                    <legend>VAT Configuration</legend>
                    <label className="cc-toggle-row">
                      <input type="checkbox" name="vat_registered" checked={!!formData.vat_registered} onChange={handleFieldChange} />
                      <span>VAT-registered clinic (adds output VAT to invoices)</span>
                    </label>
                    {formData.vat_registered && (
                      <div className="cc-grid" style={{ marginTop: 12 }}>
                        <label className="dc-field">
                          <span>VAT Rate (%)</span>
                          <input type="number" name="vat_rate" min="0" step="0.01"
                            value={formData.vat_rate} onChange={handleFieldChange} />
                        </label>
                      </div>
                    )}
                  </fieldset>

                  <div className="cc-form-actions">
                    <button type="submit" className="dc-btn dc-btn--primary" disabled={loading}>
                      {loading ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              )}
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
