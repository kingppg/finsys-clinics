-- ============================================================================
-- 007_invoice_numbering.sql  (corrected)
-- Formal invoice numbers: INV-YYYY-#### (zero-padded 4 digits), per clinic,
-- reset each year. Assigned by a BEFORE INSERT trigger so BOTH manual invoices
-- and trigger-created (appointment → Completed) invoices are numbered the same
-- way — the DB owns the sequence (like it owns totals), no app-side races.
--
-- IMPORTANT: invoice numbers are unique PER CLINIC, not globally — INV-2026-0001
-- legitimately repeats across clinics. The original `invoice_number` column had a
-- GLOBAL single-column UNIQUE (from 001), which made the cross-clinic backfill
-- collide. This migration drops that global constraint and replaces it with a
-- composite unique (clinic_id, invoice_number).
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- Per clinic + year running counter (atomic increment inside the trigger).
CREATE TABLE IF NOT EXISTS public.invoice_number_counters (
  clinic_id integer NOT NULL,
  year      integer NOT NULL,
  last_seq  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, year)
);

-- Drop any GLOBAL single-column UNIQUE on invoice_number (must be per-clinic).
DO $$
DECLARE cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public' AND rel.relname = 'invoices' AND con.contype = 'u'
    AND array_length(con.conkey, 1) = 1
    AND (SELECT attname FROM pg_attribute
          WHERE attrelid = con.conrelid AND attnum = con.conkey[1]) = 'invoice_number'
  LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- Per-clinic uniqueness (nulls allowed until numbered).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_clinic_number_uq
  ON public.invoices (clinic_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_invoice_number() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  yr  integer;
  seq integer;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN
    RETURN NEW;
  END IF;

  yr := EXTRACT(YEAR FROM COALESCE(NEW.invoice_date, CURRENT_DATE))::int;

  INSERT INTO public.invoice_number_counters (clinic_id, year, last_seq)
       VALUES (NEW.clinic_id, yr, 1)
  ON CONFLICT (clinic_id, year)
  DO UPDATE SET last_seq = public.invoice_number_counters.last_seq + 1
  RETURNING last_seq INTO seq;

  NEW.invoice_number := 'INV-' || yr || '-' || LPAD(seq::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_assign_number ON public.invoices;
CREATE TRIGGER invoices_assign_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

-- ---- One-time backfill of existing (unnumbered) invoices ----
WITH numbered AS (
  SELECT
    id,
    'INV-' ||
      EXTRACT(YEAR FROM COALESCE(invoice_date, created_at, CURRENT_DATE))::int ||
      '-' ||
      LPAD(
        ROW_NUMBER() OVER (
          PARTITION BY clinic_id, EXTRACT(YEAR FROM COALESCE(invoice_date, created_at, CURRENT_DATE))
          ORDER BY id
        )::text, 4, '0'
      ) AS num
  FROM public.invoices
  WHERE invoice_number IS NULL OR invoice_number = ''
)
UPDATE public.invoices i
   SET invoice_number = n.num
  FROM numbered n
 WHERE i.id = n.id;

-- Seed the counters to the highest sequence now present per clinic + year.
INSERT INTO public.invoice_number_counters (clinic_id, year, last_seq)
SELECT
  clinic_id,
  EXTRACT(YEAR FROM COALESCE(invoice_date, created_at, CURRENT_DATE))::int AS yr,
  COUNT(*) AS last_seq
FROM public.invoices
GROUP BY clinic_id, EXTRACT(YEAR FROM COALESCE(invoice_date, created_at, CURRENT_DATE))
ON CONFLICT (clinic_id, year)
DO UPDATE SET last_seq = GREATEST(public.invoice_number_counters.last_seq, EXCLUDED.last_seq);
