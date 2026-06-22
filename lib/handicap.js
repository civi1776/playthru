/*
 * SQL — add handicap_index column to profiles (run in Supabase if not exists):
 *
 * alter table profiles add column if not exists handicap_index numeric;
 */

// Fetch last 20 rounds, normalize 9-hole scores to 18-hole equivalent,
// average them, subtract 72 to get a simple handicap index.
export async function updateHandicapAfterRound(userId, supabase) {
  try {
    const { data: rounds } = await supabase
      .from('rounds')
      .select('gross_score, holes')
      .eq('user_id', userId)
      .not('gross_score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!rounds || rounds.length === 0) return;

    const normalized = rounds.map(r => {
      const score = parseFloat(r.gross_score);
      const holes = r.holes === '9' || r.holes === 9 ? 9 : 18;
      return holes === 9 ? score * 2 : score;
    });

    const avg      = normalized.reduce((s, v) => s + v, 0) / normalized.length;
    const handicap = Math.round((avg - 72) * 10) / 10;

    await supabase
      .from('profiles')
      .update({ handicap_index: handicap })
      .eq('id', userId);
  } catch (e) {
    // silent fail
  }
}
