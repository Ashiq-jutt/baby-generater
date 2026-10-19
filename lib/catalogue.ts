// Seed catalogue. These rows mirror what babyvideo.ai publishes on its own
// pages (recon.md) so the clone's prices are comparable. unitCostCents is
// UNVERIFIED - get real provider quotes before launch; see architecture.md.

import type { Model, Pack, Tool } from "./types";

export const CENTS_PER_CREDIT_IAP = 1.48;  // $19.99 pack at Apple 15%
export const CENTS_PER_CREDIT_WEB = 1.66;  // same pack via Stripe

export const MODELS: Model[] = [
  {
    id: "m-vidu-q3-turbo", slug: "vidu-q3-turbo", label: "Vidu Q3 Turbo",
    provider: "fal", providerModel: "fal-ai/vidu/q3/turbo",
    kind: "video", modes: ["image"],
    minDurationS: 1, maxDurationS: 16,
    resolutions: ["540p", "720p", "1080p"], supportsAudio: true,
    pricingMode: "per_second_by_resolution",
    pricing: { rates: { "540p": 5, "720p": 9, "1080p": 16 } },
    unitCostCents: null,
  },
  {
    id: "m-kling-avatar", slug: "kling-avatar", label: "Kling Avatar",
    provider: "fal", providerModel: "fal-ai/kling/avatar",
    kind: "lipsync", modes: ["image", "audio"],
    minDurationS: 1, maxDurationS: 60,
    resolutions: ["480p", "720p"], supportsAudio: true,
    pricingMode: "per_second_by_resolution",
    pricing: { rates: { "480p": 16, "720p": 30 } },
    unitCostCents: null,
  },
  {
    id: "m-kling-motion", slug: "kling-motion-control", label: "Kling Motion Control",
    provider: "fal", providerModel: "fal-ai/kling/v2.6/motion-control",
    kind: "motion", modes: ["image", "reference"],
    minDurationS: 1, maxDurationS: 30,
    resolutions: ["720p"], supportsAudio: false,
    pricingMode: "per_second", pricing: { rate: 11 },
    unitCostCents: null,
  },
  {
    id: "m-gpt-image", slug: "gpt-image-flare", label: "GPT Image Flare",
    provider: "fal", providerModel: "fal-ai/gpt-image/flare",
    kind: "image", modes: ["text", "image"],
    minDurationS: null, maxDurationS: null,
    resolutions: [], supportsAudio: false,
    pricingMode: "per_image", pricing: { rates: { "1k": 2, "2k": 3, "4k": 5 } },
    unitCostCents: null,
  },
  {
    id: "m-age", slug: "age-progress", label: "Age Progression",
    provider: "fal", providerModel: "fal-ai/nano-banana",
    kind: "image", modes: ["image"],
    minDurationS: null, maxDurationS: null,
    resolutions: [], supportsAudio: false,
    pricingMode: "per_image", pricing: { rates: { "1k": 3 } },
    unitCostCents: null,
  },
  {
    id: "m-fruit", slug: "fruit-character", label: "Fruit Character",
    provider: "fal", providerModel: "fal-ai/seedance/v2.5",
    kind: "video", modes: ["image"],
    minDurationS: 5, maxDurationS: 5,
    resolutions: ["480p"], supportsAudio: false,
    pricingMode: "flat", pricing: { credits: 80 },
    unitCostCents: null,
  },
];

export const modelBySlug = (slug: string): Model => {
  const m = MODELS.find((x) => x.slug === slug);
  if (!m) throw new Error(`unknown model ${slug}`);
  return m;
};

const PROMPT_EXAMPLES = [
  "Smiles at the camera and gives one small wave, soft morning light",
  "Blinks, then laughs. Cosy nursery behind, gentle camera push in",
  "Looks up, surprised and delighted, confetti drifting down",
];

export const TOOLS: Tool[] = [
  {
    id: "t-baby-video", slug: "baby-video", label: "Photo to video",
    blurb: "One photo, one small movement. The place to start.",
    defaultModelId: "m-vidu-q3-turbo",
    modelIds: ["m-vidu-q3-turbo"],
    inputSchema: {
      photo: { required: true, label: "Baby photo", hint: "Front-facing, eyes and mouth visible" },
      prompt: {
        required: true, label: "What should happen",
        placeholder: "Describe one movement and the mood",
        examples: PROMPT_EXAMPLES,
      },
      duration: [5, 8, 10],
      resolution: ["540p", "720p", "1080p"],
      aspect: ["9:16", "16:9"],
      skinTone: true,
    },
  },
  {
    id: "t-talking", slug: "talking-baby", label: "Talking baby",
    blurb: "Record a line and the photo says it back.",
    defaultModelId: "m-kling-avatar",
    modelIds: ["m-kling-avatar"],
    inputSchema: {
      photo: { required: true, label: "Baby photo", hint: "Mouth, eyes and cheeks visible" },
      audio: { required: true, label: "Your recording", hint: "Keep it short and clear" },
      resolution: ["480p", "720p"],
      skinTone: false,
    },
  },
  {
    id: "t-dancing", slug: "dancing-baby", label: "Dancing baby",
    blurb: "Pick a move, the photo follows it.",
    defaultModelId: "m-kling-motion",
    modelIds: ["m-kling-motion"],
    inputSchema: {
      photo: { required: true, label: "Baby photo" },
      motionRef: { required: true, label: "Dance to follow", hint: "Pick a sample or add your own clip" },
      duration: [5, 8, 10],
      skinTone: false,
    },
  },
  {
    id: "t-cartoon", slug: "cartoon-baby", label: "Cartoon baby",
    blurb: "A cartoon portrait. Cheapest thing here.",
    defaultModelId: "m-gpt-image",
    modelIds: ["m-gpt-image"],
    inputSchema: {
      photo: { required: true, label: "Baby photo" },
      styles: ["Soft pastel", "Bold outline", "Watercolour", "Claymation"],
      size: ["1k", "2k", "4k"],
      aspect: ["1:1", "9:16"],
      skinTone: true,
    },
  },
  {
    id: "t-grow-up", slug: "grow-up", label: "Grow up",
    blurb: "One photo, a few different ages.",
    defaultModelId: "m-age",
    modelIds: ["m-age"],
    inputSchema: {
      photo: { required: true, label: "Baby photo" },
      ages: [1, 5, 10, 18, 25, 50, 75],
      size: ["1k"],
      skinTone: true,
    },
  },
  {
    id: "t-fruit", slug: "fruit-baby", label: "Fruit baby",
    blurb: "Silly, and the kids love it.",
    defaultModelId: "m-fruit",
    modelIds: ["m-fruit"],
    inputSchema: {
      photo: { required: true, label: "Baby photo" },
      freeText: { required: true, label: "Which fruit", placeholder: "mango" },
      duration: [5],
      resolution: ["480p"],
      aspect: ["1:1", "9:16"],
    },
  },
];

export const toolBySlug = (slug: string): Tool => {
  const t = TOOLS.find((x) => x.slug === slug);
  if (!t) throw new Error(`unknown tool ${slug}`);
  return t;
};

export const modelById = (id: string): Model => {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown model id ${id}`);
  return m;
};

// Packs. In-app prices sit above web prices because the stores take a cut.
export const PACKS: Pack[] = [
  { slug: "mini", label: "Mini", priceCents: 699, credits: 300,
    note: "About 12 five-second videos" },
  { slug: "starter", label: "Starter", priceCents: 1199, credits: 550,
    note: "About 22 five-second videos" },
  { slug: "creator", label: "Creator", priceCents: 2299, credits: 1150,
    badge: "popular", note: "About 46 five-second videos" },
  { slug: "studio", label: "Studio", priceCents: 4599, credits: 2400,
    badge: "value", note: "About 96 five-second videos" },
];
