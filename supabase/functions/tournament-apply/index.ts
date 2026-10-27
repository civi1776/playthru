// ─── tournament-apply — shared intake for Tournament Series applications ────
// Receives applications from both the in-app form (TournamentApplyScreen,
// source: 'app') and the website form (source: 'website'). Both send the same
// field names. Writes one row to public.tournament_applications.
//
// Eligibility rule: the series is for athletes. Each player must say what
// other organized sport they played (player1_sport / player2_sport). The DB
// columns are nullable so historical rows stay valid; enforcement lives here.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// Every free-text field is length-capped: this endpoint is reachable without
// a session (the website form posts here) and writes with the service role,
// so unbounded input would be a cheap way to bloat the table.
const SHORT = 120;   // names, handles, sport, slug
const LONG  = 2000;  // "why compete"
const str = (v: unknown, max = SHORT): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strOrNull = (v: unknown, max = SHORT): string | null => str(v, max) || null;
const isEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // DB CHECK constraint only allows 'app' | 'website'.
  const source           = str(body.source) === 'app' ? 'app' : 'website';
  const tournament_slug  = str(body.tournament_slug) || 'tournament-series';
  const team_name        = str(body.team_name);
  const contact_email    = str(body.contact_email).toLowerCase();
  const player1_name     = str(body.player1_name);
  const player1_sport    = str(body.player1_sport);
  const player2_name     = str(body.player2_name);
  const player2_sport    = str(body.player2_sport);
  const why_compete      = str(body.why_compete, LONG);

  if (!team_name)             return json({ error: 'Team name is required.' }, 400);
  if (!isEmail(contact_email)) return json({ error: 'A valid contact email is required.' }, 400);
  if (!player1_name)          return json({ error: 'Player 1 name is required.' }, 400);
  if (!player2_name)          return json({ error: 'Player 2 name is required.' }, 400);
  if (!player1_sport)         return json({ error: 'Player 1 must list the sport they played.' }, 400);
  if (!player2_sport)         return json({ error: 'Player 2 must list the sport they played.' }, 400);
  if (!why_compete)           return json({ error: 'Tell us why your team should compete.' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // In-app submissions carry the user's JWT — attach their profile id so the
  // admin review screen can link the application to an account.
  let user_id: string | null = null;
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token && token !== Deno.env.get('SUPABASE_ANON_KEY')) {
    const { data: userData } = await supabase.auth.getUser(token);
    user_id = userData?.user?.id ?? null;
  }
  // A website submission can't be linked to an account, and an app
  // submission is always linked — so usernames are only trusted when they
  // belong to the verified caller's own profile. Anything else is dropped
  // rather than letting a stranger "apply as" another member.
  let verified_username: string | null = null;
  if (user_id) {
    const { data: prof } = await supabase.from('profiles').select('username').eq('id', user_id).maybeSingle();
    verified_username = prof?.username ?? null;
  }
  const claimedUsername = (v: unknown) => {
    const u = strOrNull(v);
    return u && verified_username && u.toLowerCase() === verified_username.toLowerCase() ? verified_username : null;
  };

  const { data, error } = await supabase
    .from('tournament_applications')
    .insert({
      source,
      user_id,
      tournament_slug,
      team_name,
      contact_email,
      player1_name,
      player1_handicap:  strOrNull(body.player1_handicap),
      player1_sport,
      player1_instagram: strOrNull(body.player1_instagram),
      player1_username:  claimedUsername(body.player1_username),
      player2_name,
      player2_handicap:  strOrNull(body.player2_handicap),
      player2_sport,
      player2_instagram: strOrNull(body.player2_instagram),
      // Player 2 is a different person; their handle can't be verified here
      // and is kept only as a free-text hint for the reviewer.
      player2_username:  strOrNull(body.player2_username),
      why_compete,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('tournament-apply insert failed', error);
    return json({ error: 'Could not save your application. Please try again.' }, 500);
  }

  return json({ ok: true, id: data.id });
});
