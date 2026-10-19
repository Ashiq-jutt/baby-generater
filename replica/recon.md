# Recon map: babyvideo.ai (responsive web, Next.js)

Scope: the **video** core loop — photo in, AI baby video out, paid with credits.
The future-baby *image* generator is the free hook that feeds it, so it is in
scope as the entry point. Baby names, blog and guides are out of scope.
For: a paid RN/Expo mobile app of your own (see `fixes.md` for the angle).
Date: 2026-10-19

## How this was gathered

Public pages only, read as text at human pace. `robots.txt` allows `/` and
disallows `/api/` and `/admin/` — both were left alone. No account was created,
no login, no paywall bypassed, no JS bundles read, no network calls logged, no
private API touched. Their Terms (2.5 KB, unusually thin) contain no
reverse-engineering or competing-use clause.

36 English pages saved to `replica/screens/text/`. Route existence checked with
HTTP status codes only.

**What is missing because it is behind the login:** the signed-in editor
chrome, the credit ledger UI, the Daily Check-in dialog, `/my-creations`, the
checkout, and every error state. Those rows below are marked `inferred`. If
you want them confirmed, you would need to make your own account and walk it
with me.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | sitemap | https://babyvideo.ai/sitemap.xml | 288 URLs, 36 English, 10 locales |
| 2 | pricing | https://babyvideo.ai/pricing | 5 one-time packs + free tier; monthly/annual tabs exist |
| 3 | guides index | https://babyvideo.ai/how-to | 13 tutorials, grouped by "what you start with" |
| 4 | 13 guide pages | https://babyvideo.ai/how-to/* | step-by-step flows, the best source in the set |
| 5 | 12 tool pages | https://babyvideo.ai/generate/* | controls, models and credit costs, stated openly |
| 6 | home | https://babyvideo.ai/ | hosts the future-baby generator itself |
| 7 | blog | https://babyvideo.ai/posts | 6 posts, launch post dates the product |
| 8 | legal | /terms-of-service, /refund-policy, /privacy-policy | terms 2.5 KB, privacy 9.3 KB |
| 9 | robots | https://babyvideo.ai/robots.txt | /api/ and /admin/ disallowed |

## Core loop

> Upload one baby photo, pick a format and a model, see the credit price,
> generate a 5–10 second vertical clip, download it for TikTok or the family
> chat — and buy a credit pack when the free ones run out.

The free future-baby **image** costs 2 credits. A video costs 25–300. The image
is the hook; the video is the business.

## The models they rent (stated on their own pages)

They publish this, which saves you weeks. None of it is theirs.

| job | model | controls | their price |
| --- | --- | --- | --- |
| photo → video | Vidu Q3 Turbo I2V | 1–16 s, 540p–1080p, audio | 25 cr / 5 s |
| general video | Seedance 2.5 | 4–30 s, 480p–1080p, audio, ref mode | quoted |
| general video | Kling 3.0 | 3–15 s, audio, multi-shot | quoted |
| general video | Veo 3.1 Fast | 4/6/8 s, 720p/1080p/4K | quoted |
| singing / talking | Kling Avatar | audio-driven lipsync | 16 cr/s @480p, 30 cr/s @720p |
| dancing | Kling V2.6 Motion Control | photo + motion reference | 11 cr/s |
| meme | (motion transfer) | max 30 s | 15 cr/s |
| fruit baby | (composite) | 5 s, 480p, 1:1 | 80 cr flat |
| images | GPT Image 2.5 Flare | 1K/2K/4K | 2 / 3 / 5 cr |
| age progression | Nano Banana | target age + gender | 3 cr / image |
| images (alt) | FLUX 2 Pro, Qwen Image 2 | in model menu | quoted |

**Credit → dollars:** $0.0200/cr (Mini) down to $0.0167/cr (Scale). At the
Creator rate ($0.0174/cr): a 5 s photo-video is **$0.43**, a cartoon image
**$0.035**, a 10 s dance **$1.91**, a 10 s 720p singing clip **$5.21**.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Home + Future Baby generator | `/` | hook: 2 parent photos → baby image | 2 upload slots, gender segmented (Boy/Girl/Surprise Me), Generate+cost, examples, FAQ | filled, signed-out CTA |
| S02 | Sign in | modal (no `/login`, no `/sign-in`) | auth | provider buttons | inferred |
| S03 | Pricing | `/pricing` | sell credits | 3 tabs (One-time/Monthly/Annual), 5 pack cards + Free card, "Save %" badges, Most Popular badge | filled |
| S04 | Daily Check-in | header widget | free credits | claim button, streak counter | inferred |
| S05 | Credit balance | header `+10` chip | show balance | chip + dropdown | signed-out shows `+10` |
| S06 | My Creations | `/my-creations` (302 → auth) | gallery, play, download | grid, video player, download, optional gallery share | inferred |
| S07 | Baby Photo to Video | `/generate/baby-video` | the main paid loop | photo drop-zone, prompt box, duration, aspect (9:16/16:9), model select, Generate (25 credits) | filled |
| S08 | Baby Podcast | `/generate/baby-podcast` | podcast-host baby | image upload, audio upload **or in-browser record**, resolution select, credits, Generate | filled |
| S09 | Talking Baby | `/generate/ai-baby-talking` | lipsync one line | image, audio upload/record, model select, resolution, credits | filled |
| S10 | Baby Singing | `/generate/baby-singing` | sing to a track | image, audio clip, resolution, per-second credit readout | filled |
| S11 | Dancing Baby | `/generate/dancing-baby` | motion transfer | photo, sample-motion picker **or** own dance upload, Generate (11 cr/s) | filled |
| S12 | Baby Meme | `/generate/ai-baby-meme` | meme face-swap | photo, template picker or upload, Try Sample Images, GIF→video notice, Create (15 cr/s) | filled |
| S13 | Fruit Baby | `/generate/ai-fruit-baby` | novelty character | photo, fruit **text input**, aspect/duration/resolution, Generate (80 cr) | filled |
| S14 | Baby Grow Up | `/generate/baby-grow-up` | age progression | photo, **age slider** (1·5·10·18·25·50·75·100), gender direction, aspect, 3 cr/image | filled |
| S15 | Cartoon Baby | `/generate/cartoon-baby` | cartoon portrait | photo, preset style picker, custom direction field, aspect, Generate (2 cr) | filled |
| S16 | AI Image Generator | `/generate/ai-image-generator` | general images | prompt, optional refs, model menu (4), size 1K/2K/4K, PNG/JPG, negative prompt | filled |
| S17 | AI Video Generator | `/generate/ai-video-generator` | power user | mode tabs (text / image / reference), model menu (4), duration, resolution, audio toggle, quote | filled |
| S18 | Birthday Video Maker | `/generate/birthday-video-maker` | slideshow editor | up to 20 photos/clips, ≤90 s, text, transitions, soundtrack, 9:16 or 16:9 @720p, MP4/WebM | filled |
| S19 | Baby Name generator | `/baby-name` | SEO side tool | surname, language, preferences → shortlist | filled |
| S20 | Guides index | `/how-to` | onboarding by intent | 6 "what do you have?" cards, 13 tutorials | filled |
| S21 | Guide detail | `/how-to/*` | tutorial | steps, worked example, troubleshooting, Open tool | filled |
| S22 | Blog index / post | `/posts`, `/posts/*` | SEO | 6 posts | filled |
| S23 | Legal | `/terms-of-service`, `/privacy-policy`, `/refund-policy` | compliance | prose | filled |
| S24 | Locale switcher | header "United States" | 10 locales | dropdown | filled |

24 screens. 12 of them are the same editor shell with different inputs — that
is the single most important structural fact for your build.

## Flows

```
F01 Free hook: see a future baby                     [the acquisition loop]
    S01 upload parent photo 1 -> upload photo 2 -> pick gender -> Generate
    -> S02 sign-in wall -> S04 claim 10 free credits -> result on S01
    happy path clicks: ~6
    edge: one photo only (allowed), sunglasses/side profile (quality warning),
          0 credits, free credits expired (3-day expiry), result does not
          resemble either parent

F02 The paid core loop: baby photo -> video          [the money flow]
    S06/S07 upload baby photo -> write motion prompt -> set duration
    -> set aspect 9:16 -> pick model -> read credit quote -> Generate
    -> queue/progress -> S06 My Creations -> play -> download
    happy path clicks: ~8
    edge: insufficient credits mid-flow, generation fails, queue stalls,
          face identity drifts, settings changed after quote (needs re-quote)

F03 Audio-driven: talking / podcast / singing baby
    S08/S09/S10 upload photo -> record in browser OR upload audio
    -> pick model -> pick resolution -> read per-second credit quote
    -> Generate -> review first seconds -> download
    happy path clicks: ~7
    edge: mic permission denied, audio starts late (their own docs flag this),
          audio too long (cost blows up: 30 cr/s), mouth not visible in photo

F04 Reference-driven: dancing / meme baby
    S11/S12 upload photo -> pick sample motion OR upload reference clip
    -> read credit quote -> Generate -> download
    happy path clicks: ~6
    edge: GIF uploaded (must convert first), >30 s clip, pose mismatch,
          user uploads a clip they do not own the rights to

F05 Buy credits
    S05 balance -> S03 pricing -> pick tab -> pick pack -> checkout
    -> balance updates
    happy path clicks: ~4
    edge: payment declined, double purchase, credits not credited

F06 Earn free credits
    S04 Daily Check-in -> claim 10 -> streak +20 every 7 days
    caps: 30 check-ins per account, free credits expire in 3 days
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| MediaDropzone | image, audio, video | empty, dragging, uploading, uploaded, invalid type, too large | S01, S07–S18 |
| AudioRecorder | record, upload | idle, recording, recorded, playback, mic denied | S08, S09, S10 |
| PromptField | prompt, negative prompt, custom direction | empty, filled, with example chip | S07, S13, S15, S16, S17 |
| ModelSelect | video group, image group | collapsed, open, selected, unavailable for mode | S07, S09, S16, S17 |
| SettingSegmented | duration, resolution, aspect, size, output format | default, selected, disabled for model | all editors |
| AgeSlider | ticks 1·5·10·18·25·50·75·100 | default, dragging, selected | S14 |
| StylePicker | preset style tiles | default, selected, hover | S15, S12 |
| CreditQuote | inline beside Generate | quoted, stale (settings changed), insufficient | all editors |
| GenerateButton | primary | idle with cost, disabled, submitting, queued, progress %, failed | all editors |
| ResultCard | video, image | loading, ready, playing, download, share to gallery | S06, all editors |
| PackCard | one-time, monthly, annual | default, Most Popular, Best Value, Save % badge | S03 |
| BalanceChip | header | signed-out, balance, low, zero | all |
| CheckInDialog | — | claimable, claimed today, streak, capped | S04 |
| Tabs | pricing tabs, editor mode tabs | selected, unselected | S03, S17 |
| LocaleSwitcher | 10 locales | collapsed, open | all |
| FAQAccordion | — | collapsed, expanded | S01, all tool pages |

## Inferred data model

```
User        id, email, auth_provider, locale, created_at
            evidence: S02 sign-in, S24 locale switcher, privacy policy
            confidence: high

CreditLedger id, user_id, delta, reason (purchase | checkin | streak_bonus |
             spend | refund), expires_at (null for paid), created_at
            evidence: "Paid credits never expire", "Free credits expire 3 days
            after they are awarded", 30-check-in cap, +20 streak bonus — a
            running balance alone cannot express per-grant expiry, so this must
            be a ledger with expiry per row
            confidence: high  <- the single most important entity in the app

CheckIn     id, user_id, date (unique per user), streak_count
            evidence: S04, "up to 30 check-ins per account",
            "extra 20 credits every 7 consecutive check-in days"
            confidence: high

Asset       id, user_id, kind (image | audio | video), url, mime, bytes,
            duration_s, width, height, source (upload | recording | generated),
            created_at, deleted_at
            evidence: every dropzone, S08 in-browser recorder, S06 gallery
            confidence: high

Model       id, slug, family (seedance | kling | veo | vidu | gpt_image |
            nano_banana | flux | qwen), modes[], min_s, max_s, resolutions[],
            supports_audio, pricing_mode (flat | per_second | per_image),
            credit_rate
            evidence: S17 comparison table, per-tool credit lines
            confidence: high  <- they publish their whole rate card

Tool        id, slug, label, model_id, input_schema (which dropzones and
            settings to show), route
            evidence: 12 /generate/* pages sharing one editor shell
            confidence: medium — this is the abstraction the UI implies, not
            one they have confirmed

Generation  id, user_id, tool_id, model_id, status (quoted | queued | running |
            succeeded | failed | cancelled), params (json: prompt, duration_s,
            resolution, aspect, audio_on, target_age, gender, fruit, style),
            input_asset_ids[], output_asset_id, credits_quoted,
            credits_charged, error, created_at, finished_at
            evidence: S06, "A confirmed credit total", "Changes to the settings
            require an updated quote", status language in the guides
            confidence: high

GalleryPost id, generation_id, user_id, visibility
            evidence: "gallery sharing is optional", "Free videos include a
            watermark"
            confidence: medium

Purchase    id, user_id, pack_slug, amount_usd, credits, provider,
            provider_ref, status
            evidence: S03, refund policy
            confidence: high
```

**Relationships:** `User 1-n CreditLedger`, `User 1-n CheckIn`,
`User 1-n Asset`, `User 1-n Generation`, `Tool n-1 Model`,
`Generation n-1 Tool`, `Generation n-n Asset` (inputs) + `1-1` (output),
`Generation 1-0..1 GalleryPost`, `User 1-n Purchase`.

The schema that matters is `Model` + `Tool` + `Generation`. Get those three
right and all 12 editors are one screen with a different config row.

## Feature matrix

See `features.csv`. 45 rows. Must: 21, should: 13, could: 6, skip: 5.
36 exist in the original; 9 are yours (the fixes from `fixes.md`).

## Out of scope (cannot or should not be cloned)

| item | why |
| --- | --- |
| The models themselves | Vidu, Kling, Veo, Seedance, Nano Banana are rented. You rent the same ones. Nothing to clone — but it is also the whole cost base. |
| Their commissioned showcase videos and photos | Their own creative work, explicitly "commissioned for this showcase". Shoot or generate your own. |
| Their prompt library | Those long worked prompts are written copy. Write your own; the *technique* is fair game. |
| Their SEO estate | 288 URLs across 10 locales, built over time. You cannot clone a backlink profile. |
| Their public gallery | Other people's babies. Not yours to take, and you start with an empty gallery. |
| The 13 guide pages as written | Copy; rewrite from scratch. |
| Their brand, name, logo, domain | Obviously. `/replica-brand` next. |

## What they have not solved (your openings, confirmed on their own pages)

1. **No mobile app.** Web only, no App Store or Play listing. You build RN.
2. **In-browser export is browser-dependent** — their own words: MP4 where
   supported, WebM elsewhere. A native app just exports MP4.
3. **Audio video is brutally expensive** — 30 cr/s at 720p means a 15 s singing
   clip costs the user $7.80. That is a price ceiling you can undercut by
   routing to a cheaper lipsync model.
4. **No skin tone or ethnicity control anywhere** in 12 tools. This was the #4
   complaint in `fixes.md` with two verbatim race complaints.
5. **Terms are 2.5 KB and say nothing about children's photos or parental
   consent**, while the entire product takes photos of babies. That is both a
   real risk for them and a trust feature for you.
6. **Free credits expire in 3 days** and signing up awards nothing. Harsh.

## Correction to `fixes.md`

My earlier angle A ("no subscription") was aimed at the four App Store apps
that produced the 39 billing complaints. It does **not** differentiate you from
babyvideo.ai: they already sell one-time packs and state "Paid credits never
expire" prominently. Angle A still works against the App Store field, but
against this target the live openings are **mobile-native**, **skin-tone
control**, and **cheaper audio video**. Revised angle:

> For parents on a phone who want a baby video that actually looks like their
> family, **{{your app}}** is a native iOS and Android app with skin tone and
> feature controls, and it shows you the price per clip before you spend.

## Size

Screens 24 (12 are one configurable editor). Flows 6. Entities 9.

**Hard parts, in order:**
1. **Credit ledger with per-grant expiry and refund-on-failure.** The real
   engineering. Paid credits never expire, free ones die in 3 days, failed
   generations must not charge — that is a ledger, not an integer column.
2. **The quote engine.** Four pricing modes (flat, per second, per image,
   per second×resolution) across ~10 models, re-quoted on every setting change.
3. **Async job pipeline.** Submit → poll provider → store output → push
   notification. Jobs outlive the app session on mobile.
4. **In-app audio recording on RN** plus trimming leading silence, which their
   own docs say is the main cause of bad lipsync.
5. **Mobile video export and share sheet** — easier than their browser problem,
   but new work for you.

**Size: L** (a quarter) for all 12 tools. **S (a weekend) for a real vertical
slice:** auth → credit ledger → one tool (photo → video on Vidu Q3 Turbo) →
quote → job → download. Build that first; the other 11 tools are config rows.

Next: `/replica-architect`.
