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
- [x] **Analytics, first cut** — `play_sessions` records every start; Admin → PLAY DATA. Still missing: arcade-to-real conversion as a single number (players whose first session was arcade and who later started a Clocked round), content-to-download.
- [x] **Arcade section on clocked.golf** — live 4 Nov.

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

## ARCADE — 5 Nov, from build 59 feedback

- [x] **Greens break on intermediate and pro.** Seeded tilt per green, contour lines + downhill chevron on the map, break read in the putt hint. Cups tightened (inter 0.8, pro 0.6) so a straight 10-yarder misses on intermediate and a 6-yarder misses on pro at mid tilt. `scripts/arcade-sim/putt-break.mjs` measures it.
- [x] **UNDER CLOCK counted a timed-out hole** (8/9 with two timeouts). Holes carry the verdict flag now.
- [x] **Cart drove itself after a shot** when a thumb was still on the stick at arrival. Stick ref zeroed outside the drive phase; responder kept alive across phases.
- [x] **Turbo** also fires from the button's own touch start, so it works whatever owns the gesture. Needs a device retest on the next build: stick held first, boost pressed second.
- [x] **Arcade summary buttons do something.** SEE LEADERBOARD opens the Ranks tab on the Arcade board (with your rank on the button once posted); SHARE sends the run through the share sheet.
- [ ] **Build 60** carries all of the above. 59 is in review without them; cancel 59's review and submit 60, or let 59 ship and follow with 60.

## EVENT — 5 Nov, Clocked at the Par 3

- [x] **Event sign-up in the app** — `lib/event.js` holds the facts (Palm Beach Par 3, Thu 19 Nov 2026 6:00 PM, two-player teams, $100/player by Zelle or Venmo once selected, 12–13 teams, cash prize sized by the field, hand-picked with a waitlist). TournamentScreen rewritten as the event page; TournamentApplyScreen posts slug `par3-2026-11-19` with an entry-terms acknowledgement; Today card, Profile promo and Onboarding copy updated.
- [x] **Event sign-up on clocked.golf** — /tournaments is the event page with the team application form (`event_application` kind → `tournament_applications`, source `website`, phone in new `contact_phone`). Homepage pillar, contact link and privacy policy updated.
- [x] **Migration `20261105120000_par3_event.sql`** applied 5 Nov.
- [x] **`website-forms` deployed, site live** 5 Nov; the form validates against the live function.
- [ ] **Payment tracking** — admin can mark accepted/waitlisted; there is no paid flag yet. Track Zelle/Venmo receipts by hand for this one, add `paid_at` before the next event.
- [x] **Lights confirmed** — the course is lit; 6:00 PM is deliberate. "Under the lights" is in the copy.
- [x] **Sign-up on the homepage** — 13 Nov, ahead of the promo. Gold strip under the header, hero button, and the full team application at `clocked.golf/#apply` (same `event_application` form as /tournaments, success block `#apply-done`). Stylesheet stamp `20261113a`. Draft deploy checked; production deploy is the user's to run.
- [ ] **Send one test application before the promo** — `tournament_applications` had zero rows on 13 Nov, so the path has never stored a real application from the site or the app. Confirm the row and the hello@clocked.golf email, then delete the test row.
- [ ] **Take the event content off the homepage after 19 Nov** — strip, hero button, `#apply` section and the meta description are all event-specific. Pre-event homepage is in `clocked html - backup 2026-11-13`.

## CLOCK — 5 Nov, lock-screen alarms

- [x] **Alarms at 1:00, 0:30, 0:10 and 0:00** — local notifications scheduled on START HOLE (`CLOCK_ALARMS` in ClockedRoundScreen), swept on HOLED OUT, hole jump, pause, abandon, finish and on cold-start resume (rescheduled from the original start). `chime.wav` for the warnings, `buzzer.wav` for time, both bundled through the expo-notifications plugin; `timeSensitive` interruption level + entitlement so Focus modes let them through. Foreground: no banner over the clock, chimes still sound, buzzer is the in-app one.
- [ ] **Time-sensitive entitlement** pulled after build 61 failed: the App Store provisioning profile doesn't include the capability. To bring it back: enable "Time Sensitive Notifications" on `com.civiswings.playthru` at developer.apple.com → Identifiers, regenerate the profile (`eas credentials` → iOS → production → provisioning profile), then re-add `com.apple.developer.usernotifications.time-sensitive` to `app.json`. Until then alarms don't break through Focus modes; `interruptionLevel: 'timeSensitive'` in the payload is harmless without it.
- [ ] **Silent switch** — iOS mutes notification sounds when the ring switch is off; only Critical Alerts (Apple-approved entitlement) override it. Tell players to leave the ringer on, or apply for the entitlement before the event.

## AUDIT PASS — 9 Nov (CLOCKED_GOLF_APP_AUDIT_REPORT, 32 issues on 1.9.0)

Code is committed. Two things are NOT live until they are run by hand (the permission classifier blocks both):

- [ ] `npx supabase functions deploy search-courses` — the live function still returns HTTP 500 (`.find()` on a non-array `tees.male`). Shipped builds have dead course search until this is deployed. The next build also falls back to a direct `courses` table search when the function fails.
- [ ] `npx supabase db query --linked --file supabase/migrations/20261109120000_audit_hardening.sql && npx supabase migration repair --status applied 20261109120000 --linked` — server half of CG-002, 003, 008, 023, 032.
- [ ] Supabase dashboard, Auth: turn on leaked-password protection (CG-032, cannot be done from SQL).
- [ ] New EAS build. The 1.9.0 content went live 8 Nov, so the train is closed and the version must go up first. The App Store lookup reports the live version string as `63`; confirm the number in App Store Connect before picking the next one.

Fixed in the app:

- [x] **CG-001** swipe-back disabled on `ArcadeGame` and `ClockedRound`.
- [x] **CG-002** client: runs post with session, app version and ruleset; one score per run handled. Server: guard trigger with range checks and session link (migration). Plausibility checking, not replay validation.
- [x] **CG-003** finish is re-entrancy guarded and idempotent (looks up user + tee time, treats 23505 as saved). Unique index in the migration. Verified: double-tap FINISH saved one round.
- [x] **CG-004** app background or the pause button freezes the clock, shifts every timestamp on resume, covers the map. Pause count and seconds are recorded with the run. Verified in the simulator.
- [x] **CG-005** no walk back to the cart; walks are bounded (1.0 s on the green, 1.6 s off it, 2.5 s from the cart).
- [~] **CG-006** HUD, verdict, shot panel and controls memoised. Frame rate NOT measured on a device; the per-frame JS render loop is still there.
- [x] **CG-007** power meter shows carry at the current power and a pin notch; clubs fitted so the pin sits inside the bar.
- [x] **CG-008** `lib/rankingFilters.js`: test accounts and rounds under the floor (20 min per nine) are practice, off every score and rank. Legacy listed separately. `profiles.is_test` in the migration.
- [x] **CG-009** orphaned arcade sessions closed as abandoned on launch and on unmount.
- [x] **CG-010** splash plays once per cold start; SEE LEADERBOARD pops to the existing Main.
- [x] **CG-011/012** next hole's clock starts on its tee; verdict and hole card are tap-to-skip; HUD holds the finished hole's time until the card flips.
- [x] **CG-013/026** arcade timer zones follow the fraction of time par; last ten seconds pulse faster.
- [x] **CG-014/015** verdict is a ledger (stroke points, clock, HEAT, THIS HOLE total) that fits the circle.
- [x] **CG-016/017/018** cone freezes at the strike; putts read in feet; four-column shot panel.
- [x] **CG-019/020/031** Ranks: per-board cache, no false empty state, fixed row columns.
- [x] **CG-021/029** summary leads with points, arcade score shown out of 100; HEAT is a chip.
- [x] **CG-022** one board builder feeds Ranks, profile chip (`CLK RANK`), Today and public profile.
- [x] **CG-023** `RULESET = 2` and app version stored on every run (columns in the migration). Scores run about 2 to 3 points per nine higher than ruleset 1.
- [x] **CG-024** shot result toast. **CG-025** HUD row fixed height. **CG-027** card says PLAYS n YDS. **CG-028** one clock feeds the round timer and TOTAL TIME. **CG-030** TURBO naming, tips retire.
- [x] **CG-032** anon EXECUTE revoked, duplicate index dropped, FK indexes, policy `(select auth.uid())` (migration).
- [x] **Course search** works in Play setup and in header Search (new COURSES tab opens the course profile). Placeholder pars (default 72 on hand-entered rows) are hidden.

Decisions and data left for Billy:

- [ ] Time pars are unchanged. Walking and transitions no longer charge the clock, so judge the pars again on a device before tuning.
- [ ] The 20 minute per nine ranked floor is a guess. Every production clocked round so far is 1 to 3 minutes, so the Clocked board is empty until a real round is logged.
- [ ] Palm Beach Par 3 (course id 1235, the event venue) has par 72 and no hole data in the DB. Real card is 18 holes, par 54. Needs a data fix.
- [ ] Test rows awaiting a delete decision: practice round `f9cfb8cb-560b-424f-b953-dec791bb69b9` under `billycivi` (9 Nov, made while verifying) and the duplicate `civbilly` round rows from June and July.
- [ ] After the migration, runs with no matching session are stored unverified and stay off the arcade boards (includes anything posted from 1.7.0). Older builds that double-save a round get an error on the second insert.

## RELEASES

- **1.9.0 (build 62)** live on the App Store 8 Nov (store lookup shows the 1.9.0 release notes; version string reads `63`). Train closed. The 9 Nov audit pass is not in any build yet.

- **1.7.0 (build 54)** approved and live on the App Store, 4 Nov: Today tab, course records, head-to-head profiles, course crests, arcade qualifying board.
- **1.8.0 (build 60)** built 5 Nov with the 5 Nov arcade pass (breaking greens, honest under-clock count, no phantom cart push, SEE LEADERBOARD + SHARE). **Build 61** (`fdfd67f2`, 1.8.0) errored on EAS. **Build 62 (1.9.0, `b43fc474`, started 5 Nov 7:24 PM, auto-submit)** carries the arcade pass + Par 3 event sign-up + lock-screen clock alarms + "under the lights". Build 60 was uploaded by hand at 7 PM (its auto-submit never ran).
- **1.8.0 (build 59)** APPROVED 5 Nov (confirmed by Apple rejecting build 60: "previously approved version [1.8.0]"); train closed, so 60 and 61 were both rejected/doomed. Version bumped to 1.9.0 for build 62. Contents: buzzer + HEAT, auto-posting arcade runs, champagne gold, white splash, short-game cones, turbo while steering, Ranks as two boards, profile course/arcade split, course ranking removed, play sessions. Builds 55–58 never reached review (55 and 56 cancelled pre-upload, 57 rejected because the 1.7.0 train had closed, 58 skipped for a Ranks crash found while taking screenshots). Screenshots in `~/Desktop/clocked golf screenshot 2.0`.

## OPEN RISKS

- **Arcade qualifier spots are cheatable.** The game posts its own score from the client. The 9 Nov migration adds range checks and a session link (a soft guard); it does not replay runs, so review the top ten by hand. Before a real purse is attached, either validate runs server-side from an input log or make the reward free entry rather than a guaranteed spot.
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
