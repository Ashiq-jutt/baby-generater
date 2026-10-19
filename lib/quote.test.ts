// Run: node --experimental-strip-types lib/quote.test.ts
import assert from "node:assert/strict";
import { quote, paramsHash, canonicalParams, UnsupportedSetting } from "./quote.ts";
import { modelBySlug } from "./catalogue.ts";

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  pass  ${name}`); }
  catch (e) { console.log(`  FAIL  ${name}\n        ${(e as Error).message}`); process.exitCode = 1; }
}

const vidu = modelBySlug("vidu-q3-turbo");
const avatar = modelBySlug("kling-avatar");
const motion = modelBySlug("kling-motion-control");
const image = modelBySlug("gpt-image-flare");
const fruit = modelBySlug("fruit-character");

console.log("\nquote engine");

t("per_second_by_resolution: 5s at 540p = 25 credits (matches the original)", () => {
  assert.equal(quote(vidu, { durationS: 5, resolution: "540p" }), 25);
});

t("resolution changes the price: 5s at 720p = 45", () => {
  assert.equal(quote(vidu, { durationS: 5, resolution: "720p" }), 45);
});

t("lipsync at 720p is 30/s: 10s = 300 credits", () => {
  assert.equal(quote(avatar, { durationS: 10, resolution: "720p" }), 300);
});

t("per_second: 10s dance at 11/s = 110", () => {
  assert.equal(quote(motion, { durationS: 10 }), 110);
});

t("per_image: one 1k image = 2 credits", () => {
  assert.equal(quote(image, { size: "1k" }), 2);
});

t("per_image with a count: 4 ages at 1k = 8", () => {
  assert.equal(quote(image, { size: "1k", imageCount: 4 }), 8);
});

t("flat: fruit baby is 80 regardless of duration", () => {
  assert.equal(quote(fruit, { durationS: 5, resolution: "480p" }), 80);
});

t("ALWAYS rounds up - 3.5s of audio bills as 4s, never 3", () => {
  // 3.5s at 16/s = 56 exactly; 3.1s at 16/s = 49.6 -> 50
  assert.equal(quote(avatar, { durationS: 3.1, resolution: "480p" }), 50);
  assert.ok(quote(avatar, { durationS: 3.1, resolution: "480p" }) > 3.1 * 16 - 1);
});

t("unsupported resolution is rejected, not silently priced at 0", () => {
  assert.throws(() => quote(vidu, { durationS: 5, resolution: "4k" }), UnsupportedSetting);
});

t("missing resolution is rejected", () => {
  assert.throws(() => quote(vidu, { durationS: 5 }), UnsupportedSetting);
});

t("duration over the model max is rejected", () => {
  assert.throws(() => quote(vidu, { durationS: 30, resolution: "540p" }), UnsupportedSetting);
});

t("duration under the model min is rejected, even on flat pricing", () => {
  // flat pricing ignores duration for the PRICE, but the provider still only
  // renders 5s - charging for a 1s request means paying for a job that fails
  assert.throws(() => quote(fruit, { durationS: 1, resolution: "480p" }), UnsupportedSetting);
});

t("a resolution the model does not list is rejected on flat pricing too", () => {
  assert.throws(() => quote(fruit, { durationS: 5, resolution: "1080p" }), UnsupportedSetting);
});

t("audio on a model without audio is rejected", () => {
  assert.throws(() => quote(motion, { durationS: 5, audioOn: true }), UnsupportedSetting);
});

t("zero and negative durations are rejected", () => {
  assert.throws(() => quote(motion, { durationS: 0 }), UnsupportedSetting);
  assert.throws(() => quote(motion, { durationS: -5 }), UnsupportedSetting);
});

t("fractional image counts are rejected", () => {
  assert.throws(() => quote(image, { size: "1k", imageCount: 1.5 }), UnsupportedSetting);
});

console.log("\nparams hash");

t("key order does not change the hash", () => {
  const a = paramsHash("vidu-q3-turbo", { durationS: 5, resolution: "540p" });
  const b = paramsHash("vidu-q3-turbo", { resolution: "540p", durationS: 5 });
  assert.equal(a, b);
});

t("undefined and absent optional fields hash the same", () => {
  const a = paramsHash("vidu-q3-turbo", { durationS: 5, resolution: "540p" });
  const b = paramsHash("vidu-q3-turbo", { durationS: 5, resolution: "540p", prompt: undefined });
  assert.equal(a, b);
});

t("a changed setting changes the hash (so a stale quote is rejected)", () => {
  const a = paramsHash("vidu-q3-turbo", { durationS: 5, resolution: "540p" });
  const b = paramsHash("vidu-q3-turbo", { durationS: 8, resolution: "540p" });
  assert.notEqual(a, b);
});

t("a changed model changes the hash even with identical params", () => {
  const p = { durationS: 5, resolution: "540p" };
  assert.notEqual(paramsHash("vidu-q3-turbo", p), paramsHash("kling-avatar", p));
});

t("skin tone is part of the hash - it changes the output, so it must re-quote", () => {
  const a = paramsHash("vidu-q3-turbo", { durationS: 5, resolution: "540p", skinTone: null });
  const b = paramsHash("vidu-q3-turbo", { durationS: 5, resolution: "540p", skinTone: "deep" });
  assert.notEqual(a, b);
});

t("canonical form is stable and sorted", () => {
  assert.equal(
    canonicalParams({ resolution: "540p", durationS: 5 }),
    '[["durationS",5],["resolution","540p"]]',
  );
});

console.log(`\n${pass} passing\n`);
