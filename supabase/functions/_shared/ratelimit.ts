// Fixed-window limiter in Postgres. Good enough at this scale, and it needs
// no extra service. Auth itself is rate limited by Supabase; this covers the
// expensive routes: anything that spends credits or calls a provider.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export class RateLimited extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super("rate_limited"); this.name = "RateLimited"; this.retryAfter = retryAfter;
  }
}

export async function limit(
  db: SupabaseClient, userId: string, bucket: string,
  max: number, windowSeconds: number,
): Promise<void> {
  const { data, error } = await db.rpc("rate_limit_hit", {
    p_user_id: userId, p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  if (data === false) throw new RateLimited(windowSeconds);
}
