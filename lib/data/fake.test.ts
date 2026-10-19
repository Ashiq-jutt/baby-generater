// Run: node --no-warnings --experimental-strip-types lib/data/fake.test.ts
// Same guarantees the SQL ledger was tested for, now in the fake layer.
import assert from "node:assert/strict";
import { fakeData as d, _test } from "./fake.ts";
import { InsufficientCredits, StaleQuote } from "./errors.ts";

let pass = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try { await fn(); pass++; console.log(`  pass  ${name}`); }
  catch (e) { console.log(`  FAIL  ${name}\n        ${(e as Error).message}`); process.exitCode = 1; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeQuote(params = { durationS: 5, resolution: "540p" }) {
  return d.createQuote("baby-video", "vidu-q3-turbo", params);
}

console.log("\nfake data layer: ledger");

await d.signIn("apple");

await t("sign-in grants 30 free credits that expire", async () => {
  const b = await d.getBalance();
  assert.equal(b.balance, 30);
  assert.equal(b.expiring, 30);
  assert.ok(b.nextExpiry !== null);
});

await t("paid credits never expire", async () => {
  await d.buyPack("mini");
  const b = await d.getBalance();
  assert.equal(b.balance, 330);
  assert.equal(b.expiring, 30, "the 300 paid credits must not be counted as expiring");
});

await t("quote prices 5s/540p at 25 credits", async () => {
  const q = await makeQuote();
  assert.equal(q.credits, 25);
});

await t("submit charges exactly the quote, free credits first", async () => {
  const q = await makeQuote();
  const g = await d.submitGeneration({
    quoteId: q.id, paramsHash: q.paramsHash, toolSlug: "baby-video",
    modelSlug: "vidu-q3-turbo", params: { durationS: 5, resolution: "540p" },
    idempotencyKey: "k-a",
  });
  assert.equal(g.creditsCharged, 25);
  const b = await d.getBalance();
  assert.equal(b.balance, 305);
  assert.equal(b.expiring, 5, "should have drawn from the expiring grant first");
});

await t("a stale paramsHash is rejected", async () => {
  const q = await makeQuote();
  await assert.rejects(() => d.submitGeneration({
    quoteId: q.id, paramsHash: "deadbeef", toolSlug: "baby-video",
    modelSlug: "vidu-q3-turbo", params: { durationS: 5, resolution: "540p" },
    idempotencyKey: "k-b",
  }), StaleQuote);
});

await t("changed settings cannot be submitted at the old price", async () => {
  const q = await makeQuote({ durationS: 5, resolution: "540p" });
  await assert.rejects(() => d.submitGeneration({
    quoteId: q.id, paramsHash: q.paramsHash, toolSlug: "baby-video",
    modelSlug: "vidu-q3-turbo",
    params: { durationS: 10, resolution: "1080p" }, // 160 credits, not 25
    idempotencyKey: "k-c",
  }), StaleQuote);
});

await t("the same idempotency key does not create a second job", async () => {
  const before = (await d.listGenerations()).length;
  const q = await makeQuote();
  const args = {
    quoteId: q.id, paramsHash: q.paramsHash, toolSlug: "baby-video",
    modelSlug: "vidu-q3-turbo", params: { durationS: 5, resolution: "540p" },
    idempotencyKey: "k-dup",
  };
  const g1 = await d.submitGeneration(args);
  const g2 = await d.submitGeneration(args);
  assert.equal(g1.id, g2.id);
  assert.equal((await d.listGenerations()).length, before + 1);
});

await t("overspending is refused and charges nothing", async () => {
  const b0 = await d.getBalance();
  const q = await d.createQuote("baby-video", "vidu-q3-turbo",
    { durationS: 16, resolution: "1080p" }); // 256 credits
  const huge = await d.createQuote("talking-baby", "kling-avatar",
    { durationS: 60, resolution: "720p" });  // 1800 credits
  assert.equal(huge.credits, 1800);
  await assert.rejects(() => d.submitGeneration({
    quoteId: huge.id, paramsHash: huge.paramsHash, toolSlug: "talking-baby",
    modelSlug: "kling-avatar", params: { durationS: 60, resolution: "720p" },
    idempotencyKey: "k-huge",
  }), InsufficientCredits);
  const b1 = await d.getBalance();
  assert.equal(b1.balance, b0.balance, "a refused submit must not move the balance");
  void q;
});

await t("ledger entries reconcile to every grant's remaining", async () => {
  for (const g of _test.grants()) {
    const sum = _test.entries()
      .filter((e) => e.grantId === g.id)
      .reduce((s, e) => s + e.delta, 0);
    assert.equal(g.remaining, sum, `grant ${g.reason} drifted`);
  }
});

console.log("\nfake data layer: failure and refund");

await t("a failed job refunds in full and says so", async () => {
  // find an id that rolls into the failure band
  let failed = null;
  for (let i = 0; i < 40 && !failed; i++) {
    const q = await makeQuote();
    const g = await d.submitGeneration({
      quoteId: q.id, paramsHash: q.paramsHash, toolSlug: "baby-video",
      modelSlug: "vidu-q3-turbo", params: { durationS: 5, resolution: "540p" },
      idempotencyKey: `k-f${i}`,
    });
    await sleep(0);
    failed = g;
  }
  assert.ok(failed, "could not create a job");
  await sleep(7200);
  const all = await d.listGenerations();
  const terminal = all.filter((g) => g.status === "failed" || g.status === "succeeded");
  assert.ok(terminal.length > 0, "nothing reached a terminal state");
  for (const g of terminal.filter((x) => x.status === "failed")) {
    assert.equal(g.creditsRefunded, g.creditsCharged,
      "a failed job must refund everything it charged");
    assert.ok(g.errorMessage);
  }
  for (const g of terminal.filter((x) => x.status === "succeeded")) {
    assert.equal(g.creditsRefunded, 0);
    assert.ok(g.outputUri);
  }
});

await t("refund is idempotent across repeated reads", async () => {
  const before = (await d.getBalance()).balance;
  await d.listGenerations();
  await d.listGenerations();
  assert.equal((await d.getBalance()).balance, before);
});

await t("ledger still reconciles after refunds", async () => {
  for (const g of _test.grants()) {
    const sum = _test.entries()
      .filter((e) => e.grantId === g.id)
      .reduce((s, e) => s + e.delta, 0);
    assert.equal(g.remaining, sum, `grant ${g.reason} drifted after refund`);
  }
});

await t("a free re-roll charges nothing and is allowed only once", async () => {
  const done = (await d.listGenerations()).find((g) => g.status === "succeeded"
    || g.status === "failed");
  assert.ok(done, "need a finished job");
  const b0 = (await d.getBalance()).balance;
  const r = await d.rerollGeneration(done.id);
  assert.equal(r.creditsCharged, 0);
  assert.equal(r.isFreeReroll, true);
  assert.equal((await d.getBalance()).balance, b0, "a free re-roll must not charge");
  await assert.rejects(() => d.rerollGeneration(done.id));
});

await t("cancelling a running job refunds it", async () => {
  const q = await makeQuote();
  const g = await d.submitGeneration({
    quoteId: q.id, paramsHash: q.paramsHash, toolSlug: "baby-video",
    modelSlug: "vidu-q3-turbo", params: { durationS: 5, resolution: "540p" },
    idempotencyKey: "k-cancel",
  });
  const b0 = (await d.getBalance()).balance;
  const c = await d.cancelGeneration(g.id);
  assert.equal(c.status, "cancelled");
  assert.equal(c.creditsRefunded, 25);
  assert.equal((await d.getBalance()).balance, b0 + 25);
});

console.log("\nfake data layer: check-in");

await t("daily check-in can only be claimed once a day", async () => {
  assert.equal(await d.canClaimToday(), false, "sign-in already claimed today");
  await assert.rejects(() => d.claimDailyCredits());
});

console.log(`\n${pass} passing\n`);
