-- secure-users-table.sql
-- Run this ONCE in the Supabase SQL editor.
--
-- WHY: the `users` table (staff email, name, role, clinic_id) was readable by the
-- public anon key, exposing all staff PII/roles for every clinic. (No passwords
-- live here — those are in Supabase Auth.)
--
-- FIX: this app uses Supabase Auth (LoginPage signInWithPassword, SignUpPage
-- signUp), so logged-in staff carry the `authenticated` role and logged-out
-- visitors are `anon`. Every read/write of `users` in the frontend happens AFTER
-- login (LoginPage, CompleteRegistrationPage, AdminUsersRoles). So we enable RLS,
-- allow `authenticated`, and deny `anon` entirely.
--
-- The service_role (backend) and SECURITY DEFINER RPCs (signup) bypass RLS, so
-- /api/login and the registration RPC are unaffected.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Any logged-in user can read/manage users (matches current app behavior).
-- anon has no policy -> denied once RLS is on.
DROP POLICY IF EXISTS "authenticated_full_access_users" ON public.users;
CREATE POLICY "authenticated_full_access_users"
  ON public.users
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ROLLBACK (if anything breaks): re-open the table by disabling RLS:
--   ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- FUTURE REFINEMENT: scope reads to the caller's own clinic, e.g.
--   USING (clinic_id = (auth.jwt() ->> 'clinic_id')::int)
-- once clinic_id is carried in the JWT / a claim. For now the policy is
-- permissive for authenticated users, which still closes the public exposure.
