-- ============================================================================
-- 014_billing_rls.sql  (SECURITY C2 — close the public billing exposure)
-- Run ONCE in the Supabase SQL editor.
--
-- WHY: the frontend uses the public anon key (shipped in the JS bundle). The
-- billing tables had NO row-level security, so ANYONE with that key (i.e.
-- anyone who opens DevTools) could — with no login — read every invoice/
-- payment, insert payments, rewrite payment amounts, and delete invoices for
-- ANY clinic. Verified live: anon GET returned real rows; anon POST/PATCH/
-- DELETE returned 2xx (RLS did not block).
--
-- FIX: same proven pattern as secure-users-table.sql. This app uses Supabase
-- Auth (LoginPage signInWithPassword), so logged-in staff carry the
-- `authenticated` role and logged-out visitors are `anon`. EVERY frontend
-- read/write of these tables happens AFTER login, inside the dashboard:
--   invoices / invoice_items / payments -> BillsPayment, InvoiceManagementModal,
--                                          AddPaymentForm
--   procedures                          -> BillsPayment, ClinicProcedureManager
-- No public/anon page touches them. The booking bot reads `procedures` in the
-- BACKEND via the service key, which BYPASSES RLS — so it is unaffected.
--
-- So: enable RLS, allow `authenticated`, deny `anon` entirely. The service_role
-- (backend) bypasses RLS, so any server-side code is unaffected.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---- invoices ----
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_access_invoices" ON public.invoices;
CREATE POLICY "authenticated_full_access_invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ---- invoice_items ----
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_access_invoice_items" ON public.invoice_items;
CREATE POLICY "authenticated_full_access_invoice_items"
  ON public.invoice_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ---- payments ----
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_access_payments" ON public.payments;
CREATE POLICY "authenticated_full_access_payments"
  ON public.payments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ---- procedures (catalog: names + prices + sc_pwd_eligible) ----
-- Only the Procedures config and Billing (both post-login) read this in the
-- frontend; the booking bot reads it server-side (service key). If you later
-- add a PUBLIC "our services & prices" page that uses the anon key, grant a
-- SELECT-only policy to anon on this table instead of removing RLS.
ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_access_procedures" ON public.procedures;
CREATE POLICY "authenticated_full_access_procedures"
  ON public.procedures FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ---- VERIFY (optional) ----
-- With the ANON key these should now return NO rows / be denied:
--   select * from invoices limit 1;      -- []  (was: real rows)
--   insert into payments (...) values (...);  -- denied
-- With a logged-in (authenticated) session, the billing UI works unchanged.

-- ---- ROLLBACK (if anything breaks) ----
--   ALTER TABLE public.invoices       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.invoice_items  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.payments       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.procedures     DISABLE ROW LEVEL SECURITY;

-- ---- FUTURE REFINEMENT (cross-clinic isolation) ----
-- Today authenticated staff of clinic A can still technically query clinic B's
-- rows if they craft a request (the UI always scopes by clinic_id, but the
-- policy is permissive). To harden, scope every policy to the caller's clinic
-- once clinic_id is carried in the JWT as a claim, e.g.:
--   USING (clinic_id = (auth.jwt() ->> 'clinic_id')::int)
-- This first migration closes the PUBLIC (anon) hole, which is the urgent one.
