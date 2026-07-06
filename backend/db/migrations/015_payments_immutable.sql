-- ============================================================================
-- 015_payments_immutable.sql  (SECURITY C3 — make payment history append-only)
-- Run ONCE in the Supabase SQL editor. Run AFTER 014.
--
-- WHY: 014 stops an ANONYMOUS user from touching payments, but an authenticated
-- staff session could still (via a crafted request) UPDATE a payment's amount or
-- DELETE a payment row, silently rewriting the financial ledger. "Audit-grade"
-- must be enforced by the DB, not just the UI.
--
-- Also: the app's refund flow was TWO separate client writes (insert the
-- offsetting reversal, then mark the original `reversed_at`). A failure or a
-- double-click between them can double-reverse a payment. This migration adds a
-- single atomic RPC so the whole reversal happens in one transaction.
--
-- WHAT THIS DOES:
--   1) payments become APPEND-ONLY:
--        • DELETE is always blocked (reverse instead — the audit trail stays).
--        • UPDATE is blocked EXCEPT the sanctioned `reversed_at` / `updated_at`
--          fields (used to mark a payment reversed). Amount, invoice, method,
--          dates, OR/reference numbers can never change after insert.
--   2) reverse_payment() RPC — one atomic, validated reversal (caps at net
--      collected, blocks double-reversal, writes the offsetting entry AND marks
--      the original in the same transaction).
--
-- The service_role and this SECURITY DEFINER RPC still fire these triggers, so
-- the RPC is written to only INSERT + set reversed_at (both allowed).
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---- 1) Append-only guard ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.payments_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payments are append-only — reverse the payment instead of deleting it (payment #%)', OLD.id;
  END IF;

  -- UPDATE: allow only the reversal bookkeeping fields to change.
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
$$;

DROP TRIGGER IF EXISTS payments_append_only_guard ON public.payments;
CREATE TRIGGER payments_append_only_guard
  BEFORE UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_append_only();

-- ---- 2) Atomic reversal RPC -------------------------------------------------
-- Mirrors the app's refund rules exactly:
--   • only a positive, not-already-reversed payment can be reversed
--   • refund is capped at LEAST(original amount, net collected on the invoice)
--   • a FULL refund (>= original) marks the original reversed_at; a partial one
--     leaves it open (so the remainder can still be reversed later)
-- p_note lets the caller pass the human-readable, currency-formatted audit note
-- (kept verbatim). Returns the newly-inserted offsetting payment row.
CREATE OR REPLACE FUNCTION public.reverse_payment(
  p_payment_id bigint,
  p_clinic_id  integer,
  p_amount     numeric,
  p_note       text DEFAULT NULL
) RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig    public.payments%ROWTYPE;
  v_net     numeric;
  v_max     numeric;
  v_is_full boolean;
  v_new     public.payments%ROWTYPE;
BEGIN
  SELECT * INTO v_orig FROM public.payments
   WHERE id = p_payment_id AND clinic_id = p_clinic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found for clinic %', p_payment_id, p_clinic_id;
  END IF;
  IF v_orig.amount <= 0 THEN
    RAISE EXCEPTION 'Only a positive payment can be reversed (payment #%)', p_payment_id;
  END IF;
  IF v_orig.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment #% is already reversed', p_payment_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_net
    FROM public.payments WHERE invoice_id = v_orig.invoice_id;
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
  )
  RETURNING * INTO v_new;

  IF v_is_full THEN
    UPDATE public.payments SET reversed_at = now() WHERE id = v_orig.id;
  END IF;

  RETURN v_new;
END;
$$;

-- Only logged-in staff may call it; SECURITY DEFINER runs it as the owner so it
-- writes past RLS (014) while the append-only guard still permits its actions.
REVOKE ALL ON FUNCTION public.reverse_payment(bigint, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_payment(bigint, integer, numeric, text) TO authenticated;

-- ---- ROLLBACK (if anything breaks) ----
--   DROP TRIGGER IF EXISTS payments_append_only_guard ON public.payments;
--   DROP FUNCTION IF EXISTS public.reverse_payment(bigint, integer, numeric, text);
