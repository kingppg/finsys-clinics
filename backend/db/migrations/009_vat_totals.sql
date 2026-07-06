-- ============================================================================
-- 009_vat_totals.sql
-- Make the invoice-total triggers VAT-aware (VAT-EXCLUSIVE model).
--
--   taxable = GREATEST(Σ line_items − discount, 0)
--   exempt  = discount_type IN ('senior','pwd')      -- Senior/PWD are VAT-exempt
--   vat     = (clinic.vat_registered AND NOT exempt) ? round(taxable × rate/100, 2) : 0
--   total   = taxable + vat
--   tax_amount = vat                                  -- stored for the audit trail
--
-- Only the two function BODIES change; the triggers already point at them.
-- Non-VAT clinics: vat = 0, so total = taxable — identical to today (no change to
-- existing data). Idempotent — safe to re-run.
-- ============================================================================

-- Fires AFTER INSERT/UPDATE/DELETE on invoice_items.
CREATE OR REPLACE FUNCTION public.update_invoice_total_from_items()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_inv_id   integer;
  v_subtotal numeric;
  v_discount numeric;
  v_disctype text;
  v_clinic   integer;
  v_vat_reg  boolean;
  v_vat_rate numeric;
  v_taxable  numeric;
  v_vat      numeric;
BEGIN
  v_inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT COALESCE(SUM(total), 0) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = v_inv_id;

  SELECT COALESCE(discount, 0), discount_type, clinic_id
    INTO v_discount, v_disctype, v_clinic
  FROM invoices WHERE id = v_inv_id;

  SELECT COALESCE(vat_registered, false), COALESCE(vat_rate, 12)
    INTO v_vat_reg, v_vat_rate
  FROM clinics WHERE id = v_clinic;

  v_taxable := GREATEST(v_subtotal - v_discount, 0);
  IF v_vat_reg AND (v_disctype IS NULL OR v_disctype NOT IN ('senior', 'pwd')) THEN
    v_vat := ROUND(v_taxable * v_vat_rate / 100.0, 2);
  ELSE
    v_vat := 0;
  END IF;

  UPDATE invoices
     SET total = v_taxable + v_vat,
         tax_amount = v_vat
   WHERE id = v_inv_id;

  RETURN NEW;
END;
$function$;

-- Fires BEFORE UPDATE on invoices (discount / discount_type change, and the
-- cascade from update_invoice_total_from_items). Authoritative for the stored total.
CREATE OR REPLACE FUNCTION public.update_invoice_total_on_discount()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_subtotal numeric;
  v_vat_reg  boolean;
  v_vat_rate numeric;
  v_taxable  numeric;
  v_vat      numeric;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = NEW.id;

  SELECT COALESCE(vat_registered, false), COALESCE(vat_rate, 12)
    INTO v_vat_reg, v_vat_rate
  FROM clinics WHERE id = NEW.clinic_id;

  v_taxable := GREATEST(v_subtotal - COALESCE(NEW.discount, 0), 0);
  IF v_vat_reg AND (NEW.discount_type IS NULL OR NEW.discount_type NOT IN ('senior', 'pwd')) THEN
    v_vat := ROUND(v_taxable * v_vat_rate / 100.0, 2);
  ELSE
    v_vat := 0;
  END IF;

  NEW.total := v_taxable + v_vat;
  NEW.tax_amount := v_vat;
  RETURN NEW;
END;
$function$;

-- Initialize the audit column for existing rows (all currently Non-VAT → 0).
UPDATE public.invoices SET tax_amount = 0 WHERE tax_amount IS NULL;
