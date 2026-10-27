// ─── send-push — push a notification to another user ────────────────────────
// Called by the app's sendPushToUser(). This function is the ONLY path that
// writes a `notifications` row for someone other than the caller (RLS limits
// clients to their own rows), looks up the recipient's Expo push token (the
// client can no longer read push_token), and talks to Expo.
//
// Security model
//   - The caller must present a real user session (Authorization: Bearer
//     <access token>). The public anon key alone is rejected.
//   - Per-sender and per-recipient hourly limits are enforced against the
//     notifications table, which this function writes itself — so the limit
//     counts every send, not just the ones the client chose to record.
//   - Inputs are typed and length-capped; `meta` may only contain scalar
//     values and is stamped with the verified sender_id.
//   - Responses never echo Expo's result or internal error text.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_TITLE = 80;
const MAX_BODY  = 240;
const MAX_TYPE  = 40;
const MAX_META_KEYS = 12;
const MAX_META_STR  = 200;
const SENDER_PER_HOUR    = 30;
const RECIPIENT_PER_HOUR = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE_RE = /^[a-z][a-z0-9_]*$/;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function cleanMeta(input: unknown): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (n >= MAX_META_KEYS) break;
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(k) || k === 'sender_id') continue;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') { out[k] = v; n++; }
    else if (typeof v === 'string') { out[k] = v.slice(0, MAX_META_STR); n++; }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // ── 1. Who is calling? Must be a signed-in user, not the bare anon key. ──
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' });
  const jwt = authHeader.slice(7);
  const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: { user }, error: authError } = await anonClient.auth.getUser(jwt);
  if (authError || !user) return json(401, { error: 'Unauthorized' });

  // ── 2. Validate input ──
  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }

  const userId = typeof payload.userId === 'string' ? payload.userId : '';
  const title  = typeof payload.title  === 'string' ? payload.title.trim().slice(0, MAX_TITLE) : '';
  const body   = typeof payload.body   === 'string' ? payload.body.trim().slice(0, MAX_BODY)   : '';
  const type   = typeof payload.type   === 'string' && TYPE_RE.test(payload.type) ? payload.type.slice(0, MAX_TYPE) : 'push';
  const meta   = cleanMeta(payload.meta);

  if (!UUID_RE.test(userId) || !title || !body) return json(400, { error: 'Missing required fields' });

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const since = new Date(Date.now() - 3600_000).toISOString();

    // ── 3. Rate limits (counted on rows this function wrote) ──
    const [{ count: bySender }, { count: toRecipient }] = await Promise.all([
      admin.from('notifications').select('id', { count: 'exact', head: true })
        .contains('meta', { sender_id: user.id }).gte('created_at', since),
      admin.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('created_at', since),
    ]);
    if ((bySender ?? 0) >= SENDER_PER_HOUR || (toRecipient ?? 0) >= RECIPIENT_PER_HOUR) {
      return json(429, { error: 'Rate limit exceeded' });
    }

    // ── 4. Inbox row for the recipient ──
    const stampedMeta = { ...meta, sender_id: user.id };
    const { error: insertError } = await admin.from('notifications').insert({
      user_id: userId, type, title, body, meta: stampedMeta,
    });
    if (insertError) {
      console.error('send-push: notifications insert failed:', insertError.message);
      return json(500, { error: 'Could not deliver notification' });
    }

    // ── 5. Device push, if the recipient has a token ──
    const { data: profile } = await admin.from('profiles').select('push_token').eq('id', userId).maybeSingle();
    if (!profile?.push_token) return json(200, { sent: false });

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        to: profile.push_token, title, body, sound: 'default',
        data: { type, ...meta },
      }),
    });
    if (!res.ok) console.error('send-push: Expo responded', res.status);
    return json(200, { sent: res.ok });
  } catch (e) {
    console.error('send-push unhandled error:', e);
    return json(500, { error: 'Could not deliver notification' });
  }
});
