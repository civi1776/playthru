// ─── ClockedShareCard — STAT + ROUND share cards ─────────────────────────────
// Uses the Midnight Fairway design system (lib/theme.js) for palette consistency
// with the rest of the app. Hero number (Clocked Score) is the biggest element —
// readable at thumbnail size on social media.
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLOR, scoreTier, RADIUS } from '../lib/theme';

const LOGO = require('../assets/PlayThru_Logo.png');

// ─── STAT CARD — pure black, giant Clocked Score hero ───────────────────────
export function StatCard({ score, courseName, players, holes, clockedScore, date, roundTime }) {
  const hasClockedScore = clockedScore != null;
  const heroValue = hasClockedScore ? String(clockedScore) : (score != null ? (score >= 0 ? `+${score}` : String(score)) : '--');
  const heroLabel = hasClockedScore ? 'CLOCKED SCORE' : 'ROUND POINTS';
  const tier = hasClockedScore ? scoreTier(clockedScore) : null;
  const heroColor = tier ? tier.color : COLOR.cream;

  return (
    <View style={stat.card}>
      <View style={stat.topBar}>
        <Image source={LOGO} style={stat.logo} resizeMode="contain" />
        <Text style={stat.topRight}>{date}</Text>
      </View>

      <Text style={stat.course} numberOfLines={1}>{(courseName ?? 'QUICK PLAY').toUpperCase()}</Text>
      <Text style={[stat.heroNumber, { color: heroColor }]}>{heroValue}</Text>
      <Text style={stat.heroLabel}>{heroLabel}</Text>

      <View style={stat.divider} />
      <View style={stat.bottomRow}>
        <View>
          <Text style={stat.statLabel}>PLAYERS</Text>
          <Text style={stat.statValue}>{players ?? 'Solo'}</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={stat.statLabel}>HOLES</Text>
          <Text style={stat.statValue}>{holes}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={stat.statLabel}>TIME</Text>
          <Text style={stat.statValue}>{roundTime ?? '\u2014'}</Text>
        </View>
      </View>

      <View style={stat.footer}>
        <Image source={LOGO} style={stat.footerLogo} resizeMode="contain" />
        <Text style={stat.footerText}>CLOCKED {'\u00B7'} GOLF HAS A SHOT CLOCK</Text>
      </View>
    </View>
  );
}

const stat = StyleSheet.create({
  card:       { width: 340, backgroundColor: COLOR.bg, borderWidth: 0.5, borderColor: COLOR.gold, borderRadius: RADIUS.lg, padding: 20, alignSelf: 'center' },
  topBar:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  logo:       { width: 30, height: 30, tintColor: COLOR.gold },
  topRight:   { fontSize: 9, color: COLOR.dim, letterSpacing: 1 },
  divider:    { height: 0.5, backgroundColor: COLOR.gold + '22', marginVertical: 14 },
  course:     { fontSize: 10, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 4 },
  heroNumber: { fontSize: 130, fontWeight: '200', lineHeight: 136, letterSpacing: -4 },
  heroLabel:  { fontSize: 11, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 4 },
  bottomRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  statLabel:  { fontSize: 8, color: COLOR.dim, letterSpacing: 1.5, marginBottom: 3 },
  statValue:  { fontSize: 15, fontWeight: '700', color: COLOR.cream, letterSpacing: 0.5 },
  footer:     { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerLogo: { width: 12, height: 12, tintColor: COLOR.gold + '88' },
  footerText: { fontSize: 8, color: COLOR.gold + '55', letterSpacing: 2 },
});

// ─── ROUND CARD — dark green, course photo, hole grid ───────────────────────
export function RoundCard({ score, courseName, players, holes, clockedScore, date, holeScores, roundTime, customPhoto }) {
  const hasClockedScore = clockedScore != null;
  const heroValue = hasClockedScore ? String(clockedScore) : (score != null ? (score >= 0 ? `+${score}` : String(score)) : '--');
  const heroLabel = hasClockedScore ? 'CLOCKED SCORE' : 'ROUND POINTS';
  const tier = hasClockedScore ? scoreTier(clockedScore) : null;
  const heroColor = tier ? tier.color : COLOR.green;

  const holeColor = (pts) => {
    if (pts >= 2) return COLOR.goldBright;
    if (pts === 1) return COLOR.green;
    if (pts === 0) return COLOR.gold + '44';
    return COLOR.red;
  };
  const holeBorder = (pts) => {
    if (pts >= 2) return COLOR.goldBright;
    if (pts === 1) return COLOR.green;
    if (pts === 0) return COLOR.gold;
    return COLOR.red;
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
            <Image source={LOGO} style={rnd.photoLogo} resizeMode="contain" />
          </View>
        )}
        <LinearGradient colors={['transparent', COLOR.surface]} style={rnd.scrim} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
        <View style={rnd.photoBadgeRow}>
          <View style={rnd.brandBadge}>
            <Image source={LOGO} style={rnd.brandBadgeLogo} resizeMode="contain" />
            <Text style={rnd.badgeText}>CLOCKED</Text>
          </View>
          <View style={rnd.badge}><Text style={rnd.badgeText}>{holes} HOLES</Text></View>
        </View>
      </View>

      {/* Body */}
      <View style={rnd.body}>
        <Text style={rnd.courseName} numberOfLines={1}>{(courseName ?? 'Quick Play').toUpperCase()}</Text>
        <Text style={rnd.subLine}>{players ?? 'Solo'} {'\u00B7'} {date}</Text>

        {/* Score */}
        <View style={rnd.scoreRow}>
          <Text style={[rnd.heroScore, { color: heroColor }]}>{heroValue}</Text>
          <View style={{ marginLeft: 10, justifyContent: 'flex-end', paddingBottom: 6 }}>
            <Text style={[rnd.scoreUnit, { color: heroColor }]}>{heroLabel}</Text>
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
                    <Text style={[rnd.holeCellTop, { color: COLOR.dim }]}>H{h.hole}</Text>
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
            <Text style={rnd.statLabel}>PLAYERS</Text>
            <Text style={rnd.statVal}>{players ?? 'Solo'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={rnd.statLabel}>ROUND TIME</Text>
            <Text style={rnd.statVal}>{roundTime ?? '\u2014'}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={rnd.footerRow}>
          <Image source={LOGO} style={rnd.footerLogo} resizeMode="contain" />
          <Text style={rnd.footerTagline}>golf has a shot clock.</Text>
        </View>
      </View>
    </View>
  );
}

const rnd = StyleSheet.create({
  card:              { width: 340, backgroundColor: COLOR.surface, borderWidth: 0.5, borderColor: COLOR.green + '44', borderRadius: RADIUS.lg, overflow: 'hidden', alignSelf: 'center' },
  photoWrap:         { height: 120, position: 'relative' },
  photo:             { width: '100%', height: 120 },
  photoPlaceholder:  { width: '100%', height: 120, backgroundColor: COLOR.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
  photoLogo:         { width: 44, height: 44, tintColor: COLOR.green + '66' },
  scrim:             { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  photoBadgeRow:     { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  badge:             { backgroundColor: '#00000066', borderWidth: 0.5, borderColor: '#FFFFFF33', borderRadius: RADIUS.xs, paddingHorizontal: 8, paddingVertical: 4 },
  brandBadge:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#00000066', borderWidth: 0.5, borderColor: '#FFFFFF33', borderRadius: RADIUS.xs, paddingHorizontal: 8, paddingVertical: 4 },
  brandBadgeLogo:    { width: 12, height: 12, tintColor: COLOR.cream },
  badgeText:         { fontSize: 8, fontWeight: '700', color: COLOR.cream, letterSpacing: 1.5 },
  body:              { padding: 16 },
  courseName:        { fontSize: 11, fontWeight: '700', color: COLOR.gold, letterSpacing: 1, marginBottom: 2 },
  subLine:           { fontSize: 10, color: COLOR.dim, marginBottom: 8 },
  scoreRow:          { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  heroScore:         { fontSize: 72, fontWeight: '200', lineHeight: 76, letterSpacing: -2 },
  scoreUnit:         { fontSize: 9, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  gridLabel:         { fontSize: 8, color: COLOR.dim, letterSpacing: 2, marginBottom: 6 },
  holeGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12 },
  holeCell:          { width: 30, height: 30, borderRadius: RADIUS.xs, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  holeCellTop:       { fontSize: 7, lineHeight: 10 },
  holeCellScore:     { fontSize: 10, fontWeight: '700', lineHeight: 12 },
  divider:           { height: 0.5, backgroundColor: COLOR.border, marginBottom: 10 },
  statsRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  statLabel:         { fontSize: 7, color: COLOR.dim, letterSpacing: 1.5, marginBottom: 2 },
  statVal:           { fontSize: 14, fontWeight: '700', color: COLOR.cream },
  footerRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 0.5, borderTopColor: COLOR.border, paddingTop: 10 },
  footerLogo:        { width: 14, height: 14, tintColor: COLOR.gold },
  footerTagline:     { fontSize: 9, color: COLOR.dim, fontStyle: 'italic', letterSpacing: 0.5 },
});
