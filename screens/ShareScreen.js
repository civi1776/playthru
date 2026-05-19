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
import Svg, { Path, Ellipse, Line, Rect, Text as SvgText } from 'react-native-svg';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_WIDTH  = Math.floor(SW * 0.88);
const CARD_HEIGHT = Math.floor(SH * 0.62);

// Sticker capped to card dimensions with a small margin
const STICKER_W = Math.min(320, CARD_WIDTH  - 16);
const STICKER_H = Math.min(420, CARD_HEIGHT - 16);

const CARD_LABELS = [
  'TRANSPARENT STICKER',
  'COURSE MAP',
  'SPEEDOMETER',
  'PACE VS NATIONAL AVG',
];
const NUM_CARDS = 4;

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

// ─── Verification dot ─────────────────────────────────────────────────────────

function VerifDot({ level }) {
  if (level === 'caddy_corroborated') {
    return <Ionicons name="checkmark-circle" size={15} color="#C9A84C" />;
  }
  return (
    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: 'rgba(184,168,130,0.35)' }} />
  );
}

// ─── SVG Course Map (Card 1) ──────────────────────────────────────────────────

const MAP_W = Math.round(CARD_WIDTH  * 0.9);
const MAP_H = Math.round(MAP_W * 200 / 280);

function CourseMapSVG() {
  return (
    <Svg width={MAP_W} height={MAP_H} viewBox="0 0 280 200">
      <Path
        d="M 25,45 Q 70,8 140,12 Q 210,8 255,45 Q 278,80 272,138 Q 264,175 200,188 Q 140,198 80,188 Q 16,175 8,138 Q 2,80 25,45 Z"
        fill="#0D2B10"
      />
      {/* Fairways */}
      <Ellipse cx="140" cy="100" rx="58" ry="16" fill="#2D7A3A" />
      <Ellipse cx="93"  cy="57"  rx="48" ry="13" transform="rotate(-38, 93, 57)"   fill="#2D7A3A" />
      <Ellipse cx="187" cy="57"  rx="48" ry="13" transform="rotate(38, 187, 57)"   fill="#2D7A3A" />
      <Ellipse cx="78"  cy="150" rx="43" ry="12" transform="rotate(-22, 78, 150)"  fill="#2D7A3A" />
      <Ellipse cx="202" cy="150" rx="43" ry="12" transform="rotate(22, 202, 150)"  fill="#2D7A3A" />
      {/* Greens */}
      <Ellipse cx="74"  cy="100" rx="9" ry="8" fill="#1A5C2A" />
      <Ellipse cx="206" cy="100" rx="9" ry="8" fill="#1A5C2A" />
      <Ellipse cx="55"  cy="31"  rx="8" ry="7" fill="#1A5C2A" />
      <Ellipse cx="225" cy="31"  rx="8" ry="7" fill="#1A5C2A" />
      <Ellipse cx="140" cy="20"  rx="8" ry="7" fill="#1A5C2A" />
      <Ellipse cx="32"  cy="162" rx="8" ry="7" fill="#1A5C2A" />
      <Ellipse cx="248" cy="162" rx="8" ry="7" fill="#1A5C2A" />
      <Ellipse cx="52"  cy="128" rx="8" ry="7" fill="#1A5C2A" />
      <Ellipse cx="228" cy="128" rx="8" ry="7" fill="#1A5C2A" />
      {/* Bunkers */}
      <Ellipse cx="110" cy="87"  rx="9" ry="5" transform="rotate(-15, 110, 87)"  fill="#D4B483" />
      <Ellipse cx="170" cy="87"  rx="9" ry="5" transform="rotate(15, 170, 87)"   fill="#D4B483" />
      <Ellipse cx="76"  cy="50"  rx="8" ry="4" fill="#D4B483" />
      <Ellipse cx="204" cy="50"  rx="8" ry="4" fill="#D4B483" />
      <Ellipse cx="62"  cy="152" rx="7" ry="4" fill="#D4B483" />
      <Ellipse cx="218" cy="152" rx="7" ry="4" fill="#D4B483" />
      {/* Water */}
      <Ellipse cx="65"  cy="138" rx="15" ry="9" fill="#4A90D9" opacity="0.9" />
      <Ellipse cx="215" cy="75"  rx="14" ry="8" fill="#4A90D9" opacity="0.9" />
    </Svg>
  );
}

// ─── Card 1: Course Map Dark ──────────────────────────────────────────────────

function Card1CourseMap({ cardRef, scoreStr, courseName, holes, transport, durationMinutes }) {
  return (
    <View ref={cardRef} collapsable={false} style={[c.card, { backgroundColor: '#090F0A' }]}>
      {/* Wordmark row */}
      <View style={c.topRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="golf" size={9} color="#C9A84C" />
          <Text style={c.wordmark}>PLAYTHRU</Text>
        </View>
        <View style={{ alignItems: 'flex-end', flex: 1, marginLeft: 10 }}>
          <Text style={c.metaCourse} numberOfLines={1}>{courseName || 'Unknown Course'}</Text>
          <Text style={c.metaStats}>
            {holes || '18'} holes  ·  {transport || '—'}  ·  {formatDuration(durationMinutes)}
          </Text>
        </View>
      </View>

      {/* Map centred */}
      <View style={c.mapWrap}>
        <CourseMapSVG />
      </View>

      {/* Footer */}
      <View style={c.bottom}>
        <View>
          <Text style={c.scoreNum}>{scoreStr}</Text>
          <Text style={c.scoreLabel}>POPSCORE</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Card 2: Transparent Sticker ─────────────────────────────────────────────

function Card2Sticker({
  stickerRef, scoreStr, courseName, holes, transport, durationMinutes,
  verificationLevel, grossScore, isPar3,
}) {
  const relToPar     = formatRelToPar(grossScore, holes, isPar3);
  const scoreDisplay = (grossScore != null && relToPar != null)
    ? `${grossScore} · ${relToPar}`
    : null;

  return (
    // Outer area: CARD_WIDTH × CARD_HEIGHT, transparent bg, centres the sticker
    <View style={k.stickerPage}>
      {/* The actual sticker — what gets captured */}
      <View ref={stickerRef} collapsable={false} style={k.stickerBox}>

        {/* Wordmark */}
        <View style={k.wm}>
          <Ionicons name="golf" size={11} color="#C9A84C" />
          <Text style={k.wmText}>PLAYTHRU</Text>
        </View>

        {/* POPScore hero */}
        <View style={k.hero}>
          <Text style={k.popNum}>{scoreStr}</Text>
          <Text style={k.popLabel}>POPSCORE</Text>
        </View>

        {/* Bottom — course + stats */}
        <View style={k.bottomSection}>
          <View style={k.divider} />
          <Text style={k.courseName} numberOfLines={1}>{courseName || 'Unknown Course'}</Text>
          <Text style={k.statsRow}>
            {[holes || '18', transport || '—', formatDuration(durationMinutes)].join(' · ')}
          </Text>
          {scoreDisplay != null && (
            <Text style={k.scoreRow}>{scoreDisplay}</Text>
          )}
        </View>

        {/* Verification dot */}
        <View style={k.verifDot}>
          <VerifDot level={verificationLevel} />
        </View>

      </View>
    </View>
  );
}

// ─── Card 3: Speedometer ─────────────────────────────────────────────────────

function SpeedometerSVG({ val }) {
  const clamped = Math.max(-60, Math.min(60, val ?? 0));
  const deg     = 180 - ((clamped + 60) / 120) * 180;
  const rad     = deg * Math.PI / 180;
  const nx      = (140 + 88 * Math.cos(rad)).toFixed(1);
  const ny      = (140 - 88 * Math.sin(rad)).toFixed(1);
  return (
    <Svg width="280" height="160" viewBox="0 0 280 160">
      <Path d="M 30 140 A 110 110 0 0 1 250 140" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="16" strokeLinecap="round" />
      <Path d="M 30 140 A 110 110 0 0 1 85 45"   fill="none" stroke="#C07A6A" strokeWidth="14" strokeLinecap="round" />
      <Path d="M 85 45  A 110 110 0 0 1 195 45"  fill="none" stroke="#C9A84C" strokeWidth="14" strokeLinecap="round" />
      <Path d="M 195 45 A 110 110 0 0 1 250 140" fill="none" stroke="#7DC87A" strokeWidth="14" strokeLinecap="round" />
      <Line x1="140" y1="140" x2={nx} y2={ny} stroke="#F5EDD8" strokeWidth="3" strokeLinecap="round" />
      <Ellipse cx="140" cy="140" rx="6" ry="6" fill="#F5EDD8" />
      <SvgText fill="#C07A6A" fontSize="9" fontWeight="700" x="14"  y="158">SLOW</SvgText>
      <SvgText fill="#7DC87A" fontSize="9" fontWeight="700" x="216" y="158">FAST</SvgText>
    </Svg>
  );
}

function Card3Speedometer({
  cardRef, scoreStr, courseName, holes, transport, durationMinutes,
  minutesSavedSigned, minutesSavedDisplay, wasFaster,
}) {
  const paceColor = minutesSavedDisplay === 0 ? '#B8A882' : (wasFaster ? '#7DC87A' : '#C07A6A');
  const paceText  = minutesSavedDisplay == null
    ? '— min vs course avg'
    : minutesSavedDisplay === 0
    ? 'Right on pace'
    : wasFaster
    ? `+${minutesSavedDisplay} min faster than avg`
    : `${minutesSavedDisplay} min behind avg`;

  return (
    <View ref={cardRef} collapsable={false} style={[c.card, s2.card]}>
      <View style={s2.topRow}>
        <Ionicons name="golf" size={9} color="#C9A84C" />
        <Text style={s2.wordmark}>PLAYTHRU</Text>
      </View>

      <View style={s2.dialWrap}>
        <SpeedometerSVG val={minutesSavedSigned ?? 0} />
        <View style={s2.dialCenter} pointerEvents="none">
          <Text style={s2.dialTime}>{formatDuration(durationMinutes)}</Text>
          <Text style={s2.dialSub}>ROUND TIME</Text>
        </View>
      </View>

      <Text style={[s2.paceResult, { color: paceColor }]}>{paceText}</Text>

      <View style={{ flex: 1 }} />

      <View style={s2.popRow}>
        <Text style={s2.popNum}>{scoreStr}</Text>
        <Text style={s2.popLabel}>POPSCORE</Text>
      </View>
      <Text style={s2.course} numberOfLines={1}>{courseName || 'Unknown Course'}</Text>
      <Text style={s2.meta}>{holes || '18'} holes  ·  {transport || '—'}</Text>
    </View>
  );
}

// ─── Card 4: Pace vs National Average ────────────────────────────────────────

const BAR_MAX_W = CARD_WIDTH - 80; // available bar width (padding accounted)

function Card4PaceBar({
  cardRef, scoreStr, courseName, holes, transport, durationMinutes, wasFaster,
  minutesSavedDisplay,
}) {
  const natAvg     = holes === '9' ? 120 : 240;
  const yourTime   = (durationMinutes != null && !isNaN(durationMinutes)) ? durationMinutes : null;
  const maxTime    = yourTime != null ? Math.max(natAvg, yourTime) : natAvg;

  const natAvgBarW = Math.round((natAvg / maxTime) * BAR_MAX_W);
  const yourBarW   = yourTime != null ? Math.round((yourTime / maxTime) * BAR_MAX_W) : natAvgBarW;

  const diffColor  = minutesSavedDisplay === 0 ? '#B8A882' : (wasFaster ? '#7DC87A' : '#C07A6A');
  const diffText   = minutesSavedDisplay == null
    ? '— vs national avg'
    : minutesSavedDisplay === 0
    ? 'Right on pace'
    : wasFaster
    ? `↑ ${minutesSavedDisplay} min faster`
    : `↓ ${minutesSavedDisplay} min slower`;

  const youLabel   = yourTime != null ? formatDuration(yourTime) : '--';

  return (
    <View ref={cardRef} collapsable={false} style={[c.card, p4.card]}>
      {/* Wordmark */}
      <View style={p4.topRow}>
        <Ionicons name="golf" size={9} color="#C9A84C" />
        <Text style={p4.wordmark}>PLAYTHRU</Text>
      </View>

      <Text style={p4.headline}>PACE COMPARISON</Text>

      {/* Bars */}
      <View style={{ flex: 1, justifyContent: 'center', gap: 22 }}>

        {/* YOU bar */}
        <View style={p4.barBlock}>
          <View style={p4.barLabelRow}>
            <Text style={p4.barLabel}>YOU</Text>
            <Text style={[p4.barTime, { color: '#7DC87A' }]}>{youLabel}</Text>
          </View>
          <View style={[p4.barTrack, { width: BAR_MAX_W }]}>
            <View style={[p4.barFill, { width: yourBarW, backgroundColor: '#7DC87A' }]} />
          </View>
        </View>

        {/* NAT AVG bar */}
        <View style={p4.barBlock}>
          <View style={p4.barLabelRow}>
            <Text style={p4.barLabel}>NAT AVG</Text>
            <Text style={[p4.barTime, { color: '#C9A84C' }]}>{formatDuration(natAvg)}</Text>
          </View>
          <View style={[p4.barTrack, { width: BAR_MAX_W }]}>
            <View style={[p4.barFill, { width: natAvgBarW, backgroundColor: '#C9A84C' }]} />
          </View>
        </View>

        {/* Diff */}
        <Text style={[p4.diffText, { color: diffColor }]}>{diffText}</Text>
      </View>

      {/* Footer */}
      <View style={p4.footer}>
        <View>
          <Text style={p4.popNum}>{scoreStr}</Text>
          <Text style={p4.popLabel}>POPSCORE</Text>
        </View>
        <View style={{ alignItems: 'flex-end', flex: 1, marginLeft: 12 }}>
          <Text style={p4.footerCourse} numberOfLines={1}>{courseName || 'Unknown Course'}</Text>
          <Text style={p4.footerMeta}>{holes || '18'} holes · {transport || '—'}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ShareScreen({ navigation, route }) {
  const popScore          = route.params?.popScore          ?? null;
  const courseName        = route.params?.courseName        ?? 'Unknown Course';
  const holes             = route.params?.holes             ?? '18';
  const transport         = route.params?.transport         ?? 'Cart';
  const durationMinutes   = route.params?.durationMinutes   ?? null;
  const verificationLevel = route.params?.verificationLevel ?? 'self_reported';
  const grossScore        = route.params?.grossScore        ?? null;
  const isPar3            = route.params?.isPar3            ?? false;
  const avgCourseMinutes  = route.params?.avgCourseMinutes  ?? null;

  const stickerRef = useRef(null); // Transparent Sticker inner box (for copySticker)
  const card1Ref   = useRef(null); // Sticker page wrapper (pos 1)
  const card2Ref   = useRef(null); // Course Map (pos 2)
  const card3Ref   = useRef(null); // Speedometer (pos 3)
  const card4Ref   = useRef(null); // Pace vs National Avg (pos 4)

  // card refs indexed by carousel position (sticker pos uses stickerRef for inner capture)
  const CARD_REFS = [card1Ref, card2Ref, card3Ref, card4Ref];

  const [activeIndex, setActiveIndex] = useState(0);
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState('');

  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  // Safe computed values
  const rawScore = popScore != null
    ? (typeof popScore === 'number' ? popScore : parseFloat(popScore))
    : null;
  const score    = rawScore != null && !isNaN(rawScore) ? rawScore : null;
  const scoreStr = score != null ? score.toFixed(1) : '--';

  const defaultAvg          = holes === '9' ? 120 : 240;
  const actualMinutes       = durationMinutes ?? 0;
  const safeMins            = (avgCourseMinutes ?? defaultAvg) - actualMinutes;
  const minutesSavedDisplay = (durationMinutes != null && !isNaN(safeMins))
    ? Math.abs(Math.round(safeMins)) : null;
  const minutesSavedSigned  = (durationMinutes != null && !isNaN(safeMins))
    ? Math.round(safeMins) : null;
  const wasFaster = safeMins > 0;

  const goHome    = () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const captureCurrentCard = async (resultType = 'tmpfile') => {
    try {
      setSaving(true);
      await new Promise(r => setTimeout(r, 160));
      // Card 1 (sticker) — capture the stickerRef (inner box), not the page wrapper
      const ref = activeIndex === 0 ? stickerRef : CARD_REFS[activeIndex];
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
        message: `My POPScore: ${scoreStr} at ${courseName}. Tracked with PlayThru.`,
      });
    } catch (e) {
      // silent fail
    }
  };

  const base = { scoreStr, courseName, holes, transport, durationMinutes };

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
          {/* Card 1: Transparent Sticker */}
          <View style={ss.page}>
            <Card2Sticker
              stickerRef={stickerRef}
              {...base}
              verificationLevel={verificationLevel}
              grossScore={grossScore}
              isPar3={isPar3}
            />
          </View>

          {/* Card 2: Course Map */}
          <View style={ss.page}>
            <Card1CourseMap cardRef={card2Ref} {...base} />
          </View>

          {/* Card 3: Speedometer */}
          <View style={ss.page}>
            <Card3Speedometer
              cardRef={card3Ref}
              {...base}
              minutesSavedSigned={minutesSavedSigned}
              minutesSavedDisplay={minutesSavedDisplay}
              wasFaster={wasFaster}
            />
          </View>

          {/* Card 4: Pace vs National Average */}
          <View style={ss.page}>
            <Card4PaceBar
              cardRef={card4Ref}
              {...base}
              minutesSavedDisplay={minutesSavedDisplay}
              wasFaster={wasFaster}
            />
          </View>
        </ScrollView>
      </View>

      {/* Pagination dots */}
      <View style={ss.dotsRow}>
        {Array.from({ length: NUM_CARDS }, (_, i) => (
          <View key={i} style={[ss.dot, i === activeIndex && ss.dotActive]} />
        ))}
      </View>

      {/* Card label */}
      <Text style={ss.cardLabel}>{CARD_LABELS[activeIndex] ?? ''}</Text>

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
          >
            <Ionicons name="copy-outline" size={18} color="#C9A84C" />
            <Text style={ss.actionBtnTxt}>Copy{'\n'}Sticker</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[ss.actionBtn, ss.saveBtn, saving && ss.btnDisabled]}
            onPress={saveToCameraRoll}
            activeOpacity={0.8}
            disabled={saving}
          >
            <Ionicons name="download-outline" size={18} color="#090F0A" />
            <Text style={[ss.actionBtnTxt, { color: '#090F0A' }]}>Save to{'\n'}Photos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[ss.actionBtn, ss.shareBtn, saving && ss.btnDisabled]}
            onPress={shareCard}
            activeOpacity={0.8}
            disabled={saving}
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

// ─── Shared card base (Cards 1, 3, 4) ────────────────────────────────────────

const c = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  // Course Map card specifics
  topRow:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  wordmark:   { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3 },
  metaCourse: { fontSize: 12, fontWeight: '600', color: '#F5EDD8', textAlign: 'right', maxWidth: 160 },
  metaStats:  { fontSize: 10, color: '#B8A882', textAlign: 'right', marginTop: 2 },
  mapWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottom:     { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 },
  scoreNum:   { fontSize: 48, fontFamily: 'Georgia', color: '#C9A84C', lineHeight: 52 },
  scoreLabel: { fontSize: 8, fontWeight: '700', color: 'rgba(201,168,76,0.55)', letterSpacing: 4 },
});

// ─── Card 2: Sticker styles ───────────────────────────────────────────────────

const k = StyleSheet.create({
  stickerPage: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stickerBox: {
    width: STICKER_W,
    height: STICKER_H,
    backgroundColor: 'rgba(9,15,10,0.72)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.6)',
    padding: 20,
    flexDirection: 'column',
  },
  wm:            { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wmText:        { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 3 },
  hero:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  popNum:        { fontSize: 80, fontFamily: 'Georgia', color: '#C9A84C', lineHeight: 80, textAlign: 'center' },
  popLabel:      { fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 4, textAlign: 'center', marginTop: 8 },
  bottomSection: { flexShrink: 0 },
  divider:       { height: 1, backgroundColor: 'rgba(201,168,76,0.3)', marginVertical: 12 },
  courseName:    { fontSize: 16, fontWeight: '600', color: '#F5EDD8', textAlign: 'center', marginBottom: 5 },
  statsRow:      { fontSize: 12, color: '#B8A882', textAlign: 'center', lineHeight: 18 },
  scoreRow:      { fontSize: 14, color: '#F5EDD8', textAlign: 'center', marginTop: 5 },
  verifDot:      { position: 'absolute', bottom: 16, right: 16 },
});

// ─── Card 3: Speedometer styles ───────────────────────────────────────────────

const s2 = StyleSheet.create({
  card:       { alignItems: 'center', backgroundColor: '#090F0A' },
  topRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 4 },
  wordmark:   { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3 },
  dialWrap:   { marginTop: 12, alignItems: 'center', position: 'relative' },
  dialCenter: { position: 'absolute', bottom: 18, alignItems: 'center' },
  dialTime:   { fontSize: 28, fontFamily: 'Georgia', color: '#F5EDD8', textAlign: 'center' },
  dialSub:    { fontSize: 7, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginTop: 2 },
  paceResult: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 18 },
  popRow:     { alignItems: 'center', marginBottom: 6 },
  popNum:     { fontSize: 36, fontFamily: 'Georgia', color: '#C9A84C', lineHeight: 40 },
  popLabel:   { fontSize: 8, fontWeight: '700', color: 'rgba(201,168,76,0.55)', letterSpacing: 4 },
  course:     { fontSize: 13, fontWeight: '600', color: '#F5EDD8', textAlign: 'center', marginTop: 10 },
  meta:       { fontSize: 11, color: '#B8A882', textAlign: 'center', marginTop: 4 },
});

// ─── Card 4: Pace vs National Average styles ──────────────────────────────────

const p4 = StyleSheet.create({
  card:        { backgroundColor: '#090F0A' },
  topRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  wordmark:    { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3 },
  headline:    { fontSize: 11, fontWeight: '700', color: '#B8A882', letterSpacing: 3, marginBottom: 4 },
  barBlock:    { gap: 8 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barLabel:    { fontSize: 11, fontWeight: '700', color: '#F5EDD8', letterSpacing: 1 },
  barTime:     { fontSize: 12, fontWeight: '600' },
  barTrack:    { height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.06)' },
  barFill:     { height: 14, borderRadius: 7 },
  diffText:    { fontSize: 26, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  footer:      { flexDirection: 'row', alignItems: 'flex-end', marginTop: 12 },
  popNum:      { fontSize: 36, fontFamily: 'Georgia', color: '#C9A84C', lineHeight: 40 },
  popLabel:    { fontSize: 8, fontWeight: '700', color: 'rgba(201,168,76,0.55)', letterSpacing: 4 },
  footerCourse:{ fontSize: 13, fontWeight: '600', color: '#F5EDD8', textAlign: 'right' },
  footerMeta:  { fontSize: 11, color: '#B8A882', textAlign: 'right', marginTop: 2 },
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
  laterBtn:     { alignItems: 'center', paddingVertical: 4 },
  laterText:    { fontSize: 13, color: '#B8A88266' },
});
