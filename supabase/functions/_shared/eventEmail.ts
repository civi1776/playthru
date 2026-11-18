// ─── _shared/eventEmail.ts — the emails an event application sends ──────────
// Used by website-forms (clocked.golf sign-up) and tournament-apply (in-app
// sign-up) so both paths send the same two things through Resend:
//
//   1. a notification to hello@clocked.golf, and
//   2. a confirmation to each player's own address: thanks for applying,
//      further details follow on entry.
//
// Both are best-effort. The application row is the record; a failed email
// never fails the submission. Nothing here logs an address or the API key.

export const HELLO = 'hello@clocked.golf';
export const FROM  = 'Clocked Golf <hello@clocked.golf>';

// What the confirmation says about each event. Mirrors lib/event.js in the
// app and the website copy; edit all three together.
export const EVENTS: Record<string, { name: string; when: string; where: string }> = {
  'par3-2026-11-19': {
    name:  'Clocked at the Par 3',
    when:  'Thursday, November 19 · 6:00 PM',
    where: 'The Park West Palm · West Palm Beach, FL',
  },
};
export const DEFAULT_EVENT_SLUG = 'par3-2026-11-19';

export const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const isEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

type Mail = { to: string; subject: string; html: string; text?: string; replyTo?: string };

// One Resend call. Returns true only when Resend accepted the message.
export async function sendMail(tag: string, mail: Mail): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) { console.error(`${tag}: RESEND_API_KEY not configured; no email sent`); return false; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        from: FROM, to: [mail.to], reply_to: mail.replyTo ?? HELLO,
        subject: mail.subject, html: mail.html, ...(mail.text ? { text: mail.text } : {}),
      }),
    });
    if (!res.ok) {
      // Resend's reason (domain not verified, key restricted, ...) is what
      // makes this debuggable from the function logs. Scrub the key and any
      // address before logging.
      const detail = (await res.text().catch(() => ''))
        .split(key).join('[key]')
        .replace(/[^\s"<>]+@[^\s"<>]+/g, '[address]')
        .slice(0, 300);
      console.error(`${tag}: Resend responded`, res.status, detail);
    }
    return res.ok;
  } catch (e) {
    console.error(`${tag}: Resend error`, (e as Error)?.message ?? 'unknown');
    return false;
  }
}

// Table-style notification for hello@clocked.golf.
export function notifyHtml(title: string, rows: Array<[string, string]>, origin = 'WEBSITE') {
  const trs = rows.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#777;font:12px Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${esc(k)}</td>` +
    `<td style="padding:8px 12px;border-bottom:1px solid #eee;color:#111;font:15px Arial,sans-serif;white-space:pre-wrap;">${esc(v)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f4f2ed;font-family:Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e6e2d8;">
    <div style="padding:20px 24px;background:#070A08;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:4px;color:#C9A84C;">CLOCKED GOLF · ${esc(origin)}</p>
      <h1 style="margin:8px 0 0;font-size:20px;color:#F3EEE4;font-weight:700;">${esc(title)}</h1>
    </div>
    <table style="width:100%;border-collapse:collapse;">${trs}</table>
    <p style="margin:0;padding:16px 24px;color:#999;font-size:12px;">Review and update status in the Clocked Golf admin app. Reply to this email to answer the sender directly.</p>
  </div></body></html>`;
}

const firstName = (full: string) => (full.trim().split(/\s+/)[0] || '').slice(0, 40);

export function confirmationEmail(slug: string, teamName: string, playerName: string) {
  const ev = EVENTS[slug] ?? EVENTS[DEFAULT_EVENT_SLUG];
  const hi = firstName(playerName);
  const subject = `We got your application · ${ev.name}`;
  const lines = [
    `Thanks for applying${hi ? `, ${hi}` : ''}.`,
    `We have your team's application for ${ev.name}.`,
    `Team: ${teamName}`,
    `When: ${ev.when}`,
    `Where: ${ev.where}`,
    'The field is hand-picked. If your team is in, we will send you further details upon entry.',
    `Questions? Reply to this email or write to ${HELLO}.`,
    'Clocked Golf',
  ];
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#8A8474;font:11px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${esc(k)}</td>` +
    `<td style="padding:6px 0;color:#111;font:15px Arial,sans-serif;">${esc(v)}</td></tr>`;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f4f2ed;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e2d8;">
    <div style="padding:24px;background:#070A08;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:4px;color:#C9A84C;">CLOCKED GOLF</p>
      <h1 style="margin:10px 0 0;font-size:22px;color:#F3EEE4;font-weight:700;">Thanks for applying${hi ? `, ${esc(hi)}` : ''}.</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#111;font-size:15px;line-height:23px;">We have your team's application for <strong>${esc(ev.name)}</strong>.</p>
      <table style="border-collapse:collapse;margin:0 0 18px;">${row('Team', teamName)}${row('When', ev.when)}${row('Where', ev.where)}</table>
      <p style="margin:0 0 16px;color:#111;font-size:15px;line-height:23px;">The field is hand-picked. If your team is in, we will send you further details upon entry.</p>
      <p style="margin:0;color:#666;font-size:13px;line-height:20px;">Questions? Reply to this email or write to <a href="mailto:${HELLO}" style="color:#8a6d1f;">${HELLO}</a>.</p>
    </div>
  </div></body></html>`;
  return { subject, html, text: lines.join('\n\n') };
}

// Sends the confirmation to each distinct, valid player address. Returns how
// many Resend accepted. Each player gets their own message, so neither sees
// the other's address.
export async function sendApplicantConfirmations(
  tag: string,
  slug: string,
  teamName: string,
  players: Array<{ name: string; email: string | null | undefined }>,
): Promise<number> {
  const seen = new Set<string>();
  const jobs: Promise<boolean>[] = [];
  for (const p of players) {
    const to = String(p.email ?? '').trim().toLowerCase();
    if (!isEmail(to) || seen.has(to)) continue;
    seen.add(to);
    const { subject, html, text } = confirmationEmail(slug, teamName, p.name);
    jobs.push(sendMail(tag, { to, subject, html, text, replyTo: HELLO }));
  }
  const done = await Promise.all(jobs);
  return done.filter(Boolean).length;
}
