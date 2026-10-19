# Component specs

16 components from `recon.md`, specified for **Expo / React Native**. Every
state the recon saw, plus the ones it should have: focus, disabled, loading,
error, empty.

Tokens only — `bg-surface`, `text-muted`, `min-h-touch`. Never a raw hex.

## What was measured, and what was not

babyvideo.ai runs **stock shadcn/ui on Tailwind v4**. Measured from its public
stylesheet: `--spacing: .25rem`, `--radius: .625rem` (shadcn's default), the
default Tailwind type scale (`--text-xs` … `--text-6xl`), Tailwind's default
`--shadow-*`, and the **system font stack** — no webfont, no licensed font.

So there is no bespoke system to reverse-engineer. The scale is public and
well-known, and nothing here needs their font.

**Not taken, deliberately:** their palette. Their skin is a warm amber on
cream (`#f99c00` on `#fffaf4`), which is recorded here as an *observation*
only. Signature colour plus signature layout is trade dress. `tokens.json`
ships a **neutral blue placeholder**; `/replica-brand` picks yours.

**Not measured:** I captured only page text during recon, not screenshots, so
I did not colour-pick pixels or measure rendered gaps. Everything above comes
from the stylesheet's own declared scale, which is more reliable than a
colour picker anyway. What is genuinely unmeasured is their **signed-in
editor** — it is behind the login. The editor specs below are designed from
the recon map's control inventory, not copied from their layout.

## Mobile reframe

Their design is a 1280px web page. Yours is a phone. That changes things no
amount of measuring their CSS would tell you:

- **44pt minimum touch target** (Apple HIG), 48dp Android. `min-h-touch`.
- **No hover.** Every hover state becomes a *pressed* state.
- **Dark mode is not optional** on mobile. Both palettes ship, both pass AA.
- **Safe-area insets** top and bottom; never hardcode the header height.
- **Bottom sheets, not modals.** Thumbs reach the bottom of a phone.
- **Dynamic Type.** Sizes are in px for layout stability, but test at the
  largest accessibility size and let text wrap rather than truncate.

## Accessibility baseline (applies to everything)

- Real pressables (`Pressable`), never a `View` with `onTouchEnd`.
- `accessibilityRole`, `accessibilityLabel`, `accessibilityState` on each.
- Focus ring: 2px `focus`, 2px offset — needed for keyboard and switch control.
- Loading states keep their label for screen readers; never swap the label
  for a bare spinner.
- Icon-only buttons always carry an `accessibilityLabel`.
- Announce async results with `AccessibilityInfo.announceForAccessibility`
  when a generation finishes.
- Respect `prefers-reduced-motion` / `isReduceMotionEnabled`: progress stays,
  decorative animation stops.
- Never signal state with colour alone — the credit warning gets an icon and
  text, not just amber.

---

## Button
```
variants  primary, secondary, ghost, danger
sizes     sm 36, md 44, lg 52            (md is the default; 44 = touch min)
states    default, pressed, focus-visible, disabled, loading
tokens    primary   bg accent    / text on-accent
          secondary bg surface-2 / text text      / border border
          ghost     transparent  / text text
          danger    bg danger    / text on-danger
          radius md, type sm/600, gap 8, px 16
a11y      accessibilityRole="button"; disabled sets accessibilityState
          {disabled:true}; loading sets {busy:true} and KEEPS the label
used on   every screen
notes     loading shows a spinner beside the label, not instead of it. The
          button never changes width between states - it jumps otherwise.
```

## CreditCostButton
```
The Generate button. Its own component because the price is part of it.
variants  primary (inherits Button)
states    quoting, quoted, stale, insufficient, submitting, queued, disabled
tokens    label text on-accent; cost text on-accent at 85% opacity
          insufficient -> bg surface-2, text text-muted, helper text in danger
a11y      label reads "Generate, costs 25 credits"; never just "Generate".
          Announce the price change when the quote updates.
used on   S07-S18
notes     THE most important control in the app. Four rules:
          1. Never show a price you cannot honour - show `quoting` instead.
          2. `stale` (settings changed after the quote) must re-quote before
             it can submit. Server rejects a stale params_hash anyway.
          3. `insufficient` links to the pack screen; it does not just grey out.
          4. Disable on submit and stay disabled until the job has an id, or a
             double-tap buys two videos.
```

## MediaDropzone
```
variants  image, audio, video
sizes     square (image), row (audio), 16:9 (video)
states    empty, picking, uploading (% progress), uploaded, invalid-type,
          too-large, upload-failed (retry), removed
tokens    border-input dashed 2px, radius lg, bg surface, icon text-muted
a11y      accessibilityRole="button", label "Add a baby photo";
          errors use accessibilityLiveRegion="polite"
used on   S01, S07-S18
notes     Validate type and size BEFORE upload, not after - the error must
          arrive before the user has waited. Show the thumbnail immediately
          from the local file; do not wait for the round trip.
          Caps: image 10MB, audio 25MB/60s, video 50MB/30s.
```

## AudioRecorder
```
variants  record, upload, record-or-upload
states    idle, requesting-permission, permission-denied, recording (timer +
          level meter), recorded, playing, trimming, too-long, too-quiet
tokens    record dot danger, meter accent, timer type sm/500 tabular
a11y      accessibilityRole="button"; label flips "Start recording" /
          "Stop recording"; announce the duration on stop
used on   S08, S09, S10
notes     Trim leading silence on-device before upload. Their own guides say
          late-starting audio is the main cause of bad lipsync - and at
          30 credits/second the user is otherwise paying for silence.
          permission-denied must offer a deep link to Settings, not a dead end.
```

## PromptField
```
variants  prompt, negative-prompt, short-direction
states    empty (with placeholder), focused, filled, over-limit, with-chips
tokens    bg surface, border border-input, radius md, type base, min-h 88
a11y      real TextInput with a visible <Label>; chips are buttons that
          announce "Insert example prompt"
used on   S07, S13, S15, S16, S17
notes     Example chips above the field, not inside the placeholder - a
          placeholder vanishes the moment you need it. Character counter
          appears at 80% of the limit, not before.
```

## ModelSelect
```
variants  video group, image group
states    collapsed, open (bottom sheet), selected, unavailable-for-mode,
          loading catalogue
tokens    row min-h-touch; selected row bg surface-2 + check icon;
          unavailable row text-muted + reason
a11y      accessibilityRole="radiogroup" / "radio"; selected announces
          "selected"; unavailable announces the reason, is not just dimmed
used on   S07, S09, S16, S17
notes     Each row shows duration range, resolutions and credit rate. On
          mobile, hide this behind an "Advanced" disclosure - most users
          should never open it. Unavailable options stay VISIBLE with a
          reason ("needs an audio input"); hiding them makes the UI feel broken.
```

## SettingSegmented
```
variants  duration, resolution, aspect, size, output-format
states    default, selected, disabled-for-model, single-option
tokens    track bg surface-2, thumb bg bg + shadow card, radius pill,
          each segment min-h 40, type sm/600
a11y      accessibilityRole="tablist"/"tab"; disabled segments announce why
used on   every editor
notes     Options come from the `models` row, not hardcoded - Veo allows only
          4/6/8s while Vidu allows 1-16s. Changing any segment INVALIDATES
          THE QUOTE; the cost button must go to `stale` the same frame.
          With one legal option, render it as static text, not a control.
```

## AgeSlider
```
variants  discrete ticks 1, 5, 10, 18, 25, 50, 75, 100
states    default, dragging, selected, disabled
tokens    track surface-2, active accent, thumb 28 with shadow card,
          tick labels type xs/500 text-muted
a11y      accessibilityRole="adjustable"; accessibilityActions increment /
          decrement; value announced as "25 years old"
used on   S14
notes     Snap to ticks - continuous ages are meaningless here and every stop
          costs credits. Each age is a separate paid generation, so confirm
          before firing several.
```

## StylePicker
```
variants  style presets (cartoon), meme templates
states    default, selected, pressed, loading-thumbnails, empty
tokens    2-col grid gap 12, tile radius lg, selected 2px accent ring
a11y      accessibilityRole="radiogroup"; each tile labelled by style NAME,
          not "image"
used on   S12, S15
notes     Your own sample art, never theirs. Until you have it, use a
          typographic tile with the style name - a wrong placeholder image
          is worse than none.
```

## SkinToneControl                                   [NEW - not in the original]
```
The differentiator. F31. None of their 12 tools has this.
variants  tone scale (6 steps), hair texture, hair colour
states    unset, selected, pressed
tokens    swatch 44x44 radius pill, selected 2px ring focus + check;
          row scrolls horizontally with 16 gutter
a11y      accessibilityRole="radiogroup"; EVERY swatch has a text label, never
          colour alone; label names the tone plainly
used on   S01, S07, S15, S19
notes     Came from 10 reviews, two of them explicit race complaints:
          "put two darker individuals and somehow I have a Chinese baby".
          Design rules: default to UNSET and infer from the photo rather than
          defaulting to the lightest tone; never auto-pick a tone for the
          user; no numeric scale labels (no "Type IV"); keep it one tap from
          the photo, not buried in Advanced. This control is the reason
          someone chooses your app, so it goes above the prompt field.
```

## GenerationProgress
```
variants  inline (in editor), card (in library)
states    queued (position), submitted, running (% or indeterminate),
          succeeded, failed (reason + retry), stalled, cancelled
tokens    track surface-2, bar accent, radius pill h 6;
          failed state bg surface + danger icon + text
a11y      accessibilityLiveRegion="polite"; progress has
          accessibilityValue; announce terminal states
used on   S06, S07-S18
notes     Honest progress only. If the provider gives no percentage, show an
          indeterminate bar and elapsed time - a fake 0-90% crawl is what
          produces "it just continues to load but nothing ever comes up".
          Failed state must say the credits were refunded, in words.
          Works when the app was backgrounded: re-read status on resume.
```

## ResultCard
```
variants  video, image
states    loading-poster, ready, playing, paused, saving, saved, share-open,
          failed-to-load
tokens    radius lg, poster 9:16, overlay controls on scrim,
          action row min-h-touch
a11y      video has accessibilityLabel describing the generation;
          controls are real buttons; Save announces success
used on   S06, all editors
notes     Save to Photos (not "Download" - it is a phone), then Share sheet.
          Save must succeed offline-safe: the file is local already.
          AI-labelling (F40) is baked in, not optional.
```

## BalanceChip
```
variants  header chip, inline
states    signed-out, balance, low (<1 video), zero, expiring-soon, loading
tokens    bg surface-2, radius pill, h 32, type sm/600;
          low/zero -> border danger, icon; expiring -> warning icon
a11y      label "120 credits, 20 expire in 3 days" - the expiry is read out,
          not just coloured
used on   every screen
notes     `expiring-soon` is a real state because free credits expire. Show
          the next expiry date in words. Tapping always goes to the ledger,
          never straight to checkout.
```

## PackCard
```
variants  one-time pack, (subscription if ever added)
states    default, most-popular, best-value, selected, purchasing,
          purchase-failed, restoring
tokens    radius lg, border border, selected 2px accent;
          badge bg accent text on-accent radius pill
a11y      accessibilityRole="button"; label includes price, credit count and
          what it buys ("about 46 five-second videos")
used on   S03
notes     State the video count, not only the credit count - "1150 credits"
          means nothing to a parent. Needs a visible RESTORE PURCHASES action
          (App Store requires it) and the real per-credit price so the packs
          are comparable. Price in-app packs above web packs; see
          architecture.md on store commission.
```

## CheckInDialog
```
variants  bottom sheet
states    claimable, claimed-today, streak-progress, capped, expired-warning
tokens    sheet radius xl 24, shadow sheet, 7-dot streak row
a11y      focus moves into the sheet on open, returns on close;
          accessibilityViewIsModal; claim result announced
used on   S04
notes     Say when the credits expire, on the claim button, before the tap.
          Their 3-day expiry plus "signing up awards nothing" is harsh (F36) -
          be kinder and say so here. `capped` must explain the cap, not just
          disable.
```

## EmptyState
```
variants  no creations, no credits, offline, generation-failed, search-empty
states    default, with-action
tokens    icon 48 text-muted, title type lg, body type sm text-muted,
          centred, max-w 320
a11y      heading is a real heading; the action is the focus target
used on   S06, S03, all editors
notes     Every empty state names the next action. "No creations yet" with a
          "Make your first video - it's free" button, not a shrug.
          Write all copy fresh; none of theirs.
```

## BottomSheet / Tabs / LocaleSwitcher / FAQAccordion
```
Standard patterns, no notes beyond the baseline. Build on an accessible
primitive (@gorhom/bottom-sheet for sheets) rather than hand-rolling focus
traps and pan gestures.
BottomSheet   states closed, dragging, snap-half, snap-full, open; backdrop
              press and hardware back both close; focus trapped while open
Tabs          accessibilityRole tablist/tab; selected announced; swipeable
LocaleSwitcher 10 locales; shows native language name, not a flag
FAQAccordion  accessibilityState {expanded}; one open at a time optional
```

---

## Build order for the primitives

The vertical slice in `architecture.md` needs exactly six:

1. **Button** — everything depends on it
2. **MediaDropzone** (image only) — the first real interaction
3. **SettingSegmented** — duration, resolution, aspect
4. **CreditCostButton** — the quote contract made visible
5. **GenerationProgress** — the long wait
6. **ResultCard** — the payoff

Build those on a `/design` showcase route before any product screen, check
both themes and the largest Dynamic Type size, then screenshot it. That
screenshot is the design-system check.

The other ten land with the screens that need them.
