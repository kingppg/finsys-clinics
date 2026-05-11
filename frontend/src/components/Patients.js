import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Odontogram from './Odontogram';   // ← NEW
import './Patients.css';
import './MainSection.css';

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
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyPatient, setHistoryPatient] = useState(null);
  const [profileTab, setProfileTab] = useState('history');   // ← NEW: 'history' | 'odontogram'
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPatients();
    fetchAppointments();
    fetchDentists();
    // eslint-disable-next-line
  }, [clinicId]);

  useEffect(() => {
    if (modalOpen || addModalOpen || deleteModalOpen || historyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; }
  }, [modalOpen, addModalOpen, deleteModalOpen, historyModalOpen]);

  // Reset tab to history when a new patient profile opens
  useEffect(() => {
    if (historyModalOpen) setProfileTab('history');
  }, [historyPatient, historyModalOpen]);

  useEffect(() => {
    if (addModalOpen) {
      setModalContent(
        <div className="main-content-modal-bg" onClick={closeAddModal}>
          <div className="modal patients-modal" onClick={e => e.stopPropagation()}>
            <h3>Add Patient</h3>
            <form onSubmit={handleSubmit}>
              <label>Name:</label>
              <input type="text" name="name" value={newPatient.name} onChange={handleChange} className="patients-table-edit-input" autoFocus />
              <label>Phone:</label>
              <input type="tel" name="phone" value={newPatient.phone} onChange={handleChange} className="patients-table-edit-input" />
              {error && <div className="modal-error">{error}</div>}
              <div className="modal-actions" style={{marginTop: 18}}>
                <button type="button" onClick={closeAddModal} style={{ background: "#fff", color: "#185abd", border: "1.5px solid #185abd" }}>Cancel</button>
                <button type="submit" style={{ background: "#185abd", color: "#fff" }}>Add</button>
              </div>
            </form>
          </div>
        </div>
      );
    } else if (modalOpen) {
      setModalContent(
        <div className="main-content-modal-bg" onClick={closeModal}>
          <div className="modal patients-modal" onClick={e => e.stopPropagation()}>
            <h3>Edit Patient</h3>
            <form onSubmit={e => { e.preventDefault(); saveEdit(editPatientId); }}>
              <label>Name:</label>
              <input type="text" name="name" value={editPatient.name} onChange={handleEditChange} className="patients-table-edit-input" autoFocus />
              <label>Phone:</label>
              <input type="tel" name="phone" value={editPatient.phone} onChange={handleEditChange} className="patients-table-edit-input" />
              {error && <div className="modal-error">{error}</div>}
              <div className="modal-actions" style={{marginTop: 18}}>
                <button type="button" onClick={closeModal} style={{ background: "#fff", color: "#185abd", border: "1.5px solid #185abd" }}>Cancel</button>
                <button type="submit" style={{ background: "#185abd", color: "#fff" }}>Save</button>
              </div>
            </form>
          </div>
        </div>
      );
    } else if (deleteModalOpen) {
      setModalContent(
        <div className="main-content-modal-bg" onClick={cancelDelete}>
          <div className="modal patients-modal" onClick={e => e.stopPropagation()}>
            <h3>Confirm Delete</h3>
            {hasAppointments ? (
              <div className="modal-warning">
                <strong>Warning:</strong> This profile has one or more appointments.<br />
                Deleting will also remove all related appointments.<br />
                Are you sure you want to continue?
              </div>
            ) : (
              <div>Are you sure you want to delete this profile?</div>
            )}
            <div className="modal-actions" style={{marginTop: 16}}>
              <button type="button" onClick={cancelDelete} style={{ background: "#fff", color: "#185abd", border: "1.5px solid #185abd" }}>Cancel</button>
              <button type="button" onClick={confirmDelete} style={{ background: "#e74c3c", color: "#fff" }}>Delete</button>
            </div>
          </div>
        </div>
      );

    // ─────────────────────────────────────────────────────────────────────────
    // PATIENT PROFILE MODAL — with History + Odontogram tabs
    // ─────────────────────────────────────────────────────────────────────────
    } else if (historyModalOpen && historyPatient) {
      setModalContent(
        <div className="main-content-modal-bg" onClick={closeHistoryModal}>
          {/*
            Override modal width here so the odontogram has room.
            Adjust max-width to fit your design system.
          */}
          <div
            className="modal patients-modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 720, width: '95vw' }}
          >
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <h3 style={{ margin: 0 }}>{historyPatient.name}</h3>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
                  📞 {historyPatient.phone}
                  {historyPatient.messenger_id && (
                    <span style={{ marginLeft: 12 }}>💬 {historyPatient.messenger_id}</span>
                  )}
                </div>
              </div>
              <button
                onClick={closeHistoryModal}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}
                title="Close"
              >
                ×
              </button>
            </div>

            {/* ── Tab bar ── */}
            <div style={{
              display: 'flex', gap: 0, borderBottom: '1.5px solid #e5e7eb',
              marginBottom: 16, marginTop: 12,
            }}>
              {[
                { key: 'history',    label: '📋 Appointment History' },
                { key: 'odontogram', label: '🦷 Odontogram'          },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setProfileTab(tab.key)}
                  style={{
                    padding: '8px 20px',
                    border: 'none',
                    borderBottom: profileTab === tab.key ? '2.5px solid #185abd' : '2.5px solid transparent',
                    background: 'none',
                    cursor: 'pointer',
                    fontWeight: profileTab === tab.key ? 700 : 400,
                    color: profileTab === tab.key ? '#185abd' : '#6b7280',
                    fontSize: 13,
                    marginBottom: -1,           // sits on top of border-bottom
                    transition: 'all 0.12s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Tab: Appointment History ── */}
            {profileTab === 'history' && (
              <ul style={{ maxHeight: 340, overflow: 'auto', paddingLeft: 18, margin: 0 }}>
                {appointments.filter(a => a.patient_id === historyPatient.id).length === 0 ? (
                  <li style={{ color: '#9ca3af', listStyle: 'none', padding: '12px 0' }}>No appointments found.</li>
                ) : (
                  appointments
                    .filter(a => a.patient_id === historyPatient.id)
                    .sort((a, b) => new Date(b.appointment_time) - new Date(a.appointment_time))
                    .map(a => (
                      <li key={a.id} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                        <b>
                          {new Date(a.appointment_time).toLocaleDateString()}{' '}
                          {new Date(a.appointment_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </b>
                        <br />
                        Dentist: {getDentistName(a.dentist_id)}<br />
                        Procedure: {a.reason}<br />
                        Status:{' '}
                        <span style={{
                          fontWeight: 'bold', padding: '2px 10px', borderRadius: 10,
                          background: statusColor(a.status), color: '#fff',
                          marginLeft: 2, fontSize: '.98em', display: 'inline-block',
                          minWidth: 87, textAlign: 'center',
                        }}>
                          {a.status || 'Unknown'}
                        </span>
                      </li>
                    ))
                )}
              </ul>
            )}

            {/* ── Tab: Odontogram ── */}
            {profileTab === 'odontogram' && (
              <div style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>
                <Odontogram
                  patientId={historyPatient.id}
                  clinicId={clinicId}
                  patientName={historyPatient.name}
                />
              </div>
            )}

            {/* ── Footer ── */}
            <div className="modal-actions" style={{ marginTop: 18 }}>
              <button
                type="button"
                onClick={closeHistoryModal}
                style={{ background: '#fff', color: '#185abd', border: '1.5px solid #185abd' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    } else {
      setModalContent(null);
    }
    // eslint-disable-next-line
  }, [addModalOpen, modalOpen, deleteModalOpen, historyModalOpen, historyPatient,
      profileTab,   // ← NEW dependency
      error, editPatient, newPatient, hasAppointments]);

  // ── Supabase fetches (unchanged) ──────────────────────────────────────────

  const fetchPatients = async () => {
    try {
      setError('');
      const { data, error } = await supabase
        .from('patients').select('*')
        .eq('clinic_id', clinicId).eq('deleted', false)
        .order('name', { ascending: true });
      if (error) throw error;
      setPatients(data || []);
    } catch (err) { setError('Failed to fetch patients'); setPatients([]); console.error(err); }
  };

  const fetchAppointments = async () => {
    try {
      setError('');
      const { data, error } = await supabase
        .from('appointments').select('*')
        .eq('clinic_id', clinicId).order('appointment_time', { ascending: false });
      if (error) throw error;
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
    try {
      const { error } = await supabase.from('patients').insert([{ ...newPatient, clinic_id: clinicId }]);
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
    try {
      const { error } = await supabase.from('patients')
        .update({ name: editPatient.name, phone: editPatient.phone, messenger_id: editPatient.messenger_id, clinic_id: clinicId })
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

  const openHistoryModal  = (patient) => { setHistoryPatient(patient); setHistoryModalOpen(true); };
  const closeHistoryModal = () => { setHistoryModalOpen(false); setHistoryPatient(null); };

  const statusColor = status => {
    switch ((status || '').toLowerCase()) {
      case "confirmed": return "#22b87c";
      case "completed": return "#185abd";
      case "no show":   return "#ff9800";
      case "cancelled": return "#e74c3c";
      default:          return "#888";
    }
  };
  const getDentistName = id => dentists.find(d => String(d.id) === String(id))?.name ?? id;

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.messenger_id || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Render (unchanged) ────────────────────────────────────────────────────

  return (
    <section className="main-section patients-section-relative">
      <div className="patients-sticky-header">
        <div className="patients-header-row">
          <h2 className="patients-title">Patients</h2>
          <input
            type="text" className="patients-search"
            placeholder="Search patients…" value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            onClick={openAddModal}
            style={{ fontWeight: 'bold', background: '#185abd', color: '#fff', padding: '8px 20px', border: 'none', borderRadius: 4, minWidth: 120 }}
          >
            Add Patient
          </button>
        </div>
        <div style={{ fontWeight: 500, color: '#444', fontSize: '1.05em' }}>
          Total number of patients: {patients.length}
        </div>
        <div className="patients-message-row">
          {error   && !modalOpen && !deleteModalOpen && !addModalOpen && !historyModalOpen && <span className="patients-error">{error}</span>}
          {success && !modalOpen && !deleteModalOpen && !addModalOpen && !historyModalOpen && <span className="patients-success">{success}</span>}
        </div>
      </div>
      <div className="patients-table-scroll">
        <table className="patients-table-fixed" border="1" cellPadding="8">
          <colgroup>
            <col style={{ width: '32%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
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
                    className="patients-name-link"
                    onClick={() => openHistoryModal(patient)}
                    title={`View profile for ${patient.name}`}
                    style={{ background: "none", border: "none", color: "#185abd", fontWeight: "600", textDecoration: "underline", cursor: "pointer", padding: 0 }}
                  >
                    {patient.name}
                  </button>
                </td>
                <td title={patient.phone}>{patient.phone}</td>
                <td title={patient.messenger_id}>{patient.messenger_id || ''}</td>
                <td className="patients-actions-cell">
                  <button onClick={() => startEdit(patient)} style={{ marginRight: 8, fontWeight: 'bold', color: 'white', background: '#2bc1ff', minWidth: 70 }}>Edit</button>
                  <button onClick={() => onDeleteClick(patient)} style={{ fontWeight: 'bold', color: 'white', background: '#e74c3c', minWidth: 70 }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default Patients;