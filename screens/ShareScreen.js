/*
 * Install:
 *   npx expo install react-native-view-shot expo-media-library expo-clipboard
 */

import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Dimensions, Alert, Share as RNShare,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import ClockedShareCard from '../components/ClockedShareCard';
import CourseAvatar from '../components/CourseAvatar';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_WIDTH  = Math.floor(SW * 0.88);
const CARD_HEIGHT = Math.floor(SH * 0.62);

const STICKER_W = 260;
const NUM_CARDS  = 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatRelToPar(grossScore, holes, isPar3 = false) {
  if (grossScore == null) return null;
  const par  = isPar3 ? (holes === '9' ? 27 : 54) : (holes === '9' ? 36 : 72);
  const diff = Number(grossScore) - par;
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

// ─── Style 1: Frosted Glass ───────────────────────────────────────────────────

function CardFrosted({ cardRef, roundTime, scoreStr, grossScore, relToPar, courseName }) {
  return (
    <View ref={cardRef} collapsable={false} style={f.card}>
      <Text style={f.wordmark}>CLOCKED</Text>
      <Text style={f.tagline}>GOLF ON THE CLOCK</Text>
      <Text style={f.timeHero}>{roundTime}</Text>
      <Text style={f.timeLabel}>ROUND TIME</Text>
      <View style={f.divider} />
      <View style={f.statsRow}>
        <View style={f.statItem}>
          <Text style={f.statValueGreen}>{scoreStr}</Text>
          <Text style={f.statLabel}>CLK SCORE</Text>
        </View>
        <View style={f.statDivider} />
        <View style={f.statItem}>
          <Text style={f.statValueCream}>{grossScore != null ? String(grossScore) : '—'}</Text>
          <Text style={f.statLabel}>{relToPar != null ? relToPar : 'GOLF'}</Text>
        </View>
      </View>
      {courseName && courseName !== 'Quick Play' && (
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          <CourseAvatar courseName={courseName} size={52} />
        </View>
      )}
      <Text style={f.course} numberOfLines={1}>{courseName || 'Unknown Course'}</Text>
    </View>
  );
}

// ─── Style 2: Outline Only ────────────────────────────────────────────────────

function CardOutline({ cardRef, roundTime, scoreStr, grossScore, relToPar, courseName }) {
  return (
    <View ref={cardRef} collapsable={false} style={o.card}>
      <View style={o.topRow}>
        <Text style={o.wordmark}>CLOCKED</Text>
        {grossScore != null && <Text style={o.golfScore}>{grossScore}</Text>}
      </View>
      <Text style={o.timeHero}>{roundTime}</Text>
      <Text style={o.timeLabel}>ROUND TIME</Text>
      <View style={o.pillRow}>
        <View style={o.pillGreen}>
          <Text style={o.pillGreenText}>{scoreStr} CLK</Text>
        </View>
        {grossScore != null && (
          <View style={o.pillWhite}>
            <Text style={o.pillWhiteText}>
              Shot {grossScore}{relToPar != null ? ` · ${relToPar}` : ''}
            </Text>
          </View>
        )}
      </View>
      {courseName && courseName !== 'Quick Play' && (
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          <CourseAvatar courseName={courseName} size={44} />
        </View>
      )}
      <Text style={o.bottom} numberOfLines={1}>
        GOLF ON THE CLOCK · {courseName || 'Unknown Course'}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ShareScreen({ navigation, route }) {
  const roundFormat       = route.params?.roundFormat       ?? 'pace';
  const popScore          = route.params?.popScore          ?? null;
  const courseName        = route.params?.courseName        ?? 'Unknown Course';
  const holes             = route.params?.holes             ?? '18';
  const transport         = route.params?.transport         ?? 'Cart';
  const durationMinutes   = route.params?.durationMinutes   ?? null;
  const grossScore        = route.params?.grossScore        ?? null;
  const isPar3            = route.params?.isPar3            ?? false;

  // Clocked-specific params
  const teamScore         = route.params?.teamScore         ?? null;
  const totalElapsed      = route.params?.totalElapsed      ?? null;
  const totalTimePar      = route.params?.totalTimePar      ?? null;
  const totalPenalty       = route.params?.totalPenalty       ?? null;
  const playerTotals      = route.params?.playerTotals      ?? null;
  const isUnranked        = route.params?.isUnranked        ?? false;
  const formatBadgeStr    = route.params?.formatBadge       ?? '';

  const isClocked = roundFormat === 'clocked';

  const stickerRef = useRef(null); // Style 1 — Frosted Glass / Clocked Card
  const card2Ref   = useRef(null); // Style 2 — Outline
  const CARD_REFS  = [stickerRef, card2Ref];

  const [activeIndex, setActiveIndex] = useState(0);
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState('');

  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  // Safe computed values (pace rounds)
  const rawScore = popScore != null
    ? (typeof popScore === 'number' ? popScore : parseFloat(popScore))
    : null;
  const score    = rawScore != null && !isNaN(rawScore) ? rawScore : null;
  const scoreStr = score != null ? score.toFixed(1) : '--';

  // Share message
  const shareMessage = isClocked
    ? `Scored ${teamScore != null ? (teamScore > 0 ? '+' + teamScore : teamScore) : '--'} at ${courseName}. Played on the clock.`
    : `My Clocked Score: ${scoreStr} at ${courseName}. Tracked with Clocked.`;

  const goHome    = () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const captureCurrentCard = async (resultType = 'tmpfile') => {
    try {
      setSaving(true);
      await new Promise(r => setTimeout(r, 160));
      // Card 1 (sticker) — capture the stickerRef (inner box), not the page wrapper
      const ref = CARD_REFS[activeIndex];
      return await captureRef(ref, { format: 'png', quality: 1, result: resultType });
    } catch (e) {
      Alert.alert('Error', 'Could not capture the card.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Always copies Card 2 (sticker) as transparent PNG regardless of active card
  const copySticker = async () => {
    try {
      setSaving(true);
      await new Promise(r => setTimeout(r, 160));
      const base64 = await captureRef(stickerRef, { format: 'png', quality: 1, result: 'base64' });
      await Clipboard.setImageAsync(base64);
      showToast('Sticker copied — paste onto any photo!');
    } catch (e) {
      Alert.alert('Error', 'Could not copy sticker to clipboard.');
    } finally {
      setSaving(false);
    }
  };

  const saveToCameraRoll = async () => {
    if (!mediaPermission?.granted) {
      const { granted } = await requestMediaPermission();
      if (!granted) {
        Alert.alert('Permission required', 'Allow photo library access to save your card.');
        return;
      }
    }
    const uri = await captureCurrentCard('tmpfile');
    if (!uri) return;
    try {
      await MediaLibrary.saveToLibraryAsync(uri);
      showToast('Saved to camera roll!');
    } catch (e) {
      Alert.alert('Error', 'Could not save the image.');
    }
  };

  const shareCard = async () => {
    const uri = await captureCurrentCard('tmpfile');
    if (!uri) return;
    try {
      await RNShare.share({
        url: uri,
        message: shareMessage,
      });
    } catch (e) {
      // silent fail
    }
  };

  return (
    <SafeAreaView style={ss.container}>

      {/* Header */}
      <View style={ss.header}>
        <TouchableOpacity onPress={goHome} style={ss.skipBtn}>
          <Text style={ss.skipText}>SKIP</Text>
        </TouchableOpacity>
        <Text style={ss.title}>YOUR ROUND</Text>
        <View style={{ width: 48 }} />
      </View>

      {/* Carousel — fixed height, horizontal paging */}
      <View style={[ss.carouselWrap, { height: CARD_HEIGHT }]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ width: SW, height: CARD_HEIGHT }}
          onMomentumScrollEnd={e => {
            setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / SW));
          }}
        >
          {isClocked ? (
            <>
              {/* Clocked Style 1 — Full Card */}
              <View style={ss.page}>
                <View ref={stickerRef} collapsable={false}>
                  <ClockedShareCard
                    teamScore={teamScore}
                    totalElapsed={totalElapsed}
                    totalTimePar={totalTimePar}
                    playerTotals={playerTotals}
                    formatBadge={formatBadgeStr}
                    courseName={courseName}
                    date={route.params?.date}
                    isUnranked={isUnranked}
                  />
                </View>
              </View>

              {/* Clocked Style 2 — Outline */}
              <View style={ss.page}>
                <CardOutline
                  cardRef={card2Ref}
                  roundTime={formatDuration(durationMinutes)}
                  scoreStr={teamScore != null ? (teamScore > 0 ? `+${teamScore}` : String(teamScore)) : '--'}
                  grossScore={null}
                  relToPar={null}
                  courseName={courseName}
                />
              </View>
            </>
          ) : (
            <>
              {/* Style 1: Frosted Glass */}
              <View style={ss.page}>
                <CardFrosted
                  cardRef={stickerRef}
                  roundTime={formatDuration(durationMinutes)}
                  scoreStr={scoreStr}
                  grossScore={grossScore}
                  relToPar={formatRelToPar(grossScore, holes, isPar3)}
                  courseName={courseName}
                />
              </View>

              {/* Style 2: Outline Only */}
              <View style={ss.page}>
                <CardOutline
                  cardRef={card2Ref}
                  roundTime={formatDuration(durationMinutes)}
                  scoreStr={scoreStr}
                  grossScore={grossScore}
                  relToPar={formatRelToPar(grossScore, holes, isPar3)}
                  courseName={courseName}
                />
              </View>
            </>
          )}
        </ScrollView>
      </View>

      {/* Pagination dots */}
      <View style={ss.dotsRow}>
        {Array.from({ length: NUM_CARDS }, (_, i) => (
          <View key={i} style={[ss.dot, i === activeIndex && ss.dotActive]} />
        ))}
      </View>

      {/* Toast */}
      {!!toast && (
        <View style={ss.toast}>
          <Ionicons name="checkmark-circle" size={14} color="#7DC87A" style={{ marginRight: 6 }} />
          <Text style={ss.toastText}>{toast}</Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={ss.actions}>
        <View style={ss.btnRow}>
          <TouchableOpacity
            style={[ss.actionBtn, ss.stickerBtn, saving && ss.btnDisabled]}
            onPress={copySticker}
            activeOpacity={0.8}
            disabled={saving}
            accessibilityLabel="Copy sticker to clipboard"
            accessibilityRole="button"
          >
            <Ionicons name="copy-outline" size={18} color="#C9A84C" />
            <Text style={ss.actionBtnTxt}>Copy{'\n'}Sticker</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[ss.actionBtn, ss.saveBtn, saving && ss.btnDisabled]}
            onPress={saveToCameraRoll}
            activeOpacity={0.8}
            disabled={saving}
            accessibilityLabel="Save score card to photos"
            accessibilityRole="button"
          >
            <Ionicons name="download-outline" size={18} color="#090F0A" />
            <Text style={[ss.actionBtnTxt, { color: '#090F0A' }]}>Save to{'\n'}Photos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[ss.actionBtn, ss.shareBtn, saving && ss.btnDisabled]}
            onPress={shareCard}
            activeOpacity={0.8}
            disabled={saving}
            accessibilityLabel="Share score card"
            accessibilityRole="button"
          >
            <Ionicons name="share-outline" size={18} color="#C9A84C" />
            <Text style={ss.actionBtnTxt}>Share</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={goHome} activeOpacity={0.7} style={ss.laterBtn}>
          <Text style={ss.laterText}>Maybe later</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

// ─── Style 1: Frosted Glass ───────────────────────────────────────────────────

const f = StyleSheet.create({
  card:           { width: STICKER_W, backgroundColor: 'rgba(13,26,15,0.65)', borderRadius: 18,
                    borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', padding: 20, alignItems: 'center' },
  wordmark:       { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 4 },
  tagline:        { fontSize: 6, fontWeight: '700', color: 'rgba(201,168,76,0.6)', letterSpacing: 2, marginTop: 2, marginBottom: 14 },
  timeHero:       { fontSize: 32, fontFamily: 'Georgia', fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  timeLabel:      { fontSize: 6, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 3, marginTop: 4, marginBottom: 12 },
  divider:        { width: '100%', height: 1, backgroundColor: 'rgba(201,168,76,0.2)', marginBottom: 12 },
  statsRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statItem:       { flex: 1, alignItems: 'center' },
  statDivider:    { width: 1, height: 28, backgroundColor: 'rgba(201,168,76,0.2)' },
  statValueGreen: { fontSize: 22, fontFamily: 'Georgia', color: '#7DC87A', textAlign: 'center' },
  statValueCream: { fontSize: 22, fontFamily: 'Georgia', color: '#F5EDD8', textAlign: 'center' },
  statLabel:      { fontSize: 6, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginTop: 2 },
  course:         { fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, textAlign: 'center' },
});

// ─── Style 2: Outline Only ────────────────────────────────────────────────────

const TS = { textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 };
const o = StyleSheet.create({
  card:           { width: STICKER_W, backgroundColor: 'transparent', borderRadius: 14,
                    borderWidth: 1.5, borderColor: 'rgba(125,200,122,0.6)', padding: 16, alignItems: 'center' },
  topRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 10 },
  wordmark:       { fontSize: 8, fontWeight: '700', color: '#7DC87A', letterSpacing: 3, ...TS },
  golfScore:      { fontSize: 13, fontWeight: '700', color: '#F5EDD8', ...TS },
  timeHero:       { fontSize: 30, fontFamily: 'Georgia', fontWeight: '700', color: '#FFFFFF', textAlign: 'center',
                    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8, marginBottom: 4 },
  timeLabel:      { fontSize: 7, fontWeight: '700', color: '#7DC87A', letterSpacing: 3, marginBottom: 12, ...TS },
  pillRow:        { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pillGreen:      { borderWidth: 1, borderColor: 'rgba(125,200,122,0.7)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pillGreenText:  { fontSize: 11, fontWeight: '700', color: '#7DC87A', ...TS },
  pillWhite:      { borderWidth: 1, borderColor: 'rgba(245,237,216,0.6)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pillWhiteText:  { fontSize: 11, fontWeight: '700', color: '#F5EDD8', ...TS },
  bottom:         { fontSize: 7, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textAlign: 'center', ...TS },
});

// ─── Screen chrome styles ─────────────────────────────────────────────────────

const ss = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#090F0A' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  skipBtn:      { paddingVertical: 8, paddingHorizontal: 4 },
  skipText:     { fontSize: 10, fontWeight: '700', color: '#B8A882', letterSpacing: 2 },
  title:        { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4 },
  carouselWrap: { overflow: 'hidden' },
  page:         { width: SW, alignItems: 'center', justifyContent: 'center' },
  dotsRow:      { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 10 },
  dot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C9A84C33' },
  dotActive:    { backgroundColor: '#C9A84C', width: 18, borderRadius: 3 },
  cardLabel:    { fontSize: 10, fontWeight: '700', color: '#B8A882', letterSpacing: 2.5, textAlign: 'center', textTransform: 'uppercase', marginTop: 5, marginBottom: 2 },
  toast:        { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A44', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 },
  toastText:    { fontSize: 13, color: '#7DC87A', fontWeight: '500' },
  actions:      { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 10, gap: 8 },
  btnRow:       { flexDirection: 'row', gap: 10 },
  actionBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 16, paddingVertical: 13 },
  stickerBtn:   { borderWidth: 1, borderColor: '#C9A84C55', backgroundColor: 'transparent' },
  saveBtn:      { backgroundColor: '#C9A84C' },
  shareBtn:     { borderWidth: 1, borderColor: '#C9A84C55', backgroundColor: 'transparent' },
  actionBtnTxt: { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 1, textAlign: 'center' },
  btnDisabled:  { opacity: 0.4 },
  laterBtn:          { alignItems: 'center', paddingVertical: 4 },
  laterText:         { fontSize: 13, color: '#B8A88266' },
  upgradeNote:       { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 20 },
  upgradeNoteText:   { fontSize: 11, color: '#C9A84C99', letterSpacing: 0.5, fontStyle: 'italic' },
});
