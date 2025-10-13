import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { supabase } from '../supabaseClient';
import './ClinicConfig.css';

// Always use backend API base for production
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const initialClinicState = {
  name: '',
  fb_page_access_token: '',
  reminder_time: '',
  address: '',
  contact_email: '',
  contact_phone: '',
  fb_page_id: '',
  messenger_page_id: ''
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

  // Fetch clinics list (direct from Supabase)
  const fetchClinics = async (stayOnClinicId = null) => {
    setLoading(true);
    try {
      const { data: clinicsData } = await supabase
        .from('clinics')
        .select('*');
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

  // When selectedClinicId changes, fetch clinic data or reset for new clinic
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
        messenger_page_id: clinic.messenger_page_id ?? ''
      });
    }
  }, [selectedClinicId, clinics]);

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

  async function handleSubmit(e) {
    e.preventDefault();

    // SweetAlert2 confirmation before update
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

    if (!result.isConfirmed) {
      return;
    }

    setLoading(true);

    try {
      let updatedClinicId = selectedClinicId;
      if (isNew) {
        const { data: newClinic, error } = await supabase
          .from('clinics')
          .insert([formData])
          .select()
          .single();
        if (error) throw error;
        updatedClinicId = newClinic.id;
      } else {
        const { error } = await supabase
          .from('clinics')
          .update(formData)
          .eq('id', selectedClinicId);
        if (error) throw error;
      }
      await fetchClinics(updatedClinicId);
      setIsNew(false);
      await Swal.fire({
        title: 'Success!',
        text: isNew
          ? 'New clinic has been added.'
          : 'Clinic information has been updated.',
        icon: 'success',
        confirmButtonText: 'OK'
      });
    } catch {
      Swal.fire({
        title: 'Error',
        text: 'Failed to save clinic.',
        icon: 'error'
      });
    } finally {
      setLoading(false);
    }
  }

  // FB Connect: starts OAuth flow via backend, with modal selection
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

    // Use API_BASE for OAuth popup
    const oauthWindow = window.open(
      `${API_BASE}/api/clinics/${selectedClinicId}/facebook/connect`,
      '_blank',
      'width=600,height=700'
    );

    // Step 2: Poll backend for available FB pages after OAuth
    let attempts = 0;
    const maxAttempts = 30;
    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        // Use API_BASE for polling FB pages
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
        // Get updated clinic info to see if FB is now connected
        const { data: updatedClinic } = await supabase
          .from('clinics')
          .select('*')
          .eq('id', selectedClinicId)
          .single();
        if (
          updatedClinic &&
          updatedClinic.fb_page_access_token &&
          updatedClinic.fb_page_id
        ) {
          setFormData((prev) => ({
            ...prev,
            fb_page_access_token: updatedClinic.fb_page_access_token,
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
        // Ignore polling errors, try again
      }
    }, 2000);
  }

  // When user selects a page from the modal
  async function handleFbPageSelect(page) {
    setShowFbPageModal(false);
    setFbConnecting(true);
    try {
      // Update form fields locally so UI shows the correct info
      setFormData((prev) => ({
        ...prev,
        fb_page_access_token: page.access_token,
        fb_page_id: page.id,
        messenger_page_id: page.id // <-- This makes Messenger Page ID work!
      }));

      // Use API_BASE for select-page POST
      const res = await fetch(`${API_BASE}/api/clinics/${selectedClinicId}/facebook/select-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: page.id, pageAccessToken: page.access_token })
      });
      if (res.status === 200) {
        await fetchClinics(selectedClinicId);
        Swal.fire({
          title: 'Facebook Page Connected!',
          text: `Connected to "${page.name}"`,
          icon: 'success'
        });
      } else {
        Swal.fire({
          title: 'Error',
          text: 'Failed to connect selected Facebook page.',
          icon: 'error'
        });
      }
    } catch {
      Swal.fire({
        title: 'Error',
        text: 'Failed to connect selected Facebook page.',
        icon: 'error'
      });
    } finally {
      setFbConnecting(false);
      setFbPages(null);
    }
  }

  // Modal for Facebook Page selection
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
                    <img
                      src={page.picture.data.url}
                      alt={page.name}
                      className="fb-page-avatar"
                    />
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
                <option key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </option>
              ))}
              <option value="new">➕ Add Clinic</option>
            </select>
            <button
              className="add-clinic-btn"
              type="button"
              onClick={handleAddClinic}
            >
              Add Clinic
            </button>
          </div>
        )}
        {renderFbPageModal()}
        {(!user.role || clinics.length === 0) ? (
          <p>No clinic selected or available.</p>
        ) : (
          <form
            className="clinic-form-modern"
            onSubmit={handleSubmit}
            autoComplete="off"
          >
            <div className="clinic-form-row">
              <div className="clinic-form-field">
                <label>Clinic Name*</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFieldChange}
                  required
                />
              </div>
              <div className="clinic-form-field">
                <label>Reminder Time*</label>
                <input
                  type="time"
                  name="reminder_time"
                  value={formData.reminder_time}
                  onChange={handleFieldChange}
                  required
                />
              </div>
            </div>
            <div className="clinic-form-row">
              <div className="clinic-form-field">
                <label>Messenger Page Access Token*</label>
                <div className="token-inline-row">
                  <input
                    type="text"
                    name="fb_page_access_token"
                    value={formData.fb_page_access_token}
                    onChange={handleFieldChange}
                    required
                    readOnly
                    className="token-input"
                  />
                  {!isNew && (
                    <button
                      type="button"
                      className="connect-fb-btn"
                      onClick={handleConnectFBPage}
                      disabled={fbConnecting}
                    >
                      {fbConnecting ? 'Connecting...' : 'Connect Facebook Page'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="clinic-form-row">
              <div className="clinic-form-field">
                <label>Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleFieldChange}
                />
              </div>
              <div className="clinic-form-field">
                <label>Contact Email</label>
                <input
                  type="email"
                  name="contact_email"
                  value={formData.contact_email}
                  onChange={handleFieldChange}
                />
              </div>
              <div className="clinic-form-field">
                <label>Contact Phone</label>
                <input
                  type="text"
                  name="contact_phone"
                  value={formData.contact_phone}
                  onChange={handleFieldChange}
                />
              </div>
            </div>
            <div className="clinic-form-row">
              <div className="clinic-form-field">
                <label>Facebook Page ID</label>
                <input
                  type="text"
                  name="fb_page_id"
                  value={formData.fb_page_id}
                  onChange={handleFieldChange}
                  readOnly
                />
              </div>
              <div className="clinic-form-field">
                <label>Messenger Page ID</label>
                <input
                  type="text"
                  name="messenger_page_id"
                  value={formData.messenger_page_id}
                  onChange={handleFieldChange}
                  readOnly
                />
              </div>
            </div>
            <div className="clinic-form-actions">
              <button type="submit" disabled={loading}>
                {isNew ? 'Save Clinic' : 'Update Clinic'}
              </button>
              <button
                type="button"
                className="back-btn"
                onClick={handleBack}
              >
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ClinicConfig;