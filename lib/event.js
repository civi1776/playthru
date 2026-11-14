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
  lights:      true,   // the course is lit; the evening tee time is the point
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

// How the event is played in the app (Play → Tournament). Every hole is a
// par 3 on the same three-minute clock, whatever the team size or how the
// team gets around, so every team in the field is measured the same way.
export const EVENT_PLAY = {
  // The name on the courses row, so event rounds sit with the course's other
  // rounds, records and ghost times.
  courseName:     'Palm Beach Par 3 Golf Course',
  city:           'Palm Beach',
  state:          'FL',
  holes:          EVENT.holes,
  par:            3,
  timeParSeconds: 180,
  level:          'TOURNAMENT',
  // Stored in rounds.difficulty. Three minutes on a par 3 for a team of two is
  // exactly the expert clock, and every board and rating already knows `pro`.
  difficulty:     'pro',
  players:        EVENT.teamSize,
};

// The Tournament option stays in Play until the morning after the event, so
// teams can rehearse the format beforehand and it disappears once it is over.
export function eventPlayOpen(now = new Date()) {
  const [y, m, d] = EVENT.dateISO.split('-').map(Number);
  return now < new Date(y, m - 1, d + 1, 6);
}

export const EVENT_ENTRY_NOTE =
  `Entry is ${EVENT.entryLabel}, paid by ${EVENT.paymentLabel} once your team is selected. Payment details come with your acceptance.`;

export const EVENT_TEST_RUN_NOTE =
  'This is a test run. One evening on a par 3 to try the format on real holes, hear what different players think of playing against the clock, and get it right before Clocked goes to a full 18-hole course.';

export default EVENT;
