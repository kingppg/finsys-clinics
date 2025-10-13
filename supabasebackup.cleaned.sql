-- Cleaned for Supabase import. 
-- Only public schema, tables, sequences, triggers, constraints, indexes, and data.

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- --- FUNCTIONS ---
CREATE FUNCTION public.set_sent_on_date() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.sent_on_date := NEW.sent_on::date;
  RETURN NEW;
END;
$$;

-- --- TABLES ---
CREATE TABLE public.appointment_reminders (
    id integer NOT NULL,
    appointment_id integer NOT NULL,
    sent_on timestamp with time zone DEFAULT now(),
    days_ahead integer NOT NULL,
    messenger_id character varying(50) NOT NULL,
    message text NOT NULL,
    sent_on_date date,
    is_manual boolean DEFAULT false,
    clinic_id integer NOT NULL
);

CREATE TABLE public.appointments (
    id integer NOT NULL,
    patient_id integer,
    dentist_id integer,
    appointment_time timestamp with time zone NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    status character varying(20) DEFAULT 'Scheduled'::character varying NOT NULL,
    guardian_messenger_id character varying,
    booking_origin character varying(50),
    reminder_enabled boolean DEFAULT true,
    reminder_days integer[] DEFAULT ARRAY[3, 2, 1, 0],
    reminder_message text,
    reminder_recipient_type character varying(10) DEFAULT 'patient'::character varying,
    clinic_id integer NOT NULL
);

CREATE TABLE public.clinics (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    address text,
    contact_email character varying(255),
    contact_phone character varying(50),
    fb_page_id character varying(255),
    fb_page_access_token text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    messenger_page_id character varying(32),
    reminder_time time without time zone,
    is_active boolean DEFAULT true
);

CREATE TABLE public.dentist_availability (
    id integer NOT NULL,
    dentist_id integer,
    day_of_week integer,
    specific_date date,
    start_time time without time zone,
    end_time time without time zone,
    is_available boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    clinic_id integer NOT NULL
);

CREATE TABLE public.dentists (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    phone character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true NOT NULL,
    clinic_id integer NOT NULL
);

CREATE TABLE public.invoices (
    id integer NOT NULL,
    patient_id integer,
    total numeric(12,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    clinic_id integer NOT NULL
);

CREATE TABLE public.patients (
    id integer NOT NULL,
    name character varying(100),
    email character varying(100),
    phone character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    messenger_id character varying,
    clinic_id integer NOT NULL
);

CREATE TABLE public.payments (
    id integer NOT NULL,
    patient_id integer,
    invoice_id integer,
    amount numeric(12,2) NOT NULL,
    payment_date timestamp without time zone DEFAULT now(),
    method character varying(32) NOT NULL,
    reference_number character varying(64),
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    clinic_id integer NOT NULL
);

CREATE TABLE public.procedure_categories (
    id integer NOT NULL,
    clinic_id integer NOT NULL,
    name character varying(128) NOT NULL
);

CREATE TABLE public.procedures (
    id integer NOT NULL,
    clinic_id integer NOT NULL,
    category_id integer NOT NULL,
    name character varying(128) NOT NULL,
    price numeric(12,2) DEFAULT NULL::numeric
);

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password character varying(100) NOT NULL,
    role character varying(20) DEFAULT 'admin'::character varying,
    clinic_id integer
);

-- --- SEQUENCES ---
CREATE SEQUENCE public.appointment_reminders_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE public.appointments_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE public.clinics_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE public.dentist_availability_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE public.dentists_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE public.invoices_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE public.patients_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE public.payments_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE public.procedure_categories_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE public.procedures_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE public.users_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

-- --- SEQUENCE OWNERS ---
ALTER SEQUENCE public.appointment_reminders_id_seq OWNED BY public.appointment_reminders.id;
ALTER SEQUENCE public.appointments_id_seq OWNED BY public.appointments.id;
ALTER SEQUENCE public.clinics_id_seq OWNED BY public.clinics.id;
ALTER SEQUENCE public.dentist_availability_id_seq OWNED BY public.dentist_availability.id;
ALTER SEQUENCE public.dentists_id_seq OWNED BY public.dentists.id;
ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;
ALTER SEQUENCE public.patients_id_seq OWNED BY public.patients.id;
ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;
ALTER SEQUENCE public.procedure_categories_id_seq OWNED BY public.procedure_categories.id;
ALTER SEQUENCE public.procedures_id_seq OWNED BY public.procedures.id;
ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

-- --- DEFAULTS ---
ALTER TABLE ONLY public.appointment_reminders ALTER COLUMN id SET DEFAULT nextval('public.appointment_reminders_id_seq'::regclass);
ALTER TABLE ONLY public.appointments ALTER COLUMN id SET DEFAULT nextval('public.appointments_id_seq'::regclass);
ALTER TABLE ONLY public.clinics ALTER COLUMN id SET DEFAULT nextval('public.clinics_id_seq'::regclass);
ALTER TABLE ONLY public.dentist_availability ALTER COLUMN id SET DEFAULT nextval('public.dentist_availability_id_seq'::regclass);
ALTER TABLE ONLY public.dentists ALTER COLUMN id SET DEFAULT nextval('public.dentists_id_seq'::regclass);
ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);
ALTER TABLE ONLY public.patients ALTER COLUMN id SET DEFAULT nextval('public.patients_id_seq'::regclass);
ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);
ALTER TABLE ONLY public.procedure_categories ALTER COLUMN id SET DEFAULT nextval('public.procedure_categories_id_seq'::regclass);
ALTER TABLE ONLY public.procedures ALTER COLUMN id SET DEFAULT nextval('public.procedures_id_seq'::regclass);
ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

-- --- DATA ---
-- If you use psql CLI, COPY ... FROM stdin works. If using Query Tool, you may need to convert to INSERT statements.

-- Copy blocks here for each table (appointment_reminders, appointments, clinics, dentist_availability, dentists, invoices, patients, payments, procedure_categories, procedures, users)
-- For brevity, not repeating all here, but you should use all your COPY ... FROM stdin ... \. blocks from your original file.

-- --- SEQUENCE VALUES ---
SELECT pg_catalog.setval('public.appointment_reminders_id_seq', 1206, true);
SELECT pg_catalog.setval('public.appointments_id_seq', 183, true);
SELECT pg_catalog.setval('public.clinics_id_seq', 7, true);
SELECT pg_catalog.setval('public.dentist_availability_id_seq', 85, true);
SELECT pg_catalog.setval('public.dentists_id_seq', 16, true);
SELECT pg_catalog.setval('public.invoices_id_seq', 4, true);
SELECT pg_catalog.setval('public.patients_id_seq', 92, true);
SELECT pg_catalog.setval('public.payments_id_seq', 4, true);
SELECT pg_catalog.setval('public.procedure_categories_id_seq', 7, true);
SELECT pg_catalog.setval('public.procedures_id_seq', 38, true);
SELECT pg_catalog.setval('public.users_id_seq', 2, true);

-- --- CONSTRAINTS ---
ALTER TABLE ONLY public.appointment_reminders ADD CONSTRAINT appointment_reminders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.clinics ADD CONSTRAINT clinics_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.dentist_availability ADD CONSTRAINT dentist_availability_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.dentists ADD CONSTRAINT dentists_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.patients ADD CONSTRAINT patients_messenger_id_key UNIQUE (messenger_id);
ALTER TABLE ONLY public.patients ADD CONSTRAINT patients_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.procedure_categories ADD CONSTRAINT procedure_categories_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.procedures ADD CONSTRAINT procedures_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.appointments ADD CONSTRAINT unique_dentist_timeslot UNIQUE (dentist_id, appointment_time);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_username_key UNIQUE (username);

-- --- INDEXES ---
CREATE UNIQUE INDEX appointment_reminders_unique_auto ON public.appointment_reminders USING btree (appointment_id, days_ahead, messenger_id, sent_on_date) WHERE (is_manual = false);
CREATE INDEX idx_appointment_reminders_appointment_id ON public.appointment_reminders USING btree (appointment_id);
CREATE INDEX idx_dentist_avail_day_of_week ON public.dentist_availability USING btree (day_of_week);
CREATE INDEX idx_dentist_avail_dentist_id ON public.dentist_availability USING btree (dentist_id);
CREATE INDEX idx_dentist_avail_specific_date ON public.dentist_availability USING btree (specific_date);

-- --- TRIGGERS ---
CREATE TRIGGER appointment_reminders_set_sent_on_date BEFORE INSERT OR UPDATE ON public.appointment_reminders FOR EACH ROW EXECUTE FUNCTION public.set_sent_on_date();

-- --- FOREIGN KEYS ---
ALTER TABLE ONLY public.appointment_reminders ADD CONSTRAINT appointment_reminders_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.appointment_reminders ADD CONSTRAINT fk_appointment_reminders_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_dentist_id_fkey FOREIGN KEY (dentist_id) REFERENCES public.dentists(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.appointments ADD CONSTRAINT fk_appointments_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);
ALTER TABLE ONLY public.dentist_availability ADD CONSTRAINT dentist_availability_dentist_id_fkey FOREIGN KEY (dentist_id) REFERENCES public.dentists(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dentist_availability ADD CONSTRAINT fk_dentist_availability_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);
ALTER TABLE ONLY public.dentists ADD CONSTRAINT fk_dentists_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);
ALTER TABLE ONLY public.invoices ADD CONSTRAINT fk_invoices_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.patients ADD CONSTRAINT fk_patients_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);
ALTER TABLE ONLY public.payments ADD CONSTRAINT fk_payments_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);
ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.procedure_categories ADD CONSTRAINT procedure_categories_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.procedures ADD CONSTRAINT procedures_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.procedure_categories(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.procedures ADD CONSTRAINT procedures_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.users ADD CONSTRAINT users_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);

-- END OF FILE