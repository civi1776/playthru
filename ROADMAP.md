# Clocked — build checklist

Derived from three reference points, November 2026:

1. **clocked.golf** — what we already promise publicly
2. **The marketing plan** — South Florida pilot, events as the growth engine, arcade as top of funnel
3. **Usage data** — 54 profiles, 44 of them follow nobody, 1 feed row in 30 days, 0 challenges ever completed

The through-line: Clocked is a sport with a rating system, not a social network. The
closest products are chess.com, UTR and GHIN. The number is the product; people come
back to move it and to see who they are beating. Nothing in the website or the
marketing plan asks for a feed.

---

## DELETE

- [x] **Feed tab** — 81% of users follow nobody, so it is a permanently empty home screen. Replaced by Today.
- [x] **FeedScreen.js** — 778 lines, plus its like/comment plumbing.
- [x] **Profile → Activity tab** (own profile and public profile) — same emptiness problem at a smaller scale.
- [x] **activity_feed writes** on round save and in notifications — nothing reads them any more.
- [x] **Aerial course thumbnails in lists** — a 1.1 km crop centred on the clubhouse is grey parking lot at 32px. Replaced by the course crest.
- [ ] **`follows` as the organising principle** — keep the table (challenges and duels pick opponents from it) but stop treating it as the social graph. Groups replace it later.

## ADD — now

- [x] **Today tab** — the replacement home. Your score and what moved it, anything waiting on you, your arcade qualifying position, course records, event status. Always has content because it is about you.
- [x] **Course crest** — initials, hashed colour, gold hairline. Legible at 32px, scales to the hero, zero network. Courses stay square, players stay circular.
- [x] **Course records as a destination** — every course gets a record holder for points and for time. This is the Strava-segment mechanic and the site already sells "course and nationwide leaderboards" twice.
- [x] **Record-lost notification** — the proven retention hook. Fires when someone takes a record you held.
- [x] **Pace vs baseline on the course page** — minutes saved against the course's own average. The raw material for the course pitch.
- [x] **Rules copy aligned to the website** — ready golf, roll it in the fairway, beat time par, pick up at double, own your score, keep moving.

## ADDED 4 Nov

- [x] **Every arcade run posts itself.** No post button; a completed nine goes on the board. Signed-out runs show a sign-in note.
- [x] **Rounds started, per player.** `play_sessions` records every arcade run and every Clocked round the moment it begins, and closes it on completion or abandonment (including the stale-round cleanup). Admin → PLAY DATA shows started / completed / finish rate / players for each kind, all time, 30 days and 7 days, a per-player table, and a CSV export for sponsors.
- [x] **Course ranking removed from Ranks.** Courses either run Clocked tee times or they don't; they are not ranked against each other. Per-course player boards and course records stay.

- [x] **The clock is a buzzer.** Hit zero and the hole is over: double bogey and one more (−3). A ball already in the air gets to land. Verified on device.
- [x] **HEAT.** Beat the clock 3 holes in a row for +1, 6 for +2, 9 for +3; a slow hole resets it. Shown on the HUD, the verdict card, the hole table and the summary. `STREAK_BONUS` and `CLOCK_BONUS_PER_HOLE` in `lib/arcade/engine.js` switch schemes in one line.
- [x] **Pro timeScale 0.25 → 0.30.** With a hard buzzer a careful player timed out on a quarter of pro holes; now 4%.

## ADD — next (not in this pass)

- [ ] **Course pace report, GM-facing export** — minutes saved converted to tee times and dollars at their rate, as a one-page leave-behind. Turns "we won't promise you numbers" into "here are yours." Blocks every course conversation in the next 90 days.
- [ ] **Partner course status + Clocked tee-time blocks** — the courses page promises partner courses will be listed as participating, and its hero is a tee sheet with 7:20 / 7:30 / 7:40 marked CLOCKED. Pace is a property of a block, not of one group, so the pilot needs blocks to produce clean data.
- [ ] **Round output as content** — vertical share card and a shot clock designed to be filmed. Phase 1 of the marketing plan is content; the app should produce the post without anyone designing one.
- [ ] **Verified round receipt** — "I played 18 in 2 hours" only travels if it survives disbelief. `rounds.verification_level` already exists.
- [ ] **Events** — event object, Stripe entry, field list, realtime leaderboard, sponsor slot. Gates all of Phase 2. Settle the Apple fee question before the purse math goes in a deck.
- [ ] **Founding player invites** — capped code and a badge for the first 100–200 athletes. The tournament interest list already supplies the names.
- [ ] **Analytics** — arcade-to-real-round conversion above all. The marketing plan's own measurement list is currently unmeasurable.
- [ ] **Arcade section on clocked.golf** — the plan calls the arcade top of funnel; the website does not mention it anywhere.

## STILL OPEN IN THE APP

- [x] **PreviewModeScreen** now lists recent clocked rounds instead of the retired activity feed.

## ARCADE — found by simulation, 4 Nov

Fixed in this pass: scorer judged against the real-world time par (no arcade
hole was ever penalised); ball just off the back of the green pinned the cart
on the green's wall; cart could not reach a ball against a tree; short-game
cones; turbo while steering. `scripts/arcade-sim/` reproduces all of it.

Balance, for a decision rather than a quiet retune (careful player = roughly
today's top real score; sloppy = 3s hesitation, loose meter):

| Level | Hole time | HUD time par | Holes over par, careful / sloppy |
|---|---|---|---|
| Beginner | 40–50s | 216s | 0% / 0% |
| Intermediate | 43–56s | 105s | 0% / 1% |
| Pro | 47–63s | 53s | 20% / 71% |

- [x] **Intermediate's clock never bit.** `timeScale` 0.35 → 0.24 (par 4 from 105s to 72s). Re-simulated: careful player 1% of holes over, sloppy player 7%, 11 of 137 holes expire. Beginner stays roomy. Pro unchanged.
- [ ] **Half of every round is driving** (48–53%), walking another 11–17%. Fine while the cart is the fun part, but worth watching as holes get longer.
- [ ] **Beginner is a birdie festival** for an accurate player (birdie or better on 93% of holes, +31 per nine). Acceptable for an on-ramp; revisit if beginner scores ever count for anything.

## OPEN RISKS

- **Arcade qualifier spots are cheatable.** The game posts its own score from the client. Before a real purse is attached, either validate runs server-side from an input log or make the reward free entry rather than a guaranteed spot.
- **Entry fees and Apple.** A real-world tournament entry should qualify as a physical-world service and route through Stripe, but this is where review gets strict. Settle it early.
- [x] **Arcade seasons migration** applied 3 Nov. Board and duels live.
- [x] **Play sessions migration** applied 4 Nov. Backfilled 8 arcade runs and 13 Clocked rounds; PLAY DATA tab verified live. Finish rates read 100% until live starts accumulate, because only completed rounds existed to backfill.

---

## Website changes (clocked.golf)

- [x] Add an **arcade** section and nav entry — the missing top of funnel.
- [x] Update the "in the app now" list — course records, not "follow friends".
- [x] Reflect the Today-first app structure in the app band copy.
- [x] Courses page: ask for a block of consecutive tee times, not scattered slots.
- [ ] Deploy to production (`netlify deploy --no-build --prod`) — blocked by the permission classifier, needs to be run by hand.
