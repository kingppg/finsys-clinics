-- 004_clinic_reminder_template.sql
-- Run ONCE in the Supabase SQL editor.
--
-- WHAT: adds a per-clinic DEFAULT reminder-message template. Today the "default"
-- reminder text is hardcoded in backend/reminderScheduler.js; this lets each
-- clinic set its own house style from Clinic Settings → SMS Reminders.
--
-- Sender precedence (unchanged fallback, new middle step):
--   1. appointments.reminder_message   (per-appointment override)
--   2. clinics.reminder_template        (NEW — clinic-wide default)
--   3. hardcoded system default         (used when both are blank/null)
-- then [PATIENT_NAME] / [DATE] / [TIME] are substituted.
--
-- Backward-compatible: a NULL/blank column reproduces today's exact behavior.
-- Idempotent — safe to re-run.

-- 1) Column (not a secret — it's the message body, safe for the app to read/write).
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS reminder_template text;

-- 2) Column-level grants, matching the SAFE-column model in
--    secure-clinics-columns.sql (anon/authenticated may read + write it; the
--    three secret columns stay service-key only). GRANT is idempotent.
GRANT SELECT (reminder_template) ON public.clinics TO anon, authenticated;
GRANT UPDATE (reminder_template) ON public.clinics TO anon, authenticated;

-- VERIFY (optional): with the ANON key this should succeed (not a secret):
--   select id, name, reminder_template from clinics;   -- ok
