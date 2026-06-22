import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    // Lightweight auth — same pattern as search-courses / google-places
    const authHeader   = req.headers.get('Authorization') ?? '';
    const apiKeyHeader = req.headers.get('apikey') ?? '';
    const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const hasValidKey  = apiKeyHeader === ANON_KEY ||
                         authHeader === `Bearer ${ANON_KEY}` ||
                         authHeader.startsWith('Bearer ey');
    if (!hasValidKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { userId, title, body, data } = await req.json();
    if (!userId || !title || !body) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit: max 50 pushes per RECIPIENT per hour
    const { count } = await adminClient
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 3600000).toISOString());
    if ((count ?? 0) > 50) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 });
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .maybeSingle();

    if (!profile?.push_token) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_token' }), { status: 200 });
    }

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ to: profile.push_token, title, body, sound: 'default', data: data ?? {} }),
    });

    const result = await res.json();
    return new Response(JSON.stringify({ sent: true, result }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
