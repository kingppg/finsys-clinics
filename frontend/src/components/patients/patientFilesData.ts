// ============================================================================
// PATIENT FILES — DATA MODEL
// ----------------------------------------------------------------------------
// Categories for everything attachable to a patient: dental radiographs,
// clinical photos, and documents. Mirrors the CHECK constraint in
// backend/db/migrations/003_patient_files.sql — keep the two in sync.
// Group tones reference --dc-* tokens (cosmetics stay in the theme).
// ============================================================================

export type FileGroupId = 'radiograph' | 'photo' | 'document';

export type FileCategoryId =
  | 'bitewing' | 'periapical' | 'panoramic' | 'cbct' | 'occlusal' | 'cephalometric'
  | 'intraoral_photo' | 'extraoral_photo' | 'smile_photo'
  | 'treatment_plan' | 'prescription' | 'lab_result' | 'referral' | 'consent' | 'other';

export interface FileGroup {
  id: FileGroupId;
  label: string;
  icon: string;
  /** CSS variable references — resolved by the active theme */
  tone: string;
  toneSoft: string;
}

export interface FileCategory {
  id: FileCategoryId;
  label: string;
  group: FileGroupId;
}

export const FILE_GROUPS: FileGroup[] = [
  { id: 'radiograph', label: 'Radiographs', icon: '🩻', tone: 'var(--dc-info, #60A5FA)',    toneSoft: 'var(--dc-info-soft, rgba(96,165,250,0.13))' },
  { id: 'photo',      label: 'Photos',      icon: '📷', tone: 'var(--dc-accent, #2DD4BF)',  toneSoft: 'var(--dc-accent-soft, rgba(45,212,191,0.13))' },
  { id: 'document',   label: 'Documents',   icon: '📄', tone: 'var(--dc-warning, #FBBF24)', toneSoft: 'var(--dc-warning-soft, rgba(251,191,36,0.13))' },
];

export const FILE_CATEGORIES: FileCategory[] = [
  { id: 'bitewing',        label: 'Bitewing X-ray',      group: 'radiograph' },
  { id: 'periapical',      label: 'Periapical X-ray',    group: 'radiograph' },
  { id: 'panoramic',       label: 'Panoramic (OPG)',     group: 'radiograph' },
  { id: 'cbct',            label: 'CBCT Scan',           group: 'radiograph' },
  { id: 'occlusal',        label: 'Occlusal X-ray',      group: 'radiograph' },
  { id: 'cephalometric',   label: 'Cephalometric X-ray', group: 'radiograph' },
  { id: 'intraoral_photo', label: 'Intraoral Photo',     group: 'photo' },
  { id: 'extraoral_photo', label: 'Extraoral Photo',     group: 'photo' },
  { id: 'smile_photo',     label: 'Smile Photo',         group: 'photo' },
  { id: 'treatment_plan',  label: 'Treatment Plan',      group: 'document' },
  { id: 'prescription',    label: 'Prescription',        group: 'document' },
  { id: 'lab_result',      label: 'Laboratory Result',   group: 'document' },
  { id: 'referral',        label: 'Referral Letter',     group: 'document' },
  { id: 'consent',         label: 'Consent Form',        group: 'document' },
  { id: 'other',           label: 'Other Document',      group: 'document' },
];

export const categoryById = (id: string): FileCategory | undefined =>
  FILE_CATEGORIES.find(c => c.id === id);

export const groupById = (id: string): FileGroup | undefined =>
  FILE_GROUPS.find(g => g.id === id);

export const groupOfCategory = (id: string): FileGroup | undefined => {
  const cat = categoryById(id);
  return cat ? groupById(cat.group) : undefined;
};

/** FDI two-digit tooth numbers, quadrant order (matches the odontogram) */
export const FDI_TEETH: number[] = [
  18, 17, 16, 15, 14, 13, 12, 11,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
];

// ── Row shape (public.patient_files) ────────────────────────────────────────

export interface PatientFileRow {
  id: string;
  clinic_id: number;
  patient_id: number;
  appointment_id: number | null;
  category: FileCategoryId;
  tooth_number: number | null;
  title: string;
  notes: string | null;
  taken_date: string | null;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

// ── Upload constraints (mirror the bucket config in migration 003) ──────────

export const STORAGE_BUCKET = 'patient-files';
export const MAX_FILE_MB = 25;

export const ACCEPTED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'application/pdf': 'pdf',
};

/** For <input accept> — also allows phone camera captures (they are image/jpeg) */
export const ACCEPT_ATTR = Object.keys(ACCEPTED_MIME).join(',');

export const isImageMime = (mime: string | null | undefined): boolean =>
  !!mime && mime.startsWith('image/');

export const isPdfMime = (mime: string | null | undefined): boolean =>
  mime === 'application/pdf';

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtension(name: string, mime: string | null): string {
  const fromName = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return fromName || (mime && ACCEPTED_MIME[mime]) || 'bin';
}

export function makeStoragePath(clinicId: number, patientId: number, ext: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as any).randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `clinic_${clinicId}/patient_${patientId}/${uuid}.${ext}`;
}
