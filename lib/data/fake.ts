// In-memory implementation of DataLayer. Models the behaviour that matters:
// a credit ledger with per-grant expiry, spend-expiring-first, refund on
// failure, stale-quote rejection and idempotent submits. Mirrors
// replica/schema.sql so replica-backend is a drop-in swap.
//
// Jobs fail ~12% of the time on purpose: the refund path is the feature most
// worth exercising, and it is the one the originals get wrong.

import { quote as priceOf, paramsHash } from "../quote.ts";
import { PACKS, TOOLS, modelBySlug, toolBySlug } from "../catalogue.ts";
import type {
  Balance, Generation, GenParams, Pack, Quote, Tool,
} from "../types.ts";
import { InsufficientCredits, StaleQuote } from "./errors.ts";
import type { DataLayer } from "./index.ts";

interface Grant {
  id: string;
  reason: "purchase" | "checkin" | "streak_bonus" | "refund_goodwill";
  amount: number;
  remaining: number;
  expiresAt: string | null;
  createdAt: number;
}
interface Entry {
  grantId: string;
  delta: number;
  reason: "grant" | "spend" | "refund";
  generationId: string | null;
}

const FREE_CREDIT_DAYS = 14; // kinder than the original's 3 days (F36)
const FAILURE_RATE = 0.12;

let userId: string | null = null;
let grants: Grant[] = [];
let entries: Entry[] = [];
let quotes: Quote[] = [];
let generations: Generation[] = [];
let submits = new Map<string, string>(); // idempotencyKey -> generationId
let lastCheckIn: string | null = null;
let streak = 0;
let seq = 0;

const id = (p: string) => `${p}-${++seq}-${Date.now().toString(36)}`;
const now = () => Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const live = (g: Grant) =>
  g.remaining > 0 && (g.expiresAt === null || Date.parse(g.expiresAt) > now());

function grant(
  reason: Grant["reason"], amount: number, expiresInDays: number | null,
): Grant {
  const g: Grant = {
    id: id("gr"), reason, amount, remaining: amount,
    expiresAt: expiresInDays === null
      ? null
      : iso(now() + expiresInDays * 86_400_000),
    createdAt: now(),
  };
  grants.push(g);
  entries.push({ grantId: g.id, delta: amount, reason: "grant", generationId: null });
  return g;
}

/** Spends expiring-soonest-first, so free credits are used before paid ones. */
function spend(amount: number, generationId: string): void {
  const spendable = grants
    .filter(live)
    .sort((a, b) => {
      if (a.expiresAt === b.expiresAt) return a.createdAt - b.createdAt;
      if (a.expiresAt === null) return 1;
      if (b.expiresAt === null) return -1;
      return Date.parse(a.expiresAt) - Date.parse(b.expiresAt);
    });

  const total = spendable.reduce((s, g) => s + g.remaining, 0);
  if (total < amount) throw new InsufficientCredits(amount);

  let left = amount;
  for (const g of spendable) {
    if (left === 0) break;
    const take = Math.min(g.remaining, left);
    g.remaining -= take;
    entries.push({ grantId: g.id, delta: -take, reason: "spend", generationId });
    left -= take;
  }
}

/** Reverses a failed job's spend back into the same grants. Idempotent. */
function refund(generationId: string): number {
  if (entries.some((e) => e.generationId === generationId && e.reason === "refund")) {
    return 0;
  }
  let total = 0;
  let lost = 0;
  for (const e of entries.filter(
    (x) => x.generationId === generationId && x.reason === "spend",
  )) {
    const g = grants.find((x) => x.id === e.grantId);
    if (!g) continue;
    const amount = -e.delta;
    if (g.expiresAt === null || Date.parse(g.expiresAt) > now()) {
      g.remaining += amount;
      entries.push({ grantId: g.id, delta: amount, reason: "refund", generationId });
    } else {
      lost += amount; // expired mid-job: re-grant rather than punish the user
    }
    total += amount;
  }
  if (lost > 0) {
    const g = grant("refund_goodwill", lost, FREE_CREDIT_DAYS);
    entries.push({ grantId: g.id, delta: 0, reason: "refund", generationId });
  }
  return total;
}

function balance(): Balance {
  const liveGrants = grants.filter(live);
  const expiringGrants = liveGrants.filter((g) => g.expiresAt !== null);
  const next = expiringGrants
    .map((g) => g.expiresAt as string)
    .sort()[0] ?? null;
  return {
    balance: liveGrants.reduce((s, g) => s + g.remaining, 0),
    expiring: expiringGrants.reduce((s, g) => s + g.remaining, 0),
    nextExpiry: next,
  };
}

/** Drives a job forward on each read, so the UI sees real state changes. */
function advance(g: Generation): Generation {
  if (g.status === "succeeded" || g.status === "failed" || g.status === "cancelled") {
    return g;
  }
  const elapsed = now() - Date.parse(g.queuedAt);
  if (elapsed < 1200) {
    g.status = "queued";
    g.progress = null;
  } else if (elapsed < 7000) {
    g.status = "running";
    g.progress = Math.min(0.95, (elapsed - 1200) / 5800);
  } else {
    const roll = hashUnit(g.id);
    if (roll < FAILURE_RATE) {
      g.status = "failed";
      g.errorMessage = "The model could not read the face in that photo.";
      g.finishedAt = iso(now());
      g.creditsRefunded = refund(g.id);
    } else {
      g.status = "succeeded";
      g.progress = 1;
      g.outputUri = `local://generated/${g.id}.mp4`;
      g.finishedAt = iso(now());
    }
  }
  return g;
}

/** Deterministic per-id roll, so a job does not flip outcome between reads. */
function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

export const fakeData: DataLayer = {
  async signIn(provider) {
    userId = `u-${provider}-1`;
    if (grants.length === 0) {
      grant("checkin", 30, FREE_CREDIT_DAYS); // enough for one free video
      lastCheckIn = today();
      streak = 1;
    }
    return { userId };
  },

  async signOut() {
    userId = null;
    grants = []; entries = []; quotes = []; generations = [];
    submits = new Map(); lastCheckIn = null; streak = 0;
  },

  currentUserId() {
    return userId;
  },

  async listTools(): Promise<Tool[]> {
    return TOOLS;
  },

  async getBalance() {
    return balance();
  },

  async canClaimToday() {
    return lastCheckIn !== today();
  },

  async claimDailyCredits() {
    if (lastCheckIn === today()) throw new Error("already_claimed_today");
    streak += 1;
    const bonus = streak % 7 === 0 ? 20 : 0;
    const g = grant("checkin", 10 + bonus, FREE_CREDIT_DAYS);
    lastCheckIn = today();
    return { granted: g.amount, streak, expiresAt: g.expiresAt as string };
  },

  async listPacks(): Promise<Pack[]> {
    return PACKS;
  },

  async buyPack(slug) {
    const pack = PACKS.find((p) => p.slug === slug);
    if (!pack) throw new Error(`unknown pack ${slug}`);
    grant("purchase", pack.credits, null); // paid credits never expire
    return { credits: pack.credits };
  },

  async createQuote(toolSlug, modelSlug, params) {
    toolBySlug(toolSlug);
    const model = modelBySlug(modelSlug);
    const q: Quote = {
      id: id("q"),
      toolSlug,
      modelSlug,
      credits: priceOf(model, params),
      paramsHash: paramsHash(modelSlug, params),
      expiresAt: iso(now() + 15 * 60_000),
    };
    quotes.push(q);
    return q;
  },

  async submitGeneration(input) {
    const existing = submits.get(input.idempotencyKey);
    if (existing) return advance(generations.find((g) => g.id === existing)!);

    const q = quotes.find((x) => x.id === input.quoteId);
    if (!q || q.paramsHash !== input.paramsHash
        || Date.parse(q.expiresAt) < now()) {
      throw new StaleQuote();
    }
    // re-price server-side; never trust the client's number
    const model = modelBySlug(input.modelSlug);
    const credits = priceOf(model, input.params);
    if (credits !== q.credits) throw new StaleQuote();

    const g: Generation = {
      id: id("gen"),
      toolSlug: input.toolSlug,
      modelSlug: input.modelSlug,
      status: "queued",
      params: input.params,
      progress: null,
      outputUri: null,
      creditsQuoted: credits,
      creditsCharged: 0,
      creditsRefunded: 0,
      errorMessage: null,
      queuedAt: iso(now()),
      finishedAt: null,
      isFreeReroll: false,
      rerollOf: null,
    };
    // charge and enqueue together: if the spend throws, no job exists
    spend(credits, g.id);
    g.creditsCharged = credits;
    generations.unshift(g);
    submits.set(input.idempotencyKey, g.id);
    return g;
  },

  async getGeneration(gid) {
    const g = generations.find((x) => x.id === gid);
    if (!g) throw new Error(`unknown generation ${gid}`);
    return advance(g);
  },

  async listGenerations() {
    return generations.map(advance);
  },

  async cancelGeneration(gid) {
    const g = generations.find((x) => x.id === gid);
    if (!g) throw new Error(`unknown generation ${gid}`);
    if (g.status === "queued" || g.status === "running" || g.status === "submitted") {
      g.status = "cancelled";
      g.finishedAt = iso(now());
      g.creditsRefunded = refund(g.id);
    }
    return g;
  },

  async rerollGeneration(gid) {
    const parent = generations.find((x) => x.id === gid);
    if (!parent) throw new Error(`unknown generation ${gid}`);
    if (generations.some((x) => x.rerollOf === gid && x.isFreeReroll)) {
      throw new Error("reroll_already_used");
    }
    const g: Generation = {
      ...parent,
      id: id("gen"),
      status: "queued",
      progress: null,
      outputUri: null,
      creditsCharged: 0,
      creditsRefunded: 0,
      errorMessage: null,
      queuedAt: iso(now()),
      finishedAt: null,
      isFreeReroll: true,
      rerollOf: gid,
    };
    generations.unshift(g); // free: no spend() call
    return g;
  },
};

export const _test = { grants: () => grants, entries: () => entries };
