// Provider adapters. Official public APIs only, with the user's own key.
//
// `models.provider` is a database column precisely so a failing gateway is a
// row update, not a deploy.

export interface SubmitInput {
  providerModel: string;
  inputs: Record<string, unknown>;
  webhookUrl?: string;
}
export interface SubmitResult { providerJobId: string }
export type PollResult =
  | { status: "running"; progress: number | null }
  | { status: "succeeded"; outputUrl: string; mime: string }
  | { status: "failed"; message: string };

export interface Provider {
  submit(i: SubmitInput): Promise<SubmitResult>;
  poll(providerJobId: string): Promise<PollResult>;
  cancel(providerJobId: string): Promise<void>;
}

const FAL_KEY = () => {
  const k = Deno.env.get("FAL_KEY");
  if (!k) throw new Error("FAL_KEY is not set");
  return k;
};

/** https://docs.fal.ai - queue API. */
export const fal: Provider = {
  async submit({ providerModel, inputs, webhookUrl }) {
    const url = new URL(`https://queue.fal.run/${providerModel}`);
    if (webhookUrl) url.searchParams.set("fal_webhook", webhookUrl);
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY()}`, "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
    });
    if (!r.ok) throw new Error(`fal submit ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    const id = j.request_id ?? j.requestId;
    if (!id) throw new Error("fal submit: no request_id in response");
    return { providerJobId: String(id) };
  },

  async poll(providerJobId) {
    const r = await fetch(
      `https://queue.fal.run/requests/${providerJobId}/status`,
      { headers: { Authorization: `Key ${FAL_KEY()}` } },
    );
    if (!r.ok) return { status: "running", progress: null };
    const j = await r.json();
    const s = String(j.status ?? "").toUpperCase();

    if (s === "IN_QUEUE" || s === "IN_PROGRESS") {
      return { status: "running", progress: null };
    }
    if (s !== "COMPLETED") {
      return { status: "failed", message: j.error ?? "The model could not finish this one." };
    }

    const rr = await fetch(`https://queue.fal.run/requests/${providerJobId}`,
      { headers: { Authorization: `Key ${FAL_KEY()}` } });
    if (!rr.ok) return { status: "failed", message: "Could not read the finished result." };
    const out = await rr.json();
    const media = out?.video ?? out?.image ?? out?.images?.[0] ?? out?.output;
    const url = typeof media === "string" ? media : media?.url;
    if (!url) return { status: "failed", message: "The model returned nothing usable." };
    return {
      status: "succeeded",
      outputUrl: String(url),
      mime: String(media?.content_type ?? (String(url).endsWith(".mp4") ? "video/mp4" : "image/png")),
    };
  },

  async cancel(providerJobId) {
    await fetch(`https://queue.fal.run/requests/${providerJobId}/cancel`,
      { method: "PUT", headers: { Authorization: `Key ${FAL_KEY()}` } });
  },
};

export function providerFor(name: string): Provider {
  switch (name) {
    case "fal": return fal;
    default: throw new Error(`no adapter for provider ${name}`);
  }
}

/**
 * Maps our params onto a model's own input names. Kept here so adding a model
 * is a catalogue row plus one case, never a change to the job pipeline.
 */
export function buildInputs(
  modelSlug: string,
  params: Record<string, unknown>,
  media: { photoUrl?: string; photo2Url?: string; audioUrl?: string; motionUrl?: string },
): Record<string, unknown> {
  const prompt = String(params.prompt ?? "");
  const tone = params.skinTone ? String(params.skinTone).replace(/-/g, " ") : null;
  // The skin tone is appended as explicit guidance rather than left for the
  // model to guess - that guess is the thing users complained about (F31).
  const guided = tone
    ? `${prompt}. The baby has ${tone} skin, kept faithful to the photo.`
    : prompt;

  switch (modelSlug) {
    case "vidu-q3-turbo":
      return {
        image_url: media.photoUrl, prompt: guided,
        duration: Number(params.durationS ?? 5),
        resolution: String(params.resolution ?? "540p"),
        aspect_ratio: String(params.aspect ?? "9:16"),
      };
    case "kling-avatar":
      return {
        image_url: media.photoUrl, audio_url: media.audioUrl,
        resolution: String(params.resolution ?? "480p"),
      };
    case "kling-motion-control":
      return {
        image_url: media.photoUrl, video_url: media.motionUrl,
        duration: Number(params.durationS ?? 5),
      };
    case "gpt-image-flare":
      return {
        image_url: media.photoUrl,
        prompt: `${String(params.style ?? "Soft pastel")} cartoon portrait. ${guided}`,
        image_size: String(params.size ?? "1k"),
        aspect_ratio: String(params.aspect ?? "1:1"),
      };
    case "age-progress":
      return {
        image_url: media.photoUrl,
        prompt: `The same child at about ${Number(params.age ?? 10)} years old.`
          + (tone ? ` Keep ${tone} skin.` : ""),
      };
    case "fruit-character":
      return {
        image_url: media.photoUrl,
        prompt: `A cute 3D ${String(params.freeText ?? "mango")} character with this baby's face.`,
        duration: 5, resolution: "480p",
      };
    default:
      throw new Error(`no input mapping for model ${modelSlug}`);
  }
}
