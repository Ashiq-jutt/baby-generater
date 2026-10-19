// The signature check is the only thing standing between a forged POST and
// free credits, so it gets tested on its own.
// Run: deno test --allow-import supabase/functions/_shared/webhook.test.ts
import { assertEquals } from "jsr:@std/assert@1";

// mirrors purchases-webhook/index.ts
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
async function verifyStripe(raw: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2)));
  const ts = parts.t, v1 = parts.v1;
  if (!ts || !v1) return false;
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;
  return safeEqual(v1, await hmacHex(secret, `${ts}.${raw}`));
}

const SECRET = "whsec_test_abc123";
const BODY = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const now = () => Math.floor(Date.now() / 1000);

Deno.test("a correctly signed payload verifies", async () => {
  const t = now();
  const sig = `t=${t},v1=${await hmacHex(SECRET, `${t}.${BODY}`)}`;
  assertEquals(await verifyStripe(BODY, sig, SECRET), true);
});

Deno.test("a tampered body is rejected", async () => {
  const t = now();
  const sig = `t=${t},v1=${await hmacHex(SECRET, `${t}.${BODY}`)}`;
  const tampered = BODY.replace("evt_1", "evt_2");
  assertEquals(await verifyStripe(tampered, sig, SECRET), false);
});

Deno.test("the wrong secret is rejected", async () => {
  const t = now();
  const sig = `t=${t},v1=${await hmacHex("whsec_wrong", `${t}.${BODY}`)}`;
  assertEquals(await verifyStripe(BODY, sig, SECRET), false);
});

Deno.test("a replay older than 5 minutes is rejected", async () => {
  const t = now() - 400;
  const sig = `t=${t},v1=${await hmacHex(SECRET, `${t}.${BODY}`)}`;
  assertEquals(await verifyStripe(BODY, sig, SECRET), false);
});

Deno.test("a valid signature with a swapped timestamp is rejected", async () => {
  const t = now();
  const sig = `t=${t - 10},v1=${await hmacHex(SECRET, `${t}.${BODY}`)}`;
  assertEquals(await verifyStripe(BODY, sig, SECRET), false);
});

Deno.test("a missing or malformed header is rejected", async () => {
  assertEquals(await verifyStripe(BODY, "", SECRET), false);
  assertEquals(await verifyStripe(BODY, "garbage", SECRET), false);
  assertEquals(await verifyStripe(BODY, `t=${now()}`, SECRET), false);
  assertEquals(await verifyStripe(BODY, "t=notanumber,v1=aa", SECRET), false);
});

Deno.test("the bearer compare rejects a wrong-length token early", () => {
  assertEquals(safeEqual("Bearer abc", "Bearer abcd"), false);
  assertEquals(safeEqual("Bearer abc", "Bearer abc"), true);
  assertEquals(safeEqual("Bearer abc", "Bearer abd"), false);
});
