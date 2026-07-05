-- ============================================================================
-- 008_vat_config.sql
-- Per-clinic VAT configuration + invoice discount type.
--   • clinics.vat_registered  — false = Non-VAT (default; matches clinics today);
--                               true  = VAT-registered (12% output VAT, strict BIR).
--   • clinics.vat_rate        — VAT % when registered (default 12).
--   • invoices.discount_type  — records HOW a discount was derived:
--                               'senior' | 'pwd' | 'percent' | 'amount' | null.
--
-- The VAT flag is display/computation config; it does NOT change how the totals
-- trigger stores invoices.total (line prices stay VAT-inclusive — the patient
-- pays the same). It drives the SOA VAT breakdown and the statutory Senior/PWD
-- discount (VAT is stripped first only when registered).
--
-- clinics uses column-level grants (secrets are service-key only), so the two
-- new NON-secret columns are explicitly granted to anon/authenticated.
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.clinics  ADD COLUMN IF NOT EXISTS vat_registered boolean      NOT NULL DEFAULT false;
ALTER TABLE public.clinics  ADD COLUMN IF NOT EXISTS vat_rate       numeric(5,2) NOT NULL DEFAULT 12;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_type  varchar(20);

-- These are configuration, not secrets — safe for the app (anon/authenticated).
GRANT SELECT (vat_registered, vat_rate) ON public.clinics TO anon, authenticated;
GRANT UPDATE (vat_registered, vat_rate) ON public.clinics TO authenticated;
