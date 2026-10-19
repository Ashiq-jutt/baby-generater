// The quote engine. A pure function over a `models` row - no network, no
// clock, no randomness - so it is testable and the server can run the exact
// same code to reject a stale client price.
//
// Always rounds UP. Audio models bill on detected duration rounded up; round
// down and we eat the difference on every single job.

import type { GenParams, Model } from "./types";

export class UnsupportedSetting extends Error {
  setting: string;
  value: unknown;
  constructor(setting: string, value: unknown) {
    super(`This model does not support ${setting} ${String(value)}`);
    this.name = "UnsupportedSetting";
    this.setting = setting;
    this.value = value;
  }
}

/**
 * Reject settings the model cannot run, whatever its pricing mode.
 *
 * This is separate from pricing and always runs: a flat-priced model still
 * has a fixed duration and one resolution, and submitting outside those
 * means the provider fails the job AFTER we have charged for it.
 */
export function assertSupported(model: Model, p: GenParams): void {
  if (p.durationS != null) {
    if (!(p.durationS > 0)) throw new UnsupportedSetting("duration", p.durationS);
    if (model.minDurationS != null && p.durationS < model.minDurationS) {
      throw new UnsupportedSetting("duration", p.durationS);
    }
    if (model.maxDurationS != null && p.durationS > model.maxDurationS) {
      throw new UnsupportedSetting("duration", p.durationS);
    }
  }
  if (p.resolution != null && model.resolutions.length > 0
      && !model.resolutions.includes(p.resolution)) {
    throw new UnsupportedSetting("resolution", p.resolution);
  }
  if (p.audioOn === true && !model.supportsAudio) {
    throw new UnsupportedSetting("audio", true);
  }
}

export function quote(model: Model, p: GenParams): number {
  assertSupported(model, p);
  switch (model.pricingMode) {
    case "flat": {
      const c = model.pricing.credits;
      if (c == null) throw new Error(`${model.slug}: flat pricing needs credits`);
      return c;
    }
    case "per_second": {
      const rate = model.pricing.rate;
      if (rate == null) throw new Error(`${model.slug}: per_second needs rate`);
      return Math.ceil(rate * requireDuration(model, p));
    }
    case "per_second_by_resolution": {
      const rates = model.pricing.rates ?? {};
      const res = p.resolution;
      if (res == null) throw new UnsupportedSetting("resolution", res);
      const rate = rates[res];
      if (rate == null) throw new UnsupportedSetting("resolution", res);
      return Math.ceil(rate * requireDuration(model, p));
    }
    case "per_image": {
      const rates = model.pricing.rates ?? {};
      const size = p.size;
      if (size == null) throw new UnsupportedSetting("size", size);
      const rate = rates[size];
      if (rate == null) throw new UnsupportedSetting("size", size);
      const n = p.imageCount ?? 1;
      if (!Number.isInteger(n) || n < 1) throw new UnsupportedSetting("imageCount", n);
      return rate * n;
    }
  }
}

function requireDuration(model: Model, p: GenParams): number {
  const d = p.durationS;
  if (d == null || !(d > 0)) throw new UnsupportedSetting("duration", d);
  if (model.minDurationS != null && d < model.minDurationS) {
    throw new UnsupportedSetting("duration", d);
  }
  if (model.maxDurationS != null && d > model.maxDurationS) {
    throw new UnsupportedSetting("duration", d);
  }
  return d;
}

/**
 * Canonical params hash. The client sends it with the submit; the server
 * recomputes it. A changed setting yields a different hash, so a stale quote
 * cannot be redeemed at the old price.
 *
 * Keys are sorted and undefined/null dropped, so key order and absent
 * optional fields cannot produce two different hashes for the same request.
 * djb2 here keeps the app dependency-free; the server uses sha256 over the
 * same canonical string.
 */
export function canonicalParams(p: GenParams): string {
  const entries = Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

export function paramsHash(modelSlug: string, p: GenParams): string {
  const s = `${modelSlug}|${canonicalParams(p)}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Credits -> what the user effectively pays, for honest UI copy. */
export function creditsToUsd(credits: number, centsPerCredit: number): number {
  return (credits * centsPerCredit) / 100;
}
