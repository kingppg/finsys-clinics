import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DentistAvailabilityManager from './DentistAvailabilityManager';
import './Dentists.css';
import './MainSection.css';

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
  // Availability modal state
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [availabilityDentist, setAvailabilityDentist] = useState(null);

  useEffect(() => { 
    fetchDentists(); 
    fetchAppointments(); 
    fetchPatients();
    // eslint-disable-next-line
  }, [clinicId]);

  useEffect(() => {
    if (modalOpen || addModalOpen || deleteModalOpen || availabilityModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; }
  }, [modalOpen, addModalOpen, deleteModalOpen, availabilityModalOpen]);

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
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('clinic_id', clinicId);
      if (error) throw error;
      setAppointments(data);
    } catch (err) {
      setError('Failed to fetch appointments');
      console.error(err);
    }
  };

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId);
      if (error) throw error;
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

  // Availability Modal handlers
  const openAvailabilityModal = (dentist) => {
    setAvailabilityDentist(dentist);
    setAvailabilityModalOpen(true);
  };
  const closeAvailabilityModal = () => {
    setAvailabilityDentist(null);
    setAvailabilityModalOpen(false);
  };

  // --------- STICKY HEADER PATCH (flex, align center, sticky, no UI change) ---------
  return (
    <section className="main-section dentists-section-relative">
      <div className="dentists-sticky-header">
        <div className="dentists-header-row">
          <h2 className="dentists-title">Dentists</h2>
          <button onClick={openAddModal} style={{
            fontWeight: 'bold', background: '#185abd', color: '#fff',
            padding: '8px 20px', border: 'none', borderRadius: 4, minWidth: 120
          }}>Add Dentist</button>
        </div>
        <div className="dentists-message-row" style={{ minHeight: 30 }}>
          {error && !modalOpen && !deleteModalOpen && !addModalOpen && !availabilityModalOpen ? <span className="dentists-error">{error}</span> : null}
          {success && !modalOpen && !deleteModalOpen && !addModalOpen && !availabilityModalOpen ? <span className="dentists-success">{success}</span> : null}
        </div>
      </div>
      <div className="dentists-table-scroll">
        <table className="dentists-table-fixed" border="1" cellPadding="8">
          <colgroup>
            <col style={{width: '24%'}} />
            <col style={{width: '24%'}} />
            <col style={{width: '16%'}} />
            <col style={{width: '16%'}} />
            <col style={{width: '20%'}} />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Actions</th>
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
                    onClick={() => toggleStatus(dentist)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                    title={`Mark as ${dentist.is_active ? 'Inactive' : 'Active'}`}
                  >
                    <span style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      marginRight: 8,
                      background: dentist.is_active ? '#43a047' : '#e53935',
                      verticalAlign: 'middle',
                      border: '1px solid #bbb',
                      transition: 'background 0.2s'
                    }} />
                    <span style={{
                      fontWeight: 600,
                      color: dentist.is_active ? '#43a047' : '#e53935',
                      fontSize: '1em'
                    }}>
                      {dentist.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                </td>
                <td className="dentists-actions-cell">
                  <i
                    className="fa fa-calendar icon-action calendar-icon"
                    title="Manage Availability"
                    onClick={() => openAvailabilityModal(dentist)}
                    style={{
                      cursor: "pointer",
                      color: "#388e3c",
                      fontSize: "1.15em",
                      padding: 6,
                      borderRadius: 4,
                      background: "none",
                      border: "none",
                      marginRight: 12
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label="Manage Availability"
                  />
                  <i
                    className="fa fa-edit icon-action edit-icon"
                    title="Edit"
                    onClick={() => startEdit(dentist)}
                    style={{
                      cursor: "pointer",
                      color: "#2bc1ff",
                      marginRight: 16,
                      fontSize: "1.15em",
                      padding: 6,
                      borderRadius: 4,
                      background: "none",
                      border: "none"
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label="Edit"
                  />
                  <i
                    className="fa fa-trash icon-action delete-icon"
                    title="Delete"
                    onClick={() => onDeleteClick(dentist)}
                    style={{
                      cursor: "pointer",
                      color: "#e74c3c",
                      fontSize: "1.15em",
                      padding: 6,
                      borderRadius: 4,
                      background: "none",
                      border: "none"
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label="Delete"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* ---- THE REST: MODALS, NO CHANGE ---- */}
      {addModalOpen && (
        <div className="modal-bg modal-bg-inside-section" onClick={closeAddModal}>
          <div className="modal dentists-modal" onClick={e => e.stopPropagation()}>
            <h3>Add Dentist</h3>
            <form onSubmit={handleSubmit}>
              <label>Name:</label>
              <input type="text" name="name" value={newDentist.name} onChange={handleChange} className="dentists-table-edit-input" autoFocus />
              <label>Email:</label>
              <input type="email" name="email" value={newDentist.email} onChange={handleChange} className="dentists-table-edit-input" />
              <label>Phone:</label>
              <input type="tel" name="phone" value={newDentist.phone} onChange={handleChange} className="dentists-table-edit-input" />
              <label>Status:</label>
              <div style={{marginBottom: 10}}>
                <label style={{marginRight: 16}}>
                  <input type="checkbox" name="is_active" checked={newDentist.is_active} onChange={handleChange} style={{marginRight: 6}} />
                  Active
                </label>
              </div>
              {error && <div className="modal-error">{error}</div>}
              <div className="modal-actions" style={{marginTop: 18}}>
                <button type="button" onClick={closeAddModal} style={{ background: "#fff", color: "#185abd", border: "1.5px solid #185abd" }}>Cancel</button>
                <button type="submit" style={{ background: "#185abd", color: "#fff" }}>Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modalOpen && (
        <div className="modal-bg modal-bg-inside-section" onClick={closeModal}>
          <div className="modal dentists-modal" onClick={e => e.stopPropagation()}>
            <h3>Edit Dentist</h3>
            <form onSubmit={e => { e.preventDefault(); saveEdit(editDentistId); }}>
              <label>Name:</label>
              <input type="text" name="name" value={editDentist.name} onChange={handleEditChange} className="dentists-table-edit-input" autoFocus />
              <label>Email:</label>
              <input type="email" name="email" value={editDentist.email} onChange={handleEditChange} className="dentists-table-edit-input" />
              <label>Phone:</label>
              <input type="tel" name="phone" value={editDentist.phone} onChange={handleEditChange} className="dentists-table-edit-input" />
              <label>Status:</label>
              <div style={{marginBottom: 10}}>
                <label style={{marginRight: 16}}>
                  <input type="checkbox" name="is_active" checked={editDentist.is_active} onChange={handleEditChange} style={{marginRight: 6}} />
                  Active
                </label>
              </div>
              {error && <div className="modal-error">{error}</div>}
              <div className="modal-actions" style={{marginTop: 18}}>
                <button type="button" onClick={closeModal} style={{ background: "#fff", color: "#185abd", border: "1.5px solid #185abd" }}>Cancel</button>
                <button type="submit" style={{ background: "#185abd", color: "#fff" }}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {deleteModalOpen && (
        <div className="modal-bg modal-bg-inside-section" onClick={cancelDelete}>
          <div className="modal dentists-modal" onClick={e => e.stopPropagation()}>
            <h3>Confirm Delete</h3>
            {deleteMode === 'hard' && (
              <div>
                Are you sure you want to <b>permanently delete</b> this dentist? This action cannot be undone.
              </div>
            )}
            {deleteMode === 'soft' && (
              <div>
                <strong>Note:</strong> This dentist has only past appointments.<br />
                The profile will be <b>soft deleted</b> (hidden from active lists, but kept for record-keeping).
                <br /><br />
                Are you sure you want to proceed?
              </div>
            )}
            {deleteMode === 'block' && (
              <div>
                <strong>Cannot delete dentist!</strong><br />
                This dentist has one or more <b>future appointments</b>.<br />
                Please reassign or remove the following appointments first:<br /><br />
                <ul style={{ maxHeight: 180, overflow: 'auto', padding: 0, margin: 0, listStyle: "none" }}>
                  {futureAppointments.map((a, idx) => {
                    const patient = patients.find(p => String(p.id) === String(a.patient_id));
                    return (
                      <React.Fragment key={a.id}>
                        {idx > 0 && <hr className="future-appt-divider" />}
                        <li style={{ padding: "6px 0" }}>
                          <div>
                            <b>{patient ? patient.name : "Unknown"}</b> (Appointment ID: <b>{a.id}</b>)
                            <span style={{
                              display: "inline-block",
                              marginLeft: 8,
                              padding: "2px 8px",
                              borderRadius: 8,
                              fontWeight: 600,
                              fontSize: "0.9em",
                              background: a.status === "Confirmed" ? "#e8f5e9" : "#fffde7",
                              color: a.status === "Confirmed" ? "#388e3c" : "#b28704",
                              border: a.status === "Confirmed" ? "1px solid #81c784" : "1px solid #ffe082"
                            }}>
                              {a.status}
                            </span>
                          </div>
                          <div>{new Date(a.appointment_time).toLocaleString()}</div>
                          {a.reason && <div>{a.reason}</div>}
                        </li>
                      </React.Fragment>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="modal-actions" style={{marginTop: 16}}>
              <button type="button" onClick={cancelDelete} style={{ background: "#fff", color: "#185abd", border: "1.5px solid #185abd" }}>Cancel</button>
              {(deleteMode === 'hard' || deleteMode === 'soft') && (
                <button type="button" onClick={confirmDelete} style={{ background: "#e74c3c", color: "#fff" }}>
                  {deleteMode === 'hard' ? 'Delete' : 'Soft Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {availabilityModalOpen && (
        <div className="modal-bg modal-bg-inside-section" onClick={closeAvailabilityModal} style={{zIndex: 1500}}>
          <div
            className="modal dentists-modal"
            style={{
              minWidth: 540,
              maxWidth: 900,
              width: "96%",
              maxHeight: "86vh",
              height: "720px",
              position: "fixed",
              left: "calc(120px + 50%)",
              top: "50%",
              transform: "translate(-50%, -50%)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              zIndex: 1600,
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 10px 32px #0002"
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={closeAvailabilityModal}
              style={{
                position: "absolute",
                top: 18,
                right: 28,
                background: "none",
                border: "none",
                fontSize: "1.7em",
                cursor: "pointer",
                color: "#555",
                zIndex: 1700,
                padding: 0,
                lineHeight: 1
              }}
              title="Close"
              aria-label="Close"
            >
              ×
            </button>
            <div style={{padding: '24px 32px 0 32px', textAlign: 'center'}}>
              <div style={{fontSize: 26, fontWeight: 700, marginBottom: 8}}>Dentist Availability Manager</div>
              <div style={{fontSize: 20, fontWeight: 500, marginBottom: 0, color: "#185abd"}}>
                {availabilityDentist?.name || ''}
              </div>
            </div>
            <div style={{flex: '1 1 auto', overflow: 'auto', padding: "0 32px 24px 32px"}}>
              <DentistAvailabilityManager
                clinicId={clinicId}
                dentistId={availabilityDentist?.id}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default Dentists;