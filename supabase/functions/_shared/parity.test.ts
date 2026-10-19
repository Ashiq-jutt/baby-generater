// Cross-runtime parity: the hashes and prices below were produced by the APP's
// copy (lib/quote.ts) under Node. This asserts the SERVER's copy produces the
// same ones under Deno.
//
// If these ever disagree, every submit is rejected as a stale quote and the
// app simply stops working. A file diff would not catch a runtime difference.
//
// Run: deno test --allow-import --allow-read supabase/functions/_shared/parity.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { paramsHash, quote } from "./quote.ts";
import type { GenParams, Model, PricingMode } from "./types.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./parity.fixture.json", import.meta.url)),
) as Array<{ slug: string; params: GenParams; hash: string; credits: number }>;

// the catalogue rows the server would load from Postgres
const ROWS: Record<string, Partial<Model>> = {
  "vidu-q3-turbo": {
    minDurationS: 1, maxDurationS: 16, resolutions: ["540p", "720p", "1080p"],
    supportsAudio: true, pricingMode: "per_second_by_resolution",
    pricing: { rates: { "540p": 5, "720p": 9, "1080p": 16 } },
  },
  "kling-avatar": {
    minDurationS: 1, maxDurationS: 60, resolutions: ["480p", "720p"],
    supportsAudio: true, pricingMode: "per_second_by_resolution",
    pricing: { rates: { "480p": 16, "720p": 30 } },
  },
  "kling-motion-control": {
    minDurationS: 1, maxDurationS: 30, resolutions: ["720p"],
    supportsAudio: false, pricingMode: "per_second", pricing: { rate: 11 },
  },
  "gpt-image-flare": {
    minDurationS: null, maxDurationS: null, resolutions: [],
    supportsAudio: false, pricingMode: "per_image",
    pricing: { rates: { "1k": 2, "2k": 3, "4k": 5 } },
  },
  "fruit-character": {
    minDurationS: 5, maxDurationS: 5, resolutions: ["480p"],
    supportsAudio: false, pricingMode: "flat", pricing: { credits: 80 },
  },
};

function model(slug: string): Model {
  return {
    id: slug, slug, label: slug, provider: "fal", providerModel: slug,
    kind: "video", modes: ["image"], unitCostCents: null,
    ...ROWS[slug],
  } as Model;
}

Deno.test("server hashes match the app's, case for case", () => {
  for (const c of fixture) {
    assertEquals(paramsHash(c.slug, c.params), c.hash,
      `hash drift for ${c.slug} ${JSON.stringify(c.params)}`);
  }
});

Deno.test("server prices match the app's, case for case", () => {
  for (const c of fixture) {
    assertEquals(quote(model(c.slug), c.params), c.credits,
      `price drift for ${c.slug} ${JSON.stringify(c.params)}`);
  }
});

Deno.test("key order still does not matter in this runtime", () => {
  assertEquals(
    paramsHash("vidu-q3-turbo", { durationS: 5, resolution: "540p" }),
    paramsHash("vidu-q3-turbo", { resolution: "540p", durationS: 5 }),
  );
});
