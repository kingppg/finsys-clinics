-- ============================================================================
-- 017_percent_discount_dbowned.sql  (H4 — make % discounts DB-owned)
-- Run ONCE in the Supabase SQL editor. Run AFTER 016.
--
-- WHY: a 'percent' discount was converted to a PESO amount once, at save time,
-- and stored in invoices.discount. When line items later changed, the total
-- recomputed but the peso discount stayed frozen — so a "10%" discount silently
-- became some other %. Senior/PWD already rescale correctly (DB-owned); this
-- brings 'percent' to the same behavior.
--
-- HOW: store the raw percentage in a new column invoices.discount_value, and let
-- the line-items total trigger recompute discount = subtotal x pct/100 whenever
-- items change. Only the 'percent' branch is added — 'senior'/'pwd'/'amount'/
-- none paths are IDENTICAL to the live function captured in
-- billing-schema-baseline.sql.
--
-- 'amount' discounts intentionally do NOT rescale (a fixed ₱ off stays fixed) —
-- unchanged. Idempotent — safe to re-run.
-- ============================================================================

-- ---- 1) Column to hold the raw input (% for 'percent', ₱ for 'amount') ------
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_value numeric(12,2);

-- ---- 2) Best-effort backfill of existing rows -------------------------------
-- 'percent': recover pct from the stored peso discount vs the gross subtotal
-- (exact for invoices whose items haven't changed since; a harmless estimate
--  otherwise — the next edit stores the exact value).
UPDATE public.invoices
   SET discount_value = ROUND(discount / subtotal * 100, 2)
 WHERE discount_type = 'percent'
   AND discount_value IS NULL
   AND COALESCE(subtotal, 0) > 0
   AND COALESCE(discount, 0) > 0;
-- 'amount': the value IS the peso discount.
UPDATE public.invoices
   SET discount_value = discount
 WHERE discount_type = 'amount'
   AND discount_value IS NULL
   AND COALESCE(discount, 0) > 0;

-- ---- 3) Line-items total trigger: recompute % from discount_value -----------
-- (Base = the exact live body; the ONLY change is the new ELSIF 'percent'
--  branch. The cascade into trg_update_total_on_discount is unchanged and
--  already agrees, because it recomputes the total from the discount we set.)
CREATE OR REPLACE FUNCTION public.update_invoice_total_from_items()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_inv_id integer; v_subtotal numeric; v_eligible numeric; v_noneligible numeric;
  v_discount numeric; v_disctype text; v_clinic integer; v_discval numeric;
  v_vat_reg boolean; v_vat_rate numeric; v_vatbase numeric; v_vat numeric; v_fin timestamptz;
BEGIN
  v_inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT finalized_at INTO v_fin FROM invoices WHERE id = v_inv_id;
  IF v_fin IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(total),0), COALESCE(SUM(total) FILTER (WHERE COALESCE(sc_pwd_eligible,true)),0)
    INTO v_subtotal, v_eligible FROM invoice_items WHERE invoice_id = v_inv_id;
  v_noneligible := v_subtotal - v_eligible;

  SELECT COALESCE(discount,0), discount_type, clinic_id, discount_value
    INTO v_discount, v_disctype, v_clinic, v_discval
    FROM invoices WHERE id = v_inv_id;

  SELECT COALESCE(vat_registered,false), COALESCE(vat_rate,12)
    INTO v_vat_reg, v_vat_rate FROM clinics WHERE id = v_clinic;

  IF v_disctype IN ('senior','pwd') THEN
    v_discount := ROUND(v_eligible * 0.20, 2); v_vatbase := v_noneligible;
  ELSIF v_disctype = 'percent' AND v_discval IS NOT NULL THEN
    -- DB owns the percentage now (clamped 0..100), so it rescales with items.
    v_discount := ROUND(v_subtotal * LEAST(GREATEST(v_discval,0),100) / 100.0, 2);
    v_vatbase  := GREATEST(v_subtotal - v_discount, 0);
  ELSE
    v_vatbase := GREATEST(v_subtotal - v_discount, 0);
  END IF;

  IF v_vat_reg AND v_vatbase > 0 THEN v_vat := ROUND(v_vatbase * v_vat_rate / 100.0, 2); ELSE v_vat := 0; END IF;

  UPDATE invoices SET discount = v_discount, total = GREATEST(v_subtotal - v_discount,0) + v_vat, tax_amount = v_vat
   WHERE id = v_inv_id;
  RETURN NEW;
END;
$function$;

-- ---- ROLLBACK ----
--   Restore update_invoice_total_from_items from billing-schema-baseline.sql.
--   (The discount_value column can stay — it is harmless if unused.)
