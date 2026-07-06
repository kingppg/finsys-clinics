-- ============================================================================
-- 019_lock_remaining_tables.sql — enable RLS on the 9 remaining unrestricted tables.
-- Run ONCE in the Supabase SQL editor. (Already run in prod 2026-07-06.)
--
-- WHY: an authoritative catalog check (pg_class.relrowsecurity) found 10 public
-- tables with NO row-level security. A live anon-key probe proved several were
-- fully readable AND writable with no login — most seriously:
--   • appointment_reminders — patient names + Messenger IDs (PII) + full message
--     text + appointment times, cross-clinic; anon could also DELETE/forge the
--     notification audit trail.
--   • invoice_number_counters / or_number_counters — anon could tamper last_seq,
--     colliding the UNIQUE invoice/OR numbers → invoice creation fails (billing DoS).
--   • dentist_availability — anon could read/tamper the schedule the booking bot
--     reads to offer slots.
--
-- FIX: authenticated = full access (matches the app model — all dashboard reads
-- happen post-login; the booking bot/webhook uses the SERVICE key which bypasses
-- RLS); anon = denied (no policy).
--
-- ⚠️ `clinics` is the 10th unrestricted table but is INTENTIONALLY EXCLUDED — it
-- is protected by column-level grants (secure-clinics-columns.sql) and MUST stay
-- anon-readable on safe columns for the public Queue Display + login + signup.
-- Do NOT add blanket RLS to clinics.
--
-- messenger_sessions already has RLS on with ZERO policies (service-key only) —
-- correct as-is, left untouched.
--
-- Idempotent — safe to re-run.
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointment_reminders',
    'dentist_availability',
    'procedure_categories',
    'tax_rates',
    'invoice_number_counters',
    'or_number_counters',
    'payment_plans',
    'payment_plan_installments',
    'audit_log'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'authenticated_full_access_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      'authenticated_full_access_' || t, t
    );
  END LOOP;
END $$;

-- ---- ROLLBACK (per table if ever needed) ----
--   ALTER TABLE public.appointment_reminders DISABLE ROW LEVEL SECURITY;
--   ... (repeat for the other 8)
