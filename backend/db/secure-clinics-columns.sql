-- secure-clinics-columns.sql
-- Run this ONCE in the Supabase SQL editor.
--
-- WHY: the frontend uses the public anon key (shipped in the JS bundle), and the
-- `clinics` table was readable/writable by anyone with it — exposing
-- fb_page_access_token, sms_api_key, and sms_api_secret to the whole internet.
--
-- FIX: column-level privileges. The anon/authenticated roles keep access to the
-- SAFE columns (so login, signup, queue display, and clinic config still work),
-- but can no longer read or write the three secret columns. Those are handled
-- only server-side with the service key:
--   - FB Page access token  -> POST /api/clinics/:id/facebook/select-page
--   - SMS credentials        -> PUT  /api/clinics/:id/sms
--
-- The service_role (backend) bypasses these grants, so server-side code is
-- unaffected.

-- 1) READS: revoke table-wide SELECT, then grant SELECT on safe columns only.
REVOKE SELECT ON public.clinics FROM anon, authenticated;
GRANT SELECT (
  id, name, address, contact_email, contact_phone, fb_page_id,
  created_at, updated_at, messenger_page_id, reminder_time, is_active,
  time_zone, queue_token, queue_stations, currency_symbol, currency_locale,
  sms_provider, sms_sender
) ON public.clinics TO anon, authenticated;

-- 2) WRITES: revoke table-wide UPDATE, then grant UPDATE on safe columns only.
REVOKE UPDATE ON public.clinics FROM anon, authenticated;
GRANT UPDATE (
  name, address, contact_email, contact_phone, fb_page_id,
  messenger_page_id, reminder_time, is_active, time_zone,
  queue_token, queue_stations, currency_symbol, currency_locale,
  sms_provider, sms_sender
) ON public.clinics TO anon, authenticated;

-- NOTE: INSERT/DELETE are intentionally left unchanged. New clinics are created
-- via an RPC (SignUpPage) and via ClinicConfig "Add Clinic" (safe columns only).
-- If you later lock INSERT as well, grant INSERT on the same safe column list.

-- VERIFY (optional): with the ANON key, this should now ERROR or omit secrets.
--   select id, name, fb_page_access_token from clinics;  -- permission denied
--   select id, name, sms_provider from clinics;          -- ok
