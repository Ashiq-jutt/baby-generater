// POST   /assets/sign-upload - signed upload URL, with the limits enforced here
// POST   /assets/:id/confirm - mark uploaded
// DELETE /assets/:id         - purge now (F39)
//
// The storage key is always <user_id>/..., which is what the storage RLS
// policy checks, so one user can never write into another's prefix.
import { admin, requireUser, Unauthorized } from "../_shared/auth.ts";
import { corsHeaders, fail, json } from "../_shared/cors.ts";
import { limit, RateLimited } from "../_shared/ratelimit.ts";
import { Invalid, num, str, uuid } from "../_shared/validate.ts";

const LIMITS = {
  image: { bytes: 10 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/heic", "image/webp"] },
  audio: { bytes: 25 * 1024 * 1024, mimes: ["audio/mpeg", "audio/mp4", "audio/m4a", "audio/wav"] },
  video: { bytes: 50 * 1024 * 1024, mimes: ["video/mp4", "video/quicktime"] },
} as const;

// source photos are deleted shortly after the render; outputs are kept
const PURGE_HOURS = 24;

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  try {
    const user = await requireUser(req);
    const db = admin();
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    const second = parts[1];
    const action = parts[2];

    if (req.method === "POST" && second === "sign-upload") {
      await limit(db, user.id, "upload", 60, 3600);
      const body = await req.json();
      const kind = str(body.kind, "kind", 8) as keyof typeof LIMITS;
      if (!(kind in LIMITS)) return fail("invalid", "Unknown file kind.", 400, origin);
      const mime = str(body.mime, "mime", 80);
      const bytes = num(body.bytes, "bytes", 1, LIMITS[kind].bytes);
      if (!(LIMITS[kind].mimes as readonly string[]).includes(mime)) {
        return fail("unsupported_type",
          `We cannot read that file type. Try ${kind === "image" ? "JPEG or PNG" : "MP4 or M4A"}.`,
          400, origin);
      }

      const ext = mime.split("/")[1]?.replace("quicktime", "mov") ?? "bin";
      const key = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { data: signed, error: sErr } = await db.storage.from("uploads")
        .createSignedUploadUrl(key);
      if (sErr) throw sErr;

      const { data: asset, error } = await db.from("assets").insert({
        user_id: user.id, kind, source: "upload", storage_key: key,
        mime, bytes, purge_after: new Date(Date.now() + PURGE_HOURS * 3600_000).toISOString(),
      }).select("id").single();
      if (error) throw error;

      return json({
        assetId: asset.id, uploadUrl: signed.signedUrl, token: signed.token, path: key,
      }, 200, origin);
    }

    if (req.method === "POST" && second && action === "confirm") {
      const id = uuid(second, "id");
      const { data, error } = await db.from("assets")
        .update({ source: "upload" }).eq("id", id).eq("user_id", user.id)
        .select("id").maybeSingle();
      if (error) throw error;
      if (!data) return fail("not_found", "We could not find that upload.", 404, origin);
      return json({ ok: true }, 200, origin);
    }

    if (req.method === "DELETE" && second) {
      const id = uuid(second, "id");
      const { data: a } = await db.from("assets")
        .select("storage_key").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!a) return fail("not_found", "We could not find that file.", 404, origin);
      await db.storage.from("uploads").remove([a.storage_key]);
      await db.from("assets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      return json({ deleted: true }, 200, origin);
    }

    return fail("method_not_allowed", "Not a route.", 405, origin);
  } catch (e) {
    if (e instanceof Unauthorized) return fail("unauthorized", "Please sign in.", 401, origin);
    if (e instanceof RateLimited) return fail("rate_limited", "Slow down a moment.", 429, origin);
    if (e instanceof Invalid) return fail("invalid", e.message, 400, origin);
    console.error("assets", e);
    return fail("server_error", "That upload did not work.", 500, origin);
  }
});
