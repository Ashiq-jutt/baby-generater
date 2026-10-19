// The data layer contract. Screens import ONLY from here.
//
// `fake.ts` implements it in memory today; replica-backend will add
// `supabase.ts` with the same signatures, and swapping the export below
// changes no screen code.

import type {
  Balance, Generation, GenParams, Pack, Quote, Tool,
} from "../types";

export interface DataLayer {
  // auth
  signIn(provider: "apple" | "google" | "email"): Promise<{ userId: string }>;
  signOut(): Promise<void>;
  currentUserId(): string | null;

  // catalogue
  listTools(): Promise<Tool[]>;

  // credits
  getBalance(): Promise<Balance>;
  claimDailyCredits(): Promise<{ granted: number; streak: number; expiresAt: string }>;
  canClaimToday(): Promise<boolean>;
  listPacks(): Promise<Pack[]>;
  buyPack(slug: string): Promise<{ credits: number }>;

  // the core loop
  createQuote(toolSlug: string, modelSlug: string, params: GenParams): Promise<Quote>;
  /**
   * Charges and enqueues atomically. Rejects a stale paramsHash so a price
   * the user saw cannot be redeemed after they changed a setting.
   * `idempotencyKey` makes a retried submit a no-op instead of a second job.
   */
  submitGeneration(input: {
    quoteId: string;
    paramsHash: string;
    toolSlug: string;
    modelSlug: string;
    params: GenParams;
    photoUri?: string;
    audioUri?: string;
    idempotencyKey: string;
  }): Promise<Generation>;
  getGeneration(id: string): Promise<Generation>;
  listGenerations(): Promise<Generation[]>;
  cancelGeneration(id: string): Promise<Generation>;
  rerollGeneration(id: string): Promise<Generation>;
}


export { InsufficientCredits, StaleQuote } from "./errors";
// One line switches the whole app between the in-memory layer and the real
// backend. Screens import `data` from here and never know which it is.
//
//   EXPO_PUBLIC_USE_REAL_BACKEND=1  -> Supabase
//   anything else                   -> the in-memory fake
export { data } from "./resolve";
