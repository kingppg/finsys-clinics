-- 022_normalize_patient_phones.sql
-- ---------------------------------------------------------------------------
-- Purpose: bring EXISTING patients.phone values into the same canonical
-- 09XXXXXXXXX shape the booking bot now enforces, so stored data is consistent
-- for SMS, for the bot's phone+name dedup matching, and for staff display.
--
-- Scope & safety:
--   * Only rows that ARE a PH mobile in another format (639…, +63…, 9…, or with
--     spaces/dashes) are rewritten. Landlines, NULLs, and anything we can't
--     confidently recognize are LEFT UNTOUCHED — never guessed at.
--   * Originals are snapshotted to patients_phone_backup_022 first.
--   * Idempotent: re-running changes nothing once numbers are canonical.
--
-- NOTE: SMS sends are already tolerant of legacy formats at send time
-- (helpers/phone.js formatForProvider), so this migration is about data
-- CLEANLINESS, not reachability. The audit query at the bottom lists the rows
-- SMS still can't reach (null/invalid) for manual follow-up.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1) Snapshot every non-null phone before mutating (rollback source).
--    patients.id is an integer in this DB (verified 2026-07-07).
CREATE TABLE IF NOT EXISTS public.patients_phone_backup_022 (
  id         bigint,
  old_phone  text,
  backed_up_at timestamptz DEFAULT now()
);

INSERT INTO public.patients_phone_backup_022 (id, old_phone)
SELECT id, phone
FROM public.patients
WHERE phone IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.patients_phone_backup_022 b WHERE b.id = public.patients.id
  );

-- 2) Canonicalize recognizable PH mobiles to 09XXXXXXXXX.
--    d = digits only; strip a 63 or leading 0; require 9 + 9 digits; re-add 0.
WITH norm AS (
  SELECT
    id,
    phone AS old_phone,
    CASE
      WHEN regexp_replace(phone, '\D', '', 'g') ~ '^639[0-9]{9}$'
        THEN '0' || substring(regexp_replace(phone, '\D', '', 'g') FROM 3)
      WHEN regexp_replace(phone, '\D', '', 'g') ~ '^0?9[0-9]{9}$'
        THEN '0' || right(regexp_replace(phone, '\D', '', 'g'), 10)
      ELSE NULL
    END AS new_phone
  FROM public.patients
  WHERE phone IS NOT NULL
)
UPDATE public.patients p
SET phone = n.new_phone
FROM norm n
WHERE p.id = n.id
  AND n.new_phone IS NOT NULL
  AND n.new_phone <> p.phone;

COMMIT;

-- ---------------------------------------------------------------------------
-- AUDIT (run separately; read-only): patients SMS still cannot reach. Staff
-- should collect a valid mobile for these on the patient's next visit/contact.
-- ---------------------------------------------------------------------------
-- SELECT id, name, phone, clinic_id
-- FROM public.patients
-- WHERE deleted IS NOT TRUE
--   AND ( phone IS NULL
--         OR regexp_replace(phone, '\D', '', 'g') !~ '^(63)?0?9[0-9]{9}$' )
-- ORDER BY clinic_id, name;

-- ---------------------------------------------------------------------------
-- ROLLBACK (restore originals captured above):
-- ---------------------------------------------------------------------------
-- UPDATE public.patients p
-- SET phone = b.old_phone
-- FROM public.patients_phone_backup_022 b
-- WHERE p.id = b.id;
-- DROP TABLE public.patients_phone_backup_022;
