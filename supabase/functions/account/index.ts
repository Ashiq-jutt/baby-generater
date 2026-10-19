// POST   /account/consent - record parental consent (F38). Generation is
//                           gated on this in submit_generation().
// POST   /account/delete  - queue deletion. Apple requires real deletion for
//                           any app with sign up.
// POST   /account/devices - register a push token
import { admin, requireUser, Unauthorized } from "../_shared/auth.ts";
import { corsHeaders, fail, json } from "../_shared/cors.ts";
import { Invalid, str } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405, origin);

  try {
    const user = await requireUser(req);
    const db = admin();
    const action = new URL(req.url).pathname.split("/").filter(Boolean)[1];

    if (action === "consent") {
      const { error } = await db.from("users")
        .update({ consent_at: new Date().toISOString() }).eq("id", user.id);
      if (error) throw error;
      return json({ consentAt: new Date().toISOString() }, 200, origin);
    }

    if (action === "devices") {
      const body = await req.json();
      const token = str(body.pushToken, "pushToken", 256);
      const platform = str(body.platform, "platform", 8);
      if (platform !== "ios" && platform !== "android") {
        return fail("invalid", "platform must be ios or android", 400, origin);
      }
      const { error } = await db.from("devices").upsert({
        user_id: user.id, push_token: token, platform,
        last_seen: new Date().toISOString(),
      }, { onConflict: "push_token" });
      if (error) throw error;
      return json({ ok: true }, 200, origin);
    }

    if (action === "delete") {
      const body = await req.json().catch(() => ({}));
      const scope = typeof body.scope === "string" ? body.scope : "account";
      if (!["photos", "generations", "account"].includes(scope)) {
        return fail("invalid", "Unknown scope.", 400, origin);
      }
      const { data, error } = await db.from("deletion_requests")
        .insert({ user_id: user.id, scope }).select("id, requested_at").single();
      if (error) throw error;
      return json({
        requestId: data.id, requestedAt: data.requested_at,
        message: scope === "account"
          ? "Your account and everything in it will be deleted within 24 hours."
          : "Those files will be deleted within 24 hours.",
      }, 202, origin);
    }

    return fail("method_not_allowed", "Not a route.", 405, origin);
  } catch (e) {
    if (e instanceof Unauthorized) return fail("unauthorized", "Please sign in.", 401, origin);
    if (e instanceof Invalid) return fail("invalid", e.message, 400, origin);
    console.error("account", e);
    return fail("server_error", "That did not work.", 500, origin);
  }
});
