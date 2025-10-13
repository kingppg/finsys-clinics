--
-- PostgreSQL database cluster dump
--

-- Started on 2025-09-29 23:47:37

\restrict VuwNewmH1xC3ghijyhc8M6H4JjgakvsiFcbZ8vnPtCD3geFfNZ65RTQbfpJxF2Q

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE postgres;
ALTER ROLE postgres WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:ApA5j1jj/ti2tvddfeWQPw==$OSKnsv9BFfyNG8RDjutW+1yoTMoG0EAxuM4oHifhGL4=:HObO7TR4YkqRJCyYz/2V+CKcBZz95nIwZOehW+utYgg=';

--
-- User Configurations
--








\unrestrict VuwNewmH1xC3ghijyhc8M6H4JjgakvsiFcbZ8vnPtCD3geFfNZ65RTQbfpJxF2Q

--
-- Databases
--

--
-- Database "template1" dump
--

\connect template1

--
-- PostgreSQL database dump
--

\restrict vWYbeyxNvLWGPswAiAsv37YHaLRiQyPANlsTPQnnj0cYQPoIQbdzQsdVGy23niX

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

-- Started on 2025-09-29 23:47:38

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Completed on 2025-09-29 23:47:38

--
-- PostgreSQL database dump complete
--

\unrestrict vWYbeyxNvLWGPswAiAsv37YHaLRiQyPANlsTPQnnj0cYQPoIQbdzQsdVGy23niX

--
-- Database "dental_clinic" dump
--

--
-- PostgreSQL database dump
--

\restrict TQ8fX3RRYOkdv3C6rJKl5aljR5t87vmLHEGK1tUQLGluHDPVF34hsEseelhGUJM

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

-- Started on 2025-09-29 23:47:38

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 5049 (class 1262 OID 16552)
-- Name: dental_clinic; Type: DATABASE; Schema: -; Owner: postgres
--

CREATE DATABASE dental_clinic WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'English_Philippines.1252';


ALTER DATABASE dental_clinic OWNER TO postgres;

\unrestrict TQ8fX3RRYOkdv3C6rJKl5aljR5t87vmLHEGK1tUQLGluHDPVF34hsEseelhGUJM
\connect dental_clinic
\restrict TQ8fX3RRYOkdv3C6rJKl5aljR5t87vmLHEGK1tUQLGluHDPVF34hsEseelhGUJM

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 5050 (class 0 OID 0)
-- Dependencies: 5049
-- Name: DATABASE dental_clinic; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON DATABASE dental_clinic IS 'Doc Alon App';


--
-- TOC entry 239 (class 1255 OID 41244)
-- Name: set_sent_on_date(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_sent_on_date() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.sent_on_date := NEW.sent_on::date;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_sent_on_date() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 226 (class 1259 OID 33024)
-- Name: appointment_reminders; Type: TABLE; Schema: public; Owner: postgres
--

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


ALTER TABLE public.appointment_reminders OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 33023)
-- Name: appointment_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.appointment_reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.appointment_reminders_id_seq OWNER TO postgres;

--
-- TOC entry 5051 (class 0 OID 0)
-- Dependencies: 225
-- Name: appointment_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.appointment_reminders_id_seq OWNED BY public.appointment_reminders.id;


--
-- TOC entry 222 (class 1259 OID 16570)
-- Name: appointments; Type: TABLE; Schema: public; Owner: postgres
--

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


ALTER TABLE public.appointments OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16569)
-- Name: appointments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.appointments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.appointments_id_seq OWNER TO postgres;

--
-- TOC entry 5052 (class 0 OID 0)
-- Dependencies: 221
-- Name: appointments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.appointments_id_seq OWNED BY public.appointments.id;


--
-- TOC entry 232 (class 1259 OID 41312)
-- Name: clinics; Type: TABLE; Schema: public; Owner: postgres
--

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


ALTER TABLE public.clinics OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 41311)
-- Name: clinics_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.clinics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clinics_id_seq OWNER TO postgres;

--
-- TOC entry 5053 (class 0 OID 0)
-- Dependencies: 231
-- Name: clinics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.clinics_id_seq OWNED BY public.clinics.id;


--
-- TOC entry 224 (class 1259 OID 16604)
-- Name: dentist_availability; Type: TABLE; Schema: public; Owner: postgres
--

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


ALTER TABLE public.dentist_availability OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16603)
-- Name: dentist_availability_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dentist_availability_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dentist_availability_id_seq OWNER TO postgres;

--
-- TOC entry 5054 (class 0 OID 0)
-- Dependencies: 223
-- Name: dentist_availability_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dentist_availability_id_seq OWNED BY public.dentist_availability.id;


--
-- TOC entry 220 (class 1259 OID 16562)
-- Name: dentists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dentists (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    phone character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true NOT NULL,
    clinic_id integer NOT NULL
);


ALTER TABLE public.dentists OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16561)
-- Name: dentists_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dentists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dentists_id_seq OWNER TO postgres;

--
-- TOC entry 5055 (class 0 OID 0)
-- Dependencies: 219
-- Name: dentists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dentists_id_seq OWNED BY public.dentists.id;


--
-- TOC entry 228 (class 1259 OID 41274)
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    patient_id integer,
    total numeric(12,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    clinic_id integer NOT NULL
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 41273)
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoices_id_seq OWNER TO postgres;

--
-- TOC entry 5056 (class 0 OID 0)
-- Dependencies: 227
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- TOC entry 218 (class 1259 OID 16554)
-- Name: patients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patients (
    id integer NOT NULL,
    name character varying(100),
    email character varying(100),
    phone character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    messenger_id character varying,
    clinic_id integer NOT NULL
);


ALTER TABLE public.patients OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 16553)
-- Name: patients_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.patients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patients_id_seq OWNER TO postgres;

--
-- TOC entry 5057 (class 0 OID 0)
-- Dependencies: 217
-- Name: patients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.patients_id_seq OWNED BY public.patients.id;


--
-- TOC entry 230 (class 1259 OID 41287)
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

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


ALTER TABLE public.payments OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 41286)
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO postgres;

--
-- TOC entry 5058 (class 0 OID 0)
-- Dependencies: 229
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- TOC entry 236 (class 1259 OID 41378)
-- Name: procedure_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.procedure_categories (
    id integer NOT NULL,
    clinic_id integer NOT NULL,
    name character varying(128) NOT NULL
);


ALTER TABLE public.procedure_categories OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 41377)
-- Name: procedure_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.procedure_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.procedure_categories_id_seq OWNER TO postgres;

--
-- TOC entry 5059 (class 0 OID 0)
-- Dependencies: 235
-- Name: procedure_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.procedure_categories_id_seq OWNED BY public.procedure_categories.id;


--
-- TOC entry 238 (class 1259 OID 41390)
-- Name: procedures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.procedures (
    id integer NOT NULL,
    clinic_id integer NOT NULL,
    category_id integer NOT NULL,
    name character varying(128) NOT NULL,
    price numeric(12,2) DEFAULT NULL::numeric
);


ALTER TABLE public.procedures OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 41389)
-- Name: procedures_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.procedures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.procedures_id_seq OWNER TO postgres;

--
-- TOC entry 5060 (class 0 OID 0)
-- Dependencies: 237
-- Name: procedures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.procedures_id_seq OWNED BY public.procedures.id;


--
-- TOC entry 234 (class 1259 OID 41358)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password character varying(100) NOT NULL,
    role character varying(20) DEFAULT 'admin'::character varying,
    clinic_id integer
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 41357)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- TOC entry 5061 (class 0 OID 0)
-- Dependencies: 233
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 4807 (class 2604 OID 33027)
-- Name: appointment_reminders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointment_reminders ALTER COLUMN id SET DEFAULT nextval('public.appointment_reminders_id_seq'::regclass);


--
-- TOC entry 4798 (class 2604 OID 16573)
-- Name: appointments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments ALTER COLUMN id SET DEFAULT nextval('public.appointments_id_seq'::regclass);


--
-- TOC entry 4816 (class 2604 OID 41315)
-- Name: clinics id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinics ALTER COLUMN id SET DEFAULT nextval('public.clinics_id_seq'::regclass);


--
-- TOC entry 4804 (class 2604 OID 16607)
-- Name: dentist_availability id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dentist_availability ALTER COLUMN id SET DEFAULT nextval('public.dentist_availability_id_seq'::regclass);


--
-- TOC entry 4795 (class 2604 OID 16565)
-- Name: dentists id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dentists ALTER COLUMN id SET DEFAULT nextval('public.dentists_id_seq'::regclass);


--
-- TOC entry 4810 (class 2604 OID 41277)
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- TOC entry 4793 (class 2604 OID 16557)
-- Name: patients id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patients ALTER COLUMN id SET DEFAULT nextval('public.patients_id_seq'::regclass);


--
-- TOC entry 4812 (class 2604 OID 41290)
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- TOC entry 4822 (class 2604 OID 41381)
-- Name: procedure_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.procedure_categories ALTER COLUMN id SET DEFAULT nextval('public.procedure_categories_id_seq'::regclass);


--
-- TOC entry 4823 (class 2604 OID 41393)
-- Name: procedures id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.procedures ALTER COLUMN id SET DEFAULT nextval('public.procedures_id_seq'::regclass);


--
-- TOC entry 4820 (class 2604 OID 41361)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 5031 (class 0 OID 33024)
-- Dependencies: 226
-- Data for Name: appointment_reminders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appointment_reminders (id, appointment_id, sent_on, days_ahead, messenger_id, message, sent_on_date, is_manual, clinic_id) FROM stdin;
952	101	2025-09-24 16:42:22.424353+08	1	24574878648869064	Hello Fermina Tamayo, this is a reminder for your dental clinic appointment on September 24, 2025 at 04:40 PM.	2025-09-24	f	1
1038	87	2025-09-26 09:00:01.370324+08	1	24574878648869064	Hello Angelina Gutierrez, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:00 PM.\n\nSee you soon!	2025-09-26	f	1
1039	91	2025-09-26 09:00:01.949254+08	3	24574878648869064	Hello Fernando Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:00 AM.\n\nSee you soon!	2025-09-26	f	1
1040	93	2025-09-26 09:00:02.552342+08	3	24574878648869064	Hello Ysmael Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:20 AM.\n\nSee you soon!	2025-09-26	f	1
1041	77	2025-09-26 09:00:03.132483+08	1	24574878648869064	Hello Ferdy Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:20 PM.\n\nSee you soon!	2025-09-26	f	1
1042	78	2025-09-26 09:00:03.806871+08	1	24574878648869064	Hello Skyler Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:40 PM.\n\nSee you soon!	2025-09-26	f	1
1043	115	2025-09-26 09:00:04.557533+08	0	24574878648869064	Hello Peter Limbauan, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:20 AM.\n\nSee you soon!	2025-09-26	f	1
1044	116	2025-09-26 09:00:05.110199+08	0	24574878648869064	Hello Shem Limbaun, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:40 AM.\n\nSee you soon!	2025-09-26	f	1
1045	80	2025-09-26 09:00:05.698347+08	1	24574878648869064	Hello Andrew Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 02:00 PM.\n\nSee you soon!	2025-09-26	f	1
1046	120	2025-09-26 09:00:06.380601+08	0	24574878648869064	Hello Ronald Calbario, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:40 AM.\n\nSee you soon!	2025-09-26	f	1
1047	128	2025-09-26 09:00:07.477726+08	0	24574878648869064	Hello Lea Gutierrez, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:20 AM.\n\nSee you soon!	2025-09-26	f	1
1048	134	2025-09-26 09:00:08.128174+08	0	24574878648869064	Hello Brixx Mera, this is a reminder for your dental clinic appointment on September 26, 2025 at 05:40 PM.\n\nSee you soon!	2025-09-26	f	1
1050	129	2025-09-26 09:00:09.43727+08	0	24574878648869064	Hello JM Mediavillo, this is a reminder for your dental clinic appointment on September 26, 2025 at 10:00 AM.\n\nSee you soon!	2025-09-26	f	1
1051	123	2025-09-26 09:00:10.013234+08	3	24574878648869064	Hello Herber David, this is a reminder for your dental clinic appointment on September 29, 2025 at 05:40 PM.\n\nSee you soon!	2025-09-26	f	1
1052	144	2025-09-26 09:00:10.558281+08	0	24574878648869064	Hello Jabez Limbauan, this is a reminder for your dental clinic appointment on September 26, 2025 at 05:20 PM.\n\nSee you soon!	2025-09-26	f	1
1053	92	2025-09-26 09:00:11.164324+08	3	24574878648869064	Hello Edemar Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:20 AM.\n\nSee you soon!	2025-09-26	f	1
1096	146	2025-09-26 16:53:59.730287+08	1	24574878648869064	Hello Andres Tamayo, this is a reminder for your dental clinic appointment on September 26, 2025 at 05:00 PM.	2025-09-26	t	1
1107	87	2025-09-27 11:35:01.492463+08	0	24574878648869064	Hello Angelina Gutierrez, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:00 PM.\n\nSee you soon!	2025-09-27	f	1
1108	91	2025-09-27 11:35:02.249918+08	2	24574878648869064	Hello Fernando Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:00 AM.\n\nSee you soon!	2025-09-27	f	1
1109	93	2025-09-27 11:35:02.814906+08	2	24574878648869064	Hello Ysmael Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:20 AM.\n\nSee you soon!	2025-09-27	f	1
1110	77	2025-09-27 11:35:03.482569+08	0	24574878648869064	Hello Ferdy Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:20 PM.\n\nSee you soon!	2025-09-27	f	1
1111	78	2025-09-27 11:35:04.972929+08	0	24574878648869064	Hello Skyler Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:40 PM.\n\nSee you soon!	2025-09-27	f	1
1112	80	2025-09-27 11:35:05.617502+08	0	24574878648869064	Hello Andrew Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 02:00 PM.\n\nSee you soon!	2025-09-27	f	1
1113	143	2025-09-27 11:35:06.196749+08	3	24574878648869064	Hello Peter Limbauan, this is a reminder for your dental clinic appointment on September 30, 2025 at 09:00 AM.\n\nSee you soon!	2025-09-27	f	1
1114	123	2025-09-27 11:35:06.754846+08	2	24574878648869064	Hello Herber David, this is a reminder for your dental clinic appointment on September 29, 2025 at 05:40 PM.\n\nSee you soon!	2025-09-27	f	1
1115	92	2025-09-27 11:35:07.424303+08	2	24574878648869064	Hello Edemar Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:20 AM.\n\nSee you soon!	2025-09-27	f	1
1116	148	2025-09-27 11:35:08.086327+08	3	24574878648869064	Hello Paul Gutierrez, this is a reminder for your dental clinic appointment on September 30, 2025 at 05:40 PM.\n\nSee you soon!	2025-09-27	f	1
1117	156	2025-09-27 11:35:08.66422+08	3	24574878648869064	Hello Angelina Jolie, this is a reminder for your dental clinic appointment on September 30, 2025 at 05:20 PM.\n\nSee you soon!	2025-09-27	f	1
1155	92	2025-09-27 23:02:02.204979+08	2	24574878648869064	hello po sir Edemar, May schedule po kayo	2025-09-27	t	1
1166	144	2025-09-29 13:55:23.918044+08	1	24574878648869064	manual	2025-09-29	t	1
1097	146	2025-09-26 16:54:10.602581+08	1	24574878648869064	Hello Andres Tamayo, this is a reminder for your dental clinic appointment on September 26, 2025 at 05:00 PM.	2025-09-26	t	1
1121	113	2025-09-27 12:05:01.184613+08	0	24574878648869064	Hello Lea Gutierrez, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:20 PM.\n\nSee you soon!	2025-09-27	f	1
1122	89	2025-09-27 12:05:02.357358+08	0	24574878648869064	Hello Mark Villareal, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:40 PM.\n\nSee you soon!	2025-09-27	f	1
1156	155	2025-09-27 23:07:27.295925+08	1	24574878648869064	Hello Paul Gutierrez, this is a reminder for your dental clinic appointment on September 27, 2025 at 05:40 PM.	2025-09-27	t	1
1167	172	2025-09-29 13:58:30.685673+08	1	24574878648869064	Hello Andrew Tamayo, this is a reminder for your dental clinic appointment on September 30, 2025 at 04:40 PM.	2025-09-29	t	1
955	100	2025-09-24 16:42:44.655026+08	1	24574878648869064	Hello Mario Flores, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:00 PM.	2025-09-24	f	1
1098	146	2025-09-26 16:54:32.185991+08	1	24574878648869064	Tay Andy may schedule po kayo today.	2025-09-26	t	1
1161	155	2025-09-28 00:05:44.434211+08	1	24574878648869064	Hello Paul Gutierrez, this is a reminder for your dental clinic appointment on September 27, 2025 at 05:40 PM.	2025-09-28	t	1
1169	155	2025-09-29 13:59:43.946078+08	1	24574878648869064	manual reminder ito	2025-09-29	t	1
957	99	2025-09-24 16:43:11.243099+08	1	24574878648869064	Hello Jansen Pangilinan, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:20 PM.	2025-09-24	f	1
970	144	2025-09-24 23:54:00.870126+08	2	24574878648869064	Hello Jabez Limbauan, this is a reminder for your dental clinic appointment on September 26, 2025 at 05:20 PM.\n\nSee you soon!	2025-09-24	f	1
1101	128	2025-09-26 17:22:32.464787+08	1	24574878648869064	Sweety Pie.	2025-09-26	t	1
1162	88	2025-09-28 00:06:15.970942+08	1	24574878648869064	Thank you po	2025-09-28	t	1
1170	167	2025-09-29 14:00:00.489318+08	1	24947014438257546	Hello Kalel Hicks, this is a reminder for your dental clinic appointment on September 30, 2025 at 09:00 AM.\n\nSee you soon!	2025-09-29	f	2
1171	123	2025-09-29 14:00:00.730657+08	0	24574878648869064	Hello Herber David, this is a reminder for your dental clinic appointment on September 29, 2025 at 05:40 PM.\n\nSee you soon!	2025-09-29	f	1
1172	171	2025-09-29 14:00:01.27392+08	1	24574878648869064	Hello Ferdy Tamayo, this is a reminder for your dental clinic appointment on September 30, 2025 at 05:00 PM.\n\nSee you soon!	2025-09-29	f	1
1173	173	2025-09-29 14:00:01.52365+08	2	24947014438257546	Hello Anakin Lighthouse, this is a reminder for your dental clinic appointment on October 1, 2025 at 05:40 PM.\n\nSee you soon!	2025-09-29	f	2
1174	148	2025-09-29 14:00:01.926692+08	1	24574878648869064	Hello Paul Gutierrez, this is a reminder for your dental clinic appointment on September 30, 2025 at 05:40 PM.\n\nSee you soon!	2025-09-29	f	1
1175	156	2025-09-29 14:00:02.480774+08	1	24574878648869064	Hello Angelina Jolie, this is a reminder for your dental clinic appointment on September 30, 2025 at 05:20 PM.\n\nSee you soon!	2025-09-29	f	1
1176	143	2025-09-29 14:00:02.989008+08	1	24574878648869064	Hello Peter Limbauan, this is a reminder for your dental clinic appointment on September 30, 2025 at 09:00 AM.\n\nSee you soon!	2025-09-29	f	1
1177	172	2025-09-29 14:00:03.719272+08	1	24574878648869064	Hello Andrew Tamayo, this is a reminder for your dental clinic appointment on September 30, 2025 at 04:40 PM.\n\nSee you soon!	2025-09-29	f	1
1178	175	2025-09-29 14:00:04.852826+08	1	24574878648869064	Hello John Corpuz, this is a reminder for your dental clinic appointment on September 30, 2025 at 04:20 PM.\n\nSee you soon!	2025-09-29	f	1
932	128	2025-09-24 15:59:00.714364+08	2	24574878648869064	Hello Lea Gutierrez, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:20 AM.\n\nSee you soon!	2025-09-24	f	1
973	87	2025-09-25 00:00:02.238312+08	2	24574878648869064	Hello Angelina Gutierrez, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:00 PM.\n\nSee you soon!	2025-09-25	f	1
974	89	2025-09-25 00:00:03.855624+08	2	24574878648869064	Hello Gina Padilla, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:40 PM.\n\nSee you soon!	2025-09-25	f	1
975	77	2025-09-25 00:00:04.508569+08	2	24574878648869064	Hello Ferdy Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:20 PM.\n\nSee you soon!	2025-09-25	f	1
976	78	2025-09-25 00:00:05.157358+08	2	24574878648869064	Hello Skyler Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:40 PM.\n\nSee you soon!	2025-09-25	f	1
977	115	2025-09-25 00:00:05.778618+08	1	24574878648869064	Hello Peter Limbauan, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:20 AM.\n\nSee you soon!	2025-09-25	f	1
978	116	2025-09-25 00:00:06.434832+08	1	24574878648869064	Hello Shem Limbaun, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:40 AM.\n\nSee you soon!	2025-09-25	f	1
979	79	2025-09-25 00:00:07.1118+08	1	24574878648869064	Hello Jaja Tamayo, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:00 AM.\n\nSee you soon!	2025-09-25	f	1
980	80	2025-09-25 00:00:07.795754+08	2	24574878648869064	Hello Andrew Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 02:00 PM.\n\nSee you soon!	2025-09-25	f	1
981	120	2025-09-25 00:00:08.43236+08	1	24574878648869064	Hello Ronald Calbario, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:40 AM.\n\nSee you soon!	2025-09-25	f	1
982	128	2025-09-25 00:00:09.077848+08	1	24574878648869064	Hello Lea Gutierrez, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:20 AM.\n\nSee you soon!	2025-09-25	f	1
983	129	2025-09-25 00:00:09.651741+08	1	24574878648869064	Hello JM Mediavillo, this is a reminder for your dental clinic appointment on September 26, 2025 at 10:00 AM.\n\nSee you soon!	2025-09-25	f	1
984	134	2025-09-25 00:00:10.312672+08	1	24574878648869064	Hello Brixx Mera, this is a reminder for your dental clinic appointment on September 26, 2025 at 05:40 PM.\n\nSee you soon!	2025-09-25	f	1
1102	156	2025-09-26 21:13:07.97123+08	4	24574878648869064	Hello Angelina Jolie, this is a reminder for your dental clinic appointment on September 30, 2025 at 05:20 PM.	2025-09-26	t	1
1179	173	2025-09-29 14:09:31.384745+08	2	24947014438257546	Hello Anakin Lighthouse, this is a reminder for your dental clinic appointment on October 1, 2025 at 05:40 PM.	2025-09-29	t	2
933	129	2025-09-24 16:01:00.71354+08	2	24574878648869064	Hello JM Mediavillo, this is a reminder for your dental clinic appointment on September 26, 2025 at 10:00 AM.\n\nSee you soon!	2025-09-24	f	1
1009	128	2025-09-25 10:01:49.572373+08	1	24574878648869064	Hello Lea Gutierrez, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:20 AM.	2025-09-25	t	1
1103	156	2025-09-26 21:13:34.231531+08	4	24574878648869064	Hi, this is a reminder from your clinic	2025-09-26	t	1
1180	170	2025-09-29 14:10:04.154188+08	11	24947014438257546	Hello Anakin Lighthouse, this is a reminder for your dental clinic appointment on October 10, 2025 at 05:40 PM.	2025-09-29	t	2
1010	116	2025-09-25 10:02:27.027831+08	1	24574878648869064	SHEM May schedule ka bukas	2025-09-25	t	1
1127	155	2025-09-27 16:27:00.840826+08	1	24574878648869064	Hello Paul Gutierrez, this is a reminder for your dental clinic appointment on September 27, 2025 at 05:40 PM.	2025-09-27	t	1
1181	176	2025-09-29 14:12:26.505381+08	1	24947014438257546	Hello Anakin Lighthouse, this is a reminder for your dental clinic appointment on September 29, 2025 at 05:40 PM.	2025-09-29	t	2
1011	116	2025-09-25 10:03:06.592458+08	1	24574878648869064	SHEM May schedule ka bukas	2025-09-25	t	1
1012	116	2025-09-25 10:03:15.03167+08	1	24574878648869064	Hello Shem Limbaun, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:40 AM.	2025-09-25	t	1
1128	155	2025-09-27 16:27:14.042808+08	1	24574878648869064	Hello Paul Gutierrez, this is a reminder for your dental clinic appointment on September 27, 2025 at 05:40 PM.	2025-09-27	t	1
1182	167	2025-09-29 14:12:40.015209+08	1	24947014438257546	Hello Kalel Hicks, this is a reminder for your dental clinic appointment on September 30, 2025 at 09:00 AM.	2025-09-29	t	2
1183	173	2025-09-29 14:12:56.229013+08	2	24947014438257546	Hello Anakin Lighthouse, this is a reminder for your dental clinic appointment on October 1, 2025 at 05:40 PM.	2025-09-29	t	2
936	98	2025-09-24 16:36:51.006195+08	1	24574878648869064	Hello Bryan Villanueva, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:40 PM.	2025-09-24	f	1
1013	116	2025-09-25 10:08:43.503556+08	1	24574878648869064	Hello Shem Limbaun, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:40 AM.	2025-09-25	t	1
1129	156	2025-09-27 18:23:24.516345+08	3	24574878648869064	Hello Angelina Jolie, this is a reminder for your dental clinic appointment on September 30, 2025 at 05:20 PM.	2025-09-27	t	1
1184	170	2025-09-29 14:13:07.179761+08	11	24947014438257546	Hello Anakin Lighthouse, this is a reminder for your dental clinic appointment on October 10, 2025 at 05:40 PM.	2025-09-29	t	2
963	134	2025-09-24 17:11:00.748462+08	2	24574878648869064	Hello Brixx Mera, this is a reminder for your dental clinic appointment on September 26, 2025 at 05:40 PM.\n\nSee you soon!	2025-09-24	f	1
1014	96	2025-09-25 17:14:12.961623+08	1	24574878648869064	Hello Rain Villareal, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:20 PM.	2025-09-25	t	1
1131	89	2025-09-27 18:34:25.175388+08	1	24574878648869064	Hello Mark Villareal, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:40 PM.	2025-09-27	t	1
1132	89	2025-09-27 18:34:27.986493+08	1	24574878648869064	Hello Mark Villareal, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:40 PM.	2025-09-27	t	1
1185	176	2025-09-29 14:14:10.691332+08	1	24947014438257546	manual	2025-09-29	t	2
1015	38	2025-09-25 17:14:33.446807+08	1	24574878648869064	Hello Efren D. Bautista, this is a reminder for your dental clinic appointment on September 20, 2025 at 09:00 AM.	2025-09-25	t	1
1133	92	2025-09-27 22:27:31.965661+08	2	24574878648869064	Hello Edemar Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:20 AM.	2025-09-27	t	1
1134	92	2025-09-27 22:27:37.067593+08	2	24574878648869064	Hello Edemar Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:20 AM.	2025-09-27	t	1
1186	167	2025-09-29 14:14:17.990953+08	1	24947014438257546	Hello Kalel Hicks, this is a reminder for your dental clinic appointment on September 30, 2025 at 09:00 AM.	2025-09-29	t	2
1016	100	2025-09-25 19:40:15.623787+08	1	24574878648869064	Hello Mario Flores, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:00 PM.	2025-09-25	t	1
1135	92	2025-09-27 22:28:03.928715+08	2	24574878648869064	may appointment ka kuya sa Palodentcare Clinic	2025-09-27	t	1
1187	170	2025-09-29 14:14:32.220115+08	11	24947014438257546	Hello Anakin Lighthouse, this is a reminder for your dental clinic appointment on October 10, 2025 at 05:40 PM.	2025-09-29	t	2
1019	98	2025-09-25 20:43:29.69544+08	1	24574878648869064	Hello Bryan Villanueva, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:40 PM.	2025-09-25	t	1
1136	92	2025-09-27 22:28:44.842349+08	2	24574878648869064	may appointment ka kuya sa Palodentcare Clinic	2025-09-27	t	1
1188	174	2025-09-29 14:15:53.26335+08	2	24947014438257546	manual	2025-09-29	t	2
1021	98	2025-09-25 20:44:58.953453+08	1	24574878648869064	Hello Bryan Villanueva, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:40 PM.	2025-09-25	t	1
1140	172	2025-09-27 22:42:49.935869+08	3	24574878648869064	Hello Andrew Tamayo, this is a reminder for your dental clinic appointment on September 30, 2025 at 04:40 PM.	2025-09-27	t	1
1190	174	2025-09-29 14:20:00.819974+08	2	24947014438257546	Hello Kalel Hicks, this is a reminder for your dental clinic appointment on October 1, 2025 at 05:20 PM.\n\nSee you soon!	2025-09-29	f	2
1191	176	2025-09-29 14:20:01.838365+08	0	24947014438257546	Hello Anakin Lighthouse, this is a reminder for your dental clinic appointment on September 29, 2025 at 05:40 PM.\n\nSee you soon!	2025-09-29	f	2
1022	98	2025-09-25 20:45:12.108147+08	1	24574878648869064	bryan, appointment mo	2025-09-25	t	1
1141	172	2025-09-27 22:43:26.879583+08	3	24574878648869064	Hello Andrew Tamayo, this is a reminder for your dental clinic appointment on September 30, 2025 at 04:40 PM.	2025-09-27	t	1
1192	180	2025-09-29 14:33:00.64192+08	0	24574878648869064	Hello Ayessa Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 02:40 PM.\n\nSee you soon!	2025-09-29	f	1
1195	177	2025-09-29 14:33:01.175702+08	0	24947014438257546	Hello Frederick Joseph, this is a reminder for your dental clinic appointment on September 29, 2025 at 02:40 PM.\n\nSee you soon!	2025-09-29	f	2
1196	179	2025-09-29 14:33:01.739065+08	0	24947014438257546	Hello Bryson Bernal, this is a reminder for your dental clinic appointment on September 29, 2025 at 03:20 PM.\n\nSee you soon!	2025-09-29	f	2
1197	182	2025-09-29 14:33:01.861033+08	0	24574878648869064	Hello Jaja Tamayo, this is a reminder for your dental clinic appointment on September 29, 2025 at 03:20 PM.\n\nSee you soon!	2025-09-29	f	1
943	33	2025-09-24 16:39:01.669922+08	1	24574878648869064	Hello Brixx Mera, this is a reminder for your dental clinic appointment on September 16, 2025 at 09:30 AM.	2025-09-24	f	1
1142	172	2025-09-27 22:44:37.086086+08	3	24574878648869064	Hello Andrew Tamayo, this is a reminder for your dental clinic appointment on September 30, 2025 at 04:40 PM.	2025-09-27	t	1
1193	178	2025-09-29 14:33:00.668552+08	0	24947014438257546	Hello Atlas Hubbard, this is a reminder for your dental clinic appointment on September 29, 2025 at 03:00 PM.\n\nSee you soon!	2025-09-29	f	2
1194	181	2025-09-29 14:33:01.171192+08	0	24574878648869064	Hello Skyler Tamayo, this is a reminder for your dental clinic appointment on September 29, 2025 at 03:00 PM.\n\nSee you soon!	2025-09-29	f	1
944	32	2025-09-24 16:39:18.706738+08	1	24574878648869064	Hello Rene P. Patalay, this is a reminder for your dental clinic appointment on September 16, 2025 at 09:00 AM.	2025-09-24	f	1
1143	172	2025-09-27 22:47:11.20515+08	3	24574878648869064	Hello Andrew Tamayo, this is a reminder for your dental clinic appointment on September 30, 2025 at 04:40 PM.	2025-09-27	t	1
1144	172	2025-09-27 22:47:14.4219+08	3	24574878648869064	Hello Andrew Tamayo, this is a reminder for your dental clinic appointment on September 30, 2025 at 04:40 PM.	2025-09-27	t	1
1198	183	2025-09-29 16:05:55.253265+08	1	24700038466281753	Hello Jojo Tayo, this is a reminder for your dental clinic appointment on September 29, 2025 at 05:40 PM.	2025-09-29	t	2
1145	170	2025-09-27 22:50:34.967938+08	13	24947014438257546	Hello Anakin Lighthouse, this is a reminder for your dental clinic appointment on October 10, 2025 at 05:40 PM.	2025-09-27	t	2
1199	183	2025-09-29 16:06:09.172264+08	1	24700038466281753	May sched ka..	2025-09-29	t	2
1146	167	2025-09-27 22:50:50.572722+08	3	24947014438257546	Hello Kalel Hicks, this is a reminder for your dental clinic appointment on September 30, 2025 at 09:00 AM.	2025-09-27	t	2
1204	123	2025-09-29 20:30:52.033961+08	1	24574878648869064	Pas di po kayo dumating. No Show kayo	2025-09-29	t	1
182	120	2025-09-23 17:49:00.741586+08	3	24574878648869064	Hello Ronald Calbario, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:40 AM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-23	f	1
20	88	2025-09-22 00:56:51.20325+08	5	24574878648869064	Hello Medy Nuqui, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:20 PM.	2025-09-22	f	1
28	89	2025-09-22 12:10:54.866977+08	5	24574878648869064	Hello Gina Padilla, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:40 PM.	2025-09-22	f	1
29	89	2025-09-22 12:11:07.166199+08	4	24574878648869064	Hello Gina Padilla, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:40 PM.	2025-09-22	f	1
1147	170	2025-09-27 22:52:54.344838+08	13	24947014438257546	Hello Anakin Lighthouse, this is a reminder for your dental clinic appointment on October 10, 2025 at 05:40 PM.	2025-09-27	t	2
1206	123	2025-09-29 20:38:55.708756+08	1	24574878648869064	Hello Herber David, this is a reminder for your dental clinic appointment on September 29, 2025 at 05:40 PM.	2025-09-29	t	1
76	92	2025-09-22 13:21:21.851853+08	7	24574878648869064	Hello Edemar Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:20 AM.	2025-09-22	f	1
77	79	2025-09-22 13:21:44.37469+08	4	24574878648869064	Hello Jaja Tamayo, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:00 AM.	2025-09-22	f	1
81	87	2025-09-22 14:34:44.847823+08	5	24574878648869064	Hello Angelina Gutierrez, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:00 PM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-22	f	1
188	87	2025-09-24 00:00:02.023193+08	3	24574878648869064	Hello Angelina Gutierrez, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:00 PM.\n\nSee you soon!	2025-09-24	f	1
189	89	2025-09-24 00:00:02.583485+08	3	24574878648869064	Hello Gina Padilla, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:40 PM.\n\nSee you soon!	2025-09-24	f	1
190	77	2025-09-24 00:00:03.208783+08	3	24574878648869064	Hello Ferdy Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:20 PM.\n\nSee you soon!	2025-09-24	f	1
191	78	2025-09-24 00:00:04.162035+08	3	24574878648869064	Hello Skyler Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 01:40 PM.\n\nSee you soon!	2025-09-24	f	1
100	91	2025-09-22 15:06:20.250649+08	7	24574878648869064	Hello Fernando Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:00 AM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-22	f	1
101	93	2025-09-22 15:06:20.841887+08	7	24574878648869064	Hello Ysmael Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:20 AM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-22	f	1
102	81	2025-09-22 19:04:57.148178+08	5	24574878648869064	Hello Herbert David, this is a reminder for your dental clinic appointment on September 27, 2025 at 05:40 PM.	2025-09-22	f	1
194	122	2025-09-24 00:00:06.692753+08	1	24574878648869064	Hello Femia Rolona, this is a reminder for your dental clinic appointment on September 25, 2025 at 09:00 AM.\n\nSee you soon!	2025-09-24	f	1
195	115	2025-09-24 00:00:08.267016+08	2	24574878648869064	Hello Peter Limbauan, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:20 AM.\n\nSee you soon!	2025-09-24	f	1
196	116	2025-09-24 00:00:09.111373+08	2	24574878648869064	Hello Shem Limbaun, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:40 AM.\n\nSee you soon!	2025-09-24	f	1
197	79	2025-09-24 00:00:09.803254+08	2	24574878648869064	Hello Jaja Tamayo, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:00 AM.\n\nSee you soon!	2025-09-24	f	1
198	80	2025-09-24 00:00:10.39471+08	3	24574878648869064	Hello Andrew Tamayo, this is a reminder for your dental clinic appointment on September 27, 2025 at 02:00 PM.\n\nSee you soon!	2025-09-24	f	1
199	120	2025-09-24 00:00:11.009716+08	2	24574878648869064	Hello Ronald Calbario, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:40 AM.\n\nSee you soon!	2025-09-24	f	1
1148	167	2025-09-27 22:59:05.824527+08	3	24947014438257546	Hello Kalel Hicks, this is a reminder for your dental clinic appointment on September 30, 2025 at 09:00 AM.	2025-09-27	t	2
949	59	2025-09-24 16:41:49.632829+08	1	24574878648869064	Hello Aleathea Gutierrez, this is a reminder for your dental clinic appointment on September 22, 2025 at 11:00 AM.	2025-09-24	f	1
168	79	2025-09-23 14:37:00.801954+08	3	24574878648869064	Hello Jaja Tamayo, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:00 AM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-23	f	1
169	96	2025-09-23 14:37:01.37159+08	1	24574878648869064	Hello Rain Villareal, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:20 PM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-23	f	1
170	97	2025-09-23 14:37:02.057049+08	1	24574878648869064	Hello Rose Villareal, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:00 PM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-23	f	1
171	98	2025-09-23 14:37:02.727926+08	1	24574878648869064	Hello Bryan Villanueva, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:40 PM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-23	f	1
172	99	2025-09-23 14:37:03.355192+08	1	24574878648869064	Hello Jansen Pangilinan, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:20 PM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-23	f	1
173	100	2025-09-23 14:37:03.916163+08	1	24574878648869064	Hello Mario Flores, this is a reminder for your dental clinic appointment on September 24, 2025 at 05:00 PM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-23	f	1
174	101	2025-09-23 14:37:04.439055+08	1	24574878648869064	Hello Fermina Tamayo, this is a reminder for your dental clinic appointment on September 24, 2025 at 04:40 PM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-23	f	1
177	115	2025-09-23 14:37:06.141236+08	3	24574878648869064	Hello Peter Limbauan, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:20 AM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-23	f	1
178	116	2025-09-23 14:37:06.754362+08	3	24574878648869064	Hello Shem Limbaun, this is a reminder for your dental clinic appointment on September 26, 2025 at 09:40 AM.\nIf you have questions or need to reschedule, reply here. See you soon!	2025-09-23	f	1
184	122	2025-09-23 22:52:00.745451+08	2	24574878648869064	Hello Femia Rolona, this is a reminder for your dental clinic appointment on September 25, 2025 at 09:00 AM.\n\nSee you soon!	2025-09-23	f	1
1149	167	2025-09-27 22:59:25.722299+08	3	24947014438257546	hello Kalel	2025-09-27	t	2
1150	173	2025-09-27 22:59:40.117877+08	4	24947014438257546	Hello Anakin Lighthouse, this is a reminder for your dental clinic appointment on October 1, 2025 at 05:40 PM.	2025-09-27	t	2
1151	173	2025-09-27 22:59:49.66724+08	4	24947014438257546	hello Anakin	2025-09-27	t	2
154	113	2025-09-23 14:04:04.916368+08	4	24574878648869064	ate medy schedule mo na po	2025-09-23	f	1
1154	92	2025-09-27 23:01:32.612332+08	2	24574878648869064	Hello Edemar Gutierrez, this is a reminder for your dental clinic appointment on September 29, 2025 at 09:20 AM.	2025-09-27	t	1
\.


--
-- TOC entry 5027 (class 0 OID 16570)
-- Dependencies: 222
-- Data for Name: appointments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appointments (id, patient_id, dentist_id, appointment_time, reason, created_at, status, guardian_messenger_id, booking_origin, reminder_enabled, reminder_days, reminder_message, reminder_recipient_type, clinic_id) FROM stdin;
145	68	3	2025-09-26 17:20:00+08	Messenger Booking	2025-09-25 13:45:31.751621+08	Confirmed	24574878648869064	Messenger Booking	t	{3,2,1}	\N	patient	1
147	70	3	2025-09-26 17:00:00+08	Messenger Booking	2025-09-25 16:07:29.206111+08	Confirmed	24574878648869064	Messenger Booking	t	{3,2,1}	\N	patient	1
83	24	3	2025-09-22 09:20:00+08	Teeth Whitening (Bleaching)	2025-09-20 23:06:02.611353+08	Cancelled	24574878648869064	Messenger booking	t	{3,2,1,0}	\N	patient	1
101	39	2	2025-09-24 16:40:00+08	Cancelled via Messenger	2025-09-22 19:54:25.624171+08	No Show	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
33	5	2	2025-09-16 09:30:00+08	Dental Check-up / Consultation	2025-09-15 17:00:26.957534+08	Completed	\N	\N	t	{3,2,1,0}	\N	patient	1
87	27	3	2025-09-27 13:00:00+08	\N	2025-09-21 21:44:45.666824+08	Confirmed	24574878648869064	Messenger booking	t	{3,2,1,0}		patient	1
151	4	2	2025-09-26 13:00:00+08	Sealants	2025-09-26 11:54:21.964343+08	No Show	24574878648869064	\N	t	{3,2,1}	\N	patient	1
91	30	3	2025-09-29 09:00:00+08	\N	2025-09-21 21:54:29.196802+08	Confirmed	24574878648869064	Messenger booking	t	{3,2,1,0}	\N	patient	1
93	32	3	2025-09-29 09:20:00+08	\N	2025-09-21 22:00:04.386573+08	Confirmed	24574878648869064	Messenger booking	t	{3,2,1,0}	\N	patient	1
96	34	3	2025-09-24 17:20:00+08	Messenger Booking	2025-09-22 19:44:04.228514+08	Completed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
149	2	2	2025-09-26 10:40:00+08	Oral Prophylaxis Cleaning / Dental Scaling & Polishing)	2025-09-26 10:29:43.40706+08	No Show	\N	\N	t	{3,2,1}	\N	patient	1
97	35	3	2025-09-24 17:00:00+08	Messenger Booking	2025-09-22 19:46:03.033652+08	Confirmed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
77	18	3	2025-09-27 13:20:00+08	\N	2025-09-20 20:19:07.949632+08	Confirmed	24574878648869064	Messenger booking	t	{3,2,1,0}	\N	patient	1
81	22	3	2025-09-27 17:40:00+08	\N	2025-09-20 22:52:27.027341+08	Cancelled	24574878648869064	Messenger booking	t	{3,2,1,0}	\N	patient	1
78	19	3	2025-09-27 13:40:00+08	\N	2025-09-20 21:00:07.618799+08	Confirmed	24574878648869064	Messenger booking	t	{3,2,1,0}	\N	patient	1
115	42	3	2025-09-26 09:20:00+08	Messenger Booking	2025-09-23 13:50:01.368097+08	Confirmed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
79	20	3	2025-09-26 09:00:00+08	\N	2025-09-20 21:03:34.176669+08	Confirmed	24574878648869064	Messenger booking	t	{3,2,1,0}	\N	patient	1
80	21	3	2025-09-27 14:00:00+08	\N	2025-09-20 21:39:34.333843+08	Confirmed	24574878648869064	Messenger booking	t	{3,2,1,0}	\N	patient	1
120	47	3	2025-09-26 09:40:00+08	Messenger Booking	2025-09-23 17:48:39.58263+08	Confirmed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
134	5	3	2025-09-26 17:40:00+08	Messenger Booking	2025-09-24 17:10:27.630479+08	Confirmed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
98	36	2	2025-09-24 17:40:00+08	Cancelled via Messenger	2025-09-22 19:49:02.039226+08	Completed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
99	37	2	2025-09-24 17:20:00+08	Cancelled via Messenger	2025-09-22 19:52:02.805737+08	No Show	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
38	2	3	2025-09-20 09:00:00+08	Oral Prophylaxis Cleaning / Dental Scaling & Polishing)	2025-09-17 13:14:03.185839+08	Completed	24574878648869064	\N	t	{3,2,1,0}	\N	patient	1
100	38	2	2025-09-24 17:00:00+08	Cancelled via Messenger	2025-09-22 19:53:14.230756+08	Completed	24574878648869064	Messenger Booking	t	{3,2,1,0,4}		patient	1
59	13	2	2025-09-22 11:00:00+08	Cancelled via Messenger	2025-09-18 23:02:06.003777+08	No Show	24574878648869064	\N	t	{3,2,1,0}	\N	patient	1
32	4	2	2025-09-16 09:00:00+08	Cancelled via Messenger	2025-09-15 16:33:05.187763+08	Completed	24574878648869064	\N	t	{3,2,1,0}	\N	patient	1
85	26	3	2025-09-22 09:40:00+08	\N	2025-09-21 13:43:13.516375+08	No Show	24574878648869064	Messenger booking	t	{3,2,1,0}	\N	patient	1
116	43	2	2025-09-26 09:40:00+08	Messenger Booking	2025-09-23 13:52:39.57297+08	Completed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
122	48	2	2025-09-25 09:00:00+08	Messenger Booking	2025-09-23 22:51:54.004735+08	Completed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
84	25	3	2025-09-22 17:40:00+08	\N	2025-09-21 13:40:20.403221+08	Completed	24574878648869064	Messenger booking	t	{3,2,1,0}	\N	patient	1
171	18	2	2025-09-30 17:00:00+08	Oral Prophylaxis Cleaning / Dental Scaling & Polishing	2025-09-27 22:39:37.651497+08	Confirmed	24574878648869064	\N	t	{3,2,1,0}	\N	patient	1
128	15	2	2025-09-26 09:20:00+08	Teeth Whitening (Bleaching)	2025-09-24 15:57:42.917733+08	No Show	24574878648869064	\N	t	{3,2,1,0}	\N	patient	1
150	3	2	2025-09-26 11:00:00+08	Teeth Whitening (Bleaching)	2025-09-26 10:46:48.18647+08	No Show	\N	\N	t	{3,2,1}	\N	patient	1
129	56	2	2025-09-26 10:00:00+08	Teeth Whitening (Bleaching)	2025-09-24 15:59:25.435729+08	Completed	24574878648869064	\N	t	{3,2,1,0}	\N	patient	1
169	64	2	2025-10-10 17:40:00+08	Messenger Booking	2025-09-27 19:23:02.297013+08	Confirmed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
92	31	2	2025-09-29 09:20:00+08	Cancelled via Messenger	2025-09-21 21:55:39.194466+08	Completed	24574878648869064	Messenger booking	t	{3,2,1,0}	\N	patient	1
113	15	2	2025-09-27 13:20:00+08	Tooth Extraction (Simple / Surgical)	2025-09-22 23:15:58.30665+08	No Show	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
148	64	2	2025-09-30 17:40:00+08	Messenger Booking	2025-09-25 17:09:39.277192+08	Confirmed	24574878648869064	Messenger Booking	t	{3,2,1,4}		patient	1
173	84	14	2025-10-01 17:40:00+08	Messenger Booking	2025-09-27 22:52:35.906473+08	Confirmed	24947014438257546	Messenger Booking	t	{3,2,1,0}	\N	patient	2
144	67	2	2025-09-26 17:20:00+08	Veneers	2025-09-24 23:53:29.122277+08	Completed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
170	84	14	2025-10-10 17:40:00+08	Cancelled via Messenger	2025-09-27 19:24:19.910851+08	Cancelled	24947014438257546	Messenger Booking	t	{3,2,1,0}	\N	patient	2
156	74	2	2025-09-30 17:20:00+08	Messenger Booking	2025-09-26 20:46:10.979863+08	Confirmed	24574878648869064	Messenger Booking	t	{3,2,1}	\N	patient	1
89	23	2	2025-09-27 13:40:00+08	Oral Prophylaxis Cleaning / Dental Scaling & Polishing)	2025-09-21 21:49:30.277017+08	No Show	24574878648869064	Messenger booking	t	{3,2,1,0}		patient	1
168	64	2	2025-10-11 17:40:00+08	Messenger Booking	2025-09-27 19:03:46.164487+08	Confirmed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
163	12	2	2025-09-27 14:20:00+08	Tooth Extraction (Simple / Surgical)	2025-09-27 12:39:52.009567+08	Completed	\N	\N	t	{3,2,1,0}	\N	patient	1
143	42	2	2025-09-30 09:00:00+08	Teeth Whitening (Bleaching)	2025-09-24 23:44:26.152025+08	Scheduled	24574878648869064	\N	t	{3,2,1,0}		patient	1
88	28	2	2025-09-27 14:00:00+08	Cancelled via Messenger	2025-09-21 21:48:03.798363+08	Completed	24574878648869064	Messenger booking	t	{3,2,1,0}		patient	1
146	69	2	2025-09-26 17:00:00+08	Messenger Booking	2025-09-25 15:44:25.392817+08	Completed	24574878648869064	Messenger Booking	t	{3,2,1}	\N	patient	1
172	21	2	2025-09-30 16:40:00+08	Braces (Metal, Ceramic, Invisalign)	2025-09-27 22:40:54.189676+08	Confirmed	24574878648869064	\N	t	{3,2,1,0}	\N	patient	1
162	5	2	2025-09-27 13:00:00+08	Oral Prophylaxis Cleaning / Dental Scaling & Polishing)	2025-09-27 11:56:54.799045+08	No Show	\N	\N	t	{3,2,1}	\N	patient	1
167	83	14	2025-09-30 09:00:00+08	Oral Prophylaxis Cleaning / Dental Scaling & Polishing)	2025-09-27 19:01:34.101685+08	Confirmed	24947014438257546	\N	t	{3,2,1,0}	\N	patient	2
155	64	2	2025-09-27 17:40:00+08	Messenger Booking	2025-09-26 20:38:42.257711+08	Completed	24574878648869064	Messenger Booking	t	{3,2,1}	\N	patient	1
175	85	2	2025-09-30 16:20:00+08	Messenger Booking	2025-09-29 13:57:50.60285+08	Confirmed	24574878648869064	Messenger Booking	t	{3,2,1,0}	\N	patient	1
174	83	14	2025-10-01 17:20:00+08	Oral Prophylaxis Cleaning / Dental Scaling & Polishing	2025-09-28 00:09:42.880924+08	Confirmed	24947014438257546	\N	t	{3,2,1,0}	\N	patient	2
176	84	14	2025-09-29 17:40:00+08	Messenger Booking	2025-09-29 14:11:47.32214+08	Confirmed	24947014438257546	Messenger Booking	t	{3,2,1,0}	\N	patient	2
180	17	2	2025-09-29 14:40:00+08	Oral Prophylaxis Cleaning / Dental Scaling & Polishing	2025-09-29 14:25:06.698268+08	Completed	24574878648869064	\N	t	{3,2,1,0}	\N	patient	1
178	87	14	2025-09-29 15:00:00+08	Dental Check-up / Consultation	2025-09-29 14:24:01.667819+08	Confirmed	24947014438257546	\N	t	{3,2,1,0}	\N	patient	2
179	88	14	2025-09-29 15:20:00+08	Dental Fillings – composite or amalgam	2025-09-29 14:24:17.448523+08	Confirmed	24947014438257546	\N	t	{3,2,1,0}	\N	patient	2
123	3	2	2025-09-29 17:40:00+08	Braces (Metal, Ceramic, Invisalign)	2025-09-23 23:25:49.884035+08	No Show	24574878648869064	\N	t	{3,2,1,0}	\N	patient	1
177	86	14	2025-09-29 14:40:00+08	Sealants	2025-09-29 14:23:46.499338+08	Confirmed	24947014438257546	\N	t	{3,2,1,0}	\N	patient	2
183	92	15	2025-09-29 17:40:00+08	Messenger Booking	2025-09-29 16:05:41.888724+08	Cancelled	24700038466281753	Messenger Booking	t	{3,2,1,0}	\N	patient	2
181	19	2	2025-09-29 15:00:00+08	Oral Prophylaxis Cleaning / Dental Scaling & Polishing	2025-09-29 14:25:21.762335+08	Completed	24574878648869064	\N	t	{3,2,1,0}	\N	patient	1
182	20	2	2025-09-29 15:20:00+08	Oral Prophylaxis Cleaning / Dental Scaling & Polishing	2025-09-29 14:25:34.729131+08	No Show	24574878648869064	\N	t	{3,2,1,0}	\N	patient	1
\.


--
-- TOC entry 5037 (class 0 OID 41312)
-- Dependencies: 232
-- Data for Name: clinics; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clinics (id, name, address, contact_email, contact_phone, fb_page_id, fb_page_access_token, created_at, updated_at, messenger_page_id, reminder_time, is_active) FROM stdin;
1	Palodentcare	Tanauan, Batangas	palocares@yahoo.com	09178087909	1765998033613943	EAAKpxLq4PCABPg3Sqnt4rTOKT2CU8RswYijBcTPhNGZBiAhILzRgYtzM0LDGi3WufEZAik08Hsx5mP5rEC4cemvjeqKumxkhxFF9PGTxmAXNpmY8kebr7A5zC1mSeOVrljdwZAATb36OmCwTh44q8j0ZBLjS5XziuWtFXy3HuGCANLHMYUzjFsM3UxHhy7VOZBtGdc6Aiemf2uApxrjeBDHIZD	2025-09-26 13:57:22.882173	2025-09-29 20:42:15.291071	1765998033613943	09:00:00	t
2	FinSys	Kalawaan, Pasig City	finsys@yahoo.com	09178087909	828886796972070	EAAKpxLq4PCABPnbyHYTGdZC02m0bY0Lj7qN10IIuO3KAVjQY30e4DapYBiOjGyf90vrKYpHXf930GZAsevKCqiMqieOGl5COO9XInoT9xjUD6H2CVTdFpYO1W1gnzA7oweZB8GHWu5oVJNOqG4MyP5u9F6AZBWCVdjIxkTn8tV6uw9XB8upfhQdtgYVDmZAoU83qTXANERKNffbwstgZDZD	2025-09-27 18:49:39.539564	2025-09-29 20:42:41.554909	828886796972070	14:33:00	t
5	Dr. Paul	Kalawaan, Pasig			155970564255657	EAAKpxLq4PCABPgERy4VGihktHWPMZAMJEgdWb343sxGztXuvLWPSyepmuX4GDtssJww73xvqpRZAKZAX5aTi6EntAcZAZCyUTLuasZCcZCCeDeUUGe3ZAAeyA2Hxwl6uBcvbh9vAHIZBg60Uu0u8msIZCch6oNMZCgy0960pA4oW8TNjR9mxJXBGXKKfYifT1Cg9LMVavTOl0LQifgxxkcAmivm	2025-09-29 17:25:03.87045	2025-09-29 21:03:06.528637	155970564255657	03:30:00	t
\.


--
-- TOC entry 5029 (class 0 OID 16604)
-- Dependencies: 224
-- Data for Name: dentist_availability; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dentist_availability (id, dentist_id, day_of_week, specific_date, start_time, end_time, is_available, created_at, clinic_id) FROM stdin;
61	2	\N	2025-09-27	09:00:00	13:00:00	f	2025-09-17 11:14:42.094413	1
64	3	\N	2025-09-20	13:00:00	18:00:00	f	2025-09-17 11:16:24.292252	1
65	3	\N	2025-09-27	09:00:00	13:00:00	f	2025-09-17 11:16:41.175595	1
68	2	\N	2025-09-20	09:00:00	13:00:00	f	2025-09-17 11:47:50.013404	1
69	2	\N	2025-09-20	16:00:00	18:00:00	f	2025-09-17 11:47:50.024035	1
\.


--
-- TOC entry 5025 (class 0 OID 16562)
-- Dependencies: 220
-- Data for Name: dentists; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dentists (id, name, email, phone, created_at, is_active, clinic_id) FROM stdin;
3	Dr. Byen Mayuga	byen@yahoo.com	123456789	2025-09-15 14:26:42.818556+08	f	1
12	Dr. Oner Lacap	oner@yahoo.com	12345678901	2025-09-26 17:18:07.433861+08	f	1
2	Dr. Alon P. Rivera	alon@yahoo.com	123456789	2025-09-15 14:26:15.958021+08	t	1
14	Silas Spencer	no@yahoo.com	12345678901	2025-09-27 18:59:44.055422+08	t	2
15	Dr. Paul Gutierrez	pau@yahoo.com	09178087909	2025-09-29 16:03:04.627529+08	t	2
16	Dra. Lea Gutierrez	no@yahoo.com	09178087909	2025-09-29 16:03:18.312313+08	f	2
\.


--
-- TOC entry 5033 (class 0 OID 41274)
-- Dependencies: 228
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoices (id, patient_id, total, created_at, clinic_id) FROM stdin;
1	2	1000.00	2025-09-25 22:34:45.54052	1
2	64	3000.00	2025-09-25 22:43:20.562967	1
3	5	5000.00	2025-09-25 22:46:31.367478	1
\.


--
-- TOC entry 5023 (class 0 OID 16554)
-- Dependencies: 218
-- Data for Name: patients; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.patients (id, name, email, phone, created_at, messenger_id, clinic_id) FROM stdin;
71	Joey De Leon	\N	12345678901	2025-09-26 16:00:12.393916	\N	1
74	Angelina Jolie	\N	\N	2025-09-26 20:46:10.962291	\N	1
83	Kalel Hicks	\N	12345678901	2025-09-27 19:01:12.086945	\N	2
85	John Corpuz	\N	\N	2025-09-29 13:57:50.591174	\N	1
87	Atlas Hubbard	\N	12345678901	2025-09-29 14:23:13.518222	\N	2
89	Emani Romero	\N	12345678901	2025-09-29 16:03:44.323603	\N	2
91	Shepherd Roth	\N	12345678901	2025-09-29 16:04:09.628958	\N	2
68	Ricky Santos	\N	\N	2025-09-25 13:45:31.739508	\N	1
69	Andres Tamayo	\N	\N	2025-09-25 15:44:25.378106	\N	1
5	Brixx Mera	brixx@yahoo.com	123456789	2025-09-15 13:48:26.429512	\N	1
70	Ruby Tamayo	\N	12345678901	2025-09-25 16:07:29.195492	\N	1
56	JM Mediavillo	\N	123456789	2025-09-24 15:59:02.260417	\N	1
2	Efren D. Bautista	efren@yahoo.com	123456789	2025-09-15 13:47:26.325024	\N	1
4	Rene P. Patalay	rene@yahoo.com	123456789	2025-09-15 13:48:10.614576	\N	1
3	Herber David	herbert@yahoo.com	123456789	2025-09-15 13:47:49.45922	\N	1
12	Yohann Gutierrez	\N	09178087909	2025-09-18 22:54:46.141616	\N	1
13	Aleathea Gutierrez	\N	09178087909	2025-09-18 23:02:05.981559	\N	1
15	Lea Gutierrez	\N	\N	2025-09-20 19:17:08.163541	\N	1
17	Ayessa Gutierrez	\N	\N	2025-09-20 19:23:02.075865	\N	1
18	Ferdy Tamayo	\N	\N	2025-09-20 20:19:07.922935	\N	1
19	Skyler Tamayo	\N	\N	2025-09-20 21:00:07.596719	\N	1
20	Jaja Tamayo	\N	\N	2025-09-20 21:03:34.174434	\N	1
21	Andrew Tamayo	\N	\N	2025-09-20 21:39:34.316846	\N	1
22	Herbert David	\N	\N	2025-09-20 22:22:24.410173	\N	1
23	Mark Villareal	\N	\N	2025-09-20 22:58:16.775526	\N	1
24	Jahren Bautista	\N	\N	2025-09-20 23:06:02.608547	\N	1
25	Kenneth Caoili	\N	\N	2025-09-21 13:40:20.380599	\N	1
26	Eric Valdez	\N	\N	2025-09-21 13:43:13.514355	\N	1
27	Angelina Gutierrez	\N	\N	2025-09-21 21:44:45.653469	\N	1
28	Medy Nuqui	\N	\N	2025-09-21 21:48:03.79534	\N	1
29	Gina Padilla	\N	\N	2025-09-21 21:49:30.274948	\N	1
30	Fernando Gutierrez	\N	\N	2025-09-21 21:54:29.194136	\N	1
31	Edemar Gutierrez	\N	\N	2025-09-21 21:55:39.192861	\N	1
32	Ysmael Gutierrez	\N	\N	2025-09-21 22:00:04.385147	\N	1
33	Evelyn Gutierrez	\N	\N	2025-09-21 22:03:42.753098	\N	1
34	Rain Villareal	\N	\N	2025-09-22 19:44:04.22374	\N	1
35	Rose Villareal	\N	\N	2025-09-22 19:46:03.031699	\N	1
36	Bryan Villanueva	\N	\N	2025-09-22 19:49:02.035893	\N	1
37	Jansen Pangilinan	\N	\N	2025-09-22 19:52:02.804608	\N	1
38	Mario Flores	\N	\N	2025-09-22 19:53:14.225625	\N	1
39	Fermina Tamayo	\N	\N	2025-09-22 19:54:25.618263	\N	1
40	Jairus Rolona	\N	\N	2025-09-22 21:07:27.80333	\N	1
41	Ofelia Limbauan	\N	\N	2025-09-23 13:48:29.185266	\N	1
42	Peter Limbauan	\N	\N	2025-09-23 13:50:01.365556	\N	1
43	Shem Limbaun	\N	\N	2025-09-23 13:52:39.566724	\N	1
47	Ronald Calbario	\N	\N	2025-09-23 17:48:39.566908	\N	1
48	Femia Rolona	\N	\N	2025-09-23 22:51:53.996732	\N	1
67	Jabez Limbauan	\N	\N	2025-09-24 23:53:29.10939	\N	1
64	Paul Gutierrez	\N	09178087909	2025-09-24 22:09:25.471666	24574878648869064	1
72	Vic Sotto	\N	12345678901	2025-09-26 16:01:00.026799	\N	1
84	Anakin Lighthouse	\N	09178087909	2025-09-27 19:24:19.907191	24947014438257546	2
86	Frederick Joseph	\N	12345678901	2025-09-29 14:23:00.998487	\N	2
88	Bryson Bernal	\N	12345678901	2025-09-29 14:23:24.30988	\N	2
90	Izabella Parrish	\N	12345678901	2025-09-29 16:03:58.551706	\N	2
92	Jojo Tayo	\N	\N	2025-09-29 16:05:41.88453	24700038466281753	2
\.


--
-- TOC entry 5035 (class 0 OID 41287)
-- Dependencies: 230
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, patient_id, invoice_id, amount, payment_date, method, reference_number, notes, created_at, updated_at, clinic_id) FROM stdin;
1	2	1	500.00	2025-09-25 22:35:40.072662	cash			2025-09-25 22:35:40.072662	2025-09-25 22:35:40.072662	1
2	5	3	3000.00	2025-09-25 22:47:21.893839	cash			2025-09-25 22:47:21.893839	2025-09-25 22:47:21.893839	1
3	2	1	500.00	2025-09-25 22:54:21.614469	cash			2025-09-25 22:54:21.614469	2025-09-25 22:54:21.614469	1
\.


--
-- TOC entry 5041 (class 0 OID 41378)
-- Dependencies: 236
-- Data for Name: procedure_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.procedure_categories (id, clinic_id, name) FROM stdin;
1	1	Preventive Procedures
2	1	Diagnostic Procedures
3	1	Restorative Procedures
4	2	Preventive Procedures
5	2	Diagnostic Procedures
6	2	Restorative Procedures
7	1	Orthodontic Procedures
\.


--
-- TOC entry 5043 (class 0 OID 41390)
-- Dependencies: 238
-- Data for Name: procedures; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.procedures (id, clinic_id, category_id, name, price) FROM stdin;
37	1	7	Braces (Metal, Ceramic, Invisalign)	40000.00
38	1	7	Retainers	5000.00
1	1	1	Oral Prophylaxis Cleaning / Dental Scaling & Polishing	1500.00
2	1	1	Fluoride Treatment	2500.00
3	1	1	Sealants	3000.00
4	1	2	Dental Check-up / Consultation	1000.00
5	1	2	Dental X-rays – periapical, panoramic, bitewing	500.00
6	1	2	Oral Examination	1500.00
7	1	3	Dental Fillings – composite or amalgam	1500.00
8	1	3	Inlays / Onlays	2500.00
9	1	3	Dental Crowns & Bridges	1500.00
11	2	4	Fluoride Treatment	50.00
10	2	4	Oral Prophylaxis Cleaning / Dental Scaling & Polishing	50.00
12	2	4	Sealants	150.00
13	2	5	Dental Check-up / Consultation	50.00
14	2	5	Dental X-rays – periapical, panoramic, bitewing	150.00
15	2	5	Oral Examination	50.00
16	2	6	Dental Fillings – composite or amalgam	50.00
17	2	6	Inlays / Onlays	150.00
18	2	6	Dental Crowns & Bridges	50.00
\.


--
-- TOC entry 5039 (class 0 OID 41358)
-- Dependencies: 234
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, password, role, clinic_id) FROM stdin;
1	kingppg	admin123	superadmin	1
2	admin	admin123	admin	2
4	paul	admin123	superadmin	5
\.


--
-- TOC entry 5062 (class 0 OID 0)
-- Dependencies: 225
-- Name: appointment_reminders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.appointment_reminders_id_seq', 1206, true);


--
-- TOC entry 5063 (class 0 OID 0)
-- Dependencies: 221
-- Name: appointments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.appointments_id_seq', 183, true);


--
-- TOC entry 5064 (class 0 OID 0)
-- Dependencies: 231
-- Name: clinics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.clinics_id_seq', 7, true);


--
-- TOC entry 5065 (class 0 OID 0)
-- Dependencies: 223
-- Name: dentist_availability_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.dentist_availability_id_seq', 85, true);


--
-- TOC entry 5066 (class 0 OID 0)
-- Dependencies: 219
-- Name: dentists_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.dentists_id_seq', 16, true);


--
-- TOC entry 5067 (class 0 OID 0)
-- Dependencies: 227
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.invoices_id_seq', 4, true);


--
-- TOC entry 5068 (class 0 OID 0)
-- Dependencies: 217
-- Name: patients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.patients_id_seq', 92, true);


--
-- TOC entry 5069 (class 0 OID 0)
-- Dependencies: 229
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payments_id_seq', 4, true);


--
-- TOC entry 5070 (class 0 OID 0)
-- Dependencies: 235
-- Name: procedure_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.procedure_categories_id_seq', 7, true);


--
-- TOC entry 5071 (class 0 OID 0)
-- Dependencies: 237
-- Name: procedures_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.procedures_id_seq', 38, true);


--
-- TOC entry 5072 (class 0 OID 0)
-- Dependencies: 233
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 2, true);


--
-- TOC entry 4841 (class 2606 OID 33032)
-- Name: appointment_reminders appointment_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointment_reminders
    ADD CONSTRAINT appointment_reminders_pkey PRIMARY KEY (id);


--
-- TOC entry 4832 (class 2606 OID 16578)
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- TOC entry 4849 (class 2606 OID 41321)
-- Name: clinics clinics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinics
    ADD CONSTRAINT clinics_pkey PRIMARY KEY (id);


--
-- TOC entry 4836 (class 2606 OID 16611)
-- Name: dentist_availability dentist_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dentist_availability
    ADD CONSTRAINT dentist_availability_pkey PRIMARY KEY (id);


--
-- TOC entry 4830 (class 2606 OID 16568)
-- Name: dentists dentists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dentists
    ADD CONSTRAINT dentists_pkey PRIMARY KEY (id);


--
-- TOC entry 4845 (class 2606 OID 41280)
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- TOC entry 4826 (class 2606 OID 24816)
-- Name: patients patients_messenger_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_messenger_id_key UNIQUE (messenger_id);


--
-- TOC entry 4828 (class 2606 OID 16560)
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- TOC entry 4847 (class 2606 OID 41297)
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- TOC entry 4855 (class 2606 OID 41383)
-- Name: procedure_categories procedure_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.procedure_categories
    ADD CONSTRAINT procedure_categories_pkey PRIMARY KEY (id);


--
-- TOC entry 4857 (class 2606 OID 41395)
-- Name: procedures procedures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.procedures
    ADD CONSTRAINT procedures_pkey PRIMARY KEY (id);


--
-- TOC entry 4834 (class 2606 OID 16590)
-- Name: appointments unique_dentist_timeslot; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT unique_dentist_timeslot UNIQUE (dentist_id, appointment_time);


--
-- TOC entry 4851 (class 2606 OID 41364)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4853 (class 2606 OID 41366)
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- TOC entry 4842 (class 1259 OID 41255)
-- Name: appointment_reminders_unique_auto; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX appointment_reminders_unique_auto ON public.appointment_reminders USING btree (appointment_id, days_ahead, messenger_id, sent_on_date) WHERE (is_manual = false);


--
-- TOC entry 4843 (class 1259 OID 33038)
-- Name: idx_appointment_reminders_appointment_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_appointment_reminders_appointment_id ON public.appointment_reminders USING btree (appointment_id);


--
-- TOC entry 4837 (class 1259 OID 16619)
-- Name: idx_dentist_avail_day_of_week; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dentist_avail_day_of_week ON public.dentist_availability USING btree (day_of_week);


--
-- TOC entry 4838 (class 1259 OID 16617)
-- Name: idx_dentist_avail_dentist_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dentist_avail_dentist_id ON public.dentist_availability USING btree (dentist_id);


--
-- TOC entry 4839 (class 1259 OID 16618)
-- Name: idx_dentist_avail_specific_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dentist_avail_specific_date ON public.dentist_availability USING btree (specific_date);


--
-- TOC entry 4876 (class 2620 OID 41245)
-- Name: appointment_reminders appointment_reminders_set_sent_on_date; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER appointment_reminders_set_sent_on_date BEFORE INSERT OR UPDATE ON public.appointment_reminders FOR EACH ROW EXECUTE FUNCTION public.set_sent_on_date();


--
-- TOC entry 4865 (class 2606 OID 33033)
-- Name: appointment_reminders appointment_reminders_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointment_reminders
    ADD CONSTRAINT appointment_reminders_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- TOC entry 4860 (class 2606 OID 16584)
-- Name: appointments appointments_dentist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_dentist_id_fkey FOREIGN KEY (dentist_id) REFERENCES public.dentists(id) ON DELETE CASCADE;


--
-- TOC entry 4861 (class 2606 OID 16579)
-- Name: appointments appointments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- TOC entry 4863 (class 2606 OID 16612)
-- Name: dentist_availability dentist_availability_dentist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dentist_availability
    ADD CONSTRAINT dentist_availability_dentist_id_fkey FOREIGN KEY (dentist_id) REFERENCES public.dentists(id) ON DELETE CASCADE;


--
-- TOC entry 4866 (class 2606 OID 41347)
-- Name: appointment_reminders fk_appointment_reminders_clinic; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointment_reminders
    ADD CONSTRAINT fk_appointment_reminders_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);


--
-- TOC entry 4862 (class 2606 OID 41342)
-- Name: appointments fk_appointments_clinic; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT fk_appointments_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);


--
-- TOC entry 4864 (class 2606 OID 41322)
-- Name: dentist_availability fk_dentist_availability_clinic; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dentist_availability
    ADD CONSTRAINT fk_dentist_availability_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);


--
-- TOC entry 4859 (class 2606 OID 41332)
-- Name: dentists fk_dentists_clinic; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dentists
    ADD CONSTRAINT fk_dentists_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);


--
-- TOC entry 4867 (class 2606 OID 41337)
-- Name: invoices fk_invoices_clinic; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT fk_invoices_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);


--
-- TOC entry 4858 (class 2606 OID 41327)
-- Name: patients fk_patients_clinic; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT fk_patients_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);


--
-- TOC entry 4869 (class 2606 OID 41352)
-- Name: payments fk_payments_clinic; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT fk_payments_clinic FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);


--
-- TOC entry 4868 (class 2606 OID 41281)
-- Name: invoices invoices_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- TOC entry 4870 (class 2606 OID 41303)
-- Name: payments payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;


--
-- TOC entry 4871 (class 2606 OID 41298)
-- Name: payments payments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- TOC entry 4873 (class 2606 OID 41384)
-- Name: procedure_categories procedure_categories_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.procedure_categories
    ADD CONSTRAINT procedure_categories_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- TOC entry 4874 (class 2606 OID 41401)
-- Name: procedures procedures_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.procedures
    ADD CONSTRAINT procedures_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.procedure_categories(id) ON DELETE CASCADE;


--
-- TOC entry 4875 (class 2606 OID 41396)
-- Name: procedures procedures_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.procedures
    ADD CONSTRAINT procedures_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;


--
-- TOC entry 4872 (class 2606 OID 41367)
-- Name: users users_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);


-- Completed on 2025-09-29 23:47:38

--
-- PostgreSQL database dump complete
--

\unrestrict TQ8fX3RRYOkdv3C6rJKl5aljR5t87vmLHEGK1tUQLGluHDPVF34hsEseelhGUJM

--
-- Database "postgres" dump
--

\connect postgres

--
-- PostgreSQL database dump
--

\restrict WGTVjdfaKLeGril7stbH5PLbd3b2K8dG0f3Ur9PenHO5WnlOUKbGVV0ukWRwrWV

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

-- Started on 2025-09-29 23:47:38

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 7 (class 2615 OID 16388)
-- Name: pgagent; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA pgagent;


ALTER SCHEMA pgagent OWNER TO postgres;

--
-- TOC entry 5002 (class 0 OID 0)
-- Dependencies: 7
-- Name: SCHEMA pgagent; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA pgagent IS 'pgAgent system tables';


--
-- TOC entry 2 (class 3079 OID 16389)
-- Name: pgagent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgagent WITH SCHEMA pgagent;


--
-- TOC entry 5003 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgagent; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgagent IS 'A PostgreSQL job scheduler';


--
-- TOC entry 4780 (class 0 OID 16390)
-- Dependencies: 223
-- Data for Name: pga_jobagent; Type: TABLE DATA; Schema: pgagent; Owner: postgres
--

COPY pgagent.pga_jobagent (jagpid, jaglogintime, jagstation) FROM stdin;
8132	2025-09-28 21:25:46.910804+08	FHL-Laptop
\.


--
-- TOC entry 4781 (class 0 OID 16399)
-- Dependencies: 225
-- Data for Name: pga_jobclass; Type: TABLE DATA; Schema: pgagent; Owner: postgres
--

COPY pgagent.pga_jobclass (jclid, jclname) FROM stdin;
\.


--
-- TOC entry 4782 (class 0 OID 16409)
-- Dependencies: 227
-- Data for Name: pga_job; Type: TABLE DATA; Schema: pgagent; Owner: postgres
--

COPY pgagent.pga_job (jobid, jobjclid, jobname, jobdesc, jobhostagent, jobenabled, jobcreated, jobchanged, jobagentid, jobnextrun, joblastrun) FROM stdin;
\.


--
-- TOC entry 4784 (class 0 OID 16457)
-- Dependencies: 231
-- Data for Name: pga_schedule; Type: TABLE DATA; Schema: pgagent; Owner: postgres
--

COPY pgagent.pga_schedule (jscid, jscjobid, jscname, jscdesc, jscenabled, jscstart, jscend, jscminutes, jschours, jscweekdays, jscmonthdays, jscmonths) FROM stdin;
\.


--
-- TOC entry 4785 (class 0 OID 16485)
-- Dependencies: 233
-- Data for Name: pga_exception; Type: TABLE DATA; Schema: pgagent; Owner: postgres
--

COPY pgagent.pga_exception (jexid, jexscid, jexdate, jextime) FROM stdin;
\.


--
-- TOC entry 4786 (class 0 OID 16499)
-- Dependencies: 235
-- Data for Name: pga_joblog; Type: TABLE DATA; Schema: pgagent; Owner: postgres
--

COPY pgagent.pga_joblog (jlgid, jlgjobid, jlgstatus, jlgstart, jlgduration) FROM stdin;
\.


--
-- TOC entry 4783 (class 0 OID 16433)
-- Dependencies: 229
-- Data for Name: pga_jobstep; Type: TABLE DATA; Schema: pgagent; Owner: postgres
--

COPY pgagent.pga_jobstep (jstid, jstjobid, jstname, jstdesc, jstenabled, jstkind, jstcode, jstconnstr, jstdbname, jstonerror, jscnextrun) FROM stdin;
\.


--
-- TOC entry 4787 (class 0 OID 16515)
-- Dependencies: 237
-- Data for Name: pga_jobsteplog; Type: TABLE DATA; Schema: pgagent; Owner: postgres
--

COPY pgagent.pga_jobsteplog (jslid, jsljlgid, jsljstid, jslstatus, jslresult, jslstart, jslduration, jsloutput) FROM stdin;
\.


-- Completed on 2025-09-29 23:47:38

--
-- PostgreSQL database dump complete
--

\unrestrict WGTVjdfaKLeGril7stbH5PLbd3b2K8dG0f3Ur9PenHO5WnlOUKbGVV0ukWRwrWV

-- Completed on 2025-09-29 23:47:38

--
-- PostgreSQL database cluster dump complete
--

