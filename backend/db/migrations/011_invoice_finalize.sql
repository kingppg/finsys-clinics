-- ============================================================================
-- 011_invoice_finalize.sql  (Phase 3 — immutable finalized invoices)
-- A finalized invoice is a committed legal document: its line items and amounts
-- can no longer change. Invoices auto-finalize when fully paid; staff can also
-- finalize manually (e.g. an issued-but-unpaid bill). Senior/PWD ID is captured
-- for the BIR audit trail.
--
--   invoices.finalized_at  NULL = draft (editable); set = locked
--   invoices.sc_pwd_id     OSCA / PWD ID number used for the discount
--
-- Enforcement is DB-level (not just UI): line-item writes and amount changes on
-- a finalized invoice raise an exception. Non-financial updates (status from a
-- payment, finalized_at, sc_pwd_id, notes) are still allowed.
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sc_pwd_id    text;

-- 1) Block ALL line-item changes once the parent invoice is finalized.
CREATE OR REPLACE FUNCTION public.prevent_finalized_item_change() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE v_fin timestamptz;
BEGIN
  SELECT finalized_at INTO v_fin FROM public.invoices
   WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_fin IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice is finalized — line items can no longer be changed';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS invoice_items_block_finalized ON public.invoice_items;
CREATE TRIGGER invoice_items_block_finalized
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_item_change();

-- 2) Freeze amounts on a finalized invoice — guard the discount recompute
--    trigger (from migration 010). Reject financial edits; allow status/notes/
--    finalized_at/sc_pwd_id updates (skip the recompute so totals stay frozen).
CREATE OR REPLACE FUNCTION public.update_invoice_total_on_discount() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
  v_subtotal numeric; v_eligible numeric; v_noneligible numeric;
  v_vat_reg boolean; v_vat_rate numeric; v_vatbase numeric; v_vat numeric;
BEGIN
  IF OLD.finalized_at IS NOT NULL THEN
    IF NEW.discount      IS DISTINCT FROM OLD.discount
    OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
    OR NEW.subtotal      IS DISTINCT FROM OLD.subtotal
    OR NEW.tax_amount    IS DISTINCT FROM OLD.tax_amount
    OR NEW.total         IS DISTINCT FROM OLD.total THEN
      RAISE EXCEPTION 'Invoice % is finalized — its amounts cannot be changed', OLD.id;
    END IF;
    RETURN NEW;  -- non-financial update: keep frozen totals, no recompute
  END IF;

  SELECT COALESCE(SUM(total),0), COALESCE(SUM(total) FILTER (WHERE COALESCE(sc_pwd_eligible,true)),0)
    INTO v_subtotal, v_eligible FROM invoice_items WHERE invoice_id = NEW.id;
  v_noneligible := v_subtotal - v_eligible;
  SELECT COALESCE(vat_registered,false), COALESCE(vat_rate,12) INTO v_vat_reg, v_vat_rate
    FROM clinics WHERE id = NEW.clinic_id;
  IF NEW.discount_type IN ('senior','pwd') THEN
    NEW.discount := ROUND(v_eligible * 0.20, 2); v_vatbase := v_noneligible;
  ELSE v_vatbase := GREATEST(v_subtotal - COALESCE(NEW.discount,0), 0); END IF;
  IF v_vat_reg AND v_vatbase > 0 THEN v_vat := ROUND(v_vatbase * v_vat_rate / 100.0, 2);
  ELSE v_vat := 0; END IF;
  NEW.total := GREATEST(v_subtotal - COALESCE(NEW.discount,0),0) + v_vat;
  NEW.tax_amount := v_vat;
  RETURN NEW;
END;
$function$;

-- from_items recompute: skip finalized invoices (their items can't change anyway).
CREATE OR REPLACE FUNCTION public.update_invoice_total_from_items() RETURNS trigger
LANGUAGE plpgsql AS $function$
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
  SELECT COALESCE(discount,0), discount_type, clinic_id INTO v_discount, v_disctype, v_clinic
    FROM invoices WHERE id = v_inv_id;
  SELECT COALESCE(vat_registered,false), COALESCE(vat_rate,12) INTO v_vat_reg, v_vat_rate
    FROM clinics WHERE id = v_clinic;
  IF v_disctype IN ('senior','pwd') THEN
    v_discount := ROUND(v_eligible * 0.20, 2); v_vatbase := v_noneligible;
  ELSE v_vatbase := GREATEST(v_subtotal - v_discount, 0); END IF;
  IF v_vat_reg AND v_vatbase > 0 THEN v_vat := ROUND(v_vatbase * v_vat_rate / 100.0, 2);
  ELSE v_vat := 0; END IF;
  UPDATE invoices SET discount = v_discount, total = GREATEST(v_subtotal - v_discount,0) + v_vat, tax_amount = v_vat
    WHERE id = v_inv_id;
  RETURN NEW;
END;
$function$;

-- 3) Auto-lock an invoice the moment it is fully paid.
CREATE OR REPLACE FUNCTION public.autolock_on_full_payment() RETURNS trigger
LANGUAGE plpgsql AS $function$
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

DROP TRIGGER IF EXISTS payments_autolock ON public.payments;
CREATE TRIGGER payments_autolock
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.autolock_on_full_payment();
