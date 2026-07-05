-- ============================================================================
-- 006_invoice_subtotal.sql
-- Populate invoices.subtotal with the GROSS line-item total (before discount),
-- so reports / a BIR-style SOA can read the original amount directly instead of
-- reconstructing it as (total + discount).
--
-- SAFE / ADDITIVE: this does NOT touch the existing totals trigger that owns
-- invoices.total (which already stores the NET = Σ line_items − discount).
-- It only maintains the previously-unused `subtotal` column.
--
-- Relationship after this runs, for every invoice:
--     subtotal = Σ(invoice_items.total)         -- gross (original)
--     discount = price reduction                 -- as entered
--     total    = subtotal − discount (+ tax)     -- net (owed) — unchanged
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- Keep subtotal in sync whenever line items change.
CREATE OR REPLACE FUNCTION public.set_invoice_subtotal() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  inv_id integer;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF inv_id IS NOT NULL THEN
    UPDATE public.invoices
       SET subtotal = COALESCE(
             (SELECT SUM(ii.total) FROM public.invoice_items ii WHERE ii.invoice_id = inv_id),
             0)
     WHERE id = inv_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS invoice_items_set_subtotal ON public.invoice_items;
CREATE TRIGGER invoice_items_set_subtotal
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_subtotal();

-- One-time backfill of existing invoices (invoices with no items → 0).
UPDATE public.invoices i
   SET subtotal = COALESCE(
         (SELECT SUM(ii.total) FROM public.invoice_items ii WHERE ii.invoice_id = i.id),
         0);
