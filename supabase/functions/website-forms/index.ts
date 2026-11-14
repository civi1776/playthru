// ─── website-forms — intake for the clocked.golf forms ──────────────────────
// One endpoint, three form kinds. The static site posts JSON here with the
// public anon key; the function validates, stores the row with the service
// role, and emails hello@clocked.golf via Resend.
//
//   kind = tournament_interest → public.website_inquiries        (admin app: INTEREST tab)
//   kind = contact             → public.website_inquiries        (admin app: INBOX tab)
//   kind = course_partnership  → public.course_certification_inquiries (admin app: COURSES tab)
//   kind = event_application   → public.tournament_applications       (admin app: APPLICATIONS tab)
//
// An event application also sends each player a confirmation at their own
// address (thanks, further details on entry). See _shared/eventEmail.ts.
//
// Abuse controls: project-key gate, honeypot field, minimum fill time,
// length caps, per-IP (hourly) and per-email (daily) limits. Responses never
// echo database or provider errors. A row is only reported as received
// ({ ok: true }) after the insert succeeded; the emails are best-effort on
// top of that.
//
// The bot filter never answers "ok" for a submission it dropped. It used to,
// and a real applicant whose browser autofilled the hidden "Company website"
// field was shown the success message while nothing was stored (13 Nov 2026).
// The trap field is now `hp_token`, which autofill has no reason to touch,
// the old `company_website` name is ignored, and a tripped filter returns an
// error the visitor can see and act on.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requestHasProjectKey } from '../_shared/callerKey.ts';
import { HELLO, notifyHtml, sendMail, sendApplicantConfirmations } from '../_shared/eventEmail.ts';

const NOTIFY_TO   = HELLO;
const ALLOWED_ORIGINS = ['https://clocked.golf', 'https://www.clocked.golf'];

const SHORT = 160;
const LONG  = 3000;
const MIN_FILL_MS = 2000;
const PER_IP_PER_HOUR   = 6;
const PER_EMAIL_PER_DAY = 3;

const INQUIRY_TYPES = [
  'General Question', 'Tournament Information', 'Course Partnership',
  'Sponsorship / Brand Partnership', 'Media / Press', 'Other',
];

type Kind = 'tournament_interest' | 'course_partnership' | 'contact' | 'event_application';

// Events that accept team applications from the website. The app posts the
// same slug through tournament-apply. Anything else falls back to the first.
const EVENT_SLUGS = ['par3-2026-11-19'];

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const ok = ALLOWED_ORIGINS.includes(origin)
    || /^https:\/\/[a-z0-9-]+(--[a-z0-9-]+)?\.netlify\.app$/.test(origin)
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const str = (v: unknown, max = SHORT) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const text = (v: unknown, max = LONG) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
const orNull = (s: string) => (s ? s : null);
const isEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const truthy = (v: unknown) => v === true || v === 'true' || v === 'on' || v === 'yes' || v === '1';
async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clientIp(req: Request) {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  return (xff.split(',')[0] || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || '').trim();
}

// "Jupiter, FL" → { city: "Jupiter", state: "FL" }; anything else → city only.
function splitLocation(loc: string) {
  const parts = loc.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (/^[A-Za-z]{2}$/.test(last)) return { city: parts.slice(0, -1).join(', '), state: last.toUpperCase() };
  }
  return { city: loc, state: null as string | null };
}

const notify = (subject: string, replyTo: string, html: string) =>
  sendMail('website-forms', { to: NOTIFY_TO, subject, html, replyTo });

// Confirmations go to addresses the visitor typed, so a flood of sign-ups
// must not turn this into a way to mail strangers. Past this many
// applications in an hour the rows are still stored; only the confirmations
// stop.
const CONFIRM_FLOOD_PER_HOUR = 40;

Deno.serve(async (req) => {
  const CORS = cors(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });
  if (!(await requestHasProjectKey(req))) return json(401, { ok: false, error: 'Unauthorized.' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: 'Invalid request.' }); }

  const kind = str(body.kind) as Kind;
  if (!['tournament_interest', 'course_partnership', 'contact', 'event_application'].includes(kind)) {
    return json(400, { ok: false, error: 'Unknown form.' });
  }

  // ── Bot filters: honeypot + minimum time on page ──
  // Never a quiet "ok": the page shows its success message on { ok: true },
  // so a dropped submission has to say so. `company_website` (the old trap
  // name, still sent by cached pages) is deliberately not read.
  const elapsed = Number(body.elapsed_ms ?? 0);
  const trapped = !!str(body.hp_token);
  const tooFast = Number.isFinite(elapsed) && elapsed > 0 && elapsed < MIN_FILL_MS;
  if (trapped || tooFast) {
    console.warn('website-forms: bot filter tripped', kind, trapped ? 'trap-field' : 'too-fast');
    return json(400, { ok: false, error: `We could not verify that submission. Please reload the page and try again, or email ${NOTIFY_TO}.` });
  }

  const email = str(body.email).toLowerCase();
  if (!isEmail(email)) return json(400, { ok: false, error: 'Please enter a valid email address.' });

  const ip = clientIp(req);
  const ip_hash = ip ? (await sha256Hex(`${Deno.env.get('FORM_IP_SALT') ?? 'clocked-golf'}|${ip}`)).slice(0, 40) : null;
  const user_agent = orNull(str(req.headers.get('user-agent') ?? '', 300));
  const source_page = orNull(str(body.page, 120));

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const table = kind === 'course_partnership' ? 'course_certification_inquiries'
    : kind === 'event_application' ? 'tournament_applications'
    : 'website_inquiries';
  // tournament_applications is shared with the app and has no ip_hash column;
  // it is rate-limited by email only.
  const emailCol = table === 'tournament_applications' ? 'contact_email' : 'email';
  const hasIpHash = table !== 'tournament_applications';

  // ── Rate limits ──
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo  = new Date(Date.now() - 86400_000).toISOString();
  const [{ count: byIp }, { count: byEmail }] = await Promise.all([
    ip_hash && hasIpHash
      ? admin.from(table).select('id', { count: 'exact', head: true }).eq('ip_hash', ip_hash).gte('created_at', hourAgo)
      : Promise.resolve({ count: 0 }),
    admin.from(table).select('id', { count: 'exact', head: true }).ilike(emailCol, email).gte('created_at', dayAgo),
  ]);
  if ((byIp ?? 0) >= PER_IP_PER_HOUR || (byEmail ?? 0) >= PER_EMAIL_PER_DAY) {
    return json(429, { ok: false, error: `We already have a recent submission from you. If you need to add something, email ${NOTIFY_TO}.` });
  }

  // ── Per-kind validation + insert ──
  let subject = '';
  let html = '';
  let insert: Record<string, unknown>;
  let confirm: null | { slug: string; team: string; players: Array<{ name: string; email: string }> } = null;

  if (kind === 'tournament_interest') {
    const first_name = str(body.first_name), last_name = str(body.last_name), phone = str(body.phone, 40);
    const location = str(body.location), handicap = str(body.handicap, 40);
    const home_course = str(body.home_course), message = text(body.message);
    const consent = truthy(body.consent);
    if (!first_name || !last_name) return json(400, { ok: false, error: 'Please enter your first and last name.' });
    if (!phone)    return json(400, { ok: false, error: 'Please enter a phone number.' });
    if (!location) return json(400, { ok: false, error: 'Please enter your city or location.' });
    if (!handicap) return json(400, { ok: false, error: 'Please enter your current handicap.' });
    if (!consent)  return json(400, { ok: false, error: 'Please confirm you are happy to receive tournament communications.' });
    insert = { kind, first_name, last_name, email, phone, location, handicap, home_course: orNull(home_course), message: orNull(message), consent, source_page, user_agent, ip_hash };
    subject = `Tournament interest — ${first_name} ${last_name} (${location})`;
    html = notifyHtml('New tournament invitation request', [
      ['Name', `${first_name} ${last_name}`], ['Email', email], ['Phone', phone], ['Location', location],
      ['Handicap', handicap], ['Home course', home_course], ['Comments', message], ['Consent', consent ? 'Yes' : 'No'], ['Page', source_page ?? ''],
    ]);
  } else if (kind === 'event_application') {
    // Sign-up asks for exactly: team name, and for each player a full name,
    // email and phone, with Instagram optional. `email` / `phone` are player 1
    // and double as the team contact. Entry terms are shown beside the submit
    // button; there is no checkbox.
    const slugIn = str(body.tournament_slug, 60);
    const tournament_slug = EVENT_SLUGS.includes(slugIn) ? slugIn : EVENT_SLUGS[0];
    const team_name = str(body.team_name), phone = str(body.phone, 40);
    const player1_name = str(body.player1_name), player1_instagram = str(body.player1_instagram, 80);
    const player2_name = str(body.player2_name), player2_instagram = str(body.player2_instagram, 80);
    const player2_email = str(body.player2_email).toLowerCase(), player2_phone = str(body.player2_phone, 40);
    if (!team_name)     return json(400, { ok: false, error: 'Please enter a team name.' });
    if (!player1_name || !player2_name) return json(400, { ok: false, error: 'Please enter both players\' full names.' });
    if (!phone)         return json(400, { ok: false, error: 'Please enter a phone number for player 1.' });
    if (!isEmail(player2_email)) return json(400, { ok: false, error: 'Please enter a valid email address for player 2.' });
    if (!player2_phone) return json(400, { ok: false, error: 'Please enter a phone number for player 2.' });
    insert = {
      source: 'website', tournament_slug, status: 'pending',
      team_name, contact_email: email, contact_phone: phone,
      player1_name, player1_instagram: orNull(player1_instagram),
      player2_name, player2_email, player2_phone, player2_instagram: orNull(player2_instagram),
    };
    confirm = { slug: tournament_slug, team: team_name, players: [
      { name: player1_name, email },
      { name: player2_name, email: player2_email },
    ] };
    subject = `Event application — ${team_name} (${player1_name} & ${player2_name})`;
    html = notifyHtml(`New team application · ${tournament_slug}`, [
      ['Team', team_name],
      ['Player 1', [player1_name, email, phone, player1_instagram].filter(Boolean).join(' · ')],
      ['Player 2', [player2_name, player2_email, player2_phone, player2_instagram].filter(Boolean).join(' · ')],
      ['Page', source_page ?? ''],
    ]);
  } else if (kind === 'course_partnership') {
    const contact_name = str(body.contact_name), facility = str(body.facility), job_title = str(body.job_title);
    const phone = str(body.phone, 40), location = str(body.location), message = text(body.message);
    if (!contact_name) return json(400, { ok: false, error: 'Please enter a contact name.' });
    if (!facility)     return json(400, { ok: false, error: 'Please enter the golf course or facility name.' });
    if (!phone)        return json(400, { ok: false, error: 'Please enter a phone number.' });
    if (!location)     return json(400, { ok: false, error: 'Please enter the course location.' });
    const { city, state } = splitLocation(location);
    // Best-effort link to a course already in the database (exact name, case-insensitive).
    let existing_course_id: number | null = null;
    try {
      let q = admin.from('courses').select('id').ilike('name', facility).limit(2);
      if (state) q = q.eq('state', state);
      const { data } = await q;
      if (data && data.length === 1) existing_course_id = data[0].id;
    } catch { /* optional */ }
    insert = { course_name: facility, contact_name, role: orNull(job_title), email, phone, city, state, existing_course_id, message: orNull(message), status: 'pending', ip_hash };
    subject = `Course partnership — ${facility} (${location})`;
    html = notifyHtml('New course partnership inquiry', [
      ['Facility', facility], ['Contact', contact_name], ['Title', job_title], ['Email', email], ['Phone', phone],
      ['Location', location], ['Details', message], ['Matched course id', existing_course_id ? String(existing_course_id) : ''],
    ]);
  } else {
    const name = str(body.name), inquiry_type = str(body.inquiry_type, 60), message = text(body.message);
    if (!name)    return json(400, { ok: false, error: 'Please enter your name.' });
    if (!INQUIRY_TYPES.includes(inquiry_type)) return json(400, { ok: false, error: 'Please choose an inquiry type.' });
    if (!message) return json(400, { ok: false, error: 'Please write a message.' });
    const parts = name.split(' ');
    insert = { kind, first_name: parts[0], last_name: orNull(parts.slice(1).join(' ')), email, inquiry_type, message, consent: false, source_page, user_agent, ip_hash };
    subject = `${inquiry_type} — ${name}`;
    html = notifyHtml('New website message', [['Name', name], ['Email', email], ['Type', inquiry_type], ['Message', message]]);
  }

  const { data, error } = await admin.from(table).insert(insert).select('id').single();
  if (error) {
    console.error('website-forms insert failed', kind, error.message);
    return json(500, { ok: false, error: 'We could not save your submission. Please try again in a moment.' });
  }

  // Notification to hello@ and, for an event application, a confirmation to
  // each player. Run together; neither blocks the other.
  let confirmJob: Promise<number> = Promise.resolve(0);
  if (confirm) {
    const { count: lastHour } = await admin.from('tournament_applications')
      .select('id', { count: 'exact', head: true }).gte('created_at', hourAgo);
    if ((lastHour ?? 0) <= CONFIRM_FLOOD_PER_HOUR) {
      confirmJob = sendApplicantConfirmations('website-forms', confirm.slug, confirm.team, confirm.players);
    } else {
      console.warn('website-forms: confirmation emails paused, application flood guard');
    }
  }
  const [emailed, confirmed] = await Promise.all([
    notify(`[clocked.golf] ${subject}`, email, html),
    confirmJob,
  ]);
  return json(200, { ok: true, id: data.id, emailed, confirmed });
});
