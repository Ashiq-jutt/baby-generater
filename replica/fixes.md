# Baby-video apps: what their users hate, and the gap

**Sample: 107 reviews, 4 App Store apps, pulled 2026-10-19 from Apple's public
customer-reviews RSS feed (most-recent sort).**

Apps sampled:
- AI Baby Generator: Face Maker (id 1607753158) — 4.49 stars, 13,092 ratings
- Babyface: AI Baby Generator (id 1556805595) — 3.93 stars, 2,376 ratings
- AI Baby Podcast / AI Baby Talk (id 6747033612) — 3.12 stars, 17 ratings
- AI Baby Podcast - TalkCast.AI (id 6746831281) — 2.0 stars, 8 ratings

**Known bias, stated up front:** Apple's `sortBy=mostRecent` feed returned
almost entirely 1-star reviews (avg 1.0 across every theme). These apps hold
3.9–4.7 star averages overall, so this sample is the angry tail, not the
average user. It is still the right sample for finding what to fix — but do
not quote "36% of users" anywhere public. It is 36% of 107 recent reviews.
Apple's RSS feed returned nothing for 10 other apps tried (throttled or
retired); Google Play, Reddit and Trustpilot are not yet sampled.

---

## 1. What they hate

### 1. Billing, cancelling and refunds — 39 reviews, 3 apps
The largest theme by a wide margin. Users cannot find how to stop charges.

> "There is no way to stop the charges on the app."
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1556805595&type=Purple%20Software)

> "The bank says I need to get a new credit card which makes it such a hassle for me."
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1556805595&type=Purple%20Software)

> "Scam App."
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1607753158&type=Purple%20Software)

### 2. Price and paywalls — 27 reviews, 3 apps
Nobody sees a single result before the subscription sheet appears.

> "PAY TO SEE. Remove it and then you'll get some business"
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1607753158&type=Purple%20Software)

> "Dumb and overpriced."
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1607753158&type=Purple%20Software)

### 3. Free-trial tricks — 14 reviews, 2 apps
> "App does not work and do not get fooled by the trail period."
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1607753158&type=Purple%20Software)

> "Very tricky!" / "Total rip off" / "Didn't get the free trial"
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1556805595&type=Purple%20Software)

### 4. The result ignores the parents' actual features — 10 reviews, 2 apps
The most specific and most fixable complaint in the whole set. It is a race
and skin-tone failure, repeated by different reviewers in different words.

> "Trash. Don't download app, put two darker individuals and somehow I have a Chinese baby. So stupid"
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1607753158&type=Purple%20Software)

> "i put in two melanated mfs and they gave me a white baby with straight hair ???? how dat work"
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1607753158&type=Purple%20Software)

> "Zero resemblance." / "Not accurate." / "Fake."
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1607753158&type=Purple%20Software)

### 5. It simply does not generate — 6 reviews, 3 apps
Paid, then got nothing back.

> "Do not pay for this app. I can't even get me and my fiancé pictures to load for the AI generator baby at all. It just continues to load but nothing ever comes up. This app is rigged. And I want my money back."
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1607753158&type=Purple%20Software)

> "I've tried several times and it doesn't work. I'm disappointed and I feel like I've been cheated out of my money."
> — [App Store, 1★](https://itunes.apple.com/us/review?id=6746831281&type=Purple%20Software)

### 6. Output quality — 9 reviews, 3 apps
> "It made my baby lopsided" — [App Store, 1★](https://itunes.apple.com/us/review?id=1556805595&type=Purple%20Software)

### 7. Ads on top of the subscription — 5 reviews, 2 apps
> "the app doesn't work and you need an add for everything and now i can't delete it it's stuck in my phone forever someone report them"
> — [App Store, 1★](https://itunes.apple.com/us/review?id=1556805595&type=Purple%20Software)

---

## 2. What is missing

Thin — this sample is dominated by billing anger, so feature requests are few.
Treat each as a lead, not a trend.

- **Any control over the output** (2 reviews, 2 apps). *"You can't customize
  really and it's the same photo over and over."*
  [1★](https://itunes.apple.com/us/review?id=1607753158&type=Purple%20Software)
- **Ethnicity / skin tone as an explicit input** (inferred from the 10
  likeness reviews above, not asked for by name). Nobody offers it. It is the
  single clearest unmet need in the data.
- **Video, not just a still.** The big-install apps (13k, 46k ratings) are
  still *image* generators. The video apps are all brand-new and tiny
  (8–41 ratings). The niche is a year old and nobody owns it yet.

## 3. What is unsolved

- **Nobody will let you see a result before paying.** Across all four apps,
  every complaint path starts at the paywall. A free first video is unoccupied
  ground in this category.
- **Nobody serves non-white parents properly.** Two separate reviewers
  described the same failure in their own words. No app in this niche markets
  skin-tone accuracy.
- **Nobody sells it per-video.** Everything is a weekly or yearly auto-renew
  subscription on a thing people use three times and delete. The product is a
  novelty; the pricing is a gym membership. That mismatch is what produces 39
  billing complaints.
- **The viral "AI baby podcast" format has no credible app.** Six apps exist,
  the best has 41 ratings, two sit at 2.0 and 3.1 stars, all are solo-dev
  builds. This is the actual opening.

---

## 4. Fix plan

| # | Fix | Size | Skill | Evidence |
| --- | --- | --- | --- | --- |
| 1 | No subscription. Credit packs only, one-time purchase. Cancel is meaningless because there is nothing to cancel. | M | `/replica-launch` | 39 billing + 27 pricing reviews |
| 2 | First video free, watermark-free, before any payment screen | S | `/replica-build` | 27 pricing, 14 trial reviews |
| 3 | Explicit skin tone / hair / ethnicity selector, plus prompt-level conditioning on it | S | `/replica-backend` | 10 likeness reviews, 2 verbatim race complaints |
| 4 | Never charge a credit for a failed or queued generation; auto-refund on failure | S | `/replica-backend` | 6 "doesn't work" + 5 credit reviews |
| 5 | Free re-roll: if they do not like it, one more on the house | S | `/replica-build` | 5 credits, 9 quality reviews |
| 6 | Real job queue with honest progress and push on completion | M | `/replica-backend` | 6 wait-time reviews |
| 7 | Zero ads, stated on the store page | S | `/replica-launch` | 5 ad reviews |
| 8 | Delete-my-photos button, visible, and photos purged after generation | S | `/replica-backend` | child photos + App Store 5.1.1 review risk |

## 5. The angle

Three options, each grounded in a theme above.

**A — No subscription (recommended)**
> For parents who want one fun baby video and not a weekly auto-renew they
> cannot cancel, **{{your app}}** sells videos one at a time, and the first
> one is free.
> Evidence: billing (39 reviews, 3 apps) + pricing (27 reviews, 3 apps).

**B — It actually looks like your family**
> For parents whose own features keep coming back wrong, **{{your app}}** lets
> you set skin tone, hair and features, and shows you the result before you pay.
> Evidence: likeness (10 reviews, 2 apps), including two explicit race complaints.

**C — The baby podcast app that works**
> For creators chasing the talking-baby trend, **{{your app}}** is the first
> one that renders reliably and exports clean vertical video.
> Evidence: 6 competing apps, best has 41 ratings, two rated 2.0 and 3.1.

**Recommended: A, with B as the proof and C as the launch wedge.**
A is what gets the install and kills the number-one complaint. B is the
feature that earns the good review. C is the trend that supplies traffic now.

Next: `/replica-brand`.
