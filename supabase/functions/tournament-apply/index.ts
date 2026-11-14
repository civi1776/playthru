// ─── tournament-apply — in-app intake for event applications ────────────────
// The app's sign-up form (TournamentApplyScreen) posts here; the website posts
// the same fields to website-forms. Both write public.tournament_applications
// and both send the same emails (see _shared/eventEmail.ts): a notification
// to hello@clocked.golf and a confirmation to each player.
//
// Two payload shapes are accepted, because the App Store build in people's
// hands keeps posting the old one until they update:
//
//   form_version 2 (current app): team name, and for each player a full
//     name, email and phone. Instagram optional. Same inputs as the website.
//       contact_email / contact_phone  = player 1
//       player2_email / player2_phone  = player 2
//
//   no form_version (app 1.9.0 and earlier): team name, one contact email,
//     both names, the sport each played, and "why compete". No phones, no
//     player 2 email. Still stored, and the contact still gets a confirmation.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DEFAULT_EVENT_SLUG, EVENTS, notifyHtml, sendMail, sendApplicantConfirmations, HELLO,
} from '../_shared/eventEmail.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// Every free-text field is length-capped: this endpoint writes with the
// service role, so unbounded input would be a cheap way to bloat the table.
const SHORT = 120;   // names, handles, sport, slug
const LONG  = 2000;  // "why compete"
const PER_EMAIL_PER_DAY = 3;
const CONFIRM_FLOOD_PER_HOUR = 40;   // same guard as website-forms
const str = (v: unknown, max = SHORT): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const strOrNull = (v: unknown, max = SHORT): string | null => str(v, max) || null;
const isEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const v2 = Number(body.form_version) >= 2;

  // DB CHECK constraint only allows 'app' | 'website'.
  const source           = str(body.source) === 'app' ? 'app' : 'website';
  const tournament_slug  = str(body.tournament_slug) || (v2 ? DEFAULT_EVENT_SLUG : 'tournament-series');
  const team_name        = str(body.team_name);
  const contact_email    = str(body.contact_email, 254).toLowerCase();
  const contact_phone    = str(body.contact_phone, 40);
  const player1_name     = str(body.player1_name);
  const player1_sport    = str(body.player1_sport);
  const player2_name     = str(body.player2_name);
  const player2_email    = str(body.player2_email, 254).toLowerCase();
  const player2_phone    = str(body.player2_phone, 40);
  const player2_sport    = str(body.player2_sport);
  const why_compete      = str(body.why_compete, LONG);

  if (!team_name)              return json({ error: 'Team name is required.' }, 400);
  if (!player1_name)           return json({ error: 'Player 1 name is required.' }, 400);
  if (!player2_name)           return json({ error: 'Player 2 name is required.' }, 400);
  if (v2) {
    if (!isEmail(contact_email)) return json({ error: 'Enter a valid email address for player 1.' }, 400);
    if (!contact_phone)          return json({ error: 'Enter a phone number for player 1.' }, 400);
    if (!isEmail(player2_email)) return json({ error: 'Enter a valid email address for player 2.' }, 400);
    if (!player2_phone)          return json({ error: 'Enter a phone number for player 2.' }, 400);
  } else {
    if (!isEmail(contact_email)) return json({ error: 'A valid contact email is required.' }, 400);
    if (!player1_sport)          return json({ error: 'Player 1 must list the sport they played.' }, 400);
    if (!player2_sport)          return json({ error: 'Player 2 must list the sport they played.' }, 400);
    if (!why_compete)            return json({ error: 'Tell us why your team should compete.' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Same daily limit as the website form: one address cannot stack up
  // applications (or confirmation emails).
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo  = new Date(Date.now() - 86400_000).toISOString();
  const { count: byEmail } = await supabase.from('tournament_applications')
    .select('id', { count: 'exact', head: true }).ilike('contact_email', contact_email).gte('created_at', dayAgo);
  if ((byEmail ?? 0) >= PER_EMAIL_PER_DAY) {
    return json({ error: `We already have a recent application from you. If you need to change something, email ${HELLO}.` }, 429);
  }

  // In-app submissions carry the user's JWT — attach their profile id so the
  // admin review screen can link the application to an account.
  let user_id: string | null = null;
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token && token !== Deno.env.get('SUPABASE_ANON_KEY')) {
    try {
      const { data: userData } = await supabase.auth.getUser(token);
      user_id = userData?.user?.id ?? null;
    } catch { /* anon key or expired session: stored without an account link */ }
  }
  // Usernames are only trusted when they belong to the verified caller's own
  // profile. Anything else is dropped rather than letting a stranger "apply
  // as" another member.
  let verified_username: string | null = null;
  if (user_id) {
    const { data: prof } = await supabase.from('profiles').select('username').eq('id', user_id).maybeSingle();
    verified_username = prof?.username ?? null;
  }
  const claimedUsername = (v: unknown) => {
    const u = strOrNull(v);
    return u && verified_username && u.toLowerCase() === verified_username.toLowerCase() ? verified_username : null;
  };

  const player1_instagram = strOrNull(body.player1_instagram, 80);
  const player2_instagram = strOrNull(body.player2_instagram, 80);

  const { data, error } = await supabase
    .from('tournament_applications')
    .insert({
      source,
      user_id,
      tournament_slug,
      team_name,
      contact_email,
      contact_phone:     contact_phone || null,
      player1_name,
      player1_handicap:  strOrNull(body.player1_handicap),
      player1_sport:     player1_sport || null,
      player1_instagram,
      player1_username:  claimedUsername(body.player1_username),
      player2_name,
      player2_email:     isEmail(player2_email) ? player2_email : null,
      player2_phone:     player2_phone || null,
      player2_handicap:  strOrNull(body.player2_handicap),
      player2_sport:     player2_sport || null,
      player2_instagram,
      // Player 2 is a different person; their handle can't be verified here
      // and is kept only as a free-text hint for the reviewer.
      player2_username:  strOrNull(body.player2_username),
      why_compete:       why_compete || null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('tournament-apply insert failed', error.message);
    return json({ error: 'Could not save your application. Please try again.' }, 500);
  }

  // ── Emails (best-effort; the row above is the record) ──
  const html = notifyHtml(`New team application · ${tournament_slug}`, [
    ['Team', team_name],
    ['Player 1', [player1_name, contact_email, contact_phone, player1_instagram, verified_username ? `app: ${verified_username}` : ''].filter(Boolean).join(' · ')],
    ['Player 2', [player2_name, player2_email, player2_phone, player2_instagram].filter(Boolean).join(' · ')],
    ['Sports', [player1_sport, player2_sport].filter(Boolean).join(' / ')],
    ['Why', why_compete],
  ], 'APP');

  let confirmJob: Promise<number> = Promise.resolve(0);
  if (EVENTS[tournament_slug]) {
    const { count: lastHour } = await supabase.from('tournament_applications')
      .select('id', { count: 'exact', head: true }).gte('created_at', hourAgo);
    if ((lastHour ?? 0) <= CONFIRM_FLOOD_PER_HOUR) {
      confirmJob = sendApplicantConfirmations('tournament-apply', tournament_slug, team_name, [
        { name: player1_name, email: contact_email },
        { name: player2_name, email: player2_email },
      ]);
    } else {
      console.warn('tournament-apply: confirmation emails paused, application flood guard');
    }
  }
  const [emailed, confirmed] = await Promise.all([
    sendMail('tournament-apply', {
      to: HELLO, replyTo: contact_email, html,
      subject: `[app] Event application — ${team_name} (${player1_name} & ${player2_name})`,
    }),
    confirmJob,
  ]);

  return json({ ok: true, id: data.id, emailed, confirmed });
});
