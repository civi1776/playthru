// ─── ClockedShareCard — Strava-style photo overlay share card ────────────────
import { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getCoursePhoto } from '../lib/googlePlaces';

const W = Dimensions.get('window').width - 32;
const H = Math.round(W * (11 / 9));

const GOLD  = '#C9A84C';
const CREAM = '#F5EDD8';
const MUTED = '#B8A882';
const GREEN = '#7DC87A';
const RED   = '#E85D4A';
const DIM   = '#7A6E58';

function scoreColor(v) { return v >= 0 ? GREEN : RED; }

function formatNames(playerTotals) {
  if (!playerTotals || playerTotals.length <= 1) return null;
  const names = playerTotals.map(p => (p.name ?? '').split(' ')[0]).filter(Boolean);
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  const last = names.pop();
  return `${names.join(', ')} & ${last}`;
}

export default function ClockedShareCard({
  teamScore,
  playerTotals,
  courseName,
  date,
  holes,
  holeScores,
  detailed = false,
}) {
  const scoreStr = teamScore != null ? (teamScore > 0 ? `+${teamScore}` : String(teamScore)) : '--';
  const holeData = holeScores ?? [];
  const penalties = holeData.filter(h => h.penalty < 0).length;
  const birdiesPlus = holeData.filter(h => (h.teamPointsBeforePenalty ?? 0) >= 3).length;
  const pars = holeData.filter(h => (h.teamPointsBeforePenalty ?? 0) === 1).length;
  const partnerLine = formatNames(playerTotals);
  const isQuickPlay = !courseName || courseName === 'Quick Play';

  // Photo state: course photo (default) or user-picked override
  const [coursePhotoUrl, setCoursePhotoUrl] = useState(null);
  const [userPhotoUri, setUserPhotoUri] = useState(null);

  useEffect(() => {
    if (isQuickPlay) return;
    getCoursePhoto(courseName).then(url => { if (url) setCoursePhotoUrl(url); });
  }, [courseName]);

  const bgSource = userPhotoUri ?? coursePhotoUrl;

  const pickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [9, 11],
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setUserPhotoUri(result.assets[0].uri);
      }
    } catch { /* silent */ }
  };

  return (
    <View style={s.card}>
      {/* Background */}
      {bgSource ? (
        <Image source={{ uri: bgSource }} style={s.bgImage} resizeMode="cover" />
      ) : (
        <LinearGradient colors={['#1a2e1c', '#0d1a0f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.bgImage} />
      )}

      {/* Gradient scrim */}
      <LinearGradient
        colors={['transparent', 'rgba(9,15,10,0.55)', 'rgba(9,15,10,0.88)', 'rgba(9,15,10,0.95)']}
        locations={[0, 0.3, 0.6, 1]}
        style={s.scrim}
      />

      {/* ── TOP BAR ── */}
      <View style={s.topBar}>
        <Text style={s.topLeft}>CLOCKED</Text>
        <View style={s.topRightRow}>
          {/* Photo picker */}
          <TouchableOpacity style={s.cameraBtn} onPress={pickPhoto} activeOpacity={0.7}>
            <Ionicons name="camera-outline" size={14} color={GOLD} />
          </TouchableOpacity>
          {/* Remove custom photo */}
          {userPhotoUri && (
            <TouchableOpacity style={s.cameraBtn} onPress={() => setUserPhotoUri(null)} activeOpacity={0.7}>
              <Ionicons name="close" size={14} color={CREAM} />
            </TouchableOpacity>
          )}
          <Text style={s.topRightText}>{holes ?? '9'} HOLES</Text>
        </View>
      </View>

      {/* ── BOTTOM CONTENT ── */}
      <View style={s.bottomContent}>
        <Text style={s.courseLabel}>{isQuickPlay ? 'ON THE CLOCK' : courseName?.toUpperCase()}</Text>

        {partnerLine && <Text style={s.partnerLine}>{partnerLine}</Text>}

        <Text style={[s.scoreHero, { color: scoreColor(teamScore ?? 0) }]}>{scoreStr}</Text>
        <Text style={s.scoreSub}>PTS</Text>

        {/* Simple mode: single penalty line */}
        {!detailed && (
          <Text style={[s.penaltyLine, { color: penalties > 0 ? RED : DIM }]}>
            {penalties > 0 ? `${penalties} ${penalties === 1 ? 'penalty' : 'penalties'}` : 'no penalties'}
          </Text>
        )}

        {/* Detailed mode: birdies · pars · penalties row */}
        {detailed && (
          <View style={s.detailRow}>
            <Text style={[s.detailItem, { color: birdiesPlus > 0 ? GREEN : DIM }]}>
              {birdiesPlus} {birdiesPlus === 1 ? 'BIRDIE' : 'BIRDIES'}
            </Text>
            <Text style={s.detailDot}>{'\u00B7'}</Text>
            <Text style={[s.detailItem, { color: CREAM + 'CC' }]}>
              {pars} {pars === 1 ? 'PAR' : 'PARS'}
            </Text>
            <Text style={s.detailDot}>{'\u00B7'}</Text>
            <Text style={[s.detailItem, { color: penalties > 0 ? RED : DIM }]}>
              {penalties} PEN
            </Text>
          </View>
        )}

        <Text style={s.dateLine}>{date ?? ''}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { width: W, height: H, borderRadius: 20, overflow: 'hidden', backgroundColor: '#0d1a0f' },

  bgImage: { position: 'absolute', width: W, height: H },
  scrim:   { position: 'absolute', left: 0, right: 0, bottom: 0, height: H * 0.7 },

  // Top bar
  topBar:      { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14 },
  topLeft:     { fontSize: 9, fontWeight: '700', color: GOLD, letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  topRightRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topRightText:{ fontSize: 9, fontWeight: '700', color: CREAM + 'CC', letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  cameraBtn:   { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(9,15,10,0.5)', alignItems: 'center', justifyContent: 'center' },

  // Bottom content
  bottomContent: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: 24, paddingHorizontal: 20 },

  courseLabel:  { fontSize: 11, fontWeight: '700', color: GOLD, letterSpacing: 2, marginBottom: 6 },
  partnerLine: { fontSize: 13, color: CREAM + 'DD', marginBottom: 10 },

  scoreHero: { fontSize: 52, fontWeight: '700', fontVariant: ['tabular-nums'], lineHeight: 56, letterSpacing: -2 },
  scoreSub:  { fontSize: 9, fontWeight: '700', color: GOLD, letterSpacing: 4, marginTop: -2, marginBottom: 8 },

  // Simple mode
  penaltyLine: { fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 12 },

  // Detailed mode
  detailRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  detailItem:  { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  detailDot:   { fontSize: 10, color: DIM },

  dateLine: { fontSize: 10, color: MUTED + 'AA', letterSpacing: 1 },
});
