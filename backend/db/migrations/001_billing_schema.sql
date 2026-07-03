-- ====================================================================
-- BILLING SYSTEM SCHEMA MIGRATION
-- Phase 1 + Phase 2: Invoice Management, Payments, Plans, Tax, Audit
-- ====================================================================

-- 1. invoice_items table (line-level breakdown)
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL,
    procedure_id INTEGER,
    description VARCHAR(256) NOT NULL,
    quantity NUMERIC(10, 2) DEFAULT 1.00,
    unit_price NUMERIC(12, 2) NOT NULL,
    subtotal NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    discount_type VARCHAR(20), -- 'percentage', 'fixed', NULL
    discount_value NUMERIC(12, 2),
    discount_amount NUMERIC(12, 2) GENERATED ALWAYS AS (
        CASE
            WHEN discount_type = 'percentage' THEN subtotal * (discount_value / 100)
            WHEN discount_type = 'fixed' THEN discount_value
            ELSE 0
        END
    ) STORED,
    line_total NUMERIC(12, 2) GENERATED ALWAYS AS (subtotal - discount_amount) STORED,
    tax_code VARCHAR(20), -- e.g., 'VAT_12', 'VAT_0', 'EXEMPT'
    tax_rate_id INTEGER,
    applied_tax_rate NUMERIC(5, 2),
    tax_amount NUMERIC(12, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    clinic_id INTEGER NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (procedure_id) REFERENCES public.procedures(id),
    FOREIGN KEY (tax_rate_id) REFERENCES public.tax_rates(id),
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_clinic_id ON public.invoice_items(clinic_id);

-- ====================================================================
-- 2. payment_plans table (installments)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.payment_plans (
    id BIGSERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    clinic_id INTEGER NOT NULL,
    plan_name VARCHAR(100) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    down_payment NUMERIC(12, 2) DEFAULT 0.00,
    remaining_amount NUMERIC(12, 2) GENERATED ALWAYS AS (total_amount - down_payment) STORED,
    num_installments INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'cancelled', 'defaulted'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    frequency VARCHAR(20) DEFAULT 'monthly', -- 'weekly', 'biweekly', 'monthly'
    day_of_cycle INTEGER,
    allow_early_payment BOOLEAN DEFAULT TRUE,
    early_payment_discount_type VARCHAR(20),
    early_payment_discount_value NUMERIC(12, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_user_id INTEGER,
    FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE RESTRICT,
    FOREIGN KEY (patient_id) REFERENCES public.patients(id),
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id),
    FOREIGN KEY (created_by_user_id) REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_invoice_id ON public.payment_plans(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_patient_id ON public.payment_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_clinic_id ON public.payment_plans(clinic_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_status ON public.payment_plans(status);

-- ====================================================================
-- 3. payment_plan_installments table (individual due dates)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.payment_plan_installments (
    id BIGSERIAL PRIMARY KEY,
    payment_plan_id BIGINT NOT NULL,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    due_amount NUMERIC(12, 2) NOT NULL,
    paid_amount NUMERIC(12, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'overdue', 'failed', 'waived'
    paid_date TIMESTAMPTZ,
    payment_id INTEGER,
    reminder_sent_date TIMESTAMPTZ,
    reminder_count INTEGER DEFAULT 0,
    failure_reason VARCHAR(256),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (payment_plan_id) REFERENCES public.payment_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_id) REFERENCES public.payments(id)
);

CREATE INDEX IF NOT EXISTS idx_installments_payment_plan_id ON public.payment_plan_installments(payment_plan_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON public.payment_plan_installments(due_date);
CREATE INDEX IF NOT EXISTS idx_installments_status ON public.payment_plan_installments(status);

-- ====================================================================
-- 4. tax_rates table (clinic-specific tax configuration)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.tax_rates (
    id BIGSERIAL PRIMARY KEY,
    clinic_id INTEGER NOT NULL,
    tax_code VARCHAR(20) NOT NULL,
    tax_name VARCHAR(100) NOT NULL,
    rate NUMERIC(5, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    effective_from DATE NOT NULL,
    effective_to DATE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id),
    UNIQUE(clinic_id, tax_code, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_clinic_id ON public.tax_rates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_tax_rates_effective_from ON public.tax_rates(effective_from);

-- ====================================================================
-- 5. audit_log table (financial transaction history)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
    id BIGSERIAL PRIMARY KEY,
    clinic_id INTEGER NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'invoice', 'payment', 'payment_plan', 'invoice_item'
    entity_id BIGINT NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'deleted', 'payment_received', 'reminder_sent'
    user_id INTEGER,
    actor_type VARCHAR(20) DEFAULT 'user',
    customer_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id),
    FOREIGN KEY (user_id) REFERENCES public.users(id),
    FOREIGN KEY (customer_id) REFERENCES public.patients(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_clinic_entity ON public.audit_log(clinic_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at);

-- ====================================================================
-- 6. Enhance invoices table (if not already enhanced)
-- ====================================================================
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50) UNIQUE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS adjusted_amount NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS gcash_reference VARCHAR(100);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS gcash_amount NUMERIC(12, 2);

-- ====================================================================
-- 7. Enhance payments table (if not already enhanced)
-- ====================================================================
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS or_number VARCHAR(50);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS gcash_reference VARCHAR(100);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

-- ====================================================================
-- 8. Default tax rates for Philippines (12% VAT)
-- ====================================================================
INSERT INTO public.tax_rates (clinic_id, tax_code, tax_name, rate, is_active, effective_from, description)
SELECT
    clinics.id,
    'VAT_12',
    'VAT (12%)',
    12.00,
    TRUE,
    CURRENT_DATE,
    'Standard VAT for professional dental services in Philippines'
FROM public.clinics
WHERE NOT EXISTS (
    SELECT 1 FROM public.tax_rates WHERE clinic_id = clinics.id AND tax_code = 'VAT_12'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.tax_rates (clinic_id, tax_code, tax_name, rate, is_active, effective_from, description)
SELECT
    clinics.id,
    'VAT_0',
    'VAT Exempt',
    0.00,
    TRUE,
    CURRENT_DATE,
    'VAT exempt items (if applicable)'
FROM public.clinics
WHERE NOT EXISTS (
    SELECT 1 FROM public.tax_rates WHERE clinic_id = clinics.id AND tax_code = 'VAT_0'
)
ON CONFLICT DO NOTHING;

-- ====================================================================
-- End migration
-- ====================================================================
