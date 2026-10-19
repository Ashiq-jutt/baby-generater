// POST /quotes - price a param set. The server re-prices from the catalogue
// and stores the hash; the client's number is never trusted.
import { admin, requireUser, Unauthorized } from "../_shared/auth.ts";
import { corsHeaders, fail, json } from "../_shared/cors.ts";
import { limit, RateLimited } from "../_shared/ratelimit.ts";
import { Invalid, params as vParams, str } from "../_shared/validate.ts";
import { quote as priceOf, paramsHash, UnsupportedSetting } from "../_shared/quote.ts";
import type { Model } from "../_shared/types.ts";

function toModel(row: Record<string, unknown>): Model {
  return {
    id: String(row.id), slug: String(row.slug), label: String(row.label),
    provider: String(row.provider), providerModel: String(row.provider_model),
    kind: row.kind as Model["kind"], modes: (row.modes ?? []) as Model["modes"],
    minDurationS: row.min_duration_s === null ? null : Number(row.min_duration_s),
    maxDurationS: row.max_duration_s === null ? null : Number(row.max_duration_s),
    resolutions: (row.resolutions ?? []) as string[],
    supportsAudio: Boolean(row.supports_audio),
    pricingMode: row.pricing_mode as Model["pricingMode"],
    pricing: row.pricing as Model["pricing"],
    unitCostCents: null,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405, origin);

  try {
    const user = await requireUser(req);
    const db = admin();
    // quoting is cheap but not free; 120/min stops a runaway client
    await limit(db, user.id, "quote", 120, 60);

    const body = await req.json();
    const toolSlug = str(body.toolSlug, "toolSlug", 64);
    const modelSlug = str(body.modelSlug, "modelSlug", 64);
    const p = vParams(body.params);

    const { data: tool } = await db.from("tools")
      .select("id").eq("slug", toolSlug).eq("enabled", true).maybeSingle();
    if (!tool) return fail("unknown_tool", "That tool is not available.", 404, origin);

    const { data: modelRow } = await db.from("models")
      .select("*").eq("slug", modelSlug).eq("enabled", true).maybeSingle();
    if (!modelRow) return fail("unknown_model", "That model is not available.", 404, origin);

    // the model may only be used by a tool that lists it
    const { data: link } = await db.from("tool_models")
      .select("tool_id").eq("tool_id", tool.id).eq("model_id", modelRow.id).maybeSingle();
    if (!link) return fail("model_not_allowed", "That tool cannot use that model.", 400, origin);

    const model = toModel(modelRow);
    const credits = priceOf(model, p as never);
    const hash = paramsHash(modelSlug, p as never);

    const { data: q, error } = await db.from("quotes").insert({
      user_id: user.id, tool_id: tool.id, model_id: modelRow.id,
      params: p, params_hash: hash, credits,
    }).select("id, credits, params_hash, expires_at").single();
    if (error) throw error;

    return json({
      id: q.id, toolSlug, modelSlug, credits: q.credits,
      paramsHash: q.params_hash, expiresAt: q.expires_at,
    }, 200, origin);
  } catch (e) {
    if (e instanceof Unauthorized) return fail("unauthorized", "Please sign in.", 401, origin);
    if (e instanceof RateLimited) return fail("rate_limited", "Slow down a moment.", 429, origin);
    if (e instanceof UnsupportedSetting) return fail("unsupported_setting", e.message, 400, origin);
    if (e instanceof Invalid) return fail("invalid", e.message, 400, origin);
    console.error("quotes", e);
    return fail("server_error", "Could not price that. Nothing was charged.", 500, origin);
  }
});
