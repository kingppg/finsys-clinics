import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
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
              {/* Messenger ID retained in state, not edited */}
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
              <div>
                Are you sure you want to delete this profile?
              </div>
            )}
            <div className="modal-actions" style={{marginTop: 16}}>
              <button type="button" onClick={cancelDelete} style={{ background: "#fff", color: "#185abd", border: "1.5px solid #185abd" }}>Cancel</button>
              <button type="button" onClick={confirmDelete} style={{ background: "#e74c3c", color: "#fff" }}>Delete</button>
            </div>
          </div>
        </div>
      );
    } else if (historyModalOpen && historyPatient) {
      setModalContent(
        <div className="main-content-modal-bg" onClick={closeHistoryModal}>
          <div className="modal patients-modal" onClick={e => e.stopPropagation()}>
            <h3>{historyPatient.name}'s History</h3>
            <div>
              <strong>Phone:</strong> {historyPatient.phone}<br />
              <strong>Messenger ID:</strong> {historyPatient.messenger_id || '-'}<br />
            </div>
            <hr />
            <h4>Appointment History</h4>
            <ul style={{maxHeight:'240px',overflow:'auto',paddingLeft:18}}>
              {appointments.filter(a => a.patient_id === historyPatient.id).length === 0 ? (
                <li>No appointments found.</li>
              ) : (
                appointments
                  .filter(a => a.patient_id === historyPatient.id)
                  .sort((a, b) => new Date(b.appointment_time) - new Date(a.appointment_time))
                  .map(a => (
                    <li key={a.id} style={{marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f0f0f0'}}>
                      <b>{new Date(a.appointment_time).toLocaleDateString()} {new Date(a.appointment_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</b>
                      <br />
                      Dentist: {getDentistName(a.dentist_id)}
                      <br />
                      Procedure: {a.reason}
                      <br />
                      Status: <span
                        style={{
                          fontWeight: 'bold',
                          padding: '2px 10px',
                          borderRadius: '10px',
                          background: statusColor(a.status),
                          color: '#fff',
                          marginLeft: '2px',
                          fontSize: '.98em',
                          display: 'inline-block',
                          minWidth: '87px',
                          textAlign: 'center'
                        }}
                      >
                        {a.status || 'Unknown'}
                      </span>
                    </li>
                  ))
              )}
            </ul>
            <div className="modal-actions" style={{marginTop: 18}}>
              <button type="button" onClick={closeHistoryModal} style={{ background: "#fff", color: "#185abd", border: "1.5px solid #185abd" }}>Close</button>
            </div>
          </div>
        </div>
      );
    } else {
      setModalContent(null);
    }
    // eslint-disable-next-line
  }, [addModalOpen, modalOpen, deleteModalOpen, historyModalOpen, historyPatient, error, editPatient, newPatient, hasAppointments]);

  // --- Supabase Direct Fetches ---

  const fetchPatients = async () => {
    try {
      setError('');
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('deleted', false) // Only fetch non-deleted
        .order('name', { ascending: true });
      if (error) throw error;
      setPatients(data || []);
    } catch (err) {
      setError('Failed to fetch patients');
      setPatients([]);
      console.error(err);
    }
  };

  const fetchAppointments = async () => {
    try {
      setError('');
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('appointment_time', { ascending: false });
      if (error) throw error;
      setAppointments(data || []);
    } catch (err) {
      setError('Failed to fetch appointments');
      setAppointments([]);
      console.error(err);
    }
  };

  const fetchDentists = async () => {
    try {
      setError('');
      const { data, error } = await supabase
        .from('dentists')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('name', { ascending: true });
      if (error) throw error;
      setDentists(data || []);
    } catch (err) {
      setError('Failed to fetch dentists');
      setDentists([]);
      console.error(err);
    }
  };

  const handleChange = (e) => {
    setNewPatient(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  const handleEditChange = (e) => {
    setEditPatient(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  const openAddModal = () => {
    setAddModalOpen(true); setError(''); setSuccess('');
  };
  const closeAddModal = () => {
    setAddModalOpen(false); setNewPatient({ name: '', phone: '' }); setError(''); setSuccess('');
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!newPatient.name || !newPatient.phone) {
      setError('All patient fields are required.');
      return;
    }
    try {
      const { error } = await supabase
        .from('patients')
        .insert([{ ...newPatient, clinic_id: clinicId }]);
      if (error) throw error;
      setNewPatient({ name: '', phone: '' });
      closeAddModal();
      fetchPatients();
      setSuccess('Patient added!');
      setTimeout(() => setSuccess(''), 1200);
    } catch (err) {
      setError('Error creating patient.');
      console.error(err);
    }
  };
  const startEdit = (patient) => {
    setEditPatientId(patient.id);
    setEditPatient({
      name: patient.name,
      phone: patient.phone,
      messenger_id: patient.messenger_id
    });
    setError('');
    setSuccess('');
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setEditPatientId(null);
    setEditPatient({ name: '', phone: '', messenger_id: '' });
    setError('');
    setSuccess('');
  };
  const saveEdit = async (id) => {
    setError('');
    if (!editPatient.name || !editPatient.phone) {
      setError('All fields required.');
      return;
    }
    try {
      const { error } = await supabase
        .from('patients')
        .update({
          name: editPatient.name,
          phone: editPatient.phone,
          messenger_id: editPatient.messenger_id,
          clinic_id: clinicId
        })
        .eq('id', id);
      if (error) throw error;
      setEditPatientId(null);
      setEditPatient({ name: '', phone: '', messenger_id: '' });
      setModalOpen(false);
      fetchPatients();
      setSuccess('Patient updated!');
      setTimeout(() => setSuccess(''), 1200);
    } catch (err) {
      setError('Error updating patient.');
      console.error(err);
    }
  };
  const onDeleteClick = (patient) => {
    const appts = appointments.filter(a => a.patient_id === patient.id);
    setPatientToDelete(patient);
    setHasAppointments(appts.length > 0);
    setDeleteModalOpen(true);
  };
  const confirmDelete = async () => {
    if (!patientToDelete) return;
    try {
      // SOFT DELETE: Set deleted = true instead of hard delete!
      const { error } = await supabase
        .from('patients')
        .update({ deleted: true })
        .eq('id', patientToDelete.id)
        .eq('clinic_id', clinicId);
      if (error) throw error;
      setDeleteModalOpen(false);
      setPatientToDelete(null);
      fetchPatients();
      fetchAppointments();
      setSuccess('Patient deleted!');
      setTimeout(() => setSuccess(''), 1200);
    } catch (err) {
      setError('Error deleting patient.');
      console.error(err);
    }
  };
  const cancelDelete = () => {
    setDeleteModalOpen(false);
    setPatientToDelete(null);
  };
  const openHistoryModal = (patient) => {
    setHistoryPatient(patient);
    setHistoryModalOpen(true);
  };
  const closeHistoryModal = () => {
    setHistoryModalOpen(false);
    setHistoryPatient(null);
  };
  const statusColor = status => {
    switch ((status || '').toLowerCase()) {
      case "confirmed": return "#22b87c";
      case "completed": return "#185abd";
      case "no show": return "#ff9800";
      case "cancelled": return "#e74c3c";
      default: return "#888";
    }
  };
  const getDentistName = (id) => {
    const found = dentists.find(d => String(d.id) === String(id));
    return found ? found.name : id;
  };

  // FILTERED PATIENTS (for search)
  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.messenger_id || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section className="main-section patients-section-relative">
      <div className="patients-sticky-header">
        <div className="patients-header-row">
          <h2 className="patients-title">Patients</h2>
          <input
            type="text"
            className="patients-search"
            placeholder="Search patients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            onClick={openAddModal}
            style={{
              fontWeight: 'bold', background: '#185abd', color: '#fff',
              padding: '8px 20px', border: 'none', borderRadius: 4, minWidth: 120
            }}
          >
            Add Patient
          </button>
        </div>
        <div style={{fontWeight: 500, color: '#444', fontSize: '1.05em'}}>
          Total number of patients: {patients.length}
        </div>
        <div className="patients-message-row">
          {error && !modalOpen && !deleteModalOpen && !addModalOpen && !historyModalOpen ? <span className="patients-error">{error}</span> : null}
          {success && !modalOpen && !deleteModalOpen && !addModalOpen && !historyModalOpen ? <span className="patients-success">{success}</span> : null}
        </div>
      </div>
      <div className="patients-table-scroll">
        <table className="patients-table-fixed" border="1" cellPadding="8">
          <colgroup>
            <col style={{width: '32%'}} />
            <col style={{width: '28%'}} />
            <col style={{width: '20%'}} />
            <col style={{width: '20%'}} />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Messenger ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map(patient => (
              <tr key={patient.id}>
                <td title={patient.name}>
                  <button
                    className="patients-name-link"
                    onClick={() => openHistoryModal(patient)}
                    title={`View history for ${patient.name}`}
                    style={{background: "none", border: "none", color: "#185abd", fontWeight: "600", textDecoration: "underline", cursor: "pointer", padding: 0}}
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