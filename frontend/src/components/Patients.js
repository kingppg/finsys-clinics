import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fetchAllRows } from '../api/fetchAllRows';
import { normalizePHMobile } from '../utils/phone';
import PatientProfile from './patients/PatientProfile'; // full-page profile: history, odontogram, files (TS)
import { LuSquarePen, LuTrash2, LuSearch, LuUserPlus } from 'react-icons/lu';
import './Patients.css';

function Patients({ setModalContent, clinicId }) {
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [dentists, setDentists] = useState([]);
  const [newPatient, setNewPatient] = useState({ name: '', phone: '' });
  const [editPatientId, setEditPatientId] = useState(null);
  const [editPatient, setEditPatient] = useState({ name: '', phone: '', messenger_id: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState(null);
  const [hasAppointments, setHasAppointments] = useState(false);
  const [profilePatient, setProfilePatient] = useState(null); // full-page profile view when set
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPatients();
    fetchAppointments();
    fetchDentists();
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

  useEffect(() => {
    if (addModalOpen) {
      setModalContent(
        <div className="dc-overlay" onClick={closeAddModal}>
          <div className="dc-modal dc-modal--sm" onClick={e => e.stopPropagation()}>
            <h3 className="dc-modal-title">Add Patient</h3>
            <form onSubmit={handleSubmit}>
              <div className="pt-form">
                <label className="dc-field">
                  <span>Name</span>
                  <input type="text" name="name" value={newPatient.name} onChange={handleChange} autoFocus />
                </label>
                <label className="dc-field">
                  <span>Phone</span>
                  <input type="tel" name="phone" placeholder="09171234567" value={newPatient.phone} onChange={handleChange} />
                </label>
              </div>
              {error && <div className="dc-banner dc-banner--err">{error}</div>}
              <div className="dc-modal-actions">
                <button type="button" className="dc-btn dc-btn--ghost" onClick={closeAddModal}>Cancel</button>
                <button type="submit" className="dc-btn dc-btn--primary">Add Patient</button>
              </div>
            </form>
          </div>
        </div>
      );
    } else if (modalOpen) {
      setModalContent(
        <div className="dc-overlay" onClick={closeModal}>
          <div className="dc-modal dc-modal--sm" onClick={e => e.stopPropagation()}>
            <h3 className="dc-modal-title">Edit Patient</h3>
            <form onSubmit={e => { e.preventDefault(); saveEdit(editPatientId); }}>
              <div className="pt-form">
                <label className="dc-field">
                  <span>Name</span>
                  <input type="text" name="name" value={editPatient.name} onChange={handleEditChange} autoFocus />
                </label>
                <label className="dc-field">
                  <span>Phone</span>
                  <input type="tel" name="phone" placeholder="09171234567" value={editPatient.phone} onChange={handleEditChange} />
                </label>
              </div>
              {error && <div className="dc-banner dc-banner--err">{error}</div>}
              <div className="dc-modal-actions">
                <button type="button" className="dc-btn dc-btn--ghost" onClick={closeModal}>Cancel</button>
                <button type="submit" className="dc-btn dc-btn--primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      );
    } else if (deleteModalOpen) {
      setModalContent(
        <div className="dc-overlay" onClick={cancelDelete}>
          <div className="dc-modal dc-modal--sm" onClick={e => e.stopPropagation()}>
            <h3 className="dc-modal-title">Delete patient?</h3>
            {hasAppointments ? (
              <div className="dc-banner dc-banner--err">
                <strong>Warning:</strong> This profile has one or more appointments. Deleting will also remove all related appointments.
              </div>
            ) : (
              <p>Are you sure you want to delete this profile? This can’t be undone.</p>
            )}
            <div className="dc-modal-actions">
              <button type="button" className="dc-btn dc-btn--ghost" onClick={cancelDelete}>Cancel</button>
              <button type="button" className="dc-btn dc-btn--danger dc-btn--danger-solid" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      );

    } else {
      setModalContent(null);
    }
    // eslint-disable-next-line
  }, [addModalOpen, modalOpen, deleteModalOpen, error, editPatient, newPatient, hasAppointments]);

  // ── Supabase fetches (unchanged) ──────────────────────────────────────────

  const fetchPatients = async () => {
    try {
      setError('');
      // Paged past the 1000-row cap so a large clinic never silently loses patients.
      const data = await fetchAllRows((from, to) =>
        supabase.from('patients').select('*')
          .eq('clinic_id', clinicId).eq('deleted', false)
          .order('name', { ascending: true }).range(from, to));
      setPatients(data || []);
    } catch (err) { setError('Failed to fetch patients'); setPatients([]); console.error(err); }
  };

  const fetchAppointments = async () => {
    try {
      setError('');
      // Paged so the has-appointments indicator reflects EVERY appointment.
      const data = await fetchAllRows((from, to) =>
        supabase.from('appointments').select('*')
          .eq('clinic_id', clinicId).order('appointment_time', { ascending: false }).range(from, to));
      setAppointments(data || []);
    } catch (err) { setError('Failed to fetch appointments'); setAppointments([]); console.error(err); }
  };

  const fetchDentists = async () => {
    try {
      setError('');
      const { data, error } = await supabase
        .from('dentists').select('*')
        .eq('clinic_id', clinicId).order('name', { ascending: true });
      if (error) throw error;
      setDentists(data || []);
    } catch (err) { setError('Failed to fetch dentists'); setDentists([]); console.error(err); }
  };

  // ── Handlers (unchanged) ──────────────────────────────────────────────────

  const handleChange     = e => setNewPatient(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleEditChange = e => setEditPatient(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const openAddModal  = () => { setAddModalOpen(true);  setError(''); setSuccess(''); };
  const closeAddModal = () => { setAddModalOpen(false); setNewPatient({ name: '', phone: '' }); setError(''); setSuccess(''); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!newPatient.name || !newPatient.phone) { setError('All patient fields are required.'); return; }
    const phone = normalizePHMobile(newPatient.phone);
    if (!phone) { setError('Please enter a valid PH mobile number (e.g. 09171234567) — needed for SMS reminders.'); return; }
    try {
      const { error } = await supabase.from('patients').insert([{ ...newPatient, phone, clinic_id: clinicId }]);
      if (error) throw error;
      setNewPatient({ name: '', phone: '' });
      closeAddModal(); fetchPatients();
      setSuccess('Patient added!'); setTimeout(() => setSuccess(''), 1200);
    } catch (err) { setError('Error creating patient.'); console.error(err); }
  };

  const startEdit = (patient) => {
    setEditPatientId(patient.id);
    setEditPatient({ name: patient.name, phone: patient.phone, messenger_id: patient.messenger_id });
    setError(''); setSuccess(''); setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false); setEditPatientId(null);
    setEditPatient({ name: '', phone: '', messenger_id: '' }); setError(''); setSuccess('');
  };
  const saveEdit = async (id) => {
    setError('');
    if (!editPatient.name || !editPatient.phone) { setError('All fields required.'); return; }
    const phone = normalizePHMobile(editPatient.phone);
    if (!phone) { setError('Please enter a valid PH mobile number (e.g. 09171234567) — needed for SMS reminders.'); return; }
    try {
      const { error } = await supabase.from('patients')
        .update({ name: editPatient.name, phone, messenger_id: editPatient.messenger_id, clinic_id: clinicId })
        .eq('id', id);
      if (error) throw error;
      setEditPatientId(null); setEditPatient({ name: '', phone: '', messenger_id: '' });
      setModalOpen(false); fetchPatients();
      setSuccess('Patient updated!'); setTimeout(() => setSuccess(''), 1200);
    } catch (err) { setError('Error updating patient.'); console.error(err); }
  };

  const onDeleteClick = (patient) => {
    setPatientToDelete(patient);
    setHasAppointments(appointments.filter(a => a.patient_id === patient.id).length > 0);
    setDeleteModalOpen(true);
  };
  const confirmDelete = async () => {
    if (!patientToDelete) return;
    try {
      const { error } = await supabase.from('patients')
        .update({ deleted: true }).eq('id', patientToDelete.id).eq('clinic_id', clinicId);
      if (error) throw error;
      setDeleteModalOpen(false); setPatientToDelete(null);
      fetchPatients(); fetchAppointments();
      setSuccess('Patient deleted!'); setTimeout(() => setSuccess(''), 1200);
    } catch (err) { setError('Error deleting patient.'); console.error(err); }
  };
  const cancelDelete = () => { setDeleteModalOpen(false); setPatientToDelete(null); };

  const openProfile  = (patient) => setProfilePatient(patient);
  const closeProfile = () => { setProfilePatient(null); fetchPatients(); fetchAppointments(); };

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.messenger_id || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────

  // Full-page patient profile (replaces the old cramped profile modal).
  // .dc-page = shared breathing gutters, same as the Billing System.
  if (profilePatient) {
    return (
      <div className="dc-page">
        <PatientProfile
          patient={profilePatient}
          clinicId={clinicId}
          appointments={appointments}
          dentists={dentists}
          onBack={closeProfile}
        />
      </div>
    );
  }

  return (
    <div className="dc-page pt-page">
      <header className="dc-page-header">
        <div className="dc-page-titlewrap">
          <div className="dc-page-eyebrow">Records</div>
          <h1 className="dc-page-title">Patients</h1>
          <div className="dc-page-subtitle">{patients.length} total</div>
        </div>
        <div className="dc-page-header-actions">
          <div className="pt-search">
            <LuSearch className="pt-search-icon" />
            <input
              type="text"
              placeholder="Search patients…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="dc-btn dc-btn--primary" onClick={openAddModal}>
            <LuUserPlus /> Add Patient
          </button>
        </div>
      </header>

      {((error || success) && !modalOpen && !deleteModalOpen && !addModalOpen) && (
        <div className="pt-msg-row">
          {error && <div className="dc-banner dc-banner--err">{error}</div>}
          {success && <div className="dc-banner dc-banner--ok">{success}</div>}
        </div>
      )}

      <div className="dc-table-wrap">
        <table className="dc-table pt-table">
          <colgroup>
            <col style={{ width: '34%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th><th>Phone</th><th>Messenger ID</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map(patient => (
              <tr key={patient.id}>
                <td title={patient.name}>
                  <button
                    className="pt-name-link"
                    onClick={() => openProfile(patient)}
                    title={`View profile for ${patient.name}`}
                  >
                    {patient.name}
                  </button>
                </td>
                <td title={patient.phone}>{patient.phone}</td>
                <td title={patient.messenger_id}>{patient.messenger_id || '—'}</td>
                <td>
                  <div className="dc-table-actions">
                    <button className="dc-icon-btn dc-icon-btn--accent" title="Edit" aria-label="Edit patient" onClick={() => startEdit(patient)}>
                      <LuSquarePen />
                    </button>
                    <button className="dc-icon-btn dc-icon-btn--danger" title="Delete" aria-label="Delete patient" onClick={() => onDeleteClick(patient)}>
                      <LuTrash2 />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredPatients.length === 0 && (
              <tr>
                <td colSpan={4} className="pt-empty">
                  {search ? 'No patients match your search.' : 'No patients yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Patients;