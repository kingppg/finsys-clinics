-- 024_clinic_schedule.sql
-- ---------------------------------------------------------------------------
-- Phase 1 of configurable clinic scheduling: STORAGE ONLY. Purely additive —
-- adds a schedule blob to clinics + a clinic_holidays table + the Clinic Config
-- rail (frontend). NOTHING reads these yet (the bot/form/availability rewire is
-- Phase 2–3), so booking behavior is byte-for-byte unchanged by this migration.
--
-- Defaults reproduce today's hardcoded behavior exactly:
--   Mon–Sat 09:00–18:00 open, Sunday closed, one 12:00–13:00 lunch break,
--   20-minute slots. Existing clinics are backfilled with that default, so no
--   clinic sees any change until it edits its schedule.
--
-- clinics uses COLUMN-LEVEL grants (see secure-clinics-columns.sql): table-wide
-- SELECT/UPDATE were revoked, so the new `schedule` column has NO access until
-- granted below. The bot uses the service key (bypasses grants); the staff form
-- + config UI run as `authenticated`, so they get SELECT/UPDATE on `schedule`.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1) Schedule blob on clinics (day hours + breaks + slot interval).
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS schedule jsonb;

-- Default for NEW clinics.
ALTER TABLE public.clinics
  ALTER COLUMN schedule SET DEFAULT jsonb_build_object(
    'days', jsonb_build_object(
      '0', jsonb_build_object('is_closed', true,  'open', '09:00', 'close', '18:00'),
      '1', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00'),
      '2', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00'),
      '3', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00'),
      '4', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00'),
      '5', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00'),
      '6', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00')
    ),
    'breaks', jsonb_build_array(
      jsonb_build_object('start', '12:00', 'end', '13:00', 'label', 'Lunch')
    ),
    'slot_interval_minutes', 20
  );

-- Backfill existing clinics with that same default (only where unset).
UPDATE public.clinics
SET schedule = (SELECT column_default::jsonb FROM information_schema.columns
                WHERE table_schema='public' AND table_name='clinics' AND column_name='schedule')
WHERE schedule IS NULL;

-- Fallback backfill (portable) in case the default lookup above returns NULL.
UPDATE public.clinics
SET schedule = jsonb_build_object(
  'days', jsonb_build_object(
    '0', jsonb_build_object('is_closed', true,  'open', '09:00', 'close', '18:00'),
    '1', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00'),
    '2', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00'),
    '3', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00'),
    '4', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00'),
    '5', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00'),
    '6', jsonb_build_object('is_closed', false, 'open', '09:00', 'close', '18:00')
  ),
  'breaks', jsonb_build_array(jsonb_build_object('start','12:00','end','13:00','label','Lunch')),
  'slot_interval_minutes', 20
)
WHERE schedule IS NULL;

-- Column-level grants for the new column (table-wide was revoked).
GRANT SELECT (schedule) ON public.clinics TO authenticated;
GRANT UPDATE (schedule) ON public.clinics TO authenticated;

-- 2) Holidays / closures — one row per closure, per clinic.
CREATE TABLE IF NOT EXISTS public.clinic_holidays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    integer NOT NULL,
  holiday_date date NOT NULL,
  label        text,
  is_recurring boolean NOT NULL DEFAULT false, -- true = same month/day every year
  is_blocked   boolean NOT NULL DEFAULT true,  -- false = kept in list but not enforced
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_holidays_clinic ON public.clinic_holidays (clinic_id);

-- Per-clinic isolation, same pattern as migration 020 (SECURITY DEFINER helpers).
ALTER TABLE public.clinic_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_isolation ON public.clinic_holidays;
CREATE POLICY clinic_isolation ON public.clinic_holidays
  FOR ALL TO authenticated
  USING (public.current_staff_is_superadmin() OR clinic_id = public.current_staff_clinic_id())
  WITH CHECK (public.current_staff_is_superadmin() OR clinic_id = public.current_staff_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_holidays TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK:
-- ---------------------------------------------------------------------------
-- DROP TABLE IF EXISTS public.clinic_holidays;
-- REVOKE SELECT (schedule), UPDATE (schedule) ON public.clinics FROM authenticated;
-- ALTER TABLE public.clinics DROP COLUMN IF EXISTS schedule;
