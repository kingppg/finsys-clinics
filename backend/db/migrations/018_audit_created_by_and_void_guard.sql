-- ============================================================================
-- 018_audit_created_by_and_void_guard.sql
-- Run ONCE in the Supabase SQL editor. Run AFTER 017.
--
-- Two small, low-risk integrity improvements:
--   A) created_by attribution — capture WHO created each invoice / payment.
--   B) void guard — enforce at the DB what the UI already prevents: a finalized
--      or paid invoice cannot be voided (status -> 'Cancelled').
--
-- Both are additive and idempotent — safe to re-run. Existing rows are untouched.
-- ============================================================================

-- ---- A) created_by attribution ---------------------------------------------
-- auth.uid() returns the caller's Supabase Auth uuid from their JWT. As a column
-- DEFAULT it is captured automatically on INSERT — no frontend change needed.
--   • frontend inserts (create invoice, record payment) -> the staff's uuid
--   • the auto-invoice trigger runs in the staff's request context -> their uuid
--   • the reverse_payment RPC (SECURITY DEFINER) still reads the JWT -> their uuid
--   • any service-key/system insert -> NULL (correctly "system", not a person)
-- Nullable, so all existing rows simply stay NULL (we can't know retroactively).
ALTER TABLE public.invoices  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();
ALTER TABLE public.payments  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

-- (Later, to show a name: join created_by -> auth.users.email -> public.users
--  by email. Capture first; display can come in a UI pass.)

-- ---- B) void guard ---------------------------------------------------------
-- The UI disables Void when an invoice is finalized or has payments; this makes
-- the same rule DB-enforced. Only blocks the transition INTO 'Cancelled'; the
-- status state-machine trigger (Paid/Partial/Unpaid) never sets 'Cancelled', so
-- it is unaffected.
CREATE OR REPLACE FUNCTION public.prevent_invalid_void() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled' THEN
    IF OLD.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION 'Invoice % is finalized and cannot be voided', OLD.id;
    END IF;
    IF (SELECT COALESCE(SUM(amount),0) FROM public.payments WHERE invoice_id = OLD.id) > 0.005 THEN
      RAISE EXCEPTION 'Invoice % has payments and cannot be voided — reverse them first', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS invoices_prevent_invalid_void ON public.invoices;
CREATE TRIGGER invoices_prevent_invalid_void
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_invalid_void();

-- ---- ROLLBACK ----
--   DROP TRIGGER IF EXISTS invoices_prevent_invalid_void ON public.invoices;
--   DROP FUNCTION IF EXISTS public.prevent_invalid_void();
--   ALTER TABLE public.invoices DROP COLUMN IF EXISTS created_by;
--   ALTER TABLE public.payments DROP COLUMN IF EXISTS created_by;
