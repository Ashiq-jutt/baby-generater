// The real data layer. Same contract as fake.ts, so no screen changes.
//
// Everything that moves credits goes through an Edge Function holding the
// service role; this client only ever reads with the user's own JWT.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Balance, Generation, GenParams, Pack, Quote, Tool,
} from "../types";
import { InsufficientCredits, StaleQuote } from "./errors";
import type { DataLayer } from "./index";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  throw new Error(
    "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local",
  );
}

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    client = createClient(URL!, ANON!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

let cachedUserId: string | null = null;

/** Thrown for anything the server names in its error envelope. */
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function call<T>(
  path: string, init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(`${URL}/functions/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON!,
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const code = json?.error?.code ?? "server_error";
    const message = json?.error?.message ?? "Something went wrong.";
    if (code === "insufficient_credits") throw new InsufficientCredits(0);
    if (code === "stale_quote") throw new StaleQuote();
    throw new ApiError(code, message, res.status);
  }
  return json as T;
}

/** DB row -> the shape the screens already use. */
function toGeneration(r: Record<string, any>): Generation {
  return {
    id: r.id,
    toolSlug: r.tools?.slug ?? r.tool_slug ?? "",
    modelSlug: r.models?.slug ?? r.model_slug ?? "",
    status: r.status,
    params: (r.params ?? {}) as GenParams,
    progress: r.status === "running" ? null : r.status === "succeeded" ? 1 : null,
    outputUri: r.output_url ?? null,
    creditsQuoted: r.credits_quoted ?? 0,
    creditsCharged: r.credits_charged ?? 0,
    creditsRefunded: r.credits_refunded ?? 0,
    errorMessage: r.error_message ?? null,
    queuedAt: r.queued_at ?? r.created_at,
    finishedAt: r.finished_at ?? null,
    isFreeReroll: !!r.is_free_reroll,
    rerollOf: r.reroll_of ?? null,
  };
}

function toTool(r: Record<string, any>, models: Record<string, any>[]): Tool {
  const m = models.find((x) => x.id === r.default_model_id);
  return {
    id: r.id,
    slug: r.slug,
    label: r.label,
    blurb: r.blurb ?? "",
    defaultModelId: r.default_model_id,
    modelIds: m ? [m.id] : [],
    inputSchema: (r.input_schema ?? {}) as Tool["inputSchema"],
  };
}

/** A signed URL for an output, minted on demand. Outputs are private. */
async function signedOutputUrl(storageKey: string): Promise<string | null> {
  const { data } = await sb().storage.from("outputs").createSignedUrl(storageKey, 3600);
  return data?.signedUrl ?? null;
}

export const supabaseData: DataLayer = {
  async signIn(provider) {
    if (provider === "email") {
      throw new ApiError("use_otp", "Email sign-in uses a one-time code.", 400);
    }
    // Native OAuth: expo-auth-session gets the id token, which is exchanged
    // here. The provider's own SDK never sees our service key.
    const { data, error } = await sb().auth.signInWithOAuth({
      provider: provider === "apple" ? "apple" : "google",
      options: { redirectTo: "babyclip://", skipBrowserRedirect: true },
    });
    if (error) throw new ApiError("sign_in_failed", error.message, 400);
    const { data: { user } } = await sb().auth.getUser();
    cachedUserId = user?.id ?? null;
    void data;
    if (!cachedUserId) throw new ApiError("sign_in_failed", "Could not sign in.", 400);
    return { userId: cachedUserId };
  },

  async signOut() {
    await sb().auth.signOut();
    cachedUserId = null;
  },

  currentUserId() {
    return cachedUserId;
  },

  async listTools() {
    const { tools, models } = await call<{ tools: any[]; models: any[] }>("/catalogue");
    return tools.map((t) => toTool(t, models));
  },

  async getBalance(): Promise<Balance> {
    const r = await call<{ balance: number; expiring: number; nextExpiry: string | null }>(
      "/credits");
    return { balance: r.balance, expiring: r.expiring, nextExpiry: r.nextExpiry };
  },

  async canClaimToday() {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return false;
    const today = new Date();
    const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const { data } = await sb().from("check_ins")
      .select("local_date").eq("local_date", local).maybeSingle();
    return !data;
  },

  async claimDailyCredits() {
    const t = new Date();
    const local = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    return call("/credits/checkin", { method: "POST", body: { localDate: local } });
  },

  async listPacks(): Promise<Pack[]> {
    // Pack prices come from the store (RevenueCat offerings) at runtime, not
    // from us: the store is the source of truth for what the user will pay.
    const { PACKS } = await import("../catalogue");
    return PACKS;
  },

  async buyPack(_slug) {
    // Purchases happen in the store SDK; credits arrive by webhook. The UI
    // polls the balance afterwards rather than trusting a client receipt.
    throw new ApiError(
      "use_store_sdk",
      "Buy through the app store, then your credits appear here.",
      501,
    );
  },

  async createQuote(toolSlug, modelSlug, params): Promise<Quote> {
    const q = await call<{
      id: string; credits: number; paramsHash: string; expiresAt: string;
    }>("/quotes", { method: "POST", body: { toolSlug, modelSlug, params } });
    return {
      id: q.id, toolSlug, modelSlug,
      credits: q.credits, paramsHash: q.paramsHash, expiresAt: q.expiresAt,
    };
  },

  async submitGeneration(input) {
    const { generation } = await call<{ generation: any }>("/generations", {
      method: "POST",
      body: {
        quoteId: input.quoteId,
        paramsHash: input.paramsHash,
        idempotencyKey: input.idempotencyKey,
        inputAssets: input.photoUri ? { photo: input.photoUri } : {},
      },
    });
    return toGeneration(generation);
  },

  async getGeneration(id) {
    const { generation } = await call<{ generation: any }>(`/generations/${id}`);
    const g = toGeneration(generation);
    if (generation.output_asset_id) {
      const { data: a } = await sb().from("assets")
        .select("storage_key").eq("id", generation.output_asset_id).maybeSingle();
      if (a) g.outputUri = await signedOutputUrl(a.storage_key);
    }
    return g;
  },

  async listGenerations() {
    const { generations } = await call<{ generations: any[] }>("/generations");
    return generations.map(toGeneration);
  },

  async cancelGeneration(id) {
    await call(`/generations/${id}/cancel`, { method: "POST" });
    return this.getGeneration(id);
  },

  async rerollGeneration(id) {
    const { generation } = await call<{ generation: any }>(
      `/generations/${id}/reroll`, { method: "POST" });
    return toGeneration(generation);
  },
};

/** Upload a local file and return the asset id to pass as a generation input. */
export async function uploadPhoto(
  localUri: string, mime: string, bytes: number,
): Promise<string> {
  const { assetId, uploadUrl } = await call<{ assetId: string; uploadUrl: string }>(
    "/assets/sign-upload", { method: "POST", body: { kind: "image", mime, bytes } });

  const file = await fetch(localUri);
  const blob = await file.blob();
  const put = await fetch(uploadUrl, {
    method: "PUT", headers: { "Content-Type": mime }, body: blob,
  });
  if (!put.ok) throw new ApiError("upload_failed", "That upload did not work.", 400);

  await call(`/assets/${assetId}/confirm`, { method: "POST" });
  return assetId;
}

export async function recordConsent(): Promise<void> {
  await call("/account/consent", { method: "POST" });
}

export async function registerDevice(pushToken: string, platform: "ios" | "android") {
  await call("/account/devices", { method: "POST", body: { pushToken, platform } });
}

export async function requestDeletion(scope: "photos" | "generations" | "account") {
  return call<{ requestId: string; message: string }>("/account/delete", {
    method: "POST", body: { scope },
  });
}
