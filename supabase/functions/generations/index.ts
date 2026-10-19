// Generations: submit (charge + enqueue), read, cancel, reroll.
//
// The charge and the enqueue happen in ONE database transaction inside
// submit_generation(). The provider is called only AFTER that commits:
// call it first and a crash gives a free generation; charge without
// enqueuing and the credits are simply taken.
import { admin, requireUser, Unauthorized } from "../_shared/auth.ts";
import { corsHeaders, fail, json } from "../_shared/cors.ts";
import { limit, RateLimited } from "../_shared/ratelimit.ts";
import { Invalid, str, uuid } from "../_shared/validate.ts";
import { buildInputs, providerFor } from "../_shared/providers.ts";

/**
 * Supabase types an embedded to-one relation as an ARRAY, and depending on the
 * query it can come back either way. Casting straight to an object yields
 * `undefined` for every field - which here meant the provider got no image
 * URL and every generation failed. Normalise instead of casting.
 */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const ERRORS: Record<string, [string, string, number]> = {
  P0001: ["insufficient_credits", "You need more credits for this one.", 402],
  P0003: ["stale_quote", "The price moved. Check it and try again.", 409],
  P0004: ["consent_required", "Please confirm the consent step first.", 403],
  P0005: ["unknown_asset", "We could not find that upload.", 400],
  P0006: ["reroll_unavailable", "That retry is not available.", 409],
};

function mapPgError(e: { code?: string; message?: string }, origin: string | null) {
  const hit = e.code && ERRORS[e.code];
  if (hit) return fail(hit[0], hit[1], hit[2], origin);
  for (const [, [code, msg, status]] of Object.entries(ERRORS)) {
    if (e.message?.includes(code.replace(/_/g, "_"))) return fail(code, msg, status, origin);
  }
  return null;
}

/** Signed read URLs for the provider, short-lived. */
async function mediaUrls(db: ReturnType<typeof admin>, generationId: string) {
  const { data } = await db.from("generation_inputs")
    .select("role, assets(storage_key)").eq("generation_id", generationId);
  const out: Record<string, string | undefined> = {};
  for (const row of data ?? []) {
    const asset = one<{ storage_key: string }>(
      row.assets as { storage_key: string } | { storage_key: string }[] | null);
    const key = asset?.storage_key;
    if (!key) continue;
    const { data: signed } = await db.storage.from("uploads").createSignedUrl(key, 900);
    const field = row.role === "photo" ? "photoUrl"
      : row.role === "photo_2" ? "photo2Url"
      : row.role === "audio" ? "audioUrl"
      : row.role === "motion_ref" ? "motionUrl" : row.role;
    out[field] = signed?.signedUrl;
  }
  return out;
}

async function dispatch(db: ReturnType<typeof admin>, generationId: string) {
  const { data: g } = await db.from("generations")
    .select("id, params, models(slug, provider, provider_model)")
    .eq("id", generationId).single();
  if (!g) return;
  const m = one<{ slug: string; provider: string; provider_model: string }>(
    g.models as never);
  if (!m) {
    console.error("dispatch: generation has no model row", generationId);
    return;
  }

  try {
    const media = await mediaUrls(db, generationId);
    const inputs = buildInputs(m.slug, (g.params ?? {}) as Record<string, unknown>, media);
    const { providerJobId } = await providerFor(m.provider).submit({
      providerModel: m.provider_model, inputs,
    });
    await db.from("generations").update({
      status: "submitted", provider: m.provider,
      provider_job_id: providerJobId, started_at: new Date().toISOString(),
    }).eq("id", generationId);
  } catch (e) {
    // the provider refused: fail and refund immediately rather than leave
    // the user's credits sitting in a job that will never run
    console.error("dispatch", e);
    await db.from("generations").update({
      status: "failed", finished_at: new Date().toISOString(),
      error_code: "dispatch_failed",
      error_message: "We could not start that one.",
    }).eq("id", generationId);
    await db.rpc("refund_generation", { p_generation_id: generationId });
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  try {
    const user = await requireUser(req);
    const db = admin();
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    // /generations            -> list or submit
    // /generations/:id        -> read
    // /generations/:id/cancel -> cancel
    // /generations/:id/reroll -> reroll
    const id = parts[1];
    const action = parts[2];

    if (req.method === "GET" && !id) {
      const { data, error } = await db.from("generations")
        .select("*, tools(slug), models(slug)")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return json({ generations: data }, 200, origin);
    }

    if (req.method === "GET" && id) {
      uuid(id, "id");
      const { data, error } = await db.from("generations")
        .select("*, tools(slug), models(slug)")
        .eq("id", id).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!data) return fail("not_found", "We could not find that one.", 404, origin);
      return json({ generation: data }, 200, origin);
    }

    if (req.method === "POST" && id && action === "cancel") {
      uuid(id, "id");
      const { data: g } = await db.from("generations")
        .select("id, status, provider, provider_job_id")
        .eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!g) return fail("not_found", "We could not find that one.", 404, origin);
      if (!["queued", "submitted", "running"].includes(g.status)) {
        return fail("not_cancellable", "That one already finished.", 409, origin);
      }
      if (g.provider && g.provider_job_id) {
        try { await providerFor(g.provider).cancel(g.provider_job_id); } catch { /* best effort */ }
      }
      await db.from("generations").update({
        status: "cancelled", finished_at: new Date().toISOString(),
      }).eq("id", id);
      const { data: refunded } = await db.rpc("refund_generation", { p_generation_id: id });
      return json({ cancelled: true, creditsRefunded: refunded ?? 0 }, 200, origin);
    }

    if (req.method === "POST" && id && action === "reroll") {
      uuid(id, "id");
      await limit(db, user.id, "submit", 30, 60);
      const { data: newId, error } = await db.rpc("reroll_generation", {
        p_user_id: user.id, p_generation_id: id,
      });
      if (error) {
        const mapped = mapPgError(error, origin);
        if (mapped) return mapped;
        throw error;
      }
      // copy the parent's inputs so the retry has the same photo
      const { data: inputs } = await db.from("generation_inputs")
        .select("asset_id, role").eq("generation_id", id);
      if (inputs?.length) {
        await db.from("generation_inputs").insert(
          inputs.map((i) => ({ ...i, generation_id: newId })));
      }
      await dispatch(db, String(newId));
      const { data: g } = await db.from("generations")
        .select("*, tools(slug), models(slug)").eq("id", newId).single();
      return json({ generation: g }, 200, origin);
    }

    if (req.method === "POST" && !id) {
      await limit(db, user.id, "submit", 30, 60);
      const body = await req.json();
      const quoteId = uuid(body.quoteId, "quoteId");
      const hash = str(body.paramsHash, "paramsHash", 64);
      const key = str(body.idempotencyKey, "idempotencyKey", 128);
      const assets = body.inputAssets && typeof body.inputAssets === "object"
        ? body.inputAssets as Record<string, string>
        : {};
      for (const [role, aid] of Object.entries(assets)) {
        str(role, "inputAssets key", 32);
        uuid(aid, `inputAssets.${role}`);
      }

      const { data: genId, error } = await db.rpc("submit_generation", {
        p_user_id: user.id, p_quote_id: quoteId, p_params_hash: hash,
        p_idempotency_key: key, p_input_assets: assets,
      });
      if (error) {
        const mapped = mapPgError(error, origin);
        if (mapped) return mapped;
        throw error;
      }

      // committed and charged; now call the provider
      await dispatch(db, String(genId));

      const { data: g } = await db.from("generations")
        .select("*, tools(slug), models(slug)").eq("id", genId).single();
      return json({ generation: g }, 201, origin);
    }

    return fail("method_not_allowed", "Not a route.", 405, origin);
  } catch (e) {
    if (e instanceof Unauthorized) return fail("unauthorized", "Please sign in.", 401, origin);
    if (e instanceof RateLimited) return fail("rate_limited", "Slow down a moment.", 429, origin);
    if (e instanceof Invalid) return fail("invalid", e.message, 400, origin);
    console.error("generations", e);
    return fail("server_error", "That did not go through. Nothing was charged.", 500, origin);
  }
});
