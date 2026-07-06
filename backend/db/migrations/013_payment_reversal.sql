-- ============================================================================
-- 013_payment_reversal.sql  (Phase 4 — refund / reverse a payment)
-- Reversing a payment records an OFFSETTING refund entry (a negative-amount
-- payment) — the original is never deleted, so the audit trail is intact. The
-- original payment is marked `reversed_at` to prevent double-reversal.
--
-- Because a reversed invoice still HAS payment rows (original + refund, net 0),
-- the reopen/edit guards must key off NET paid (Σ amount), not row count.
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

-- Reopen guard now uses NET paid: an invoice with payments fully reversed
-- (Σ amount = 0) can be reopened; any net money on it blocks reopen.
CREATE OR REPLACE FUNCTION public.update_invoice_total_on_discount() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
  v_subtotal numeric; v_eligible numeric; v_noneligible numeric;
  v_vat_reg boolean; v_vat_rate numeric; v_vatbase numeric; v_vat numeric;
BEGIN
  IF OLD.finalized_at IS NOT NULL THEN
    IF NEW.finalized_at IS NULL THEN
      IF (SELECT COALESCE(SUM(amount),0) FROM public.payments WHERE invoice_id = NEW.id) > 0.005 THEN
        RAISE EXCEPTION 'Invoice % has net payments and cannot be reopened until fully reversed', OLD.id;
      END IF;
      RETURN NEW;  -- unlock; amounts unchanged
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
