// ─── send-email — transactional email to the signed-in user ─────────────────
// Previously this accepted {to, subject, html} from any signed-in user, which
// made it an open mail relay from hello@clocked.golf. It now:
//   - requires a real user session,
//   - sends ONLY to that user's own verified address,
//   - renders a named server-side template (no client HTML),
//   - HTML-escapes every interpolated value,
//   - never echoes provider error bodies or configuration details.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const esc = (s: unknown, max = 60) =>
  String(s ?? '').slice(0, max)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function welcomeEmail({ firstName, username, referralCode }: { firstName: string; username: string; referralCode: string }) {
  const name = esc(firstName || username || 'Golfer');
  const code = /^[A-Z0-9]{4,12}$/.test(referralCode) ? referralCode : '';
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#090F0A;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#0D1A0F;border-radius:16px;border:1px solid rgba(125,200,122,0.25);padding:40px 36px;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#C9A84C;letter-spacing:5px;font-family:Arial,sans-serif;">CLOCKED GOLF</p>
    <p style="margin:0 0 28px;font-size:9px;color:rgba(125,200,122,0.5);letter-spacing:3px;font-family:Arial,sans-serif;">GOLF ON THE CLOCK</p>
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:400;color:#F5EDD8;">Welcome, ${name}.</h1>
    <p style="margin:0 0 24px;font-size:13px;color:rgba(245,237,216,0.6);letter-spacing:1px;font-family:Arial,sans-serif;">YOUR ACCOUNT IS READY</p>
    <hr style="border:none;border-top:1px solid rgba(125,200,122,0.15);margin:0 0 24px;" />
    <p style="margin:0 0 20px;font-size:15px;color:#F5EDD8;line-height:1.6;">Log your first round to get your official Clocked Score and see where you rank nationally.</p>
    ${code ? `
    <div style="background:rgba(125,200,122,0.08);border:1px solid rgba(125,200,122,0.2);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:9px;font-weight:700;color:rgba(125,200,122,0.6);letter-spacing:3px;font-family:Arial,sans-serif;">YOUR REFERRAL CODE</p>
      <p style="margin:0;font-size:22px;font-weight:700;color:#C9A84C;letter-spacing:4px;font-family:Arial,sans-serif;">${code}</p>
      <p style="margin:6px 0 0;font-size:12px;color:rgba(245,237,216,0.5);font-family:Arial,sans-serif;">Share with friends.</p>
    </div>` : ''}
    <p style="margin:0 0 6px;font-size:12px;color:rgba(245,237,216,0.4);font-family:Arial,sans-serif;">Questions? <a href="mailto:hello@clocked.golf" style="color:#C9A84C;">hello@clocked.golf</a></p>
    <p style="margin:0;font-size:11px;color:rgba(245,237,216,0.25);font-family:Arial,sans-serif;">Clocked Golf</p>
  </div>
</body>
</html>`;
}

const TEMPLATES: Record<string, { subject: string; render: (p: Record<string, string>) => string }> = {
  welcome: {
    subject: 'Welcome to Clocked Golf',
    render: (p) => welcomeEmail({ firstName: p.firstName, username: p.username, referralCode: p.referralCode }),
  },
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' });
  const { data: { user }, error: authError } = await createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
  ).auth.getUser(authHeader.slice(7));
  if (authError || !user?.email) return json(401, { error: 'Unauthorized' });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }

  const template = typeof payload.template === 'string' ? TEMPLATES[payload.template] : undefined;
  if (!template) return json(400, { error: 'Unknown template' });

  const params: Record<string, string> = {};
  for (const k of ['firstName', 'username', 'referralCode']) {
    params[k] = typeof payload[k] === 'string' ? (payload[k] as string) : '';
  }

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.error('send-email: RESEND_API_KEY not configured');
    return json(500, { error: 'Email unavailable' });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'Clocked Golf <hello@clocked.golf>',
        to: [user.email],               // always the caller's own address
        subject: template.subject,
        html: template.render(params),
      }),
    });
    if (!res.ok) {
      console.error('send-email: Resend responded', res.status);
      return json(502, { error: 'Email unavailable' });
    }
    return json(200, { sent: true });
  } catch (e) {
    console.error('send-email unhandled error:', e);
    return json(500, { error: 'Email unavailable' });
  }
});
