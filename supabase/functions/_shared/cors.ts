// A native app does not need permissive CORS. Only the local dev server and
// the marketing site are allowed, and the list comes from env, not code.
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:8081")
  .split(",").map((s) => s.trim()).filter(Boolean);

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

/** Error shape every route returns. `code` is what the client switches on. */
export function fail(code: string, message: string, status = 400, origin: string | null = null) {
  return json({ error: { code, message } }, status, origin);
}
