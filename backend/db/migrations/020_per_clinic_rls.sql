-- ============================================================================
-- 020_per_clinic_rls.sql — per-clinic RLS isolation (multi-tenant data separation).
-- Run ONCE in the Supabase SQL editor. (Applied to prod 2026-07-07.)
--
-- WHY: after 014/019 every table had RLS, but the policies were "any AUTHENTICATED
-- user = full access". So a logged-in staffer from Clinic A could craft a query
-- for Clinic B's invoices/patients/appointments. For a multi-tenant SaaS sold on
-- data separation, that was the single biggest remaining gap.
--
-- HOW: resolve the caller's clinic from their JWT email (public.users maps
-- email -> clinic_id, exactly like backend/middleware/requireAuth.js). Each policy
-- becomes: superadmin OR row.clinic_id = caller's clinic. Works with EXISTING
-- logged-in sessions (email is a standard JWT claim — no re-login needed). The
-- frontend already filters by clinic_id, so NO app code change is required.
--
-- SECURITY DEFINER on the helpers is essential: they read public.users without
-- tripping users' own RLS (prevents infinite recursion / lockout).
--
-- SCOPE: the 17 data tables that carry clinic_id AND are frontend-facing.
-- DELIBERATELY EXCLUDED:
--   • users — scoping touches login/signup/registration (highest break-risk);
--     staff PII, not patient/financial data. Deferred to its own tested pass.
--   • messenger_sessions — RLS-on/zero-policy (service-key only) already.
--   • payment_plan_installments — has NO clinic_id (scope via parent plan later).
--   • clinics — column-grant protected (must stay anon-readable for Queue/login).
--
-- Verified live: own-clinic data loads for a logged-in user; anon still fully
-- denied (no regression). Reversible — see ROLLBACK at the bottom.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_staff_clinic_id()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT clinic_id FROM public.users WHERE email = (auth.jwt() ->> 'email') LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_staff_is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role = 'superadmin' FROM public.users
                   WHERE email = (auth.jwt() ->> 'email') LIMIT 1), false);
$$;

REVOKE ALL ON FUNCTION public.current_staff_clinic_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_staff_is_superadmin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_staff_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_is_superadmin() TO authenticated;

DO $$
DECLARE
  t text;
  pol record;
  targets text[] := ARRAY[
    'appointment_reminders','appointments','audit_log','dentist_availability',
    'dentists','invoice_items','invoice_number_counters','invoices','odontograms',
    'or_number_counters','patient_files','patients','payment_plans','payments',
    'procedure_categories','procedures','tax_rates'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format($f$
      CREATE POLICY clinic_isolation ON public.%I
      FOR ALL TO authenticated
      USING (public.current_staff_is_superadmin() OR clinic_id = public.current_staff_clinic_id())
      WITH CHECK (public.current_staff_is_superadmin() OR clinic_id = public.current_staff_clinic_id())
    $f$, t);
  END LOOP;
END $$;

-- ---- ROLLBACK (restores the permissive authenticated-only policies) ----
-- DO $$
-- DECLARE t text; targets text[] := ARRAY[
--   'appointment_reminders','appointments','audit_log','dentist_availability',
--   'dentists','invoice_items','invoice_number_counters','invoices','odontograms',
--   'or_number_counters','patient_files','patients','payment_plans','payments',
--   'procedure_categories','procedures','tax_rates'];
-- BEGIN
--   FOREACH t IN ARRAY targets LOOP
--     EXECUTE format('DROP POLICY IF EXISTS clinic_isolation ON public.%I', t);
--     EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
--       'authenticated_full_access_'||t, t);
--   END LOOP;
-- END $$;
--
-- FOLLOW-UP (next session): scope public.users per-clinic too (test login/signup/
-- AdminUsersRoles), and payment_plan_installments via its parent payment_plan.
