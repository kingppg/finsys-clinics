-- ============================================================================
-- 016_or_number_atomic.sql  (H7 — race-safe BIR OR numbers)
-- Run ONCE in the Supabase SQL editor. Run AFTER 015.
--
-- WHY: generate_or_number() minted Official Receipt numbers with COUNT(*)+1 —
-- the SAME race the invoice numbering had before 007 fixed it. Two concurrent
-- payments COUNT the same value and get the SAME OR number (a BIR compliance
-- problem). It also numbered 'Reversal' rows (money OUT), which should not draw
-- an OR at all.
--
-- FIX (mirrors 007 exactly):
--   • a per-clinic + year ATOMIC counter table (increment inside the trigger,
--     no races),
--   • generate_or_number() draws from it,
--   • assign_or_number_on_payment() SKIPS reversals,
--   • a UNIQUE (clinic_id, or_number) index makes any future collision a hard
--     error instead of a silent duplicate.
--
-- Existing rows are NOT touched (the 7 historical reversals keep the OR numbers
-- they were already given — harmless; the counter is seeded past them so no new
-- receipt can collide). Idempotent — safe to re-run.
-- ============================================================================

-- ---- 0) Safety: refuse to proceed if duplicate OR numbers already exist -----
-- (The UNIQUE index below would fail anyway; this reports exactly which ones so
--  you can fix them first, instead of a cryptic index error.)
DO $$
DECLARE
  v_dupes text;
BEGIN
  SELECT string_agg(clinic_id || ':' || or_number || ' (x' || cnt || ')', ', ')
    INTO v_dupes
  FROM (
    SELECT clinic_id, or_number, COUNT(*) AS cnt
    FROM public.payments
    WHERE or_number IS NOT NULL
    GROUP BY clinic_id, or_number
    HAVING COUNT(*) > 1
  ) d;
  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate OR numbers exist — resolve before adding the unique index: %', v_dupes;
  END IF;
END $$;

-- ---- 1) Per clinic + year atomic counter -----------------------------------
CREATE TABLE IF NOT EXISTS public.or_number_counters (
  clinic_id integer NOT NULL,
  year      integer NOT NULL,
  last_seq  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, year)
);

-- ---- 2) Seed the counter to the highest EXISTING well-formed OR sequence ----
-- (per clinic + year). Only 'OR-YYYY-#####' rows count; custom/manual OR strings
-- are ignored. GREATEST keeps the counter monotonic if re-run.
INSERT INTO public.or_number_counters (clinic_id, year, last_seq)
SELECT
  clinic_id,
  split_part(or_number, '-', 2)::int              AS yr,
  MAX(split_part(or_number, '-', 3)::int)          AS last_seq
FROM public.payments
WHERE or_number ~ '^OR-[0-9]{4}-[0-9]+$'
GROUP BY clinic_id, split_part(or_number, '-', 2)::int
ON CONFLICT (clinic_id, year)
DO UPDATE SET last_seq = GREATEST(public.or_number_counters.last_seq, EXCLUDED.last_seq);

-- ---- 3) Atomic generator ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_or_number(p_clinic_id integer)
RETURNS character varying
LANGUAGE plpgsql
AS $function$
DECLARE
  yr  integer := EXTRACT(YEAR FROM NOW())::int;
  seq integer;
BEGIN
  INSERT INTO public.or_number_counters (clinic_id, year, last_seq)
       VALUES (p_clinic_id, yr, 1)
  ON CONFLICT (clinic_id, year)
  DO UPDATE SET last_seq = public.or_number_counters.last_seq + 1
  RETURNING last_seq INTO seq;

  RETURN 'OR-' || yr || '-' || LPAD(seq::text, 5, '0');
END;
$function$;

-- ---- 4) Assign on insert, but SKIP reversals / negative (money-out) rows ----
CREATE OR REPLACE FUNCTION public.assign_or_number_on_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- A reversal/refund is money OUT — it is not an Official Receipt, so no OR #.
  IF NEW.method = 'Reversal' OR NEW.amount < 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.or_number IS NULL THEN
    NEW.or_number := public.generate_or_number(NEW.clinic_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- ---- 5) Enforce uniqueness (nulls allowed — reversals & unnumbered) ---------
CREATE UNIQUE INDEX IF NOT EXISTS payments_clinic_or_uq
  ON public.payments (clinic_id, or_number)
  WHERE or_number IS NOT NULL;

-- ---- ROLLBACK (if needed) ----
--   DROP INDEX IF EXISTS public.payments_clinic_or_uq;
--   -- and restore the previous generate_or_number / assign_or_number_on_payment
--   -- bodies from billing-schema-baseline.sql if you truly need the old behavior.
