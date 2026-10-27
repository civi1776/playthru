// ─── _shared/callerKey.ts — "does this request carry a project API key?" ────
// Used by the functions that the app and website call with the public anon
// key rather than a user session (search-courses, google-places).
//
// Why not compare against Deno.env SUPABASE_ANON_KEY? In this project the
// platform-injected value does not match the legacy anon JWT embedded in the
// shipped app, so an exact comparison rejects every real caller (the old
// code only "worked" through its `startsWith('Bearer ey')` prefix test).
//
// What this does instead, in order of strength:
//   1. If a JWT_SECRET secret is configured (`supabase secrets set
//      JWT_SECRET=<project JWT secret>`), the token's HS256 signature is
//      verified. This is a real check.
//   2. Otherwise the token is decoded and its claims must say it was issued
//      by Supabase for THIS project ref with role anon/authenticated and not
//      expired. This is not cryptographic, but the anon key is public by
//      design, so the purpose of this gate is only to turn away scanners and
//      stray callers; abuse protection must come from rate limiting.
//
// Accepted locations: `apikey` header or `Authorization: Bearer <token>`.

const b64urlToBytes = (s: string) => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

function decodeClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  } catch {
    return null;
  }
}

async function hs256Valid(token: string, secret: string): Promise<boolean> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    return await crypto.subtle.verify('HMAC', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    return false;
  }
}

export async function requestHasProjectKey(req: Request): Promise<boolean> {
  const projectRef = (() => {
    try { return new URL(Deno.env.get('SUPABASE_URL') ?? '').hostname.split('.')[0]; } catch { return ''; }
  })();
  const auth = req.headers.get('Authorization') ?? '';
  const candidates = [req.headers.get('apikey') ?? '', auth.startsWith('Bearer ') ? auth.slice(7) : '']
    .map((t) => t.trim()).filter(Boolean);

  const secret = Deno.env.get('JWT_SECRET');
  for (const token of candidates) {
    const claims = decodeClaims(token);
    if (!claims) continue;
    const role = String(claims.role ?? '');
    const exp  = Number(claims.exp ?? 0);
    const okClaims =
      claims.iss === 'supabase' &&
      (!projectRef || claims.ref === projectRef) &&
      (role === 'anon' || role === 'authenticated') &&
      exp * 1000 > Date.now();
    if (!okClaims) continue;
    if (secret) { if (await hs256Valid(token, secret)) return true; continue; }
    return true;
  }
  return false;
}
