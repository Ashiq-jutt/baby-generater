// The background jobs. Called by pg_cron (or any scheduler) with the
// JOBS_SECRET. Not reachable by a user token.
//
//   poll      every 20s  - advance live jobs, refund failures, push on done
//   reap      every 5m   - fail and refund anything running too long
//   expire    hourly     - write expire entries for lapsed grants
//   purge     hourly     - delete source photos past purge_after (F39)
//   deletions hourly     - fulfil deletion_requests
//   reconcile nightly    - assert the ledger balances; alert on drift
import { admin } from "../_shared/auth.ts";
import { fail, json } from "../_shared/cors.ts";
import { providerFor } from "../_shared/providers.ts";

type Db = ReturnType<typeof admin>;

async function notify(db: Db, userId: string, title: string, body: string) {
  const { data } = await db.from("devices").select("push_token").eq("user_id", userId);
  const messages = (data ?? []).map((d) => ({
    to: d.push_token, title, body, sound: "default",
  }));
  if (!messages.length) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (e) { console.error("push", e); }
}

async function poll(db: Db) {
  const { data: live } = await db.from("generations")
    .select("id, user_id, provider, provider_job_id, status")
    .in("status", ["submitted", "running"])
    .not("provider_job_id", "is", null)
    .limit(50);

  let done = 0, failed = 0;
  for (const g of live ?? []) {
    try {
      const res = await providerFor(g.provider!).poll(g.provider_job_id!);

      if (res.status === "running") {
        if (g.status !== "running") {
          await db.from("generations").update({ status: "running" }).eq("id", g.id);
        }
        continue;
      }

      if (res.status === "failed") {
        await db.from("generations").update({
          status: "failed", finished_at: new Date().toISOString(),
          error_code: "provider_failed", error_message: res.message,
        }).eq("id", g.id);
        await db.rpc("refund_generation", { p_generation_id: g.id });
        await notify(db, g.user_id, "That one didn't work",
          "Your credits are back. Nothing was charged.");
        failed++;
        continue;
      }

      // succeeded: copy the output into our own bucket. The provider's URL
      // expires, so storing the file is what makes the video keep working.
      const media = await fetch(res.outputUrl);
      if (!media.ok) throw new Error(`fetch output ${media.status}`);
      const bytes = new Uint8Array(await media.arrayBuffer());
      const ext = res.mime.includes("mp4") ? "mp4" : res.mime.includes("png") ? "png" : "jpg";
      const key = `${g.user_id}/${g.id}.${ext}`;

      const up = await db.storage.from("outputs")
        .upload(key, bytes, { contentType: res.mime, upsert: true });
      if (up.error) throw up.error;

      const { data: asset, error: aErr } = await db.from("assets").insert({
        user_id: g.user_id, kind: ext === "mp4" ? "video" : "image",
        source: "generated", storage_key: key, mime: res.mime, bytes: bytes.byteLength,
      }).select("id").single();
      if (aErr) throw aErr;

      await db.from("generations").update({
        status: "succeeded", finished_at: new Date().toISOString(),
        output_asset_id: asset.id,
      }).eq("id", g.id);
      await notify(db, g.user_id, "Your video is ready", "Tap to see it.");
      done++;
    } catch (e) {
      console.error("poll", g.id, e);
      // a poll that keeps throwing is caught by reap_stalled, which refunds
    }
  }
  return { polled: (live ?? []).length, done, failed };
}

async function purge(db: Db) {
  const { data: stale } = await db.from("assets")
    .select("id, storage_key").lte("purge_after", new Date().toISOString())
    .is("deleted_at", null).eq("source", "upload").limit(200);
  if (!stale?.length) return { purged: 0 };
  await db.storage.from("uploads").remove(stale.map((a) => a.storage_key));
  await db.from("assets").update({ deleted_at: new Date().toISOString() })
    .in("id", stale.map((a) => a.id));
  return { purged: stale.length };
}

async function deletions(db: Db) {
  const { data: reqs } = await db.from("deletion_requests")
    .select("id, user_id, scope").is("completed_at", null).limit(20);
  let n = 0;
  for (const r of reqs ?? []) {
    if (r.scope === "photos" || r.scope === "account") {
      const { data: own } = await db.from("assets")
        .select("storage_key").eq("user_id", r.user_id).is("deleted_at", null);
      const keys = (own ?? []).map((a) => a.storage_key);
      if (keys.length) {
        await db.storage.from("uploads").remove(keys);
        await db.storage.from("outputs").remove(keys);
      }
      await db.from("assets").update({ deleted_at: new Date().toISOString() })
        .eq("user_id", r.user_id);
    }
    if (r.scope === "account") {
      // cascades through every table that references the user
      await db.auth.admin.deleteUser(r.user_id);
    }
    await db.from("deletion_requests")
      .update({ completed_at: new Date().toISOString() }).eq("id", r.id);
    n++;
  }
  return { deletions: n };
}

/**
 * The ledger must always balance. This is how a ledger bug is found before
 * users report it in reviews.
 */
async function reconcile(db: Db) {
  const { data, error } = await db.rpc("reconcile_ledger");
  if (error) throw error;
  const drift = (data ?? []) as Array<{ grant_id: string; remaining: number; entry_sum: number }>;
  if (drift.length) console.error("LEDGER DRIFT", JSON.stringify(drift));
  return { drift: drift.length, rows: drift.slice(0, 10) };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("JOBS_SECRET");
  if (!secret || req.headers.get("x-jobs-secret") !== secret) {
    return fail("unauthorized", "No.", 401);
  }
  const job = new URL(req.url).searchParams.get("job") ?? "poll";
  const db = admin();
  try {
    switch (job) {
      case "poll":      return json(await poll(db));
      case "reap": {
        const { data } = await db.rpc("reap_stalled", { p_max_minutes: 15 });
        return json({ reaped: data ?? 0 });
      }
      case "expire": {
        const { data } = await db.rpc("expire_grants");
        return json({ expired: data ?? 0 });
      }
      case "purge":     return json(await purge(db));
      case "deletions": return json(await deletions(db));
      case "reconcile": return json(await reconcile(db));
      case "sweep": {
        const { data } = await db.rpc("sweep_rate_limits");
        return json({ swept: data ?? 0 });
      }
      default: return fail("unknown_job", `No job called ${job}.`, 400);
    }
  } catch (e) {
    console.error("job", job, e);
    return fail("job_failed", String(e), 500);
  }
});
