-- ============================================================================
-- capture-billing-schema.sql  (H3 — get the live DB logic into the repo)
--
-- PROBLEM: several load-bearing pieces of the billing system exist ONLY in the
-- live database and are NOT in this repo, so we cannot rebuild or stage from
-- source, and cannot review them. Confirmed missing from git:
--   • the INVOICE STATUS trigger (recomputes Unpaid / Partial / Paid on payment
--     insert) — never committed.
--   • the APPOINTMENT -> INVOICE trigger (auto-creates an invoice when an
--     appointment is marked Completed; sets invoices.appointment_id) — never
--     committed. (Live check: 134 / 149 invoices carry appointment_id.)
--   • the ORIGINAL invoice/item total triggers that pre-dated migration 006.
-- (The only SQL dump in the tree, supabasebackup.sql, is from Sep 2025 and
-- pre-dates billing — its invoices table has just 5 columns.)
--
-- HOW TO USE: run each query below in the Supabase SQL editor and paste the
-- output into a new file  backend/db/000_billing_baseline.sql  (commit it).
-- That file becomes the single source of truth for the live billing logic.
-- Nothing here MODIFIES the database — these are read-only introspection queries.
-- ============================================================================

-- 1) All trigger definitions on the billing tables (invoices, invoice_items,
--    payments) AND on appointments (the auto-invoice trigger lives there).
SELECT
  c.relname                              AS table_name,
  t.tgname                               AS trigger_name,
  pg_get_triggerdef(t.oid) || ';'        AS definition
FROM pg_trigger t
JOIN pg_class c   ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname IN ('invoices', 'invoice_items', 'payments', 'appointments')
ORDER BY c.relname, t.tgname;

-- 2) The full body of every function those triggers call (plus the ones this
--    repo already defines, so the baseline is complete in one place).
SELECT
  p.proname                              AS function_name,
  pg_get_functiondef(p.oid) || ';'       AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    -- known / in-repo (latest definition wins — see inventory below):
    'update_invoice_total_from_items',
    'update_invoice_total_on_discount',
    'set_invoice_subtotal',
    'assign_invoice_number',
    'prevent_finalized_item_change',
    'autolock_on_full_payment',
    'payments_append_only',          -- new in 015
    'reverse_payment',               -- new in 015
    -- suspected UNVERSIONED (names are a guess — query #1 shows the real names):
    'update_invoice_status',
    'create_invoice_on_completion',
    'set_invoice_status'
  )
ORDER BY p.proname;

-- 3) Catch-all: if query #2 missed a function (wrong guessed name), this lists
--    EVERY trigger function attached to the billing/appointments tables so you
--    can grab any you don't recognize.
SELECT DISTINCT p.proname, pg_get_functiondef(p.oid) || ';' AS definition
FROM pg_trigger t
JOIN pg_class c   ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p    ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname IN ('invoices', 'invoice_items', 'payments', 'appointments')
ORDER BY p.proname;

-- ============================================================================
-- INVENTORY — which migration currently OWNS each billing function/trigger.
-- (When a function is redefined by several migrations, the LATEST one is the
-- authoritative body. Re-running an OLDER migration silently regresses it —
-- this is the trap to avoid. After capturing the baseline, treat 000_billing_
-- baseline.sql as canonical and stop re-running the old numbered files.)
--
--   update_invoice_total_from_items    -> latest def in 011_invoice_finalize.sql
--   update_invoice_total_on_discount   -> latest def in 013_payment_reversal.sql
--   set_invoice_subtotal   (+trigger)  -> 006_invoice_subtotal.sql
--   assign_invoice_number  (+trigger)  -> 007_invoice_numbering.sql
--   prevent_finalized_item_change (+t) -> 011_invoice_finalize.sql
--   autolock_on_full_payment      (+t) -> 011_invoice_finalize.sql
--   payments_append_only          (+t) -> 015_payments_immutable.sql
--   reverse_payment (RPC)              -> 015_payments_immutable.sql
--   <invoice status recompute>    (+t) -> *** NOT IN REPO — capture from live ***
--   <appointment -> invoice>      (+t) -> *** NOT IN REPO — capture from live ***
-- ============================================================================
