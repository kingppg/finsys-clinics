-- ============================================================================
-- 010_scpwd_eligibility.sql  (Phase 2 — mixed invoices)
-- Per-line Senior/PWD eligibility so the 20% discount + VAT-exemption apply only
-- to eligible items (medically-necessary), while non-eligible items (cosmetic)
-- are charged normally (and are VATable for VAT-registered clinics).
--
--   procedures.sc_pwd_eligible    catalog default (true)
--   invoice_items.sc_pwd_eligible per-line snapshot (true)
--
-- The total triggers become eligibility-aware, and the DB OWNS the Senior/PWD
-- discount (= 20% of the eligible base) so it stays correct as lines change:
--   subtotal      = Σ items
--   eligibleBase  = Σ items WHERE sc_pwd_eligible
--   nonEligible   = subtotal − eligibleBase
--   if discount_type IN ('senior','pwd'):
--       discount  = round(eligibleBase × 0.20, 2)      -- DB-owned
--       vatBase   = nonEligible                        -- eligible lines are VAT-exempt
--   else:
--       discount  = invoices.discount (app-set custom)
--       vatBase   = subtotal − discount
--   vat   = (vat_registered AND vatBase>0) ? round(vatBase × rate/100, 2) : 0
--   total = (subtotal − discount) + vat ; tax_amount = vat
--
-- Non-VAT clinics with all-eligible items (today's data) are unchanged.
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.procedures    ADD COLUMN IF NOT EXISTS sc_pwd_eligible boolean NOT NULL DEFAULT true;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS sc_pwd_eligible boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.update_invoice_total_from_items()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_inv_id    integer;
  v_subtotal  numeric;
  v_eligible  numeric;
  v_noneligible numeric;
  v_discount  numeric;
  v_disctype  text;
  v_clinic    integer;
  v_vat_reg   boolean;
  v_vat_rate  numeric;
  v_vatbase   numeric;
  v_vat       numeric;
BEGIN
  v_inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT COALESCE(SUM(total), 0),
         COALESCE(SUM(total) FILTER (WHERE COALESCE(sc_pwd_eligible, true)), 0)
    INTO v_subtotal, v_eligible
  FROM invoice_items WHERE invoice_id = v_inv_id;
  v_noneligible := v_subtotal - v_eligible;

  SELECT COALESCE(discount, 0), discount_type, clinic_id
    INTO v_discount, v_disctype, v_clinic
  FROM invoices WHERE id = v_inv_id;

  SELECT COALESCE(vat_registered, false), COALESCE(vat_rate, 12)
    INTO v_vat_reg, v_vat_rate
  FROM clinics WHERE id = v_clinic;

  IF v_disctype IN ('senior', 'pwd') THEN
    v_discount := ROUND(v_eligible * 0.20, 2);   -- DB owns the statutory discount
    v_vatbase  := v_noneligible;
  ELSE
    v_vatbase  := GREATEST(v_subtotal - v_discount, 0);
  END IF;

  IF v_vat_reg AND v_vatbase > 0 THEN
    v_vat := ROUND(v_vatbase * v_vat_rate / 100.0, 2);
  ELSE
    v_vat := 0;
  END IF;

  UPDATE invoices
     SET discount = v_discount,
         total = GREATEST(v_subtotal - v_discount, 0) + v_vat,
         tax_amount = v_vat
   WHERE id = v_inv_id;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_invoice_total_on_discount()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_subtotal  numeric;
  v_eligible  numeric;
  v_noneligible numeric;
  v_vat_reg   boolean;
  v_vat_rate  numeric;
  v_vatbase   numeric;
  v_vat       numeric;
BEGIN
  SELECT COALESCE(SUM(total), 0),
         COALESCE(SUM(total) FILTER (WHERE COALESCE(sc_pwd_eligible, true)), 0)
    INTO v_subtotal, v_eligible
  FROM invoice_items WHERE invoice_id = NEW.id;
  v_noneligible := v_subtotal - v_eligible;

  SELECT COALESCE(vat_registered, false), COALESCE(vat_rate, 12)
    INTO v_vat_reg, v_vat_rate
  FROM clinics WHERE id = NEW.clinic_id;

  IF NEW.discount_type IN ('senior', 'pwd') THEN
    NEW.discount := ROUND(v_eligible * 0.20, 2);   -- DB owns the statutory discount
    v_vatbase    := v_noneligible;
  ELSE
    v_vatbase    := GREATEST(v_subtotal - COALESCE(NEW.discount, 0), 0);
  END IF;

  IF v_vat_reg AND v_vatbase > 0 THEN
    v_vat := ROUND(v_vatbase * v_vat_rate / 100.0, 2);
  ELSE
    v_vat := 0;
  END IF;

  NEW.total := GREATEST(v_subtotal - COALESCE(NEW.discount, 0), 0) + v_vat;
  NEW.tax_amount := v_vat;
  RETURN NEW;
END;
$function$;
