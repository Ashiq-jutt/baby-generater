import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Service-role client. Bypasses RLS, so it is used ONLY after the caller's
 * identity has been established by `requireUser`, and never with a user-supplied
 * user_id.
 */
export function admin(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { persistSession: false } });
}

/**
 * Resolves the caller from the Authorization header. The user id comes from
 * the verified JWT, never from the request body - that is the whole point.
 */
export async function requireUser(req: Request): Promise<{ id: string; email: string | null }> {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) throw new Unauthorized();
  const token = header.slice(7);

  const client = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Unauthorized();
  return { id: data.user.id, email: data.user.email ?? null };
}

export class Unauthorized extends Error {
  constructor() { super("unauthorized"); this.name = "Unauthorized"; }
}
