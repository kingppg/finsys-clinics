// Edge Function: delete-user (testfunc2) v4-final
// Purpose: Delete a Supabase Auth user AND custom users table record by user_id (UUID).
// Requirements (Project Secrets):
//   SERVICE_ROLE_KEY = <service role JWT key starting with eyJ...>
//   PROJECT_REF      = <your project ref, e.g. kjdouaccurnbbvqtzxva>
// Optional (auto-derived if absent):
//   SUPABASE_URL     = https://<PROJECT_REF>.supabase.co
//
// CORS: Fully open (adjust Access-Control-Allow-Origin if you want to restrict).
//
// CHANGELOG v4-final:
// - Also deletes user from custom "users" table (Postgres) after Auth deletion.
// - All v3-final improvements retained.
// - DB delete errors are logged and included in response.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface DeletePayload {
  user_id?: string;
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      ...extraHeaders,
    },
  });
}

Deno.serve(async (req: Request) => {
  const rid = crypto.randomUUID();
  const start = Date.now();
  console.log(`[testfunc2][${rid}] START method=${req.method} url=${req.url}`);

  // Preflight
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true, preflight: true, version: "v4-final" });
  }

  if (req.method !== "POST") {
    console.log(`[testfunc2][${rid}] Invalid method=${req.method}`);
    return jsonResponse(
      { error: "Method not allowed", version: "v4-final" },
      405,
    );
  }

  // Read raw first for diagnostics
  let raw = "";
  try {
    raw = await req.text();
  } catch (e) {
    console.log(
      `[testfunc2][${rid}] Failed reading body: ${(e as Error).message}`,
    );
    return jsonResponse(
      { error: "Cannot read request body", version: "v4-final" },
      400,
    );
  }

  console.log(
    `[testfunc2][${rid}] RAW="${raw}" rawLength=${raw.length} ct=${req.headers.get("content-type")}`,
  );

  if (!raw.trim()) {
    console.log(`[testfunc2][${rid}] Empty body`);
    return jsonResponse(
      { error: "Empty body", version: "v4-final" },
      400,
    );
  }

  let parsed: DeletePayload;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.log(
      `[testfunc2][${rid}] JSON parse error: ${(e as Error).message}`,
    );
    return jsonResponse(
      { error: "Invalid JSON body", version: "v4-final" },
      400,
    );
  }

  const user_id = parsed.user_id;
  console.log(`[testfunc2][${rid}] Parsed user_id=${user_id}`);

  if (!user_id || typeof user_id !== "string") {
    return jsonResponse(
      { error: "Missing or invalid user_id", version: "v4-final" },
      400,
    );
  }

  // Basic UUID style pattern (not ultra strict)
  if (!/^[0-9a-fA-F-]{32,36}$/.test(user_id)) {
    return jsonResponse(
      { error: "Invalid user_id format", version: "v4-final" },
      400,
    );
  }

  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  const projectRef = Deno.env.get("PROJECT_REF");
  let supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    if (!projectRef) {
      console.log(`[testfunc2][${rid}] Missing PROJECT_REF + SUPABASE_URL`);
      return jsonResponse(
        { error: "Server misconfigured (no PROJECT_REF/SUPABASE_URL)", version: "v4-final" },
        500,
      );
    }
    supabaseUrl = `https://${projectRef}.supabase.co`;
  }

  if (!serviceRoleKey) {
    console.log(`[testfunc2][${rid}] Missing SERVICE_ROLE_KEY`);
    return jsonResponse(
      { error: "Server misconfigured (no SERVICE_ROLE_KEY)", version: "v4-final" },
      500,
    );
  }

  // Use supabase-js admin client
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let authDeleteResult: any = {};
  try {
    console.log(`[testfunc2][${rid}] Attempt admin.deleteUser via supabase-js`);
    const { error: delErr } = await admin.auth.admin.deleteUser(user_id);
    if (delErr) {
      const lower = (delErr.message || "").toLowerCase();
      if (lower.includes("not found")) {
        console.log(`[testfunc2][${rid}] User not found (treat as success)`);
        authDeleteResult = { success: true, note: "User not found (already deleted)" };
      } else {
        console.log(`[testfunc2][${rid}] admin.deleteUser error: ${delErr.message}`);
        authDeleteResult = { error: "Auth delete error", details: delErr.message };
      }
    } else {
      authDeleteResult = { success: true };
      console.log(`[testfunc2][${rid}] Auth user deleted.`);
    }
  } catch (e) {
    console.log(`[testfunc2][${rid}] Exception in admin.deleteUser: ${(e as Error).message}`);
    authDeleteResult = { error: "Exception calling admin.deleteUser", details: (e as Error).message };
  }

  // Now, delete from custom users table
  let dbDeleteResult: any = {};
  try {
    const { error: dbErr } = await admin
      .from("users") // <-- CHANGE THIS if your table name is different!
      .delete()
      .eq("id", user_id); // <-- CHANGE THIS if your user_id column name is different!
    if (dbErr) {
      dbDeleteResult = { error: "DB delete error", details: dbErr.message };
      console.log(`[testfunc2][${rid}] DB delete error: ${dbErr.message}`);
    } else {
      dbDeleteResult = { success: true };
      console.log(`[testfunc2][${rid}] DB user deleted.`);
    }
  } catch (e) {
    dbDeleteResult = { error: "Exception deleting DB user", details: (e as Error).message };
    console.log(`[testfunc2][${rid}] Exception in DB delete: ${(e as Error).message}`);
  }

  const ms = Date.now() - start;
  console.log(`[testfunc2][${rid}] DONE user_id=${user_id} timeMs=${ms}`);
  return jsonResponse({
    auth_delete: authDeleteResult,
    db_delete: dbDeleteResult,
    user_id,
    version: "v4-final",
    time_ms: ms
  });
});