import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fetchAllRows } from '../api/fetchAllRows';
import DentistAvailabilityManager from './DentistAvailabilityManager';
import { LuUserPlus, LuCalendarClock, LuSquarePen, LuTrash2, LuInfo } from 'react-icons/lu';
import './Dentists.css';

function Dentists({ clinicId }) {
  const [dentists, setDentists] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [newDentist, setNewDentist] = useState({ name: '', email: '', phone: '', is_active: true });
  const [editDentistId, setEditDentistId] = useState(null);
  const [editDentist, setEditDentist] = useState({ name: '', email: '', phone: '', is_active: true });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [dentistToDelete, setDentistToDelete] = useState(null);
  const [deleteMode, setDeleteMode] = useState('none');
  const [futureAppointments, setFutureAppointments] = useState([]);
  // Availability full-page view (swaps the list, same pattern as Patients profile)
  const [availabilityDentist, setAvailabilityDentist] = useState(null);

  useEffect(() => { 
    fetchDentists(); 
    fetchAppointments(); 
    fetchPatients();
    // eslint-disable-next-line
  }, [clinicId]);

  useEffect(() => {
    if (modalOpen || addModalOpen || deleteModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; }
  }, [modalOpen, addModalOpen, deleteModalOpen]);

  // --- SORTING BY NAME (ASC) ---
  const fetchDentists = async () => {
    try {
      const { data, error } = await supabase
        .from('dentists')
        .select('*')
        .eq('clinic_id', clinicId);
      if (error) throw error;
      // Always sort by name ascending (case-insensitive, stable)
      const sorted = (data || []).slice().sort((a, b) => {
        const n1 = (a.name || "").toLowerCase();
        const n2 = (b.name || "").toLowerCase();
        if (n1 < n2) return -1;
        if (n1 > n2) return 1;
        return 0;
      });
      setDentists(sorted);
    } catch (err) {
      setError('Failed to fetch dentists');
      console.error(err);
    }
  };

  const fetchAppointments = async () => {
    try {
      // Paged past the 1000-row cap so per-dentist counts/stats stay accurate.
      const data = await fetchAllRows((from, to) =>
        supabase.from('appointments').select('*')
          .eq('clinic_id', clinicId).order('id', { ascending: true }).range(from, to));
      setAppointments(data);
    } catch (err) {
      setError('Failed to fetch appointments');
      console.error(err);
    }
  };

  const fetchPatients = async () => {
    try {
      const data = await fetchAllRows((from, to) =>
        supabase.from('patients').select('*')
          .eq('clinic_id', clinicId).order('id', { ascending: true }).range(from, to));
      setPatients(data);
    } catch (err) {
      setPatients([]);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewDentist(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditDentist(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const openAddModal = () => {
    setAddModalOpen(true);
    setError('');
    setSuccess('');
  };

  const closeAddModal = () => {
    setAddModalOpen(false);
    setNewDentist({ name: '', email: '', phone: '', is_active: true });
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!newDentist.name || !newDentist.email || !newDentist.phone) {
      setError('All dentist fields are required.');
      return;
    }
    try {
      const { error } = await supabase
        .from('dentists')
        .insert([{ ...newDentist, clinic_id: clinicId }]);
      if (error) throw error;
      setNewDentist({ name: '', email: '', phone: '', is_active: true });
      closeAddModal();
      fetchDentists();
      setSuccess('Dentist added!');
      setTimeout(() => setSuccess(''), 1200);
    } catch (err) {
      setError('Error creating dentist.');
      console.error(err);
    }
  };

  const startEdit = (dentist) => {
    setEditDentistId(dentist.id);
    setEditDentist({ 
      name: dentist.name, 
      email: dentist.email, 
      phone: dentist.phone,
      is_active: dentist.is_active !== undefined ? dentist.is_active : true
    });
    setError('');
    setSuccess('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditDentistId(null);
    setEditDentist({ name: '', email: '', phone: '', is_active: true });
    setError('');
    setSuccess('');
  };

  const saveEdit = async (id) => {
    setError('');
    if (!editDentist.name || !editDentist.email || !editDentist.phone) {
      setError('All fields required.');
      return;
    }
    try {
      const { error } = await supabase
        .from('dentists')
        .update({ ...editDentist, clinic_id: clinicId })
        .eq('id', id);
      if (error) throw error;
      setEditDentistId(null);
      setEditDentist({ name: '', email: '', phone: '', is_active: true });
      setModalOpen(false);
      fetchDentists();
      setSuccess('Dentist updated!');
      setTimeout(() => setSuccess(''), 1200);
    } catch (err) {
      setError('Error updating dentist.');
      console.error(err);
    }
  };

  // --- ALWAYS RE-SORT BY NAME after status change ---
  const toggleStatus = async (dentist) => {
    try {
      const { error } = await supabase
        .from('dentists')
        .update({
          ...dentist,
          is_active: !dentist.is_active,
          clinic_id: clinicId
        })
        .eq('id', dentist.id);
      if (error) throw error;
      await fetchDentists();
      setSuccess(`Dentist marked as ${!dentist.is_active ? 'Active' : 'Inactive'}!`);
      setTimeout(() => setSuccess(''), 1200);
    } catch (err) {
      setError('Error toggling status.');
      console.error(err);
    }
  };

  const onDeleteClick = async (dentist) => {
    setError('');
    setSuccess('');
    setDeleteMode('none');
    setFutureAppointments([]);

    const { data: allAppts, error: allApptsError } = await supabase
      .from('appointments')
      .select('*')
      .eq('dentist_id', dentist.id)
      .eq('clinic_id', clinicId);

    if (allApptsError) {
      setError('Error checking appointments for this dentist.');
      setDeleteModalOpen(true);
      setDentistToDelete(dentist);
      return;
    }

    if (!allAppts || allAppts.length === 0) {
      setDeleteMode('hard');
      setDentistToDelete(dentist);
      setDeleteModalOpen(true);
      return;
    }

    const nowIso = new Date().toISOString();
    const futureAppts = allAppts.filter(
      a =>
        a.appointment_time >= nowIso &&
        !a.deleted &&
        (a.status === "Scheduled" || a.status === "Confirmed")
    ).sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time));
    if (futureAppts.length > 0) {
      setDeleteMode('block');
      setFutureAppointments(futureAppts);
      setDentistToDelete(dentist);
      setDeleteModalOpen(true);
      return;
    }
    setDeleteMode('soft');
    setDentistToDelete(dentist);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!dentistToDelete) return;
    if (deleteMode === 'hard') {
      try {
        const { error } = await supabase
          .from('dentists')
          .delete()
          .eq('id', dentistToDelete.id)
          .eq('clinic_id', clinicId);
        if (error) throw error;
        setDeleteModalOpen(false);
        setDentistToDelete(null);
        fetchDentists();
        setSuccess('Dentist deleted!');
        setTimeout(() => setSuccess(''), 1200);
      } catch (err) {
        setError('Error deleting dentist.');
        console.error(err);
      }
    } else if (deleteMode === 'soft') {
      try {
        const { error } = await supabase
          .from('dentists')
          .update({ deleted: true })
          .eq('id', dentistToDelete.id)
          .eq('clinic_id', clinicId);
        if (error) throw error;
        setDeleteModalOpen(false);
        setDentistToDelete(null);
        fetchDentists();
        setSuccess('Dentist soft deleted!');
        setTimeout(() => setSuccess(''), 1200);
      } catch (err) {
        setError('Error soft deleting dentist.');
        console.error(err);
      }
    }
  };

  const cancelDelete = () => {
    setDeleteModalOpen(false);
    setDentistToDelete(null);
    setFutureAppointments([]);
    setDeleteMode('none');
  };

  // Availability full-page view handlers (like Patients openProfile/closeProfile)
  const openAvailability = (dentist) => setAvailabilityDentist(dentist);
  const closeAvailability = () => setAvailabilityDentist(null);

  // ── Full-page availability workstation (replaces the old modal) ──
  // Swaps the Dentists list for a full-viewport view, same pattern as clicking
  // a patient's name → PatientProfile. .dc-page = shared breathing gutters.
  if (availabilityDentist) {
    const initial = (availabilityDentist.name || '?').trim().charAt(0).toUpperCase();
    return (
      <div className="dc-page">
        <div className="dt-avail-page">
          <div className="dt-avail-page-head">
            <button type="button" className="dc-back-btn" onClick={closeAvailability}>
              ← Back to Dentists
            </button>
            <div className="dt-avail-identity">
              <div className="dt-avail-avatar">{initial}</div>
              <div className="dt-avail-identity-text">
                <h2 className="dt-avail-name">{availabilityDentist.name}</h2>
                <div className="dt-avail-contact">
                  {availabilityDentist.email && <span>✉️ {availabilityDentist.email}</span>}
                  {availabilityDentist.phone && <span>📞 {availabilityDentist.phone}</span>}
                  <span className="dt-avail-contact-dim">Manage availability &amp; blocked periods</span>
                </div>
              </div>
            </div>
          </div>
          <div className="dt-avail-page-body">
            <DentistAvailabilityManager clinicId={clinicId} dentistId={availabilityDentist.id} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dc-page dt-page">
      <header className="dc-page-header">
        <div className="dc-page-titlewrap">
          <div className="dc-page-eyebrow">Team</div>
          <h1 className="dc-page-title">Dentists</h1>
          <div className="dc-page-subtitle">{dentists.length} total</div>
        </div>
        <div className="dc-page-header-actions">
          <button className="dc-btn dc-btn--primary" onClick={openAddModal}>
            <LuUserPlus /> Add Dentist
          </button>
        </div>
      </header>

      {((error || success) && !modalOpen && !deleteModalOpen && !addModalOpen) && (
        <div className="dt-msg-row">
          {error && <div className="dc-banner dc-banner--err">{error}</div>}
          {success && <div className="dc-banner dc-banner--ok">{success}</div>}
        </div>
      )}

      <div className="dc-table-wrap">
        <table className="dc-table dt-table">
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {dentists.map(dentist => (
              <tr key={dentist.id}>
                <td title={dentist.name}>{dentist.name}</td>
                <td title={dentist.email}>{dentist.email}</td>
                <td title={dentist.phone}>{dentist.phone}</td>
                <td>
                  <button
                    className={`dt-status${dentist.is_active ? ' active' : ''}`}
                    onClick={() => toggleStatus(dentist)}
                    title={`Mark as ${dentist.is_active ? 'Inactive' : 'Active'}`}
                  >
                    <span className="dt-status-dot" />
                    {dentist.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td>
                  <div className="dc-table-actions">
                    <button className="dc-icon-btn dc-icon-btn--accent" title="Manage Availability" aria-label="Manage availability" onClick={() => openAvailability(dentist)}>
                      <LuCalendarClock />
                    </button>
                    <button className="dc-icon-btn dc-icon-btn--accent" title="Edit" aria-label="Edit dentist" onClick={() => startEdit(dentist)}>
                      <LuSquarePen />
                    </button>
                    <button className="dc-icon-btn dc-icon-btn--danger" title="Delete" aria-label="Delete dentist" onClick={() => onDeleteClick(dentist)}>
                      <LuTrash2 />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {dentists.length === 0 && (
              <tr><td colSpan={5} className="dt-empty">No dentists yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="dt-note">
        <LuInfo /> Tip: click a dentist's <strong>status</strong> to switch them between Active and Inactive.
      </div>

      {/* ── Add ── */}
      {addModalOpen && (
        <div className="dc-overlay" onClick={closeAddModal}>
          <div className="dc-modal dc-modal--sm" onClick={e => e.stopPropagation()}>
            <h3 className="dc-modal-title">Add Dentist</h3>
            <form onSubmit={handleSubmit}>
              <div className="dt-form">
                <label className="dc-field"><span>Name</span><input type="text" name="name" value={newDentist.name} onChange={handleChange} autoFocus /></label>
                <label className="dc-field"><span>Email</span><input type="email" name="email" value={newDentist.email} onChange={handleChange} /></label>
                <label className="dc-field"><span>Phone</span><input type="tel" name="phone" value={newDentist.phone} onChange={handleChange} /></label>
                <label className="dt-check"><input type="checkbox" name="is_active" checked={newDentist.is_active} onChange={handleChange} /> Active</label>
              </div>
              {error && <div className="dc-banner dc-banner--err">{error}</div>}
              <div className="dc-modal-actions">
                <button type="button" className="dc-btn dc-btn--ghost" onClick={closeAddModal}>Cancel</button>
                <button type="submit" className="dc-btn dc-btn--primary">Add Dentist</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit ── */}
      {modalOpen && (
        <div className="dc-overlay" onClick={closeModal}>
          <div className="dc-modal dc-modal--sm" onClick={e => e.stopPropagation()}>
            <h3 className="dc-modal-title">Edit Dentist</h3>
            <form onSubmit={e => { e.preventDefault(); saveEdit(editDentistId); }}>
              <div className="dt-form">
                <label className="dc-field"><span>Name</span><input type="text" name="name" value={editDentist.name} onChange={handleEditChange} autoFocus /></label>
                <label className="dc-field"><span>Email</span><input type="email" name="email" value={editDentist.email} onChange={handleEditChange} /></label>
                <label className="dc-field"><span>Phone</span><input type="tel" name="phone" value={editDentist.phone} onChange={handleEditChange} /></label>
                <label className="dt-check"><input type="checkbox" name="is_active" checked={editDentist.is_active} onChange={handleEditChange} /> Active</label>
              </div>
              {error && <div className="dc-banner dc-banner--err">{error}</div>}
              <div className="dc-modal-actions">
                <button type="button" className="dc-btn dc-btn--ghost" onClick={closeModal}>Cancel</button>
                <button type="submit" className="dc-btn dc-btn--primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete ── */}
      {deleteModalOpen && (
        <div className="dc-overlay" onClick={cancelDelete}>
          <div className="dc-modal dc-modal--sm" onClick={e => e.stopPropagation()}>
            <h3 className="dc-modal-title">{deleteMode === 'block' ? 'Cannot delete dentist' : 'Delete dentist?'}</h3>
            {deleteMode === 'hard' && <p>Permanently delete this dentist? This can’t be undone.</p>}
            {deleteMode === 'soft' && (
              <div className="dc-banner dc-banner--err">
                <strong>Note:</strong> This dentist has only past appointments. The profile will be soft-deleted (hidden from active lists, kept for records).
              </div>
            )}
            {deleteMode === 'block' && (
              <>
                <div className="dc-banner dc-banner--err">
                  This dentist has future appointments — reassign or remove them first.
                </div>
                <ul className="dt-appt-list">
                  {futureAppointments.map((a) => {
                    const patient = patients.find(p => String(p.id) === String(a.patient_id));
                    return (
                      <li key={a.id} className="dt-appt-item">
                        <div>
                          <b>{patient ? patient.name : 'Unknown'}</b> · #{a.id}
                          <span className={`dt-appt-badge${a.status === 'Confirmed' ? ' confirmed' : ''}`}>{a.status}</span>
                        </div>
                        <div className="dt-appt-when">{new Date(a.appointment_time).toLocaleString()}</div>
                        {a.reason && <div className="dt-appt-reason">{a.reason}</div>}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <div className="dc-modal-actions">
              <button type="button" className="dc-btn dc-btn--ghost" onClick={cancelDelete}>Cancel</button>
              {(deleteMode === 'hard' || deleteMode === 'soft') && (
                <button type="button" className="dc-btn dc-btn--danger dc-btn--danger-solid" onClick={confirmDelete}>
                  {deleteMode === 'hard' ? 'Delete' : 'Soft Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Dentists;