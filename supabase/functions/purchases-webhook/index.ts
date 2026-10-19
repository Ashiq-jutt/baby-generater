// Webhooks that grant credits. RevenueCat (Apple + Google) and Stripe (web).
//
// Three rules, all non-negotiable:
//   1. verify the signature before reading the body
//   2. record the provider's event id, so a replay is a no-op
//   3. grant through credit_purchase(), which is keyed on the provider's own
//      transaction id and returns 0 on a replay
//
// Stripe and RevenueCat both retry. Without 2 and 3 a retry is free credits.
import { admin } from "../_shared/auth.ts";
import { fail, json } from "../_shared/cors.ts";

const PACKS: Record<string, { credits: number; cents: number }> = {
  mini: { credits: 300, cents: 699 },
  starter: { credits: 550, cents: 1199 },
  creator: { credits: 1150, cents: 2299 },
  studio: { credits: 2400, cents: 4599 },
};

/** Constant-time compare, so a bad signature cannot be probed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stripe's scheme: t=<ts>,v1=<hmac of "<ts>.<body>">, with a 5 min window. */
async function verifyStripe(raw: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2)));
  const ts = parts.t;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;   // replay window
  return safeEqual(v1, await hmacHex(secret, `${ts}.${raw}`));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405);

  const raw = await req.text();
  const db = admin();
  let provider: "apple" | "google" | "stripe";
  let eventId: string;
  let eventType = "";
  let userId: string | null = null;
  let packSlug: string | null = null;
  let providerRef: string | null = null;
  let grossCents: number | null = null;
  let netCents: number | null = null;
  let currency = "USD";

  const stripeSig = req.headers.get("stripe-signature");
  const rcAuth = req.headers.get("authorization");

  if (stripeSig) {
    const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!secret) return fail("not_configured", "Stripe is not configured.", 500);
    if (!await verifyStripe(raw, stripeSig, secret)) {
      return fail("bad_signature", "Signature did not verify.", 400);
    }
    const ev = JSON.parse(raw);
    provider = "stripe";
    eventId = String(ev.id);
    eventType = String(ev.type);
    if (eventType !== "checkout.session.completed") {
      return json({ ignored: eventType }, 200);
    }
    const s = ev.data?.object ?? {};
    userId = s.client_reference_id ?? s.metadata?.user_id ?? null;
    packSlug = s.metadata?.pack_slug ?? null;
    providerRef = String(s.id);
    grossCents = Number(s.amount_total ?? 0);
    // Stripe's own fee is not on this event; net is reconciled from the
    // balance transaction later. Record gross now rather than guess.
    netCents = null;
    currency = String(s.currency ?? "usd").toUpperCase();
  } else if (rcAuth) {
    const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
    if (!secret) return fail("not_configured", "RevenueCat is not configured.", 500);
    // RevenueCat sends a shared bearer token, not an HMAC
    if (!safeEqual(rcAuth, `Bearer ${secret}`)) {
      return fail("bad_signature", "Signature did not verify.", 400);
    }
    const ev = JSON.parse(raw).event ?? {};
    eventType = String(ev.type ?? "");
    eventId = String(ev.id ?? "");
    provider = String(ev.store ?? "").toUpperCase() === "PLAY_STORE" ? "google" : "apple";
    if (!["NON_RENEWING_PURCHASE", "INITIAL_PURCHASE"].includes(eventType)) {
      // refunds and cancellations are recorded but never grant credits
      if (eventType === "REFUND" || eventType === "CANCELLATION") {
        await db.from("webhook_events").insert({
          provider, event_id: eventId, event_type: eventType,
          processed_at: new Date().toISOString(),
        }).select();
        await db.from("purchases").update({ status: "refunded" })
          .eq("provider", provider)
          .eq("provider_ref", String(ev.transaction_id ?? ""));
        return json({ recorded: eventType }, 200);
      }
      return json({ ignored: eventType }, 200);
    }
    userId = ev.app_user_id ?? null;
    packSlug = String(ev.product_id ?? "").split(".").pop() ?? null;
    providerRef = String(ev.transaction_id ?? "");
    grossCents = Math.round(Number(ev.price ?? 0) * 100);
    // RevenueCat gives the proceeds after the store's cut - the number that
    // actually matters for margin
    netCents = ev.price_in_purchased_currency != null
      ? Math.round(Number(ev.price ?? 0) * 100 * 0.85)
      : null;
    currency = String(ev.currency ?? "USD").toUpperCase();
  } else {
    return fail("bad_signature", "No signature header.", 400);
  }

  if (!eventId) return fail("invalid", "No event id.", 400);

  // idempotency gate: the insert fails on replay, and we stop there
  const { error: dupErr } = await db.from("webhook_events")
    .insert({ provider, event_id: eventId, event_type: eventType });
  if (dupErr) {
    if (dupErr.code === "23505" || dupErr.message?.includes("duplicate")) {
      return json({ replay: true }, 200);
    }
    console.error("webhook_events", dupErr);
    return fail("server_error", "Could not record that event.", 500);
  }

  if (!userId || !packSlug || !providerRef || !PACKS[packSlug]) {
    await db.from("webhook_events").update({
      processed_at: new Date().toISOString(),
      error: `unusable payload: user=${userId} pack=${packSlug}`,
    }).eq("provider", provider).eq("event_id", eventId);
    return fail("invalid", "Unusable payload.", 400);
  }

  const pack = PACKS[packSlug];
  const { data: granted, error } = await db.rpc("credit_purchase", {
    p_user_id: userId, p_provider: provider, p_provider_ref: providerRef,
    p_pack_slug: packSlug, p_credits: pack.credits,
    p_gross_cents: grossCents ?? pack.cents, p_net_cents: netCents,
    p_currency: currency, p_raw: JSON.parse(raw),
  });
  if (error) {
    await db.from("webhook_events").update({
      processed_at: new Date().toISOString(), error: error.message,
    }).eq("provider", provider).eq("event_id", eventId);
    console.error("credit_purchase", error);
    return fail("server_error", "Could not add those credits.", 500);
  }

  await db.from("webhook_events").update({ processed_at: new Date().toISOString() })
    .eq("provider", provider).eq("event_id", eventId);

  return json({ granted }, 200);
});
