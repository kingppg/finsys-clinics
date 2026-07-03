-- ============================================================================
-- 002_messenger_sessions.sql — persistent Messenger conversation state
-- ----------------------------------------------------------------------------
-- The webhook's booking state machine used to live only in process memory
-- (`let userStates = {}`), so every Render deploy/restart orphaned patients
-- mid-booking. This table makes sessions survive restarts and multi-instance.
-- Run this in the Supabase SQL editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.messenger_sessions (
    clinic_id INTEGER NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    psid TEXT NOT NULL,                          -- Facebook page-scoped user id
    state TEXT NOT NULL DEFAULT 'default',       -- state machine node
    data JSONB NOT NULL DEFAULT '{}'::jsonb,     -- flow data (date, slots, names…)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clinic_id, psid)
);

-- Cleanup queries purge by age
CREATE INDEX IF NOT EXISTS idx_messenger_sessions_updated_at
    ON public.messenger_sessions(updated_at);

-- Lock the table down: RLS on with NO policies means the public anon key gets
-- nothing. The backend's service-role key bypasses RLS and is the only reader/
-- writer. Bot sessions contain patient names/phones — never expose them.
ALTER TABLE public.messenger_sessions ENABLE ROW LEVEL SECURITY;
