import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import './AdminUsersRoles.css';

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'dentist', label: 'Dentist' },
];

const EDGE_DELETE_FUNC_URL =
  process.env.REACT_APP_DELETE_USER_FUNC_URL ||
  'https://kjdouaccurnbbvqtzxva.functions.supabase.co/testfunc2';

function AdminUsersRoles({ clinicId, currentUser }) {
  const [users, setUsers] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);

  const [form, setForm] = useState({ email: '', name: '', role: 'receptionist', password: '' });
  const [editForm, setEditForm] = useState({ id: '', name: '', role: 'receptionist' });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const clinicName = currentUser?.clinic_name || 'Clinic';

  const resetFeedback = () => {
    setError('');
    setSuccess('');
    setEditError('');
    setEditSuccess('');
    setDeleteError('');
    setDeleteSuccess('');
  };

  const fetchUsers = useCallback(async () => {
    if (clinicId == null) return;
    setFetching(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('users')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('id', { ascending: false });

      if (fetchErr) throw fetchErr;
      setUsers(data || []);
    } catch (err) {
      setError('Failed to fetch users');
      setUsers([]);
    } finally {
      setFetching(false);
    }
  }, [clinicId]);

  useEffect(() => {
    fetchUsers();
  }, [clinicId, fetchUsers]);

  function openAddModal() {
    resetFeedback();
    setForm({ email: '', name: '', role: 'receptionist', password: '' });
    setAddModal(true);
  }
  function closeAddModal() {
    setAddModal(false);
    resetFeedback();
  }

  function openEditModal(user) {
    resetFeedback();
    setEditForm({ id: user.id, name: user.name || '', role: user.role || 'receptionist' });
    setEditModal(true);
  }
  function closeEditModal() {
    setEditModal(false);
    setEditForm({ id: '', name: '', role: 'receptionist' });
    resetFeedback();
  }

  function openConfirmDelete(userId) {
    resetFeedback();
    setConfirmDeleteId(userId);
  }
  function closeConfirmDelete() {
    setConfirmDeleteId(null);
    resetFeedback();
  }

  async function handleAddUser(e) {
    e.preventDefault();
    resetFeedback();
    if (!form.email || !form.name || !form.role || !form.password) {
      setError('Please fill all fields.');
      return;
    }
    setActionLoading(true);
    try {
      const { data, error: supaError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { name: form.name } },
      });
      if (supaError) throw supaError;
      const supabaseUser = data.user || (data.session ? data.session.user : null);
      if (!supabaseUser) {
        setSuccess('User created! They must confirm their email before logging in.');
        closeAddModal();
        fetchUsers();
        return;
      }
      const { error: insertErr } = await supabase
        .from('users')
        .insert([
          {
            user_id: supabaseUser.id,
            email: supabaseUser.email,
            name: form.name,
            role: form.role,
            clinic_id: clinicId,
          },
        ]);
      if (insertErr) throw insertErr;
      setSuccess('User created! They must confirm their email before logging in.');
      closeAddModal();
      fetchUsers();
    } catch (err) {
      setError(err.message || 'User creation failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEditUser(e) {
    e.preventDefault();
    setEditError('');
    setEditSuccess('');
    if (!editForm.name || !editForm.role) {
      setEditError('Please fill all fields.');
      return;
    }
    setActionLoading(true);
    try {
      const { error: userUpdateError } = await supabase
        .from('users')
        .update({
          name: editForm.name,
          role: editForm.role,
        })
        .eq('id', editForm.id);

      if (userUpdateError) throw userUpdateError;
      setEditSuccess('User updated!');
      closeEditModal();
      fetchUsers();
    } catch (err) {
      setEditError(err.message || 'User update failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function callEdgeDelete(authUserId, retries = 2) {
    const payload = { user_id: authUserId };
    const body = JSON.stringify(payload);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(EDGE_DELETE_FUNC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        let json;
        try { json = await res.json(); } catch { throw new Error('Edge function returned non-JSON'); }
        if (!res.ok) throw new Error(json.error || 'Edge function returned error status');
        if (json.auth_delete || json.db_delete) return json;
        if (json.success) {
          return {
            auth_delete: { success: true },
            db_delete: { success: true },
            legacy: true,
            version: json.version || 'v3-final',
          };
        }
        throw new Error('Unexpected edge function response format');
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }

  async function handleDeleteUser(user) {
    resetFeedback();
    setActionLoading(true);
    const authUserId = user.user_id;
    if (!authUserId) {
      setDeleteError('No auth user_id stored for this user.');
      setActionLoading(false);
      return;
    }
    try {
      const result = await callEdgeDelete(authUserId);
      const authOk = result?.auth_delete?.success;
      const dbOk = result?.db_delete?.success;
      if (authOk && dbOk) {
        setDeleteSuccess('User deleted from Auth & custom table.');
      } else {
        let msg = '';
        if (!authOk) msg += `Auth delete failed: ${result?.auth_delete?.details || result?.auth_delete?.error || ''}\n`;
        if (!dbOk) msg += `DB delete failed: ${result?.db_delete?.details || result?.db_delete?.error || ''}`;
        setDeleteError(msg.trim() || 'Partial failure deleting user.');
      }
      closeConfirmDelete();
      fetchUsers();
    } catch (err) {
      setDeleteError(err.message || 'User deletion failed');
    } finally {
      setActionLoading(false);
    }
  }

  const isBusy = fetching || actionLoading;

  return (
    <section className="main-section admin-usersroles-section">
      <div className="admin-usersroles-header-row">
        <div>
          <h2>Users & Roles</h2>
          <div style={{ fontSize: 15, fontWeight: 400, color: '#3462db', marginTop: 4, marginLeft: 2 }}>
            {currentUser?.name && (
              <>
                Logged in as: <b>{currentUser.name}</b>
                {currentUser?.role && <> (<span>{currentUser.role}</span>)</>}
              </>
            )}
            {clinicName && <> | Clinic: <b>{clinicName}</b></>}
            {(clinicId != null) && <> | Clinic ID: <b>{clinicId}</b></>}
          </div>
        </div>
        <button className="admin-usersroles-add-btn" onClick={openAddModal} disabled={actionLoading}>
          Add User
        </button>
      </div>

      {error && <div className="admin-usersroles-error">{error}</div>}
      {success && <div className="admin-usersroles-success">{success}</div>}
      {deleteError && <div className="admin-usersroles-error">{deleteError}</div>}
      {deleteSuccess && <div className="admin-usersroles-success">{deleteSuccess}</div>}
      {editError && <div className="admin-usersroles-error">{editError}</div>}
      {editSuccess && <div className="admin-usersroles-success">{editSuccess}</div>}

      <div className="admin-usersroles-table-scroll">
        <table className="admin-usersroles-table" cellPadding={8}>
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Name</th>
              <th style={{ width: '26%' }}>Email</th>
              <th style={{ width: '16%' }}>Role</th>
              <th style={{ width: '16%' }}>Date Added</th>
              <th style={{ width: '20%' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {fetching ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center' }}>Loading...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center' }}>No users found.</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name || '-'}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <button
                      className="admin-usersroles-edit-btn"
                      onClick={() => openEditModal(user)}
                      style={{ padding: '2px 10px', fontSize: '1em', marginRight: '8px' }}
                      disabled={isBusy}
                    >
                      Edit
                    </button>
                    <button
                      className="admin-usersroles-delete-btn"
                      onClick={() => openConfirmDelete(user.id)}
                      style={{ padding: '2px 10px', fontSize: '1em', background: '#e74c3c', color: '#fff' }}
                      disabled={isBusy}
                    >
                      Delete
                    </button>
                    {confirmDeleteId === user.id && (
                      <div className="admin-usersroles-confirm-modal-bg" onClick={closeConfirmDelete}>
                        <div className="admin-usersroles-confirm-modal" onClick={(e) => e.stopPropagation()}>
                          <h4>Confirm Delete</h4>
                          <div>
                            Are you sure you want to delete user <b>{user.name || user.email}</b>?
                          </div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 6, wordBreak: 'break-all' }}>
                            Auth user_id: {user.user_id || '(missing)'}
                          </div>
                          <div className="admin-usersroles-modal-actions">
                            <button type="button" onClick={closeConfirmDelete} disabled={actionLoading}>
                              Cancel
                            </button>
                            <button
                              type="button"
                              style={{ background: '#e74c3c', color: '#fff', marginLeft: '8px' }}
                              onClick={() => handleDeleteUser(user)}
                              disabled={actionLoading}
                            >
                              {actionLoading ? 'Deleting...' : 'Confirm Delete'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {addModal && (
        <div className="admin-usersroles-modal-bg" onClick={closeAddModal}>
          <div className="admin-usersroles-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add User</h3>
            <form onSubmit={handleAddUser}>
              <label>Name:</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
              <label>Email:</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
              <label>Password:</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <label>Role:</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                required
              >
                {ROLES.map((roleOpt) => (
                  <option key={roleOpt.value} value={roleOpt.value}>
                    {roleOpt.label}
                  </option>
                ))}
              </select>
              <div className="admin-usersroles-modal-actions">
                <button type="button" onClick={closeAddModal} disabled={actionLoading}>
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading}>
                  {actionLoading ? 'Adding...' : 'Add'}
                </button>
              </div>
              <div style={{ color: '#e74c3c', minHeight: 22 }}>{error}</div>
              <div style={{ color: '#2ecc71', minHeight: 22 }}>{success}</div>
            </form>
          </div>
        </div>
      )}

      {editModal && (
        <div className="admin-usersroles-modal-bg" onClick={closeEditModal}>
          <div className="admin-usersroles-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit User</h3>
            <form onSubmit={handleEditUser}>
              <label>Name:</label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
                autoFocus
              />
              <label>Role:</label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                required
              >
                {ROLES.map((roleOpt) => (
                  <option key={roleOpt.value} value={roleOpt.value}>
                    {roleOpt.label}
                  </option>
                ))}
              </select>
              <div className="admin-usersroles-modal-actions">
                <button type="button" onClick={closeEditModal} disabled={actionLoading}>
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
              <div style={{ color: '#e74c3c', minHeight: 22 }}>{editError}</div>
              <div style={{ color: '#2ecc71', minHeight: 22 }}>{editSuccess}</div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default AdminUsersRoles;