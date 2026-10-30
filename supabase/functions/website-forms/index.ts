// ─── website-forms — intake for the clocked.golf forms ──────────────────────
// One endpoint, three form kinds. The static site posts JSON here with the
// public anon key; the function validates, stores the row with the service
// role, and emails hello@clocked.golf via Resend.
//
//   kind = tournament_interest → public.website_inquiries        (admin app: INTEREST tab)
//   kind = contact             → public.website_inquiries        (admin app: INBOX tab)
//   kind = course_partnership  → public.course_certification_inquiries (admin app: COURSES tab)
//
// Abuse controls: project-key gate, honeypot field, minimum fill time,
// length caps, per-IP (hourly) and per-email (daily) limits. Responses never
// echo database or provider errors. A row is only reported as received
// ({ ok: true }) after the insert succeeded; the notification email is
// best-effort on top of that.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requestHasProjectKey } from '../_shared/callerKey.ts';

const NOTIFY_TO   = 'hello@clocked.golf';
const NOTIFY_FROM = 'Clocked Golf <hello@clocked.golf>';
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

type Kind = 'tournament_interest' | 'course_partnership' | 'contact';

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
const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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

function notifyHtml(title: string, rows: Array<[string, string]>) {
  const trs = rows.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#777;font:12px Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${esc(k)}</td>` +
    `<td style="padding:8px 12px;border-bottom:1px solid #eee;color:#111;font:15px Arial,sans-serif;white-space:pre-wrap;">${esc(v)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f4f2ed;font-family:Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e6e2d8;">
    <div style="padding:20px 24px;background:#070A08;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:4px;color:#C9A84C;">CLOCKED GOLF · WEBSITE</p>
      <h1 style="margin:8px 0 0;font-size:20px;color:#F3EEE4;font-weight:700;">${esc(title)}</h1>
    </div>
    <table style="width:100%;border-collapse:collapse;">${trs}</table>
    <p style="margin:0;padding:16px 24px;color:#999;font-size:12px;">Review and update status in the Clocked Golf admin app. Reply to this email to answer the sender directly.</p>
  </div></body></html>`;
}

async function notify(subject: string, replyTo: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) { console.error('website-forms: RESEND_API_KEY not configured; row saved, no email sent'); return false; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ from: NOTIFY_FROM, to: [NOTIFY_TO], reply_to: replyTo, subject, html }),
    });
    if (!res.ok) {
      // Log Resend's reason (domain not verified, key restricted, etc.) so it
      // can be read in the function logs. Never includes the API key.
      const detail = (await res.text().catch(() => '')).split(key).join('[key]').slice(0, 300);
      console.error('website-forms: Resend responded', res.status, detail);
    }
    return res.ok;
  } catch (e) {
    console.error('website-forms: Resend error', e);
    return false;
  }
}

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
  if (!['tournament_interest', 'course_partnership', 'contact'].includes(kind)) {
    return json(400, { ok: false, error: 'Unknown form.' });
  }

  // ── Bot filters: honeypot + minimum time on page. Bots get a quiet "ok". ──
  const elapsed = Number(body.elapsed_ms ?? 0);
  if (str(body.company_website) || (Number.isFinite(elapsed) && elapsed > 0 && elapsed < MIN_FILL_MS)) {
    return json(200, { ok: true });
  }

  const email = str(body.email).toLowerCase();
  if (!isEmail(email)) return json(400, { ok: false, error: 'Please enter a valid email address.' });

  const ip = clientIp(req);
  const ip_hash = ip ? (await sha256Hex(`${Deno.env.get('FORM_IP_SALT') ?? 'clocked-golf'}|${ip}`)).slice(0, 40) : null;
  const user_agent = orNull(str(req.headers.get('user-agent') ?? '', 300));
  const source_page = orNull(str(body.page, 120));

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const table = kind === 'course_partnership' ? 'course_certification_inquiries' : 'website_inquiries';

  // ── Rate limits ──
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo  = new Date(Date.now() - 86400_000).toISOString();
  const [{ count: byIp }, { count: byEmail }] = await Promise.all([
    ip_hash
      ? admin.from(table).select('id', { count: 'exact', head: true }).eq('ip_hash', ip_hash).gte('created_at', hourAgo)
      : Promise.resolve({ count: 0 }),
    admin.from(table).select('id', { count: 'exact', head: true }).ilike('email', email).gte('created_at', dayAgo),
  ]);
  if ((byIp ?? 0) >= PER_IP_PER_HOUR || (byEmail ?? 0) >= PER_EMAIL_PER_DAY) {
    return json(429, { ok: false, error: `We already have a recent submission from you. If you need to add something, email ${NOTIFY_TO}.` });
  }

  // ── Per-kind validation + insert ──
  let subject = '';
  let html = '';
  let insert: Record<string, unknown>;

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

  const emailed = await notify(`[clocked.golf] ${subject}`, email, html);
  return json(200, { ok: true, id: data.id, emailed });
});
