import { supabase } from '../supabaseClient';

// Builds request headers carrying the staff member's Supabase Auth JWT.
// Backend write/send endpoints (reminders, status notifications, SMS config)
// verify this token via middleware/requireAuth.js — requests without it get 401.
export async function authHeaders(extra = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
