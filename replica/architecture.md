# Architecture: your AI baby video app (a rebuild of babyvideo.ai's core features)

From `recon.md` (24 screens, 6 flows, 9 entities) and `features.csv`
(45 rows: 21 must, 13 should, 6 could, 5 skip).

Target: **native iOS + Android**, because the original is web-only with no
store listing. That is the structural advantage, and it is also what makes
the billing hard. Read the economics section before you write any code.

## Stack

| layer | choice | why |
| --- | --- | --- |
| mobile app | **Expo (React Native) + TypeScript**, expo-router | You already ship RN/Expo. EAS Build handles both stores; OTA updates let you fix the editor without a review cycle. |
| styling | Tailwind via **NativeWind**, tokens from `/replica-design` | One token set for app and marketing site. |
| media | `expo-image-picker`, `expo-audio`, `expo-video`, `expo-file-system` | Covers upload, in-app recording (F13) and MP4 playback/save (F33). |
| backend | **Supabase** (Postgres + Auth + Storage + Edge Functions) | One managed box for the database, auth, files and RLS. No second service to operate at zero users. |
| ORM | **Drizzle** | SQL-first, so `schema.sql` stays the source of truth instead of being generated away. |
| auth | **Supabase Auth** — Apple, Google, email OTP | Sign in with Apple is mandatory on iOS once you offer any other social login. |
| model gateway | **fal.ai** primary, **Replicate** fallback | One API key for Vidu, Kling, Seedance, Veo, FLUX. Two gateways so one provider's outage is not your outage. `models` rows carry the provider, so switching is a row edit. |
| jobs | **Supabase Edge Functions** + `pg_cron` poller; webhooks where the provider offers them | Generation is 30 s–5 min, far past any HTTP timeout. Jobs must outlive the app being backgrounded. |
| payments | **RevenueCat** over Apple IAP + Google Play Billing; **Stripe Checkout** for web top-up | RevenueCat normalises two store receipt formats and gives you one webhook. Stripe is the margin rail — see below. |
| files | **Supabase Storage**, private buckets, signed URLs | Child photos must never sit on a public URL. |
| push | **Expo Notifications** | "Your video is ready" is the whole retention loop (F06). |
| email | **Resend** | Receipts and deletion confirmations only. |
| hosting (site) | **Vercel** | Marketing site, web top-up, privacy pages. |
| monitoring | **Sentry** + a `generations` failure-rate dashboard | Your #1 review complaint class is "it didn't work". Watch it directly. |

One Postgres database. No microservices. No Kubernetes.

## The economics, before the code

This decides whether the app is a business, so it goes first.

Apple and Google take a cut of in-app credit purchases. Guideline 3.1.1 still
requires digital content to be unlocked through In-App Purchase, so you cannot
simply put Stripe inside the app. On the **US storefront**, Apple's anti-steering
rules are currently suspended under the Epic contempt order, so a US app may
link out to your own web checkout with **no Apple commission at present**.
That is under appeal (Apple's Supreme Court merits brief was filed 2026-09-14,
and Apple has asked for a 15% link-out fee). Verify Apple's live guidelines
before launch; do not build a business that only works at 0%.

What that does to a $19.99 / 1,150-credit pack:

| rail | net to you | net per credit | net on a 25-credit video |
| --- | --- | --- | --- |
| Apple/Google at 30% | $13.99 | $0.0122 | **$0.30** |
| Apple/Google at 15% (Small Business Program, under $1M/yr) | $16.99 | $0.0148 | **$0.37** |
| Stripe on the web (2.9% + 30¢) | $19.11 | $0.0166 | **$0.42** |

Three consequences, all of them architectural:

1. **Enrol in the Apple Small Business Program and Google's equivalent on day
   one.** 15% not 30% is the difference between a margin and a hobby.
2. **Build both rails from the start.** `purchases.provider` already allows
   `apple | google | stripe`, and credits are granted identically by all three.
   Price in-app packs ~20% above web packs, and (US only, while the rules hold)
   offer the web link.
3. **The number you must verify before writing a line of code** is the
   provider cost of your cheapest 5-second 540p image-to-video generation.
   Your gross margin per video is `net_per_credit × quoted_credits −
   provider_cost`. At the 15% Apple rate and 25 credits, you break even at a
   provider cost of **$0.37 per 5 s clip (~$0.074/s)**. Get a real quote from
   fal for Vidu Q3 Turbo at 540p and put it in `models.unit_cost_cents`.
   I do not have a verified figure for that model and tier, and every other
   decision here depends on it.

Note what the original's own rate card implies: they sell a 5 s video for
~$0.43 of credits. Nobody sells below cost for long, so their provider cost
is likely well under that. Good news — but confirm it, do not assume it.

## Schema

`replica/schema.sql`. **15 tables**, 2 functions, 1 view, RLS on all 14
user-facing tables.

**It loads and the ledger passes its tests.** Run yourself:

```bash
createdb replica_test
psql -d replica_test -c 'create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;'
psql -d replica_test -v ON_ERROR_STOP=1 -f replica/schema.sql
```

Tables: `users`, `models`, `tools`, `tool_models`, `assets`, `credit_grants`,
`credit_entries`, `purchases`, `check_ins`, `quotes`, `generations`,
`generation_inputs`, `gallery_posts`, `devices`, `deletion_requests`.
Plus the `credit_balances` view and the `spend_credits` / `refund_generation`
functions.

### Why the ledger is two tables

`recon.md` found the constraint that breaks a naive design: **paid credits
never expire, free credits do.** A single `balance integer` column cannot
express that, and neither can a single ledger — you need to know which batch
each credit came from to know when it dies.

So: `credit_grants` is one row per batch with **its own `expires_at`**
(null = paid = never), and `credit_entries` is the append-only audit trail,
one row per grant touched. Balance is the sum of `remaining` over unexpired
grants.

Spending draws **expiring-soonest-first**. That matters: spend paid credits
first and the user's free credits silently rot, which is the complaint you are
here to fix.

`refund_generation` reverses a failed job's entries back into **the same
grants** (F34), and is idempotent. If a grant expired while the job was
running, those credits are re-granted fresh with 14 days rather than lost —
the user should not pay for your failure.

### Tested, not asserted

Seven ledger tests plus a concurrency test, all run against Postgres 16:

| test | result |
| --- | --- |
| Balance ignores expired grants (120, not 170) | pass |
| Spend draws free credits before paid | pass |
| Refund restores the exact grants it drew from | pass |
| Second refund call is a no-op | pass |
| Overspend raises `insufficient_credits` | pass |
| Entries reconcile to every grant's `remaining` | pass |
| **Two concurrent 100-credit spends against a 120 balance: one succeeds, one fails** | pass |

That last one is the only test that matters financially. `spend_credits`
takes `FOR UPDATE` on the user's spendable grants in expiry order; the second
transaction blocks, re-evaluates its `WHERE remaining > 0` after the lock
releases, finds nothing left and raises. No double-spend, no negative balance.

### Hard constraints pushed into the database

Not left to the UI:

- `unique (user_id, idempotency_key)` on `generations` — a retried submit from
  a flaky mobile connection cannot create a second paid job.
- `unique (provider, provider_ref)` on `purchases` — a replayed store webhook
  cannot grant credits twice.
- `unique (user_id, local_date)` on `check_ins` — one claim per day.
- `unique index on generations(reroll_of) where is_free_reroll` — exactly one
  free re-roll per generation (F35).
- `check (remaining <= amount)` and `check (credits_refunded <= credits_charged)`.
- `check (status not in terminal... or finished_at is not null)`.

### The quote engine

Four pricing modes across ~10 models, re-quoted on every setting change.
Keep it a **pure function** over a `models` row — no provider calls, no
network, trivially testable:

```ts
export function quote(model: Model, p: GenParams): number {
  switch (model.pricing_mode) {
    case 'flat':       return model.pricing.credits;
    case 'per_second': return Math.ceil(model.pricing.rate * p.duration_s);
    case 'per_second_by_resolution': {
      const rate = model.pricing.rates[p.resolution];
      if (rate == null) throw new UnsupportedSetting('resolution', p.resolution);
      return Math.ceil(rate * p.duration_s);
    }
    case 'per_image': {
      const rate = model.pricing.rates[p.size];
      if (rate == null) throw new UnsupportedSetting('size', p.size);
      return rate * (p.image_count ?? 1);
    }
  }
}
```

Always `Math.ceil` — audio-driven models bill on detected duration rounded up,
and rounding down means you eat the difference on every single job.

A quote is persisted with `params_hash` = sha256 of the canonicalised params.
Submitting re-derives the hash; if it does not match a live unconsumed quote,
the submit is rejected and the client must re-quote. That is how
"changes to the settings require an updated quote" is enforced on the server
rather than trusted from the client.

## API

Supabase Edge Functions. Every route authenticates the caller and derives
`user_id` from the JWT — never from the body.

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `GET /catalogue` | tools + models + constraints + rates | public | — | tools[], models[] | all editors |
| `POST /assets/sign-upload` | signed upload URL, enforces type and size | user | kind, mime, bytes | url, asset_id | F01–F04 |
| `POST /assets/:id/confirm` | mark uploaded, read dimensions/duration | user | — | asset | F01–F04 |
| `DELETE /assets/:id` | purge now (F39) | owner | — | 204 | privacy |
| `POST /quotes` | price a param set | user | tool, model, params | quote_id, credits, params_hash, expires_at | all editors |
| `POST /generations` | charge + enqueue, atomically | user | quote_id, params_hash, input asset ids, idempotency_key | generation | F02–F04 |
| `GET /generations/:id` | poll status | owner | — | status, progress, output | F02–F04 |
| `GET /generations` | My Creations, paginated | owner | cursor | generation[] | F02 |
| `POST /generations/:id/reroll` | one free retry (F35) | owner | — | generation | F02 |
| `POST /generations/:id/cancel` | cancel + refund | owner | — | 202 | F02 |
| `GET /credits` | balance, next expiry, history | user | — | balance, expiring, entries[] | F05 |
| `POST /credits/checkin` | claim daily credits | user | local_date, tz | granted, streak | F06 |
| `GET /packs` | credit packs for this platform | user | platform | pack[] | F05 |
| `POST /purchases/stripe/session` | web top-up checkout | user | pack_slug | checkout_url | F05 |
| `POST /consent` | record parental consent (F38) | user | — | user | onboarding |
| `POST /account/delete` | queue full deletion | user | scope | request | privacy |
| `POST /devices` | register push token | user | token, platform | 204 | F02 |

**Webhooks in:** RevenueCat (Apple + Google purchases, refunds, chargebacks) →
grant or claw back credits, keyed on `provider_ref`. Stripe
`checkout.session.completed`. fal.ai / Replicate job-completion callbacks.

**Webhooks out:** none at launch.

**Jobs:**

| job | schedule | does |
| --- | --- | --- |
| `poll-generations` | every 20 s | poll non-terminal jobs at the provider; on success store output, on failure call `refund_generation` and push |
| `reap-stalled` | every 5 min | jobs running > 15 min → `failed`, refund, push |
| `expire-grants` | hourly | write `expire` entries, zero `remaining` on lapsed grants |
| `purge-assets` | hourly | delete source photos past `purge_after` (F39) |
| `process-deletions` | hourly | fulfil `deletion_requests` |
| `reconcile-ledger` | nightly | assert entries sum to every grant's `remaining`; alert on drift |

`reconcile-ledger` is not optional. It is how you find out a ledger bug exists
before your users tell you in reviews.

## The parts that bite

- **Store commission.** Covered above. It is the single biggest number in this
  app and it is not a technical problem.
- **Idempotency.** Store webhooks arrive two and three times. `unique (provider,
  provider_ref)` on `purchases` and `unique (user_id, idempotency_key)` on
  `generations` make a replay a no-op instead of free credits.
- **Races.** Double-spend is handled and tested. The other one is submit-twice
  from a backgrounded app; the idempotency key covers it.
- **Charge-then-enqueue must be one transaction.** `spend_credits` and the
  `generations` insert commit together, and the provider is only called *after*
  commit. Call the provider first and a crash gives a free generation; charge
  without enqueuing and you have stolen credits.
- **Refund on failure is a product feature, not error handling.** F34 came from
  11 reviews. It must be impossible to fail a job without refunding.
- **Time zones.** `check_ins.local_date` is the user's day, sent from the
  device, so "once a day" means their midnight. Everything else is
  `timestamptz` in UTC. Never trust the device clock for expiry — expiry is
  computed server-side with `now()`.
- **Rounding.** `Math.ceil` everywhere, and bill on the provider's *detected*
  audio duration, not the client's claim.
- **Mobile audio.** Their own guides say late-starting audio is the main cause
  of bad lipsync. Trim leading silence on-device before upload: cheaper, and it
  stops the user paying for a second of silence at 30 credits.
- **File limits.** Cap uploads in the signing route (images 10 MB, audio 25 MB /
  60 s, reference video 50 MB / 30 s) and reject at the edge. A 200 MB upload
  on cellular is a support ticket.
- **Child photos / GDPR.** Private buckets, signed URLs only, `purge_after` on
  every source photo, a visible delete control, consent recorded before first
  generation, and a terms page that actually addresses it (F38). The original's
  terms are 2.5 KB and silent on this; yours cannot be.
- **App Store review.** An app built on photos of babies gets looked at hard.
  Expect to justify consent, data retention, and AI labelling (F40). Budget a
  rejection round.
- **Provider outage.** `models.provider` is a column precisely so a failing
  gateway is a row update, not a deploy.

## Build order

### 1. Vertical slice — prove the stack end to end (the weekend)

Sign in → claim free credits → upload one photo → quote → generate a 5 s
540p video on Vidu Q3 Turbo → poll → download. Ugly, one screen, no styling.

- screens: S02 sign-in, S07 Baby Photo to Video, S06 My Creations
- tables: `users`, `models`, `tools`, `assets`, `credit_grants`,
  `credit_entries`, `quotes`, `generations`, `generation_inputs`
- routes: `/catalogue`, `/assets/sign-upload`, `/assets/:id/confirm`,
  `/quotes`, `/generations`, `/generations/:id`
- jobs: `poll-generations`
- features: F01, F02, F05, F06, F07, F08, F09, F11, F34

Ship nothing else until a real video comes out of a real phone.

### 2. Must-haves

- **Billing both rails:** F03, F04 + RevenueCat and Stripe webhooks,
  `purchases`, `check_ins`, `reap-stalled`, `expire-grants`
  (screens S03, S04, S05)
- **Privacy and trust:** F38, F39, F40, `deletion_requests`, `purge-assets`,
  `process-deletions`, consent gate
- **The differentiators:** F31 skin tone / hair / feature controls — the one
  thing none of their 12 tools has — F32 native, F33 MP4
- **Audio tools:** F12 talking baby, F13 in-app recording (screen S09)
- **The cheap hooks:** F19 cartoon baby (2 credits), F20 future baby
  (screen S01, S15) — these are what gets the install
- **Per-model settings:** F10

### 3. Should-haves

F14 podcast (S08), F15 singing (S10), F16 dancing + F17 sample motion library
(S11), F21 age progression (S14), F23 model picker behind an Advanced toggle
(S17), F27 guides, F28 locales, F29 free-tier watermark,
F35 free re-roll, F36 kinder free-credit expiry, F37 cheaper audio route.

### 4. Could-haves

F18 meme (S12), F22 fruit baby (S13), F24 image generator (S16),
F25 birthday slideshow (S18 — a real video editor, defer hard),
F26 baby names (S19), F30 public gallery.

### Explicitly not built

F41–F45: no own model, no copied showcase media, no copied prompt library,
no cloned SEO estate, no scraped gallery. See `recon.md`.

## Summary

- **Stack:** Expo + Supabase Postgres + fal.ai + RevenueCat/Stripe, one database.
- **15 tables**, 17 routes, 6 background jobs.
- **Riskiest parts:** (1) the store commission against per-video GPU cost — get
  a real fal quote for Vidu Q3 Turbo 540p before anything else; (2) charge and
  enqueue staying atomic, with a guaranteed refund on failure; (3) App Store
  review of an app built on photos of children.

Next: `/replica-design`.
