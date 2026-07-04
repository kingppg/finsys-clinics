import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { DcThemeProvider } from '../../themes/DcThemeProvider';
import {
  ACCEPTED_MIME,
  ACCEPT_ATTR,
  FDI_TEETH,
  FILE_CATEGORIES,
  FILE_GROUPS,
  FileCategoryId,
  FileGroupId,
  MAX_FILE_MB,
  PatientFileRow,
  STORAGE_BUCKET,
  categoryById,
  fileExtension,
  formatBytes,
  groupOfCategory,
  isImageMime,
  isPdfMime,
  makeStoragePath,
} from './patientFilesData';
import './PatientFiles.css';

// ============================================================================
// PATIENT FILES — imaging & document storage (Dark Executive)
// Radiographs, clinical photos, and documents for one patient. Files live in
// the private "patient-files" Supabase Storage bucket and are viewed through
// short-lived signed URLs; metadata lives in public.patient_files.
// Requires migration 003_patient_files.sql.
// ============================================================================

interface PatientFilesProps {
  patientId: number;
  clinicId: number;
  patientName?: string;
  /** Pre-select this appointment on new uploads (Appointments-flow entry) */
  defaultAppointmentId?: number | null;
}

interface AppointmentOption {
  id: number;
  appointment_time: string;
  reason: string | null;
  status: string | null;
}

const SIGNED_URL_TTL = 3600; // seconds

function apptLabel(a: AppointmentOption): string {
  const d = new Date(a.appointment_time);
  const when = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return a.reason ? `${when} — ${a.reason}` : when;
}

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── Upload form state ────────────────────────────────────────────────────────

interface UploadDraft {
  files: File[];
  category: FileCategoryId | '';
  takenDate: string;
  toothNumber: string;      // '' = none
  appointmentId: string;    // '' = none
  title: string;            // used when a single file is selected
  notes: string;
}

const emptyDraft = (defaultAppointmentId?: number | null): UploadDraft => ({
  files: [],
  category: '',
  takenDate: todayISO(),
  toothNumber: '',
  appointmentId: defaultAppointmentId ? String(defaultAppointmentId) : '',
  title: '',
  notes: '',
});

function PatientFilesInner({ patientId, clinicId, patientName, defaultAppointmentId }: PatientFilesProps) {
  const [files, setFiles] = useState<PatientFileRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [appointments, setAppointments] = useState<AppointmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [groupFilter, setGroupFilter] = useState<'all' | FileGroupId>('all');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [draft, setDraft] = useState<UploadDraft>(emptyDraft(defaultAppointmentId));
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<PatientFileRow>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rowBusy, setRowBusy] = useState(false);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setBanner({ kind, text });
    setTimeout(() => setBanner(null), kind === 'ok' ? 2500 : 6000);
  };

  // ── Load rows + signed URLs ──
  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('patient_files')
      .select('*')
      .eq('patient_id', patientId)
      .eq('clinic_id', clinicId)
      .eq('deleted', false)
      .order('taken_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.error('patient_files load error:', error);
      flash('err', 'Failed to load files. Has migration 003_patient_files.sql been run?');
      setFiles([]);
      setLoading(false);
      return;
    }
    const rows = (data || []) as PatientFileRow[];
    setFiles(rows);
    if (rows.length > 0) {
      const paths = rows.map(r => r.file_path);
      const { data: signed, error: signErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL);
      if (signErr) {
        console.error('signed URL error:', signErr);
      } else {
        const map: Record<string, string> = {};
        (signed || []).forEach((s: any) => { if (s.signedUrl && !s.error) map[s.path] = s.signedUrl; });
        setUrls(map);
      }
    } else {
      setUrls({});
    }
    setLoading(false);
  }, [patientId, clinicId]);

  useEffect(() => { load(); }, [load]);

  // Appointment options for the link dropdown
  useEffect(() => {
    if (!patientId) return;
    supabase
      .from('appointments')
      .select('id, appointment_time, reason, status')
      .eq('patient_id', patientId)
      .eq('clinic_id', clinicId)
      .order('appointment_time', { ascending: false })
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) { console.error(error); return; }
        setAppointments((data || []) as AppointmentOption[]);
      });
  }, [patientId, clinicId]);

  // ── Derived ──
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: files.length, radiograph: 0, photo: 0, document: 0 };
    for (const f of files) {
      const g = groupOfCategory(f.category);
      if (g) c[g.id] += 1;
    }
    return c;
  }, [files]);

  const visible = useMemo(
    () => (groupFilter === 'all' ? files : files.filter(f => groupOfCategory(f.category)?.id === groupFilter)),
    [files, groupFilter]
  );

  const viewerFile = viewerId ? files.find(f => f.id === viewerId) || null : null;

  // ── Upload ──
  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    const rejected: string[] = [];
    const ok = incoming.filter(f => {
      if (!ACCEPTED_MIME[f.type]) { rejected.push(`${f.name} (unsupported type)`); return false; }
      if (f.size > MAX_FILE_MB * 1024 * 1024) { rejected.push(`${f.name} (over ${MAX_FILE_MB} MB)`); return false; }
      return true;
    });
    if (rejected.length) flash('err', `Skipped: ${rejected.join(', ')}`);
    setDraft(d => {
      const files = [...d.files, ...ok];
      return {
        ...d,
        files,
        title: files.length === 1 ? (d.title || files[0].name.replace(/\.[^.]+$/, '')) : d.title,
      };
    });
  };

  const removeDraftFile = (idx: number) =>
    setDraft(d => ({ ...d, files: d.files.filter((_, i) => i !== idx) }));

  const openUpload = () => {
    setDraft(emptyDraft(defaultAppointmentId));
    setUploadOpen(true);
  };

  const handleUpload = async () => {
    if (draft.files.length === 0) { flash('err', 'Choose at least one file.'); return; }
    if (!draft.category) { flash('err', 'Choose a category.'); return; }
    setUploading(true);
    let uploadedBy: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      uploadedBy = data?.user?.email || null;
    } catch { /* session unavailable — uploaded_by stays null */ }

    const failures: string[] = [];
    let done = 0;
    for (const file of draft.files) {
      done += 1;
      setUploadStep(`Uploading ${done} of ${draft.files.length}…`);
      const path = makeStoragePath(clinicId, patientId, fileExtension(file.name, file.type));
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        console.error('storage upload error:', upErr);
        failures.push(file.name);
        continue;
      }
      const title =
        draft.files.length === 1 && draft.title.trim()
          ? draft.title.trim()
          : file.name.replace(/\.[^.]+$/, '');
      const { error: insErr } = await supabase.from('patient_files').insert([{
        clinic_id: clinicId,
        patient_id: patientId,
        appointment_id: draft.appointmentId ? Number(draft.appointmentId) : null,
        category: draft.category,
        tooth_number: draft.toothNumber ? Number(draft.toothNumber) : null,
        title,
        notes: draft.notes.trim() || null,
        taken_date: draft.takenDate || null,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: uploadedBy,
      }]);
      if (insErr) {
        console.error('patient_files insert error:', insErr);
        // Don't orphan the object if the metadata row failed
        await supabase.storage.from(STORAGE_BUCKET).remove([path]);
        failures.push(file.name);
      }
    }

    setUploading(false);
    setUploadStep('');
    if (failures.length === draft.files.length) {
      flash('err', 'Upload failed. Check that migration 003 has been run in Supabase.');
      return;
    }
    setUploadOpen(false);
    setDraft(emptyDraft(defaultAppointmentId));
    if (failures.length > 0) flash('err', `Some files failed: ${failures.join(', ')}`);
    else flash('ok', draft.files.length > 1 ? `${draft.files.length} files uploaded` : 'File uploaded');
    load();
  };

  // ── Viewer actions ──
  const openViewer = (id: string) => { setViewerId(id); setEditing(false); setConfirmDelete(false); };
  const closeViewer = () => { setViewerId(null); setEditing(false); setConfirmDelete(false); };

  const startEdit = () => {
    if (!viewerFile) return;
    setEditDraft({
      title: viewerFile.title,
      category: viewerFile.category,
      tooth_number: viewerFile.tooth_number,
      taken_date: viewerFile.taken_date,
      appointment_id: viewerFile.appointment_id,
      notes: viewerFile.notes,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!viewerFile) return;
    setRowBusy(true);
    const { error } = await supabase
      .from('patient_files')
      .update({
        title: (editDraft.title || '').trim() || viewerFile.title,
        category: editDraft.category,
        tooth_number: editDraft.tooth_number || null,
        taken_date: editDraft.taken_date || null,
        appointment_id: editDraft.appointment_id || null,
        notes: (editDraft.notes || '').trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', viewerFile.id);
    setRowBusy(false);
    if (error) { console.error(error); flash('err', 'Failed to save changes.'); return; }
    setEditing(false);
    flash('ok', 'Details updated');
    load();
  };

  const softDelete = async () => {
    if (!viewerFile) return;
    setRowBusy(true);
    const { error } = await supabase
      .from('patient_files')
      .update({ deleted: true, updated_at: new Date().toISOString() })
      .eq('id', viewerFile.id);
    setRowBusy(false);
    if (error) { console.error(error); flash('err', 'Failed to delete file.'); return; }
    closeViewer();
    flash('ok', 'File deleted');
    load();
  };

  const download = async (row: PatientFileRow) => {
    const url = urls[row.file_path];
    if (!url) { flash('err', 'File link expired — reopen this tab.'); return; }
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = row.file_name || row.title;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error(err);
      flash('err', 'Download failed.');
    }
  };

  // ── Render ──
  if (loading) return <div className="dc-loading">Loading files…</div>;

  const viewerGroup = viewerFile ? groupOfCategory(viewerFile.category) : undefined;
  const viewerAppt = viewerFile?.appointment_id
    ? appointments.find(a => a.id === viewerFile.appointment_id)
    : undefined;

  return (
    <div className="pf-root">

      {/* ── Toolbar ── */}
      <div className="pf-toolbar">
        <div className="pf-filters">
          <button
            type="button"
            className={`dc-chip${groupFilter === 'all' ? ' active' : ''}`}
            onClick={() => setGroupFilter('all')}
          >
            All <span className="dc-chip-count">{counts.all}</span>
          </button>
          {FILE_GROUPS.map(g => (
            <button
              key={g.id}
              type="button"
              className={`dc-chip${groupFilter === g.id ? ' active' : ''}`}
              style={{ '--tone': g.tone, '--tone-soft': g.toneSoft } as React.CSSProperties}
              onClick={() => setGroupFilter(g.id)}
            >
              {g.icon} {g.label} <span className="dc-chip-count">{counts[g.id]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="dc-btn dc-btn--primary" onClick={openUpload}>
          + Upload
        </button>
      </div>

      {banner && (
        <div className={`dc-banner dc-banner--${banner.kind}`}>{banner.text}</div>
      )}

      {/* ── Gallery ── */}
      {visible.length === 0 ? (
        <div className="dc-empty">
          <div className="dc-empty-icon">🩻</div>
          <div className="dc-empty-title">
            {files.length === 0 ? 'No files yet' : 'Nothing in this category'}
          </div>
          <div className="dc-empty-hint">
            {files.length === 0
              ? `Upload X-rays, photos, or documents for ${patientName || 'this patient'}.`
              : 'Try another filter, or upload a new file.'}
          </div>
        </div>
      ) : (
        <div className="pf-grid">
          {visible.map(f => {
            const g = groupOfCategory(f.category);
            const url = urls[f.file_path];
            return (
              <button type="button" key={f.id} className="pf-card" onClick={() => openViewer(f.id)}>
                <div className="pf-thumb">
                  {isImageMime(f.mime_type) && url ? (
                    <img src={url} alt={f.title} loading="lazy" />
                  ) : (
                    <span className="pf-thumb-icon">{isPdfMime(f.mime_type) ? '📄' : '🗂️'}</span>
                  )}
                  {f.tooth_number && <span className="pf-tooth-badge">🦷 {f.tooth_number}</span>}
                </div>
                <div className="pf-card-body">
                  <div className="pf-card-title" title={f.title}>{f.title}</div>
                  <div className="pf-card-meta">
                    <span
                      className="dc-pill"
                      style={{ '--tone': g?.tone, '--tone-soft': g?.toneSoft } as React.CSSProperties}
                    >
                      {categoryById(f.category)?.label || f.category}
                    </span>
                    {f.taken_date && (
                      <span className="pf-card-date">{new Date(f.taken_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Upload modal ── */}
      {uploadOpen && (
        <div className="dc-overlay" onClick={() => !uploading && setUploadOpen(false)}>
          <div className="dc-modal" onClick={e => e.stopPropagation()}>
            <h3 className="dc-modal-title">Upload Files</h3>

            <div
              className={`pf-dropzone${dragOver ? ' over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            >
              <span className="pf-dropzone-icon">📤</span>
              <span>Drag files here, or</span>
              <label className="dc-btn dc-btn--ghost pf-file-label">
                Browse…
                <input
                  type="file"
                  multiple
                  accept={ACCEPT_ATTR}
                  onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                />
              </label>
              <span className="pf-dropzone-hint">JPG / PNG / WEBP / PDF · max {MAX_FILE_MB} MB each · phone photos of films work too</span>
            </div>

            {draft.files.length > 0 && (
              <ul className="pf-file-list">
                {draft.files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <span className="pf-file-name" title={f.name}>{f.name}</span>
                    <span className="pf-file-size">{formatBytes(f.size)}</span>
                    <button type="button" className="pf-file-remove" onClick={() => removeDraftFile(i)} title="Remove">×</button>
                  </li>
                ))}
              </ul>
            )}

            <div className="pf-form-grid">
              <label className="dc-field">
                <span>Category *</span>
                <select
                  value={draft.category}
                  onChange={e => setDraft(d => ({ ...d, category: e.target.value as FileCategoryId }))}
                >
                  <option value="">Select…</option>
                  {FILE_GROUPS.map(g => (
                    <optgroup key={g.id} label={g.label}>
                      {FILE_CATEGORIES.filter(c => c.group === g.id).map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="dc-field">
                <span>Date taken</span>
                <input
                  type="date"
                  value={draft.takenDate}
                  onChange={e => setDraft(d => ({ ...d, takenDate: e.target.value }))}
                />
              </label>

              <label className="dc-field">
                <span>Tooth (FDI)</span>
                <select
                  value={draft.toothNumber}
                  onChange={e => setDraft(d => ({ ...d, toothNumber: e.target.value }))}
                >
                  <option value="">Not tooth-specific</option>
                  {FDI_TEETH.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>

              <label className="dc-field">
                <span>Appointment</span>
                <select
                  value={draft.appointmentId}
                  onChange={e => setDraft(d => ({ ...d, appointmentId: e.target.value }))}
                >
                  <option value="">Not linked</option>
                  {appointments.map(a => (
                    <option key={a.id} value={a.id}>{apptLabel(a)}</option>
                  ))}
                </select>
              </label>

              {draft.files.length === 1 && (
                <label className="dc-field dc-field--wide">
                  <span>Title</span>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                    placeholder="e.g. Periapical — tooth 36, before RCT"
                  />
                </label>
              )}

              <label className="dc-field dc-field--wide">
                <span>Notes</span>
                <textarea
                  rows={2}
                  value={draft.notes}
                  onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                  placeholder="Dentist remarks…"
                />
              </label>
            </div>

            <div className="dc-modal-actions">
              <button type="button" className="dc-btn dc-btn--ghost" onClick={() => setUploadOpen(false)} disabled={uploading}>
                Cancel
              </button>
              <button type="button" className="dc-btn dc-btn--primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? uploadStep || 'Uploading…' : `Upload${draft.files.length > 1 ? ` ${draft.files.length} files` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Viewer modal ── */}
      {viewerFile && (
        <div className="dc-overlay" onClick={closeViewer}>
          <div className="dc-modal dc-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="pf-viewer-head">
              <h3 className="dc-modal-title" title={viewerFile.title}>{viewerFile.title}</h3>
              <button type="button" className="dc-modal-close" onClick={closeViewer} title="Close">×</button>
            </div>

            <div className="pf-viewer-body">
              <div className="pf-viewer-stage">
                {isImageMime(viewerFile.mime_type) && urls[viewerFile.file_path] ? (
                  <img src={urls[viewerFile.file_path]} alt={viewerFile.title} />
                ) : (
                  <div className="pf-viewer-doc">
                    <span className="pf-thumb-icon">📄</span>
                    <span>{viewerFile.file_name}</span>
                    {urls[viewerFile.file_path] && (
                      <a
                        className="dc-btn dc-btn--primary"
                        href={urls[viewerFile.file_path]}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open PDF
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="pf-viewer-side">
                {!editing ? (
                  <>
                    <dl className="pf-detail-list">
                      <div><dt>Category</dt><dd>
                        <span
                          className="dc-pill"
                          style={{ '--tone': viewerGroup?.tone, '--tone-soft': viewerGroup?.toneSoft } as React.CSSProperties}
                        >
                          {categoryById(viewerFile.category)?.label || viewerFile.category}
                        </span>
                      </dd></div>
                      {viewerFile.taken_date && (
                        <div><dt>Date taken</dt><dd>{new Date(viewerFile.taken_date).toLocaleDateString()}</dd></div>
                      )}
                      {viewerFile.tooth_number && (
                        <div><dt>Tooth</dt><dd>🦷 {viewerFile.tooth_number} (FDI)</dd></div>
                      )}
                      {viewerAppt && (
                        <div><dt>Appointment</dt><dd>{apptLabel(viewerAppt)}</dd></div>
                      )}
                      {viewerFile.notes && (
                        <div><dt>Notes</dt><dd className="pf-detail-notes">{viewerFile.notes}</dd></div>
                      )}
                      <div><dt>File</dt><dd>{viewerFile.file_name} {formatBytes(viewerFile.file_size) && `· ${formatBytes(viewerFile.file_size)}`}</dd></div>
                      <div><dt>Uploaded</dt><dd>
                        {new Date(viewerFile.created_at).toLocaleString()}
                        {viewerFile.uploaded_by && <> · {viewerFile.uploaded_by}</>}
                      </dd></div>
                    </dl>

                    <div className="pf-viewer-actions">
                      <button type="button" className="dc-btn dc-btn--primary" onClick={() => download(viewerFile)}>
                        ⬇ Download
                      </button>
                      <button type="button" className="dc-btn dc-btn--ghost" onClick={startEdit}>✏️ Edit details</button>
                      {!confirmDelete ? (
                        <button type="button" className="dc-btn dc-btn--danger" onClick={() => setConfirmDelete(true)}>
                          Delete
                        </button>
                      ) : (
                        <div className="pf-confirm-row">
                          <span>Delete this file?</span>
                          <button type="button" className="dc-btn dc-btn--danger dc-btn--danger-solid" onClick={softDelete} disabled={rowBusy}>
                            {rowBusy ? 'Deleting…' : 'Yes, delete'}
                          </button>
                          <button type="button" className="dc-btn dc-btn--ghost" onClick={() => setConfirmDelete(false)}>No</button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="pf-form-grid pf-form-grid--stack">
                    <label className="dc-field">
                      <span>Title</span>
                      <input
                        type="text"
                        value={editDraft.title || ''}
                        onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
                      />
                    </label>
                    <label className="dc-field">
                      <span>Category</span>
                      <select
                        value={editDraft.category || ''}
                        onChange={e => setEditDraft(d => ({ ...d, category: e.target.value as FileCategoryId }))}
                      >
                        {FILE_GROUPS.map(g => (
                          <optgroup key={g.id} label={g.label}>
                            {FILE_CATEGORIES.filter(c => c.group === g.id).map(c => (
                              <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label className="dc-field">
                      <span>Date taken</span>
                      <input
                        type="date"
                        value={editDraft.taken_date || ''}
                        onChange={e => setEditDraft(d => ({ ...d, taken_date: e.target.value || null }))}
                      />
                    </label>
                    <label className="dc-field">
                      <span>Tooth (FDI)</span>
                      <select
                        value={editDraft.tooth_number ? String(editDraft.tooth_number) : ''}
                        onChange={e => setEditDraft(d => ({ ...d, tooth_number: e.target.value ? Number(e.target.value) : null }))}
                      >
                        <option value="">Not tooth-specific</option>
                        {FDI_TEETH.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </label>
                    <label className="dc-field">
                      <span>Appointment</span>
                      <select
                        value={editDraft.appointment_id ? String(editDraft.appointment_id) : ''}
                        onChange={e => setEditDraft(d => ({ ...d, appointment_id: e.target.value ? Number(e.target.value) : null }))}
                      >
                        <option value="">Not linked</option>
                        {appointments.map(a => (
                          <option key={a.id} value={a.id}>{apptLabel(a)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="dc-field">
                      <span>Notes</span>
                      <textarea
                        rows={3}
                        value={editDraft.notes || ''}
                        onChange={e => setEditDraft(d => ({ ...d, notes: e.target.value }))}
                      />
                    </label>
                    <div className="pf-viewer-actions">
                      <button type="button" className="dc-btn dc-btn--primary" onClick={saveEdit} disabled={rowBusy}>
                        {rowBusy ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="dc-btn dc-btn--ghost" onClick={() => setEditing(false)} disabled={rowBusy}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PatientFiles(props: PatientFilesProps) {
  return (
    <DcThemeProvider>
      <PatientFilesInner {...props} />
    </DcThemeProvider>
  );
}
