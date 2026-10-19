# Test plan: BabyClip (a rebuild of babyvideo.ai's core features)

Build: 221cdf4  Date: 2026-10-19  Env: local web build, in-memory data layer

## What can and cannot be tested here

The clone is an Expo app. It is driven through its **web build**
(`expo export --platform web`, react-native-web), because a native simulator
run needs a prebuild and CocoaPods round trip.

That is a real limit, so it is stated up front:

| cannot be tested on web | why | how it gets covered |
| --- | --- | --- |
| Native photo picker | `expo-image-picker` falls back to a file input on web; the native permission dialog does not exist | manual pass on device |
| Native audio recording | not built at all yet | n/a |
| Push notifications | no native runtime | manual pass on device |
| Store purchases | RevenueCat SDK is native-only | Stripe test mode, manual |
| Save to Photos | native media library | manual pass on device |
| Real generation | needs `FAL_KEY`; the in-memory layer simulates it | manual once keys exist |

Everything below the API line **is** covered, and more thoroughly than a
click-through could manage: the credit ledger, the quote contract, refunds
and isolation are tested directly in Postgres and in the data layer
(`npm run test:db`, `test:data`, `test:quote`, `test:functions`).

## Flows under test

From `recon.md`. F03 and F04 are blocked on unbuilt inputs, so they are
scoped to "the screen states honestly", not the full flow.

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| S-H1 | shell | happy | load the app | tool list renders, 6 tools, no console error | e2e | |
| S-H2 | shell | happy | tap each tab | Make / Yours / Credits all render | e2e | |
| S-A1 | shell | a11y | axe scan each screen | no violations | e2e | |
| S-E1 | shell | edge: 390px | load at phone width | no horizontal scroll, nothing clipped | e2e | |
| S-E2 | shell | edge: keyboard only | tab through home | every control reachable, focus visible | e2e | |
| F02-H1 | photo → video | happy | sign in, open Photo to video, add photo, prompt, generate | price shown, job queues, result or refund | e2e | |
| F02-E1 | photo → video | edge: no photo | open the tool, read the button | button says "Add a photo to start", disabled | e2e | |
| F02-E2 | photo → video | edge: change a setting after the quote | quote, then change length | button goes to "Settings changed", cannot submit the old price | e2e | |
| F02-E3 | photo → video | edge: double-tap submit | tap Generate twice fast | exactly one generation exists | e2e | |
| F02-E4 | photo → video | edge: not enough credits | pick 10s/1080p on 30 credits | "Not enough credits", routes to packs, nothing charged | e2e | |
| F02-E5 | photo → video | edge: refresh mid-flow | reload while a job runs | app recovers, job still listed | e2e | |
| F02-E6 | photo → video | edge: very long prompt | paste 2000 chars | accepted or capped, no crash | e2e | |
| F02-E7 | photo → video | edge: emoji and accents in the prompt | paste "👶 café niño" | round-trips intact | e2e | |
| F02-E8 | photo → video | edge: unsupported setting | combination the model cannot run | rejected before any charge | unit | done |
| F02-N1 | photo → video | negative: generation fails | a job that rolls into failure | failure message says the credits came back | e2e | |
| F02-N2 | photo → video | negative: stale quote at the API | submit a changed paramsHash | rejected, nothing charged | unit | done |
| F03-H1 | talking baby | partial | open the tool | honest "recording not built yet" panel, not a dead control | e2e | |
| F04-H1 | dancing baby | partial | open the tool | honest "motion picker not built yet" panel | e2e | |
| F05-H1 | buy credits | happy | open Credits, buy a pack | balance rises, "never expire" stated | e2e | |
| F05-E1 | buy credits | edge: pack labels | read each card | every pack names a video count, not just credits | e2e | |
| F05-E2 | buy credits | edge: restore purchases | find the control | present (App Store requires it) | e2e | |
| F06-H1 | free credits | happy | claim the daily credits | credits added, expiry stated in words | e2e | |
| F06-E1 | free credits | edge: claim twice | claim, then claim again | refused with a clear message | e2e | |
| F06-E2 | free credits | edge: expiry copy | read the balance card | says when free credits run out | e2e | |
| L-1 | ledger | isolation | second user reads first user's rows | 0 rows | sql | done |
| L-2 | ledger | integrity | reconcile after every scenario | 0 drift | sql | done |
| L-3 | ledger | refund | failed job | refunded in full, once | sql + unit | done |
| L-4 | ledger | expiry | paid vs free credits | paid never expire, free do | sql + unit | done |
| W-1 | webhooks | negative | forged signature, replay, tampered body | all rejected | unit | done |

## Manual checklist (needs a device, or keys)

- [ ] iOS: photo permission denied → deep link to Settings, not a dead end
- [ ] iOS: Sign in with Apple completes and creates the account
- [ ] iOS: Save to Photos actually writes the file
- [ ] iOS: background the app mid-render, return → status is correct
- [ ] push arrives when a job finishes
- [ ] Android: same five
- [ ] real fal.ai generation returns a usable 5s 9:16 clip
- [ ] Stripe test card 4000 0000 0000 0002 declines cleanly, no credits granted
- [ ] RevenueCat sandbox purchase grants credits exactly once
- [ ] account deletion removes the auth user and every asset
