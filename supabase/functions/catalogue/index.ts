// GET /catalogue - tools, models and their constraints. Public read.
import { admin } from "../_shared/auth.ts";
import { corsHeaders, fail, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "GET") return fail("method_not_allowed", "Use GET.", 405, origin);

  const db = admin();
  const [tools, models] = await Promise.all([
    db.from("tools").select("*").eq("enabled", true).order("sort_order"),
    db.from("models").select("*").eq("enabled", true),
  ]);
  if (tools.error || models.error) {
    return fail("catalogue_unavailable", "Could not load the tool list.", 500, origin);
  }
  // unit_cost_cents is our margin data; it never leaves the server
  const safeModels = (models.data ?? []).map(({ unit_cost_cents: _c, ...m }) => m);
  return json({ tools: tools.data, models: safeModels }, 200, origin);
});
