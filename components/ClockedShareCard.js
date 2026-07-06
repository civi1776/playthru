// ─── ClockedShareCard — STAT + ROUND share cards ─────────────────────────────
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// ─── STAT CARD — pure black, giant score hero ───────────────────────────────
export function StatCard({ score, courseName, players, holes, difficulty, penalties, clockedScore, date }) {
  const scoreStr = score != null ? (score >= 0 ? `+${score}` : String(score)) : '--';
  const diffLabel = difficulty === 'pro' ? 'PRO' : difficulty === 'beginner' ? 'BEGINNER' : 'INTER.';
  const diffColor = difficulty === 'pro' ? '#E85D4A' : difficulty === 'beginner' ? '#7DC87A' : '#C9A84C';
  const penStr = penalties === 0 ? 'ZERO' : String(penalties);
  const penColor = penalties === 0 ? '#7DC87A' : '#E85D4A';

  return (
    <View style={stat.card}>
      <View style={stat.topBar}>
        <Text style={stat.wordmark}>CLOCKED</Text>
        <Text style={stat.topRight}>{date}</Text>
      </View>
      <View style={stat.divider} />
      <Text style={stat.course}>{(courseName ?? 'QUICK PLAY').toUpperCase()}</Text>
      <Text style={stat.heroNumber}>{scoreStr}</Text>
      <Text style={stat.ptsLabel}>PTS</Text>
      <View style={stat.divider} />
      <View style={stat.bottomRow}>
        <View>
          <Text style={stat.statLabel}>PLAYERS</Text>
          <Text style={stat.statValue}>{players ?? 'Solo'}</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={stat.statLabel}>DIFFICULTY</Text>
          <Text style={[stat.statValue, { color: diffColor }]}>{diffLabel}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={stat.statLabel}>PENALTIES</Text>
          <Text style={[stat.statValue, { color: penColor }]}>{penStr}</Text>
        </View>
      </View>
      <View style={stat.divider} />
      <View style={stat.bottomRow}>
        <View>
          <Text style={stat.statLabel}>CLOCKED SCORE</Text>
          <Text style={[stat.statValue, { color: '#C9A84C', fontSize: 22 }]}>{clockedScore ?? '\u2014'}</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={stat.statLabel}>HOLES</Text>
          <Text style={stat.statValue}>{holes}H</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={stat.statLabel}>FORMAT</Text>
          <Text style={stat.statValue}>ON THE CLOCK</Text>
        </View>
      </View>
      <View style={stat.footer}>
        <Text style={stat.footerText}>CLOCKED GOLF {'\u00B7'} GOLF HAS A SHOT CLOCK.</Text>
      </View>
    </View>
  );
}

const stat = StyleSheet.create({
  card:       { width: 340, backgroundColor: '#090F0A', borderWidth: 0.5, borderColor: '#C9A84C', borderRadius: 16, padding: 20, alignSelf: 'center' },
  topBar:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  wordmark:   { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 4 },
  topRight:   { fontSize: 9, color: '#7A6E58', letterSpacing: 1 },
  divider:    { height: 0.5, backgroundColor: '#C9A84C22', marginVertical: 12 },
  course:     { fontSize: 10, fontWeight: '700', color: '#7A6E58', letterSpacing: 2, marginBottom: 8 },
  heroNumber: { fontSize: 120, fontWeight: '200', color: '#F5EDD8', lineHeight: 130, letterSpacing: -4 },
  ptsLabel:   { fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 4 },
  bottomRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  statLabel:  { fontSize: 8, color: '#7A6E58', letterSpacing: 1.5, marginBottom: 3 },
  statValue:  { fontSize: 13, fontWeight: '700', color: '#F5EDD8', letterSpacing: 0.5 },
  footer:     { marginTop: 16, alignItems: 'center' },
  footerText: { fontSize: 8, color: '#C9A84C44', letterSpacing: 2 },
});

// ─── ROUND CARD — dark green, course photo, hole grid ───────────────────────
export function RoundCard({ score, courseName, players, holes, difficulty, penalties, clockedScore, date, holeScores, roundTime, customPhoto }) {
  const scoreStr = score != null ? (score >= 0 ? `+${score}` : String(score)) : '--';
  const diffLabel = difficulty === 'pro' ? 'PRO' : difficulty === 'beginner' ? 'BGNNR' : 'INTER.';
  const diffColor = difficulty === 'pro' ? '#E85D4A' : difficulty === 'beginner' ? '#7DC87A' : '#C9A84C';

  const holeColor = (pts) => {
    if (pts >= 2) return '#F0CB5B';
    if (pts === 1) return '#7DC87A';
    if (pts === 0) return '#C9A84C44';
    return '#E85D4A';
  };
  const holeBorder = (pts) => {
    if (pts >= 2) return '#F0CB5B';
    if (pts === 1) return '#7DC87A';
    if (pts === 0) return '#C9A84C';
    return '#E85D4A';
  };
  const holeLabel = (pts) => {
    if (pts > 0) return `+${pts}`;
    if (pts === 0) return 'P';
    return String(pts);
  };

  return (
    <View style={rnd.card}>
      {/* Photo band */}
      <View style={rnd.photoWrap}>
        {customPhoto ? (
          <Image source={{ uri: customPhoto }} style={rnd.photo} resizeMode="cover" />
        ) : (
          <View style={rnd.photoPlaceholder}>
            <Text style={rnd.photoPlaceholderText}>{(courseName ?? 'QUICK PLAY').toUpperCase()}</Text>
          </View>
        )}
        <LinearGradient colors={['transparent', '#0D1A0F']} style={rnd.scrim} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
        <View style={rnd.photoBadgeRow}>
          <View style={rnd.badge}><Text style={rnd.badgeText}>CLOCKED</Text></View>
          <View style={rnd.badge}><Text style={rnd.badgeText}>{holes} HOLES</Text></View>
        </View>
      </View>

      {/* Body */}
      <View style={rnd.body}>
        <Text style={rnd.courseName} numberOfLines={1}>{(courseName ?? 'Quick Play').toUpperCase()}</Text>
        <Text style={rnd.subLine}>{players ?? 'Solo'} {'\u00B7'} {date}</Text>

        {/* Score */}
        <View style={rnd.scoreRow}>
          <Text style={rnd.heroScore}>{scoreStr}</Text>
          <View style={{ marginLeft: 12, justifyContent: 'flex-end', paddingBottom: 6 }}>
            <Text style={rnd.scoreUnit}>PTS</Text>
            <Text style={[rnd.penaltyLine, { color: penalties === 0 ? '#7DC87A' : '#E85D4A' }]}>
              {penalties === 0 ? 'no penalties' : `${penalties} penalties`}
            </Text>
          </View>
        </View>

        {/* Hole grid */}
        {holeScores?.length > 0 && (
          <View>
            <Text style={rnd.gridLabel}>HOLE BY HOLE</Text>
            <View style={rnd.holeGrid}>
              {holeScores.map((h, i) => {
                const pts = h.players?.[0]?.points ?? h.holeScore ?? 0;
                return (
                  <View key={i} style={[rnd.holeCell, { borderColor: holeBorder(pts), backgroundColor: holeColor(pts) + '22' }]}>
                    <Text style={[rnd.holeCellTop, { color: '#7A6E58' }]}>H{h.hole}</Text>
                    <Text style={[rnd.holeCellScore, { color: holeBorder(pts) }]}>{holeLabel(pts)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Stats */}
        <View style={rnd.divider} />
        <View style={rnd.statsRow}>
          <View>
            <Text style={rnd.statLabel}>CLK SCORE</Text>
            <Text style={[rnd.statVal, { color: '#C9A84C' }]}>{clockedScore ?? '\u2014'}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={rnd.statLabel}>DIFFICULTY</Text>
            <Text style={[rnd.statVal, { color: diffColor }]}>{diffLabel}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={rnd.statLabel}>ROUND TIME</Text>
            <Text style={rnd.statVal}>{roundTime ?? '\u2014'}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={rnd.footerRow}>
          <Text style={rnd.footerWordmark}>CLOCKED GOLF</Text>
          <Text style={rnd.footerTagline}>golf has a shot clock.</Text>
        </View>
      </View>
    </View>
  );
}

const rnd = StyleSheet.create({
  card:              { width: 340, backgroundColor: '#0D1A0F', borderWidth: 0.5, borderColor: '#7DC87A44', borderRadius: 16, overflow: 'hidden', alignSelf: 'center' },
  photoWrap:         { height: 120, position: 'relative' },
  photo:             { width: '100%', height: 120 },
  photoPlaceholder:  { width: '100%', height: 120, backgroundColor: '#1A3A1C', justifyContent: 'center', alignItems: 'center' },
  photoPlaceholderText: { fontSize: 10, color: '#7A6E58', letterSpacing: 3 },
  scrim:             { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  photoBadgeRow:     { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  badge:             { backgroundColor: '#00000066', borderWidth: 0.5, borderColor: '#FFFFFF33', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText:         { fontSize: 8, fontWeight: '700', color: '#F5EDD8', letterSpacing: 1.5 },
  body:              { padding: 16 },
  courseName:        { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 1, marginBottom: 2 },
  subLine:           { fontSize: 10, color: '#7A6E58', marginBottom: 8 },
  scoreRow:          { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  heroScore:         { fontSize: 64, fontWeight: '200', color: '#7DC87A', lineHeight: 68, letterSpacing: -2 },
  scoreUnit:         { fontSize: 9, fontWeight: '700', color: '#7DC87A', letterSpacing: 2, marginBottom: 2 },
  penaltyLine:       { fontSize: 10, fontStyle: 'italic' },
  gridLabel:         { fontSize: 8, color: '#7A6E58', letterSpacing: 2, marginBottom: 6 },
  holeGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12 },
  holeCell:          { width: 30, height: 30, borderRadius: 6, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  holeCellTop:       { fontSize: 7, lineHeight: 10 },
  holeCellScore:     { fontSize: 10, fontWeight: '700', lineHeight: 12 },
  divider:           { height: 0.5, backgroundColor: '#7DC87A22', marginBottom: 10 },
  statsRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  statLabel:         { fontSize: 7, color: '#7A6E58', letterSpacing: 1.5, marginBottom: 2 },
  statVal:           { fontSize: 14, fontWeight: '700', color: '#F5EDD8' },
  footerRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 0.5, borderTopColor: '#7DC87A22', paddingTop: 8 },
  footerWordmark:    { fontSize: 8, fontWeight: '700', color: '#C9A84C', letterSpacing: 3 },
  footerTagline:     { fontSize: 8, color: '#7A6E58', fontStyle: 'italic', letterSpacing: 0.5 },
});
