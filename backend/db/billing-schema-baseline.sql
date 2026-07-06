-- ============================================================================
-- billing-schema-baseline.sql
-- AUTHORITATIVE SNAPSHOT of the live billing triggers + functions.
-- Captured from production 2026-07-06 via capture-billing-schema.sql (H3).
--
-- PURPOSE: several of these existed ONLY in the live database and were never in
-- the repo — you could not rebuild, stage, or review them from source. This
-- file is the single source of truth for the current billing DB logic.
--
-- ⚠️ THIS IS A REFERENCE / REBUILD SNAPSHOT — do NOT run it against the existing
-- production database (the objects already exist). Run it only when standing up
-- a FRESH database (staging), AFTER the base tables exist.
--
-- When a function is edited, update its body HERE too, so this snapshot never
-- drifts from production again.
--
-- NOT-YET-CAPTURED dependency: generate_or_number(clinic_id) — called by
-- assign_or_number_on_payment(); grab it in the same way and paste it below.
-- ============================================================================


-- ===========================================================================
-- TRIGGERS  (table -> trigger -> function)
-- ===========================================================================
-- appointments:
--   trg_create_invoice_on_completed   AFTER UPDATE           -> create_invoice_on_appointment_completed()
-- invoice_items:
--   invoice_items_block_finalized     BEFORE INS/UPD/DEL     -> prevent_finalized_item_change()
--   invoice_items_set_subtotal        AFTER  INS/UPD/DEL     -> set_invoice_subtotal()
--   trg_update_invoice_total          AFTER  INS/UPD/DEL     -> update_invoice_total_from_items()
-- invoices:
--   invoices_assign_number            BEFORE INSERT          -> assign_invoice_number()
--   trg_update_total_on_discount      BEFORE UPDATE OF discount -> update_invoice_total_on_discount()
-- payments:
--   trg_assign_or_number              BEFORE INSERT          -> assign_or_number_on_payment()
--   payments_autolock                 AFTER  INSERT          -> autolock_on_full_payment()
--   payments_append_only_guard        BEFORE UPD/DEL         -> payments_append_only()          [015]
--   trigger_update_invoice_status     AFTER  INS/UPD/DEL     -> update_invoice_status_on_payment()


-- ===========================================================================
-- FUNCTIONS
-- ===========================================================================

-- ---- appointment -> invoice (auto-create on Completed) --------------------
-- ** WAS NOT IN REPO ** — captured 2026-07-06.
-- Dedup guard keys off appointment_id ONLY, so a MANUAL invoice that does not
-- stamp appointment_id will NOT be seen here -> a 2nd invoice is created when
-- the appointment is later Completed (audit finding H2).
CREATE OR REPLACE FUNCTION public.create_invoice_on_appointment_completed()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_invoice_id INTEGER;
BEGIN
  -- Fire only when status transitions INTO 'Completed'
  IF NEW.status = 'Completed' AND (OLD.status IS DISTINCT FROM 'Completed') THEN
    -- Avoid duplicate
    IF NOT EXISTS (
      SELECT 1 FROM invoices
      WHERE appointment_id = NEW.id
        AND clinic_id = NEW.clinic_id
    ) THEN
      INSERT INTO invoices (
        patient_id, clinic_id, appointment_id, dentist_id, total, status, invoice_date
      ) VALUES (
        NEW.patient_id, NEW.clinic_id, NEW.id, NEW.dentist_id,
        COALESCE(NEW.procedure_price, 0), 'Unpaid', CURRENT_DATE
      )
      RETURNING id INTO v_invoice_id;

      IF NEW.procedure_price IS NOT NULL AND NEW.procedure_price > 0 THEN
        INSERT INTO invoice_items (
          invoice_id, clinic_id, procedure_id, description, quantity, unit_price
        ) VALUES (
          v_invoice_id, NEW.clinic_id, NEW.procedure_id,
          COALESCE(NEW.reason, 'Dental Service'), 1, COALESCE(NEW.procedure_price, 0)
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---- invoice status state machine (Unpaid / Partial / Paid) ---------------
-- ** WAS NOT IN REPO ** — captured 2026-07-06. Net-aware (SUM includes
-- negative reversals). Fires AFTER INSERT/UPDATE/DELETE on payments.
CREATE OR REPLACE FUNCTION public.update_invoice_status_on_payment()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_invoice_total NUMERIC;
  v_total_paid    NUMERIC;
  v_new_status    TEXT;
BEGIN
  SELECT total INTO v_invoice_total FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid FROM payments WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  IF v_total_paid >= v_invoice_total THEN
    v_new_status := 'Paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'Partial';
  ELSE
    v_new_status := 'Unpaid';
  END IF;

  UPDATE invoices SET status = v_new_status WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  RETURN NEW;
END;
$function$;

-- ---- OR number auto-assignment on payment ---------------------------------
-- ** WAS NOT IN REPO ** — captured 2026-07-06. Keeps a staff-entered OR #;
-- otherwise generates one. NOTE: also assigns to 'Reversal' rows (money OUT) —
-- a future BIR tidy could skip auto-OR for reversals.
-- Dependency generate_or_number(clinic_id) still to be captured.
CREATE OR REPLACE FUNCTION public.assign_or_number_on_payment()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.or_number IS NULL THEN
    NEW.or_number := generate_or_number(NEW.clinic_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- ---- invoice numbering (INV-YYYY-####) ------------------------------------
-- (in repo: 007_invoice_numbering.sql — snapshot matches)
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE yr integer; seq integer;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN RETURN NEW; END IF;
  yr := EXTRACT(YEAR FROM COALESCE(NEW.invoice_date, CURRENT_DATE))::int;
  INSERT INTO public.invoice_number_counters (clinic_id, year, last_seq)
       VALUES (NEW.clinic_id, yr, 1)
  ON CONFLICT (clinic_id, year)
  DO UPDATE SET last_seq = public.invoice_number_counters.last_seq + 1
  RETURNING last_seq INTO seq;
  NEW.invoice_number := 'INV-' || yr || '-' || LPAD(seq::text, 4, '0');
  RETURN NEW;
END;
$function$;

-- ---- gross subtotal maintenance -------------------------------------------
-- (in repo: 006_invoice_subtotal.sql — snapshot matches)
CREATE OR REPLACE FUNCTION public.set_invoice_subtotal()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE inv_id integer;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF inv_id IS NOT NULL THEN
    UPDATE public.invoices
       SET subtotal = COALESCE((SELECT SUM(ii.total) FROM public.invoice_items ii WHERE ii.invoice_id = inv_id), 0)
     WHERE id = inv_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ---- totals from line items (AFTER on invoice_items) ----------------------
-- (in repo: latest def in 011_invoice_finalize.sql — snapshot matches)
-- NOTE (audit H4): for non-senior/pwd it uses the STORED peso discount as-is,
-- so a 'percent' discount does NOT rescale when line items change.
CREATE OR REPLACE FUNCTION public.update_invoice_total_from_items()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_inv_id integer; v_subtotal numeric; v_eligible numeric; v_noneligible numeric;
  v_discount numeric; v_disctype text; v_clinic integer;
  v_vat_reg boolean; v_vat_rate numeric; v_vatbase numeric; v_vat numeric; v_fin timestamptz;
BEGIN
  v_inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT finalized_at INTO v_fin FROM invoices WHERE id = v_inv_id;
  IF v_fin IS NOT NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(total),0), COALESCE(SUM(total) FILTER (WHERE COALESCE(sc_pwd_eligible,true)),0)
    INTO v_subtotal, v_eligible FROM invoice_items WHERE invoice_id = v_inv_id;
  v_noneligible := v_subtotal - v_eligible;
  SELECT COALESCE(discount,0), discount_type, clinic_id INTO v_discount, v_disctype, v_clinic FROM invoices WHERE id = v_inv_id;
  SELECT COALESCE(vat_registered,false), COALESCE(vat_rate,12) INTO v_vat_reg, v_vat_rate FROM clinics WHERE id = v_clinic;
  IF v_disctype IN ('senior','pwd') THEN
    v_discount := ROUND(v_eligible * 0.20, 2); v_vatbase := v_noneligible;
  ELSE v_vatbase := GREATEST(v_subtotal - v_discount, 0); END IF;
  IF v_vat_reg AND v_vatbase > 0 THEN v_vat := ROUND(v_vatbase * v_vat_rate / 100.0, 2); ELSE v_vat := 0; END IF;
  UPDATE invoices SET discount = v_discount, total = GREATEST(v_subtotal - v_discount,0) + v_vat, tax_amount = v_vat WHERE id = v_inv_id;
  RETURN NEW;
END;
$function$;

-- ---- totals on discount / finalize / reopen (BEFORE UPDATE OF discount) ----
-- (in repo: latest def in 013_payment_reversal.sql — snapshot matches)
CREATE OR REPLACE FUNCTION public.update_invoice_total_on_discount()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_subtotal numeric; v_eligible numeric; v_noneligible numeric;
  v_vat_reg boolean; v_vat_rate numeric; v_vatbase numeric; v_vat numeric;
BEGIN
  IF OLD.finalized_at IS NOT NULL THEN
    IF NEW.finalized_at IS NULL THEN
      IF (SELECT COALESCE(SUM(amount),0) FROM public.payments WHERE invoice_id = NEW.id) > 0.005 THEN
        RAISE EXCEPTION 'Invoice % has net payments and cannot be reopened until fully reversed', OLD.id;
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.discount IS DISTINCT FROM OLD.discount OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.total IS DISTINCT FROM OLD.total THEN
      RAISE EXCEPTION 'Invoice % is finalized — its amounts cannot be changed', OLD.id;
    END IF;
    RETURN NEW;
  END IF;
  SELECT COALESCE(SUM(total),0), COALESCE(SUM(total) FILTER (WHERE COALESCE(sc_pwd_eligible,true)),0)
    INTO v_subtotal, v_eligible FROM invoice_items WHERE invoice_id = NEW.id;
  v_noneligible := v_subtotal - v_eligible;
  SELECT COALESCE(vat_registered,false), COALESCE(vat_rate,12) INTO v_vat_reg, v_vat_rate FROM clinics WHERE id = NEW.clinic_id;
  IF NEW.discount_type IN ('senior','pwd') THEN
    NEW.discount := ROUND(v_eligible * 0.20, 2); v_vatbase := v_noneligible;
  ELSE v_vatbase := GREATEST(v_subtotal - COALESCE(NEW.discount,0), 0); END IF;
  IF v_vat_reg AND v_vatbase > 0 THEN v_vat := ROUND(v_vatbase * v_vat_rate / 100.0, 2); ELSE v_vat := 0; END IF;
  NEW.total := GREATEST(v_subtotal - COALESCE(NEW.discount,0),0) + v_vat;
  NEW.tax_amount := v_vat;
  RETURN NEW;
END;
$function$;

-- ---- finalized-invoice immutability ---------------------------------------
-- (in repo: 011_invoice_finalize.sql — snapshot matches)
CREATE OR REPLACE FUNCTION public.prevent_finalized_item_change()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_fin timestamptz;
BEGIN
  SELECT finalized_at INTO v_fin FROM public.invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_fin IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice is finalized — line items can no longer be changed';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ---- auto-lock on full payment --------------------------------------------
-- (in repo: 011_invoice_finalize.sql — snapshot matches)
CREATE OR REPLACE FUNCTION public.autolock_on_full_payment()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_paid numeric; v_total numeric; v_fin timestamptz;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.payments WHERE invoice_id = NEW.invoice_id;
  SELECT total, finalized_at INTO v_total, v_fin FROM public.invoices WHERE id = NEW.invoice_id;
  IF v_fin IS NULL AND v_total > 0 AND v_paid >= v_total THEN
    UPDATE public.invoices SET finalized_at = now() WHERE id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---- payments append-only guard -------------------------------------------
-- (in repo: 015_payments_immutable.sql)
CREATE OR REPLACE FUNCTION public.payments_append_only()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payments are append-only — reverse the payment instead of deleting it (payment #%)', OLD.id;
  END IF;
  IF NEW.amount            IS DISTINCT FROM OLD.amount
  OR NEW.invoice_id        IS DISTINCT FROM OLD.invoice_id
  OR NEW.clinic_id         IS DISTINCT FROM OLD.clinic_id
  OR NEW.patient_id        IS DISTINCT FROM OLD.patient_id
  OR NEW.method            IS DISTINCT FROM OLD.method
  OR NEW.payment_date      IS DISTINCT FROM OLD.payment_date
  OR NEW.or_number         IS DISTINCT FROM OLD.or_number
  OR NEW.reference_number  IS DISTINCT FROM OLD.reference_number
  OR NEW.created_at        IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Payment #% is immutable — amount/method/dates/receipt fields cannot be changed (reverse it instead)', OLD.id;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---- atomic reversal RPC --------------------------------------------------
-- (in repo: 015_payments_immutable.sql)
CREATE OR REPLACE FUNCTION public.reverse_payment(
  p_payment_id bigint, p_clinic_id integer, p_amount numeric, p_note text DEFAULT NULL::text
) RETURNS public.payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_orig public.payments%ROWTYPE; v_net numeric; v_max numeric; v_is_full boolean; v_new public.payments%ROWTYPE;
BEGIN
  SELECT * INTO v_orig FROM public.payments WHERE id = p_payment_id AND clinic_id = p_clinic_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment % not found for clinic %', p_payment_id, p_clinic_id; END IF;
  IF v_orig.amount <= 0 THEN RAISE EXCEPTION 'Only a positive payment can be reversed (payment #%)', p_payment_id; END IF;
  IF v_orig.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Payment #% is already reversed', p_payment_id; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_net FROM public.payments WHERE invoice_id = v_orig.invoice_id;
  v_max := LEAST(v_orig.amount, v_net);
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > v_max + 0.005 THEN
    RAISE EXCEPTION 'Refund amount % is invalid — must be between 0 and % (net collected)', p_amount, v_max;
  END IF;
  v_is_full := p_amount >= v_orig.amount - 0.005;
  INSERT INTO public.payments (patient_id, invoice_id, clinic_id, amount, method, payment_date, notes)
  VALUES (
    COALESCE(v_orig.patient_id, (SELECT patient_id FROM public.invoices WHERE id = v_orig.invoice_id)),
    v_orig.invoice_id, p_clinic_id, -p_amount, 'Reversal', now(),
    COALESCE(p_note, 'Reversal of payment #' || v_orig.id)
  ) RETURNING * INTO v_new;
  IF v_is_full THEN UPDATE public.payments SET reversed_at = now() WHERE id = v_orig.id; END IF;
  RETURN v_new;
END;
$function$;

-- ---- OR number generator --------------------------------------------------
-- ** WAS NOT IN REPO ** — captured 2026-07-06.
-- ⚠️ RACE CONDITION: uses the COUNT(*)+1 pattern — the SAME flaw the invoice
-- numbering had before 007 replaced it with an atomic counter. Two concurrent
-- payment inserts can COUNT the same value and mint the SAME OR number. OR #s
-- are BIR Official Receipts, so duplicates are a compliance problem. Also counts
-- 'Reversal' rows (which shouldn't hold an OR at all). FIX CANDIDATE: mirror 007
-- — a per-clinic+year atomic counter table + a UNIQUE (clinic_id, or_number)
-- index, and skip auto-OR for reversals.
CREATE OR REPLACE FUNCTION public.generate_or_number(p_clinic_id integer)
RETURNS character varying LANGUAGE plpgsql AS $function$
DECLARE
  v_year TEXT;
  v_count INTEGER;
  v_or_number VARCHAR;
BEGIN
  v_year := TO_CHAR(NOW(), 'YYYY');
  SELECT COUNT(*) INTO v_count
  FROM payments
  WHERE clinic_id = p_clinic_id
    AND or_number LIKE 'OR-' || v_year || '-%';
  v_or_number := 'OR-' || v_year || '-' || LPAD((v_count + 1)::TEXT, 5, '0');
  RETURN v_or_number;
END;
$function$;
