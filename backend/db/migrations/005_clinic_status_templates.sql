-- 005_clinic_status_templates.sql
-- Run ONCE in the Supabase SQL editor.
--
-- WHAT: adds per-clinic EDITABLE status-change messages. Today the 6 status
-- notifications (Confirmed / Checked-In / Scheduled / Completed / No Show /
-- Cancelled) are hardcoded in backend/routes/statusNotifications.js. This lets a
-- clinic override any of them from Clinic Settings → Message Templates.
--
-- Shape: a JSON object keyed by status, e.g.
--   { "Confirmed": "Hi [PATIENT_NAME], you're confirmed for [DATE] at [TIME].", ... }
-- Only overridden statuses need a key; missing keys fall back to the built-in
-- (now emoji-free) defaults. Tokens: [PATIENT_NAME] [DATE] [TIME] [CLINIC] [CLINIC_PHONE].
--
-- Backward-compatible: NULL column = today's behavior (defaults for all statuses).
-- Idempotent — safe to re-run.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS status_templates jsonb;

-- Not a secret (message wording) — same SAFE-column model as reminder_template.
GRANT SELECT (status_templates) ON public.clinics TO anon, authenticated;
GRANT UPDATE (status_templates) ON public.clinics TO anon, authenticated;
