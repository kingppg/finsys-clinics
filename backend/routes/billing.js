// ====================================================================
// BILLING SYSTEM API ROUTES
// Phase 1: Invoice Management, Payment Recording, Financial Reports
// Manual GCash Integration (staff records payment)
// ====================================================================

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ====================================================================
// HELPER FUNCTIONS
// ====================================================================

const fmt = (n, currencySymbol = '₱', currencyLocale = 'en-PH') =>
  `${currencySymbol}${Number(n).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}`;

// Generate invoice number (e.g., "INV-2026-001")
async function generateInvoiceNumber(clinicId) {
  const today = new Date();
  const year = today.getFullYear();
  const { data } = await supabase
    .from('invoices')
    .select('invoice_number', { count: 'exact' })
    .eq('clinic_id', clinicId)
    .like('invoice_number', `INV-${year}-%`);

  const count = (data?.length || 0) + 1;
  return `INV-${year}-${String(count).padStart(3, '0')}`;
}

// ====================================================================
// INVOICES: Create, List, Detail, Update
// ====================================================================

// GET /api/billing/invoices - List all invoices for clinic
router.get('/invoices', async (req, res) => {
  try {
    const clinicId = req.query.clinic_id;
    if (!clinicId) return res.status(400).json({ error: 'Missing clinic_id' });

    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        patient:patient_id (id, name, phone),
        items:invoice_items (*)
      `)
      .eq('clinic_id', clinicId)
      .order('invoice_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Use existing total column, or calculate from items if needed
    const invoicesWithTotals = (data || []).map(inv => {
      // If invoice.total exists (from existing schema), use it
      if (inv.total && parseFloat(inv.total) > 0) {
        return inv;
      }
      // Otherwise, calculate from line items (for new invoices)
      const itemsTotal = (inv.items || []).reduce((sum, item) => sum + parseFloat(item.total || 0), 0);
      const taxAmount = parseFloat(inv.tax_amount || 0);
      const adjustedAmount = parseFloat(inv.adjusted_amount || 0);
      const calculatedTotal = itemsTotal + taxAmount + adjustedAmount;
      return { ...inv, total: calculatedTotal > 0 ? calculatedTotal : inv.total };
    });

    res.json(invoicesWithTotals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/invoices - Create new invoice
router.post('/invoices', async (req, res) => {
  try {
    const { clinic_id, patient_id, due_date, notes } = req.body;

    if (!clinic_id || !patient_id) {
      return res.status(400).json({ error: 'Missing clinic_id or patient_id' });
    }

    const invoice_number = await generateInvoiceNumber(clinic_id);
    const invoice_date = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('invoices')
      .insert([{
        clinic_id,
        patient_id,
        invoice_number,
        invoice_date,
        due_date: due_date || null,
        status: 'draft',
        notes: notes || null,
        total: 0,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Log audit
    await supabase.from('audit_log').insert([{
      clinic_id,
      entity_type: 'invoice',
      entity_id: data.id,
      action: 'created',
      details: `Invoice ${invoice_number} created`,
    }]);

    res.json({ success: true, invoice: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/invoices/:id - Get single invoice
router.get('/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clinicId = req.query.clinic_id;

    if (!clinicId) return res.status(400).json({ error: 'Missing clinic_id' });

    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        patient:patient_id (id, name, phone, email),
        items:invoice_items (*),
        payments:payments (*)
      `)
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .single();

    if (error) return res.status(404).json({ error: 'Invoice not found' });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/billing/invoices/:id - Update invoice (status, due_date, etc.)
router.put('/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { clinic_id, status, due_date, notes } = req.body;

    if (!clinic_id) return res.status(400).json({ error: 'Missing clinic_id' });

    const { data, error } = await supabase
      .from('invoices')
      .update({ status, due_date, notes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Log audit
    await supabase.from('audit_log').insert([{
      clinic_id,
      entity_type: 'invoice',
      entity_id: id,
      action: 'updated',
      details: `Invoice status changed to ${status}`,
    }]);

    res.json({ success: true, invoice: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================================================================
// INVOICE ITEMS: Add, List, Delete
// ====================================================================

// POST /api/billing/invoices/:id/items - Add line item
router.post('/invoices/:id/items', async (req, res) => {
  try {
    const { id: invoice_id } = req.params;
    const { clinic_id, procedure_id, description, quantity, unit_price, discount_type, discount_value, tax_code, tax_rate_id } = req.body;

    if (!clinic_id || !description || !unit_price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get tax rate if applicable
    let tax_amount = 0;
    let applied_tax_rate = 0;
    if (tax_rate_id) {
      const { data: taxRow } = await supabase
        .from('tax_rates')
        .select('rate')
        .eq('id', tax_rate_id)
        .single();

      if (taxRow) {
        applied_tax_rate = taxRow.rate;
        const subtotal = parseFloat(quantity || 1) * parseFloat(unit_price);
        const discountAmt = discount_type === 'percentage'
          ? subtotal * (parseFloat(discount_value || 0) / 100)
          : parseFloat(discount_value || 0);
        const lineTotal = subtotal - discountAmt;
        tax_amount = lineTotal * (applied_tax_rate / 100);
      }
    }

    const { data, error } = await supabase
      .from('invoice_items')
      .insert([{
        invoice_id,
        clinic_id,
        procedure_id: procedure_id || null,
        description,
        quantity: parseFloat(quantity || 1),
        unit_price: parseFloat(unit_price),
        discount_type: discount_type || null,
        discount_value: discount_value || null,
        tax_code: tax_code || null,
        tax_rate_id: tax_rate_id || null,
        applied_tax_rate: applied_tax_rate || null,
        tax_amount: tax_amount || null,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ success: true, item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/billing/invoices/:invoiceId/items/:itemId - Delete line item
router.delete('/invoices/:invoiceId/items/:itemId', async (req, res) => {
  try {
    const { invoiceId, itemId } = req.params;
    const clinicId = req.query.clinic_id;

    if (!clinicId) return res.status(400).json({ error: 'Missing clinic_id' });

    const { error } = await supabase
      .from('invoice_items')
      .delete()
      .eq('id', itemId)
      .eq('invoice_id', invoiceId)
      .eq('clinic_id', clinicId);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================================================================
// PAYMENTS: Record Manual Payment (GCash, Cash, Bank Transfer)
// ====================================================================

// POST /api/billing/payments - Record payment manually
router.post('/payments', async (req, res) => {
  try {
    const { invoice_id, clinic_id, amount, method, or_number, gcash_reference, notes } = req.body;

    if (!invoice_id || !clinic_id || !amount || !method) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Record payment
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert([{
        invoice_id,
        clinic_id,
        patient_id: null, // Will be fetched from invoice
        amount: parseFloat(amount),
        method,
        or_number: or_number || null,
        reference_number: gcash_reference || null,
        payment_date: new Date().toISOString(),
        notes: notes || null,
      }])
      .select()
      .single();

    if (payErr) return res.status(500).json({ error: payErr.message });

    // Update invoice status based on payment
    const { data: invoice } = await supabase
      .from('invoices')
      .select('total')
      .eq('id', invoice_id)
      .single();

    const { data: payments } = await supabase
      .from('payments')
      .select('amount')
      .eq('invoice_id', invoice_id);

    const totalPaid = (payments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const newStatus = totalPaid >= parseFloat(invoice.total) ? 'paid' : 'partial';

    await supabase
      .from('invoices')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', invoice_id);

    // Log audit
    await supabase.from('audit_log').insert([{
      clinic_id,
      entity_type: 'payment',
      entity_id: payment.id,
      action: 'payment_received',
      details: `Payment of ${fmt(amount)} received via ${method}`,
    }]);

    res.json({ success: true, payment, newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/payments - List payments
router.get('/payments', async (req, res) => {
  try {
    const clinicId = req.query.clinic_id;
    if (!clinicId) return res.status(400).json({ error: 'Missing clinic_id' });

    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        patient:patient_id (id, name),
        invoice:invoice_id (invoice_number, total)
      `)
      .eq('clinic_id', clinicId)
      .order('payment_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================================================================
// FINANCIAL REPORTS: Aging Analysis, Collections Rate, Revenue
// ====================================================================

// GET /api/billing/reports/aging - Aging analysis (overdue buckets)
router.get('/reports/aging', async (req, res) => {
  try {
    const clinicId = req.query.clinic_id;
    if (!clinicId) return res.status(400).json({ error: 'Missing clinic_id' });

    const today = new Date();

    // Get unpaid invoices (status filtering happens in JS because stored
    // statuses are capitalized — 'Paid'/'Unpaid' — and .neq is case-sensitive)
    const { data: allInvoices } = await supabase
      .from('invoices')
      .select('id, total, due_date, invoice_date, invoice_number, status')
      .eq('clinic_id', clinicId)
      .order('due_date');

    const invoices = (allInvoices || []).filter(inv => {
      const status = String(inv.status || '').toLowerCase();
      return status !== 'paid' && status !== 'cancelled';
    });

    // Get payments for each invoice
    const { data: payments } = await supabase
      .from('payments')
      .select('invoice_id, amount')
      .eq('clinic_id', clinicId);

    // Bucket invoices by age
    const aging = {
      current: [],
      '1-30': [],
      '31-60': [],
      '61-90': [],
      '90+': [],
    };

    for (const inv of invoices || []) {
      const totalPaid = (payments || [])
        .filter(p => p.invoice_id === inv.id)
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      const balanceDue = parseFloat(inv.total) - totalPaid;
      if (balanceDue <= 0) continue;

      // Reference date: due date if set, else invoice date. Invoices with no
      // dates at all are treated as current (never falsely bucketed as 90+).
      const refDateStr = inv.due_date || inv.invoice_date;
      if (!refDateStr) { aging.current.push(inv); continue; }
      const dueDate = new Date(refDateStr);
      const daysPast = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

      if (daysPast <= 0) aging.current.push(inv);
      else if (daysPast <= 30) aging['1-30'].push(inv);
      else if (daysPast <= 60) aging['31-60'].push(inv);
      else if (daysPast <= 90) aging['61-90'].push(inv);
      else aging['90+'].push(inv);
    }

    res.json(aging);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/reports/collections - Collections rate & metrics
router.get('/reports/collections', async (req, res) => {
  try {
    const clinicId = req.query.clinic_id;
    if (!clinicId) return res.status(400).json({ error: 'Missing clinic_id' });

    // Total invoices (cancelled filtered in JS — statuses are capitalized)
    const { data: allInvoices } = await supabase
      .from('invoices')
      .select('id, total, status')
      .eq('clinic_id', clinicId);

    const invoices = (allInvoices || []).filter(
      inv => String(inv.status || '').toLowerCase() !== 'cancelled'
    );

    // Total payments
    const { data: payments } = await supabase
      .from('payments')
      .select('amount')
      .eq('clinic_id', clinicId);

    const totalBilled = (invoices || []).reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);
    const totalCollected = (payments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const outstandingAmount = totalBilled - totalCollected;
    const collectionsRate = totalBilled > 0 ? (totalCollected / totalBilled * 100).toFixed(1) : 0;

    res.json({
      totalBilled: fmt(totalBilled),
      totalCollected: fmt(totalCollected),
      outstandingAmount: fmt(outstandingAmount),
      collectionsRate: `${collectionsRate}%`,
      invoiceCount: invoices?.length || 0,
      paymentCount: payments?.length || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================================================================
// TAX MANAGEMENT: Get rates, Calculate tax, Export tax report
// ====================================================================

// GET /api/billing/tax-rates - List tax rates for clinic
router.get('/tax-rates', async (req, res) => {
  try {
    const clinicId = req.query.clinic_id;
    if (!clinicId) return res.status(400).json({ error: 'Missing clinic_id' });

    const { data, error } = await supabase
      .from('tax_rates')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .order('tax_code');

    if (error) return res.status(500).json({ error: error.message });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/tax-rates - Create or update tax rate
router.post('/tax-rates', async (req, res) => {
  try {
    const { clinic_id, tax_code, tax_name, rate, effective_from } = req.body;

    if (!clinic_id || !tax_code || !tax_name || rate === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('tax_rates')
      .upsert([{
        clinic_id,
        tax_code,
        tax_name,
        rate: parseFloat(rate),
        is_active: true,
        effective_from: effective_from || new Date().toISOString().slice(0, 10),
      }], { onConflict: 'clinic_id,tax_code' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ success: true, taxRate: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
