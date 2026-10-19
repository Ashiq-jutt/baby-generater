// GET  /credits         - balance, next expiry, recent ledger
// POST /credits/checkin - claim the daily credits
import { admin, requireUser, Unauthorized } from "../_shared/auth.ts";
import { corsHeaders, fail, json } from "../_shared/cors.ts";
import { limit, RateLimited } from "../_shared/ratelimit.ts";
import { Invalid, isoDate } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  try {
    const user = await requireUser(req);
    const db = admin();
    const action = new URL(req.url).pathname.split("/").filter(Boolean)[1];

    if (req.method === "GET" && !action) {
      const [bal, entries] = await Promise.all([
        db.from("credit_balances").select("*").eq("user_id", user.id).maybeSingle(),
        db.from("credit_entries").select("delta, reason, note, created_at")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(40),
      ]);
      return json({
        balance: bal.data?.balance ?? 0,
        expiring: bal.data?.expiring ?? 0,
        nextExpiry: bal.data?.next_expiry ?? null,
        entries: entries.data ?? [],
      }, 200, origin);
    }

    if (req.method === "POST" && action === "checkin") {
      await limit(db, user.id, "checkin", 10, 3600);
      const body = await req.json().catch(() => ({}));
      // the user's OWN day, so "once a day" means their midnight not UTC's
      const localDate = isoDate(body.localDate, "localDate");
      const { data, error } = await db.rpc("claim_daily_credits", {
        p_user_id: user.id, p_local_date: localDate,
      });
      if (error) {
        if (error.code === "P0002" || error.message?.includes("already_claimed_today")) {
          return fail("already_claimed", "Already claimed today. Come back tomorrow.", 409, origin);
        }
        throw error;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return json({
        granted: row.granted, streak: row.streak, expiresAt: row.expires_at,
      }, 200, origin);
    }

    return fail("method_not_allowed", "Not a route.", 405, origin);
  } catch (e) {
    if (e instanceof Unauthorized) return fail("unauthorized", "Please sign in.", 401, origin);
    if (e instanceof RateLimited) return fail("rate_limited", "Slow down a moment.", 429, origin);
    if (e instanceof Invalid) return fail("invalid", e.message, 400, origin);
    console.error("credits", e);
    return fail("server_error", "Could not read your credits.", 500, origin);
  }
});
