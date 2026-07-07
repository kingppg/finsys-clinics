-- 023_prevent_double_booking.sql
-- ---------------------------------------------------------------------------
-- Enforce one ACTIVE appointment per dentist per exact time at the DB level.
-- The booking bot and the staff form both check availability in application
-- code only, and there was NO database guard — so two concurrent bookings
-- (staff+staff, or staff+bot) could land on the same dentist+slot. This partial
-- unique index makes the second write fail with 23505, which the frontend now
-- catches and surfaces as "that slot was just taken" (AppointmentForm) instead
-- of silently double-booking.
--
-- Excludes Cancelled and soft-deleted rows so a freed slot can be rebooked.
-- NULL status is treated as active (protected) — new staff inserts omit status
-- and rely on the column default.
--
-- ⚠️ PREFLIGHT: if the CREATE errors with "could not create unique index …
-- contains duplicated values", existing data already has a double-book. Run the
-- detection query at the bottom, resolve those rows (cancel/soft-delete the
-- extras), then re-run this migration.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_dentist_slot
  ON public.appointments (dentist_id, appointment_time)
  WHERE deleted = false AND (status IS NULL OR status <> 'Cancelled');

COMMIT;

-- ---------------------------------------------------------------------------
-- PREFLIGHT / detection (run separately if the CREATE fails):
-- ---------------------------------------------------------------------------
-- SELECT dentist_id, appointment_time, count(*) AS n,
--        array_agg(id ORDER BY id) AS appointment_ids
-- FROM public.appointments
-- WHERE deleted = false AND (status IS NULL OR status <> 'Cancelled')
-- GROUP BY dentist_id, appointment_time
-- HAVING count(*) > 1
-- ORDER BY n DESC;

-- ---------------------------------------------------------------------------
-- ROLLBACK:
-- ---------------------------------------------------------------------------
-- DROP INDEX IF EXISTS public.uniq_active_dentist_slot;
