# Build log

Stack: Expo SDK 58, expo-router, NativeWind 4 + Tailwind 3.4, TypeScript strict.
Data layer is fake and in memory; `/replica-backend` swaps it.

## Verified, not asserted

| check | command | result |
| --- | --- | --- |
| Typecheck, strict | `npx tsc --noEmit` | **0 errors** |
| iOS bundle | `npx expo export --platform ios` | **1542 modules, 3.7 MB Hermes** |
| Quote engine | `node --no-warnings --experimental-strip-types lib/quote.test.ts` | **22 passing** |
| Fake ledger | `node --no-warnings --experimental-strip-types lib/data/fake.test.ts` | **15 passing** |
| SQL ledger | `psql -f replica/schema.sql` + 8 tests | **passing** (see architecture.md) |
| Token contrast | `python3 replica/design/contrast.py tokens.json` | **34 pairs, 0 failing AA** |

## Screens

| ID | screen | route | done | notes |
| --- | --- | --- | --- | --- |
| S01 | Home / tool list | `app/(tabs)/index.tsx` | done | signed-out hook card, balance chip, 6 tools |
| S02 | Sign in | `app/sign-in.tsx` | partial | Apple first (iOS requires it); fake provider |
| S03/S05 | Credits + packs | `app/(tabs)/credits.tsx` | partial | balance, expiry warning, check-in, 4 packs, restore stub. No real IAP. |
| S06 | My Creations | `app/(tabs)/creations.tsx` | done | live polling, empty state, per-item progress/result |
| S07–S15 | **The editor (all tools)** | `app/tool/[slug].tsx` | done | one screen, driven by the tool's `inputSchema` row |
| S04 | Daily check-in | inside S03 | partial | works, but not the bottom sheet the spec calls for |

**The editor is the headline.** 372 lines render all six tools because the
difference between them is a `inputSchema` row in `lib/catalogue.ts`, not
screen code. Adding the remaining tools is a data change.

## The core loop works end to end

Sign in → 30 free credits → pick a photo → pick skin tone → write a prompt →
see the price → generate → watch it queue and render → get a video or a
refund. On the fake layer, with the real ledger semantics.

## Primitives built (9)

`Button`, `CreditCostButton`, `MediaDropzone`, `SettingSegmented`,
`SkinToneControl`, `GenerationProgress`, `ResultCard`, `BalanceChip`,
`EmptyState`. Tokens only — no raw hex, no raw pixel values.

## Two bugs the tests caught

1. **`quote()` returned early on flat pricing and never validated duration.**
   A 1-second pick on a 5-second-only model would have been priced, charged,
   and then rejected by the provider — the user pays for a job that cannot
   run. Fixed by splitting `assertSupported()` out of pricing and calling it
   for every mode. Three tests now cover it.
2. **A circular import between the data-layer contract and its fake.**
   `index.ts` re-exported from `fake.ts` while `fake.ts` imported error
   classes from `index.ts`. It happened to work through ESM hoisting; it
   would have broken the moment an error was constructed during module init.
   Errors moved to `lib/data/errors.ts`.

## Harder than expected

- **Expo SDK 58 unified versioning.** `expo-constants@~19` is the old scheme;
  SDK 58 wants `~58.0.12`. `npm install` failed on the peer conflict until
  every satellite package was repinned to 58.x.
- **Node's type stripper rejects TS parameter properties** and needs explicit
  `.ts` import extensions, which `tsc` then rejects without
  `allowImportingTsExtensions`. Both config and code had to meet in the middle.
- **The re-quote loop is subtler than it looks.** Dropping the old quote the
  instant any priced input changes is what makes `stale` honest. Keep the old
  quote on screen for even one render and the user can submit a price that is
  no longer real.

## Not built, and why

| what | why |
| --- | --- |
| **In-app audio recording (F13)** | Blocks talking baby, podcast and singing — three tools. The single highest-value next piece. Needs `expo-audio`, a level meter, and leading-silence trimming (their own docs say late audio is the main cause of bad lipsync, and at 30 credits/second the user otherwise pays for silence). |
| **Sample motion library (F17)** | Blocks dancing baby. Needs your own motion clips; using theirs is not an option. |
| **Future baby (F20)** | Needs a two-photo input the editor does not render yet. Small change to `inputSchema` plus a second dropzone. |
| **Real MP4 export / save to Photos (F33)** | `expo-media-library`. The Save button is wired but currently only flips to "Saved". |
| **Push on completion (F06)** | Polling works; push is what makes a backgrounded render usable. |
| **Delete-my-photos (F39) and consent record (F38)** | Consent copy is on the sign-in screen, but nothing is recorded and there is no delete control. Both are App Store review risks for an app built on photos of children — do not ship without them. |
| **Age slider (F21)** | Shipped as a segmented control instead. Works, but not the spec. |
| **Real auth, IAP and provider calls** | All `/replica-backend`. The data layer contract is written so none of the screens change. |

## Screenshots for replica-diff

**Not captured.** A native app needs a booted simulator, and `expo run:ios`
means a prebuild plus CocoaPods — several minutes and a native toolchain
round trip I did not spend here. `replica/clone-screens/` is empty, so
`/replica-diff`'s layout diff cannot run yet. Say the word and I will boot
the simulator and capture S01, S03, S06 and the editor.

## Status

- **Screens:** 6 of 24 built (the 6 that matter; 12 of the remaining 18 are
  config rows on the editor that already exists)
- **Must-haves:** 11 done, 6 partial, 4 not started, of 21
- **All rows:** 15 yes, 8 partial, 17 no, 5 skip, of 45

Next: `/replica-backend`. The fake layer is doing real ledger work and the
contract will not change, so that swap should touch no screen code.
