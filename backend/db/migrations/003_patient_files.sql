-- ============================================================================
-- 003_patient_files.sql — Patient imaging & document storage (Phase 1)
-- ----------------------------------------------------------------------------
-- One flexible table for every file attached to a patient: dental radiographs
-- (bitewing, periapical, panoramic, CBCT, occlusal, cephalometric), clinical
-- photos (intraoral, extraoral, smile), and documents (treatment plans,
-- prescriptions, lab results, referrals, consent forms).
--
-- Files themselves live in the PRIVATE Supabase Storage bucket
-- "patient-files" (created below); this table holds the metadata and the
-- storage path. The frontend reads/writes via the authenticated Supabase
-- session and fetches files through short-lived signed URLs — the bucket is
-- never public.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- ============================================================================

-- ── Table ───────────────────────────────────────────────────────────────────

create table if not exists public.patient_files (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      bigint not null,
  patient_id     bigint not null references public.patients(id) on delete cascade,
  appointment_id bigint references public.appointments(id) on delete set null,

  category       text not null check (category in (
                   -- radiographs
                   'bitewing','periapical','panoramic','cbct','occlusal','cephalometric',
                   -- clinical photos
                   'intraoral_photo','extraoral_photo','smile_photo',
                   -- documents
                   'treatment_plan','prescription','lab_result','referral','consent','other'
                 )),
  -- FDI two-digit notation (11–18, 21–28, 31–38, 41–48); null = not tooth-specific
  tooth_number   int check (
                   tooth_number between 11 and 18 or
                   tooth_number between 21 and 28 or
                   tooth_number between 31 and 38 or
                   tooth_number between 41 and 48
                 ),

  title          text not null,
  notes          text,
  taken_date     date,

  file_path      text not null,   -- path inside the patient-files bucket
  file_name      text not null,   -- original filename as uploaded
  mime_type      text,
  file_size      bigint,          -- bytes

  uploaded_by    text,            -- staff email (from Supabase Auth session)
  deleted        boolean not null default false,  -- soft delete, same as patients
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_patient_files_patient  on public.patient_files (patient_id) where not deleted;
create index if not exists idx_patient_files_clinic   on public.patient_files (clinic_id);
create index if not exists idx_patient_files_appt     on public.patient_files (appointment_id);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Same convention as the users-table lockdown (secure-users-table.sql):
-- authenticated staff allowed, anon denied. Service role bypasses RLS.

alter table public.patient_files enable row level security;

drop policy if exists "patient_files authenticated all" on public.patient_files;
create policy "patient_files authenticated all"
  on public.patient_files
  for all
  to authenticated
  using (true)
  with check (true);

revoke all on public.patient_files from anon;
grant select, insert, update, delete on public.patient_files to authenticated;

-- ── Storage bucket (PRIVATE) ────────────────────────────────────────────────
-- 25 MB per-file cap; images + PDF only. Files are served exclusively through
-- signed URLs created by the authenticated frontend session.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-files', 'patient-files', false,
  26214400,  -- 25 MB
  array['image/jpeg','image/png','image/webp','image/gif','image/bmp','application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: authenticated staff may read/write ONLY this bucket; anon
-- gets nothing (no policy = denied under storage RLS).

drop policy if exists "patient-files read (authenticated)" on storage.objects;
create policy "patient-files read (authenticated)"
  on storage.objects for select to authenticated
  using (bucket_id = 'patient-files');

drop policy if exists "patient-files insert (authenticated)" on storage.objects;
create policy "patient-files insert (authenticated)"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'patient-files');

drop policy if exists "patient-files update (authenticated)" on storage.objects;
create policy "patient-files update (authenticated)"
  on storage.objects for update to authenticated
  using (bucket_id = 'patient-files');

drop policy if exists "patient-files delete (authenticated)" on storage.objects;
create policy "patient-files delete (authenticated)"
  on storage.objects for delete to authenticated
  using (bucket_id = 'patient-files');

-- ── Rollback (if ever needed) ───────────────────────────────────────────────
-- drop table public.patient_files;
-- delete from storage.objects where bucket_id = 'patient-files';
-- delete from storage.buckets where id = 'patient-files';
