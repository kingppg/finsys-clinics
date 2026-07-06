-- ============================================================================
-- 012_invoice_reopen.sql
-- Allow REOPENING (un-finalizing) a finalized invoice ONLY when it has no
-- recorded payments — a premature manual lock on a pure draft is recoverable,
-- but a paid (or partially-paid) invoice stays permanently locked.
--
-- Enforced in the discount trigger (DB-level, not just UI): un-setting
-- finalized_at on an invoice that has any payment raises an exception.
-- Idempotent — safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_invoice_total_on_discount() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
  v_subtotal numeric; v_eligible numeric; v_noneligible numeric;
  v_vat_reg boolean; v_vat_rate numeric; v_vatbase numeric; v_vat numeric;
BEGIN
  IF OLD.finalized_at IS NOT NULL THEN
    -- Reopen attempt (finalized_at -> NULL): only when there are no payments.
    IF NEW.finalized_at IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.payments WHERE invoice_id = NEW.id) THEN
        RAISE EXCEPTION 'Invoice % has payments and cannot be reopened', OLD.id;
      END IF;
      RETURN NEW;  -- unlock; amounts unchanged
    END IF;
    -- Still finalized: reject any change to the amounts.
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
