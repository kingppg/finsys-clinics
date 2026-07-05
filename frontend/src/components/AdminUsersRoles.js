import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { LuUserPlus, LuSquarePen, LuTrash2 } from 'react-icons/lu';
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
  const deleteTarget = confirmDeleteId != null
    ? users.find((u) => u.id === confirmDeleteId)
    : null;

  const roleTone = (role) => {
    switch (role) {
      case 'admin': return { '--tone': 'var(--dc-accent)', '--tone-soft': 'var(--dc-accent-soft)' };
      case 'dentist': return { '--tone': 'var(--dc-info)', '--tone-soft': 'var(--dc-info-soft)' };
      default: return { '--tone': 'var(--dc-text-2)', '--tone-soft': 'var(--dc-surface-2)' };
    }
  };

  return (
    <section className="aur">
      <div className="aur-head">
        <div className="aur-head-text">
          <div className="cc-panel-eyebrow">Access Control</div>
          <h2 className="cc-panel-title">Users &amp; Roles</h2>
          <div className="aur-meta">
            {currentUser?.name && (
              <>Signed in as <b>{currentUser.name}</b>{currentUser?.role && <> · <span>{currentUser.role}</span></>}</>
            )}
            {clinicName && <> · Clinic <b>{clinicName}</b></>}
            {(clinicId != null) && <> · ID <b>{clinicId}</b></>}
          </div>
        </div>
        <button className="dc-btn dc-btn--primary" onClick={openAddModal} disabled={actionLoading}>
          <LuUserPlus /> Add User
        </button>
      </div>

      {error && <div className="dc-banner dc-banner--err">{error}</div>}
      {success && <div className="dc-banner dc-banner--ok">{success}</div>}
      {deleteError && <div className="dc-banner dc-banner--err">{deleteError}</div>}
      {deleteSuccess && <div className="dc-banner dc-banner--ok">{deleteSuccess}</div>}
      {editError && <div className="dc-banner dc-banner--err">{editError}</div>}
      {editSuccess && <div className="dc-banner dc-banner--ok">{editSuccess}</div>}

      <div className="dc-table-wrap">
        <table className="dc-table aur-table">
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Date Added</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {fetching ? (
              <tr><td colSpan={5} className="aur-empty">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="aur-empty">No users found.</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td title={user.name}>{user.name || '—'}</td>
                  <td title={user.email}>{user.email}</td>
                  <td>
                    <span className="dc-pill" style={roleTone(user.role)}>{user.role}</span>
                  </td>
                  <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <div className="dc-table-actions">
                      <button
                        className="dc-icon-btn dc-icon-btn--accent"
                        title="Edit" aria-label="Edit user"
                        onClick={() => openEditModal(user)}
                        disabled={isBusy}
                      >
                        <LuSquarePen />
                      </button>
                      <button
                        className="dc-icon-btn dc-icon-btn--danger"
                        title="Delete" aria-label="Delete user"
                        onClick={() => openConfirmDelete(user.id)}
                        disabled={isBusy}
                      >
                        <LuTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Add ── */}
      {addModal && (
        <div className="dc-overlay" onClick={closeAddModal}>
          <div className="dc-modal dc-modal--sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="dc-modal-title">Add User</h3>
            <form onSubmit={handleAddUser}>
              <div className="aur-form">
                <label className="dc-field"><span>Name</span>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
                </label>
                <label className="dc-field"><span>Email</span>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </label>
                <label className="dc-field"><span>Password</span>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                </label>
                <label className="dc-field"><span>Role</span>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required>
                    {ROLES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                  </select>
                </label>
              </div>
              {error && <div className="dc-banner dc-banner--err">{error}</div>}
              {success && <div className="dc-banner dc-banner--ok">{success}</div>}
              <div className="dc-modal-actions">
                <button type="button" className="dc-btn dc-btn--ghost" onClick={closeAddModal} disabled={actionLoading}>Cancel</button>
                <button type="submit" className="dc-btn dc-btn--primary" disabled={actionLoading}>
                  {actionLoading ? 'Adding…' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit ── */}
      {editModal && (
        <div className="dc-overlay" onClick={closeEditModal}>
          <div className="dc-modal dc-modal--sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="dc-modal-title">Edit User</h3>
            <form onSubmit={handleEditUser}>
              <div className="aur-form">
                <label className="dc-field"><span>Name</span>
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required autoFocus />
                </label>
                <label className="dc-field"><span>Role</span>
                  <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} required>
                    {ROLES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                  </select>
                </label>
              </div>
              {editError && <div className="dc-banner dc-banner--err">{editError}</div>}
              {editSuccess && <div className="dc-banner dc-banner--ok">{editSuccess}</div>}
              <div className="dc-modal-actions">
                <button type="button" className="dc-btn dc-btn--ghost" onClick={closeEditModal} disabled={actionLoading}>Cancel</button>
                <button type="submit" className="dc-btn dc-btn--primary" disabled={actionLoading}>
                  {actionLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete ── */}
      {deleteTarget && (
        <div className="dc-overlay" onClick={closeConfirmDelete}>
          <div className="dc-modal dc-modal--sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="dc-modal-title">Delete user?</h3>
            <p>
              Permanently delete <b>{deleteTarget.name || deleteTarget.email}</b>? This removes them
              from Auth and the staff table and can’t be undone.
            </p>
            <div className="aur-authid">Auth user_id: {deleteTarget.user_id || '(missing)'}</div>
            <div className="dc-modal-actions">
              <button type="button" className="dc-btn dc-btn--ghost" onClick={closeConfirmDelete} disabled={actionLoading}>Cancel</button>
              <button type="button" className="dc-btn dc-btn--danger-solid" onClick={() => handleDeleteUser(deleteTarget)} disabled={actionLoading}>
                {actionLoading ? 'Deleting…' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default AdminUsersRoles;
