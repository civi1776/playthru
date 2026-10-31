// ─── lib/theme.js ──────────────────────────────────────────────────────────
// The Midnight Fairway design system. Single source of truth for color,
// typography, and motion constants across the app — instrumentation, not
// decoration. Numbers are heroes; labels are telemetry.
//
// Reference points: Whoop, Strava, F1 timing graphics, a fighter jet HUD.
// Athletic. Precise. Alive.

// ─── Color ───────────────────────────────────────────────────────────────
export const COLOR = {
  // Base — every screen lives in the dark.
  bg:          '#090F0A',
  surface:     '#0D1A0F',
  surfaceAlt:  '#1A2E1C',
  border:      '#7DC87A22',
  borderGold:  '#C9A84C33',

  // Signal gold — reserved for earned things. Never decoration.
  gold:        '#C9A84C',
  goldBright:  '#F0CB5B',

  // Text
  cream:       '#F5EDD8',
  muted:       '#B8A882',
  dim:         '#7A6E58',

  // Performance — color IS information.
  green:       '#7DC87A', // under the clock / birdie
  amber:       '#D9954C', // mid-pack — bridges red and gold in the score scale
  red:         '#E85D4A', // over / penalty / low score
  goldElite:   '#F0CB5B', // elite / eagle
};

// Gold gradient endpoints, for LinearGradient — earned things only
// (scores, ranks, certification seals). Never used as plain background fill.
export const GOLD_GRADIENT = [COLOR.gold, COLOR.goldBright];

// ─── Clocked Score tiers ─────────────────────────────────────────────────
// Named tiers give the score culture — "he's an Apex guy." Sponsors get
// segments to activate against. Order matters: checked top-down.
// Color runs red (low) -> amber -> gold -> bright gold (high) — the number
// itself should telegraph good/bad before anyone reads the label.
export const SCORE_TIERS = [
  { min: 80, name: 'APEX',       color: COLOR.goldBright },
  { min: 65, name: 'CONTENDER',  color: COLOR.gold },
  { min: 40, name: 'GRINDER',    color: COLOR.amber },
  { min: 0,  name: 'ON THE CLOCK', color: COLOR.red },
];

export function scoreTier(score, isProvisional) {
  if (isProvisional) return { name: 'ON TRIAL', color: COLOR.dim };
  const s = score ?? 0;
  return SCORE_TIERS.find(t => s >= t.min) ?? SCORE_TIERS[SCORE_TIERS.length - 1];
}

// ─── Countdown ring zones ────────────────────────────────────────────────
// Green zone -> gold zone (final 25%) -> pulsing red (final 60s or over).
export function ringZone(remainingSeconds, timeParSeconds) {
  if (remainingSeconds <= 0) return 'red';
  if (remainingSeconds <= 60) return 'red';
  if (timeParSeconds > 0 && remainingSeconds <= timeParSeconds * 0.25) return 'gold';
  return 'green';
}

export function ringColorForZone(zone) {
  if (zone === 'red') return COLOR.red;
  if (zone === 'gold') return COLOR.gold;
  return COLOR.green;
}

// ─── Typography as instrumentation ───────────────────────────────────────
// Numbers are heroes: big, thin-weight, tabular. Labels are telemetry:
// small, letterspaced, all-caps.
export const TYPE = {
  // Display face: screen titles, wordmarks, hero statements. Matches the
  // heavy condensed sans on clocked.golf. Loaded in App.js.
  display: {
    fontFamily: 'Montserrat_800ExtraBold',
    textTransform: 'uppercase',
  },
  heroNumber: {
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  statNumber: {
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: COLOR.dim,
    textTransform: 'uppercase',
  },
  labelOn: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: COLOR.gold,
    textTransform: 'uppercase',
  },
};

// ─── Motion ──────────────────────────────────────────────────────────────
// Fast, directional. Nothing floats. Nothing bounces. This is a sport.
export const MOTION = {
  fast: 150,
  standard: 200,
  ringTick: 1000, // ring drains in sync with the 1s clock tick
  verdictHold: 1000,
  heartbeatInterval: 1000, // haptic pulse cadence in the final minute
};

// ─── Spacing scale ───────────────────────────────────────────────────────
// 4px increments. Every screen currently hand-rolls its own paddings —
// this is the shared vocabulary to converge on, not a hard requirement to
// rewrite everything at once.
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

// ─── Radius scale ────────────────────────────────────────────────────────
// sm — pills, chips, small controls. md — standard cards/inputs.
// lg — hero cards and primary CTA buttons.
export const RADIUS = {
  xs: 6,    // chips, tags, tiny controls
  sm: 8,    // small controls, inputs
  md: 12,   // cards, buttons
  lg: 16,   // hero cards
  pill: 999,
};

// ─── Shared card treatment ───────────────────────────────────────────────
// The look every screen already converges on by hand: surface fill, hairline
// border, standard radius/padding. Spread into a StyleSheet entry
// (`{ ...CARD, ...overrides }`) rather than a wrapper component, since the
// app has no shared <Card> convention yet and every screen builds its cards
// via StyleSheet.create.
export const CARD = {
  backgroundColor: COLOR.surface,
  borderRadius: RADIUS.md,
  borderWidth: 1,
  borderColor: COLOR.border,
  padding: SPACING.lg,
};

export default { COLOR, GOLD_GRADIENT, SCORE_TIERS, scoreTier, ringZone, ringColorForZone, TYPE, MOTION, SPACING, RADIUS, CARD };
