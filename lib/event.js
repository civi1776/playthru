// ─── lib/event.js — the next Clocked event, in one place ─────────────────────
// Everything the Tournament screens, the Today card and the apply form say
// about the event comes from here, so a date or price change is one edit.
// The website (clocked.golf/tournaments) carries the same facts by hand.

export const EVENT = {
  slug:        'par3-2026-11-19',
  name:        'Clocked at the Par 3',
  venue:       'Palm Beach Par 3',
  city:        'Palm Beach, FL',
  dateISO:     '2026-11-19',
  dateLabel:   'Thursday, November 19',
  timeLabel:   '6:00 PM',
  holes:       9,
  teamSize:    2,
  teamCap:     '12–13 teams',
  entryPerPlayer: 100,
  entryLabel:  '$100 per player',
  paymentLabel:'Zelle or Venmo',
  // The field is picked by hand from the applications; everyone else sits on
  // a waitlist and gets the call when a team drops.
  selection:   'hand-picked',
};

export const EVENT_ENTRY_NOTE =
  `Entry is ${EVENT.entryLabel}, paid by ${EVENT.paymentLabel} once your team is selected. Payment details come with your acceptance.`;

export const EVENT_TEST_RUN_NOTE =
  'This is a test run. One evening on a par 3 to try the format on real holes, hear what different players think of playing against the clock, and get it right before Clocked goes to a full 18-hole course.';

export default EVENT;
