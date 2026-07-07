-- ============================================================================
-- 021_users_per_clinic_rls.sql — per-clinic isolation for public.users.
-- Run ONCE in the Supabase SQL editor. Reuses the helpers from migration 020.
--
-- WHY: users was the one data table left at "any authenticated = full access"
-- (deferred from 020 because it touches login/signup). A logged-in Clinic A
-- staffer could read Clinic B's staff list (emails, names, roles = PII).
--
-- SAFE because (verified in the frontend):
--   • LoginPage reads its OWN row by email — the SECURITY DEFINER helper resolves
--     the caller's clinic, so their own row is visible. Login still works.
--   • Signup/registration uses the register_clinic_with_admin RPC (SECURITY
--     DEFINER, bypasses RLS). Unaffected.
--   • AdminUsersRoles list/edit/delete operate within the admin's own clinic.
--   • AdminUsersRoles "Add User" inserts a row with clinic_id = admin's clinic;
--     the WITH CHECK passes as long as the admin's session runs the insert
--     (true when email confirmation is ON — the app's wording implies it is).
--     ** TEST "Add User" after applying. ** If it fails, email confirmation is
--     OFF and signUp switched the session — rollback and we'll add a targeted
--     INSERT policy.
--
-- OPERATIONAL SAFETY: the SQL editor runs as postgres (RLS does not apply to it),
-- so the ROLLBACK below ALWAYS works even if the app locks out. Keep this editor
-- tab open and TEST LOGIN IN A FRESH TAB before trusting it.
-- ============================================================================

DROP POLICY IF EXISTS authenticated_full_access_users ON public.users;
DROP POLICY IF EXISTS clinic_isolation ON public.users;

CREATE POLICY clinic_isolation ON public.users
  FOR ALL TO authenticated
  USING (public.current_staff_is_superadmin() OR clinic_id = public.current_staff_clinic_id())
  WITH CHECK (public.current_staff_is_superadmin() OR clinic_id = public.current_staff_clinic_id());

-- ---- ROLLBACK (restores the permissive authenticated-only policy) ----
-- DROP POLICY IF EXISTS clinic_isolation ON public.users;
-- CREATE POLICY authenticated_full_access_users ON public.users
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
