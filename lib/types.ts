// Domain types. Mirrors replica/schema.sql so the fake data layer and the
// real one (replica-backend) share one shape.

export type PricingMode =
  | "flat"
  | "per_second"
  | "per_second_by_resolution"
  | "per_image";

export type ModelKind = "video" | "image" | "lipsync" | "motion";
export type InputMode = "text" | "image" | "reference" | "audio";

export interface Model {
  id: string;
  slug: string;
  label: string;
  provider: string;
  providerModel: string;
  kind: ModelKind;
  modes: InputMode[];
  minDurationS: number | null;
  maxDurationS: number | null;
  resolutions: string[];
  supportsAudio: boolean;
  pricingMode: PricingMode;
  pricing: {
    credits?: number;
    rate?: number;
    rates?: Record<string, number>;
  };
  /** what we pay the provider, cents per second or per call. Margin lives here. */
  unitCostCents: number | null;
}

/** Which controls a tool's editor renders. Drives the generic editor screen. */
export interface InputSchema {
  photo?: { required: boolean; label: string; hint?: string };
  photo2?: { required: boolean; label: string; hint?: string };
  audio?: { required: boolean; label: string; hint?: string };
  motionRef?: { required: boolean; label: string; hint?: string };
  prompt?: { required: boolean; label: string; placeholder: string; examples?: string[] };
  freeText?: { required: boolean; label: string; placeholder: string };
  duration?: number[];
  resolution?: string[];
  aspect?: string[];
  size?: string[];
  ages?: number[];
  skinTone?: boolean;
  styles?: string[];
}

export interface Tool {
  id: string;
  slug: string;
  label: string;
  blurb: string;
  defaultModelId: string;
  modelIds: string[];
  inputSchema: InputSchema;
}

export interface GenParams {
  durationS?: number;
  resolution?: string;
  aspect?: string;
  size?: string;
  imageCount?: number;
  prompt?: string;
  freeText?: string;
  age?: number;
  skinTone?: string | null;
  style?: string;
  audioOn?: boolean;
}

export type GenerationStatus =
  | "queued" | "submitted" | "running"
  | "succeeded" | "failed" | "cancelled" | "expired";

export interface Generation {
  id: string;
  toolSlug: string;
  modelSlug: string;
  status: GenerationStatus;
  params: GenParams;
  progress: number | null;
  outputUri: string | null;
  creditsQuoted: number;
  creditsCharged: number;
  creditsRefunded: number;
  errorMessage: string | null;
  queuedAt: string;
  finishedAt: string | null;
  isFreeReroll: boolean;
  rerollOf: string | null;
}

export interface Quote {
  id: string;
  toolSlug: string;
  modelSlug: string;
  credits: number;
  paramsHash: string;
  expiresAt: string;
}

export interface Balance {
  balance: number;
  expiring: number;
  nextExpiry: string | null;
}

export interface Pack {
  slug: string;
  label: string;
  priceCents: number;
  credits: number;
  badge?: "popular" | "value";
  note: string;
}
