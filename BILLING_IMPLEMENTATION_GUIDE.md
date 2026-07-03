# Billing System Implementation Guide
## Phase 1 + Phase 2: 8-Week MVP to Production

**Status:** Implementation Started  
**Date:** 2026-07-03  
**Team:** 2 Backend + 2 Frontend Developers  
**Budget:** $42k-80k  
**Timeline:** 8 weeks

---

## 📁 FILES CREATED

### Backend
- `backend/db/migrations/001_billing_schema.sql` — Database tables (invoice_items, payment_plans, tax_rates, audit_log)
- `backend/routes/billing.js` — REST API endpoints (invoices, payments, reports)

### Frontend
- `frontend/src/components/BillsPaymentEnhanced.jsx` — React component (manual GCash recording)
- `frontend/src/components/BillsPaymentEnhanced.css` — Styles for billing UI

### Documentation
- `BILLING_SYSTEM_SPEC.md` — Complete 38-page technical specification (in scratchpad)
- `BILLING_IMPLEMENTATION_GUIDE.md` — This file

---

## 🚀 QUICK START (This Week)

### 1. Backend Setup (2 hours)

```bash
# Navigate to project
cd /path/to/dental-clinic-system

# Step 1: Run database migrations
# Copy the SQL from backend/db/migrations/001_billing_schema.sql
# Paste into Supabase SQL editor and execute

# Step 2: Install dependencies (if needed)
npm install

# Step 3: Update backend/index.js to include billing routes
```

**In `backend/index.js`, add after other route imports:**
```javascript
const billingRoutes = require('./routes/billing');
app.use('/api/billing', billingRoutes);
```

### 2. Frontend Setup (1 hour)

```bash
# The component is ready to use
# Update frontend sidebar to use new component:
```

**In `frontend/src/App.jsx` or your routing file:**
```javascript
import BillsPaymentEnhanced from './components/BillsPaymentEnhanced';

// In your route definitions:
<Route path="/billing" element={<BillsPaymentEnhanced />} />
```

### 3. Test Locally (1 hour)

```bash
# Terminal 1: Start backend
cd backend && npm run dev

# Terminal 2: Start frontend
cd frontend && npm start

# Browser: Navigate to http://localhost:3000/billing
# Try creating an invoice and recording a manual GCash payment
```

---

## 📅 WEEK-BY-WEEK BREAKDOWN

### Week 1: Database + API Foundation
**Dev Focus:** Backend integration  
**Deliverables:**
- [ ] Database schema migrated to Supabase
- [ ] Billing routes integrated into Express server
- [ ] Test POST /api/billing/invoices (create)
- [ ] Test POST /api/billing/payments (record payment)
- [ ] Test GET /api/billing/invoices (list)
- [ ] Test GET /api/billing/reports/aging
- [ ] Test GET /api/billing/reports/collections

**Testing Checklist:**
```bash
# Create test invoice
curl -X POST http://localhost:5000/api/billing/invoices \
  -H "Content-Type: application/json" \
  -d '{"clinic_id":1,"patient_id":1,"due_date":"2026-08-03"}'

# Record payment
curl -X POST http://localhost:5000/api/billing/payments \
  -H "Content-Type: application/json" \
  -d '{"invoice_id":1,"clinic_id":1,"amount":1000,"method":"gcash","gcash_reference":"GC123456"}'

# Get invoices
curl http://localhost:5000/api/billing/invoices?clinic_id=1

# Get aging report
curl http://localhost:5000/api/billing/reports/aging?clinic_id=1

# Get collections report
curl http://localhost:5000/api/billing/reports/collections?clinic_id=1
```

---

### Weeks 2-4: Frontend Integration + MVP Testing

**Dev Focus:** Frontend developer builds UI, integrate with backend  
**Deliverables:**
- [ ] BillsPaymentEnhanced component displays invoices
- [ ] Create invoice button works
- [ ] Record payment form submits correctly
- [ ] Payment status updates invoice (draft → partial → paid)
- [ ] Aging analysis chart displays correctly
- [ ] Collections metrics widget displays stats
- [ ] Overdue invoices highlighted in red
- [ ] End-to-end test: Create → Pay → Reconcile

**Manual Test Script:**
1. Go to /billing
2. Click "Create Invoice"
3. Select patient, set amount, set due date
4. Click "Create"
5. Click "Record Payment" on invoice
6. Select GCash, enter amount, add GC reference
7. Click "Record Payment"
8. Verify invoice status changes to "Partial" or "Paid"
9. Check Aging Analysis tab
10. Check Collections tab for updated metrics

**Styling Checklist:**
- [ ] Tables are readable and styled
- [ ] Modals are centered and functional
- [ ] Tabs switch content correctly
- [ ] Status badges color-coded (draft/sent/partial/paid/overdue)
- [ ] Responsive on mobile

**Phase 1 Complete When:**
- ✅ All backend tests pass
- ✅ Frontend creates invoices without errors
- ✅ Payments record and auto-reconcile
- ✅ Reports calculate correctly
- ✅ Staff can record GCash payments manually

---

### Weeks 5-8: Phase 2 (Automation + Intelligence)

This guide covers Phase 1. Phase 2 adds:
- Payment plans (installments)
- Automated reminders (email/SMS/Messenger)
- Financial dashboards (charts, trends)
- Tax calculation UI
- Customer portal

*(Phase 2 implementation guide coming after Phase 1 MVP stabilizes)*

---

## 🧪 TESTING STRATEGY

### Unit Tests (Backend)

```javascript
// tests/billing.test.js
describe('Billing API', () => {
  it('should create invoice with auto-generated number', async () => {
    const res = await POST('/api/billing/invoices', {
      clinic_id: 1,
      patient_id: 1,
      due_date: '2026-08-03'
    });
    expect(res.invoice.invoice_number).toMatch(/INV-2026-\d{3}/);
  });

  it('should record payment and update invoice status', async () => {
    const inv = await POST('/api/billing/invoices', {...});
    const pay = await POST('/api/billing/payments', {
      invoice_id: inv.id,
      clinic_id: 1,
      amount: inv.total,
      method: 'gcash'
    });
    expect(pay.newStatus).toBe('paid');
  });

  it('should calculate aging buckets correctly', async () => {
    const aging = await GET('/api/billing/reports/aging?clinic_id=1');
    expect(aging.current).toBeDefined();
    expect(aging['1-30']).toBeDefined();
  });
});
```

### Integration Tests (End-to-End)

```javascript
// tests/billing-e2e.test.js
describe('Full Booking to Payment Flow', () => {
  it('should complete invoice lifecycle', async () => {
    // 1. Create invoice
    const invoice = await createInvoice();
    
    // 2. Add line item
    await addLineItem(invoice.id, {
      description: 'Cleaning',
      quantity: 1,
      unit_price: 2000
    });
    
    // 3. Record payment
    await recordPayment(invoice.id, {
      amount: 2000,
      method: 'gcash',
      gcash_reference: 'GC123'
    });
    
    // 4. Verify status
    const updated = await getInvoice(invoice.id);
    expect(updated.status).toBe('paid');
  });
});
```

---

## 📊 GO-LIVE CHECKLIST (Week 8)

### Pre-Deployment (Week 7 Friday)

Database & Security
- [ ] Backup Supabase database
- [ ] Verify RLS policies on invoice_items, payment_plans, audit_log
- [ ] Test clinic_id isolation (clinic 1 can't see clinic 2 data)
- [ ] Verify sensitive fields are not exposed in API responses

Backend API
- [ ] All endpoints tested with curl/Postman
- [ ] Stripe/GCash integration scaffolded (even if not enabled)
- [ ] Error responses consistent (400/404/500)
- [ ] Rate limiting configured (optional but recommended)

Frontend
- [ ] Component renders without console errors
- [ ] Mobile responsive tested (320px minimum)
- [ ] Form validation works (required fields, number formats)
- [ ] Currency formatting matches clinic settings
- [ ] No broken images/icons

Staff Training
- [ ] Create training guide (1-2 pages)
- [ ] 1-hour walkthrough with clinic staff
- [ ] Test with real sample data
- [ ] Document GCash payment reference format

### Deployment Day (Week 8 Monday)

```bash
# 1. Database
# Run migrations in Supabase

# 2. Backend (auto-deploys to Render on git push)
git add backend/routes/billing.js backend/db/migrations/
git commit -m "feat: billing system Phase 1 MVP"
git push origin main

# 3. Frontend (auto-deploys to Vercel on git push)
git add frontend/src/components/BillsPaymentEnhanced*
git commit -m "feat: enhanced billing UI with GCash recording"
git push origin main

# 4. Smoke Tests
# Test create invoice → record payment → verify status updates
# Check no console errors
# Verify clinic can see only their own invoices
```

### Post-Deployment Monitoring (Week 8)

- [ ] Monitor backend logs for errors (first 24 hours)
- [ ] Check webhook/API call latencies
- [ ] Verify invoices are creating with correct numbering
- [ ] Verify payments are recording and reconciling
- [ ] Have staff confirm they can use the system

### Rollback Plan (If Issues)

```bash
# Option 1: Revert commit (safest)
git revert HEAD

# Option 2: Disable billing route temporarily
# In backend/index.js, comment out:
# app.use('/api/billing', billingRoutes);

# Option 3: Restore database backup
# Contact Supabase support
```

---

## 📞 SUPPORT DURING ROLLOUT

**First 48 hours:** Backend dev on-call for API issues  
**Week 1:** Weekly debrief with clinic staff  
**Ongoing:** Monitor collections metrics weekly

---

## 🔄 AFTER PHASE 1

Once MVP is stable (Week 8+):

1. **Gather feedback** from staff (1-2 weeks)
2. **Plan Phase 2** features based on priority
3. **Start Phase 2** development (payment plans, automation, dashboards)

**Estimated Phase 2 start:** Mid-September 2026

---

## 📝 NOTES

- **GCash Integration:** Currently manual (staff records). API integration comes in Phase 3.
- **Tax Calculation:** VAT rates are configurable per clinic via `/api/billing/tax-rates`
- **Audit Trail:** All financial actions logged in `audit_log` table for compliance
- **Currency:** Respects clinic's currency setting (PHP, USD, etc.)

---

**Questions?** See BILLING_SYSTEM_SPEC.md (38 pages, in scratchpad) for complete technical details.
