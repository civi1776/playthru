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
import { StatCard, RoundCard } from '../components/ClockedShareCard';

const { width: SW } = Dimensions.get('window');

function formatRoundTime(mins) {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ShareScreen({ navigation, route }) {
  const p = route.params ?? {};

  const courseName      = p.courseName ?? 'Quick Play';
  const holes           = p.holes ?? '9';
  const teamScore       = p.teamScore ?? 0;
  const durationMinutes = p.durationMinutes ?? null;
  const playerTotals    = p.playerTotals ?? [];
  const holeScores      = p.holeScores ?? [];
  const difficulty      = p.difficulty ?? 'intermediate';
  const date            = p.date ?? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Derived
  const penaltyCount = holeScores.filter(h => h.penalty < 0).length;
  const roundTime    = formatRoundTime(durationMinutes);
  const playersStr   = playerTotals.length > 1
    ? playerTotals.map(pt => (pt.name ?? '').split(' ')[0]).filter(Boolean).join(' & ')
    : 'Solo';

  const shareMessage = `Scored ${teamScore > 0 ? '+' + teamScore : teamScore} at ${courseName}. Played on the clock.`;

  const statRef  = useRef(null);
  const roundRef = useRef(null);
  const CARD_REFS = [statRef, roundRef];

  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState('');
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const goHome    = () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const captureCard = async (resultType = 'tmpfile') => {
    try {
      setSaving(true);
      await new Promise(r => setTimeout(r, 160));
      return await captureRef(CARD_REFS[activeIndex], { format: 'png', quality: 1, result: resultType });
    } catch {
      Alert.alert('Error', 'Could not capture the card.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const copySticker = async () => {
    try {
      setSaving(true);
      await new Promise(r => setTimeout(r, 160));
      const base64 = await captureRef(statRef, { format: 'png', quality: 1, result: 'base64' });
      await Clipboard.setImageAsync(base64);
      showToast('Sticker copied — paste onto any photo!');
    } catch {
      Alert.alert('Error', 'Could not copy sticker.');
    } finally {
      setSaving(false);
    }
  };

  const saveToCameraRoll = async () => {
    if (!mediaPermission?.granted) {
      const { granted } = await requestMediaPermission();
      if (!granted) { Alert.alert('Permission required', 'Allow photo library access to save your card.'); return; }
    }
    const uri = await captureCard('tmpfile');
    if (!uri) return;
    try {
      await MediaLibrary.saveToLibraryAsync(uri);
      showToast('Saved to camera roll!');
    } catch { Alert.alert('Error', 'Could not save the image.'); }
  };

  const shareCard = async () => {
    const uri = await captureCard('tmpfile');
    if (!uri) return;
    try { await RNShare.share({ url: uri, message: shareMessage }); } catch {}
  };

  const cardProps = {
    score: teamScore,
    courseName,
    players: playersStr,
    holes,
    difficulty,
    penalties: penaltyCount,
    clockedScore: null, // not available at share time
    date,
    holeScores,
    roundTime,
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={goHome} style={s.skipBtn}>
          <Text style={s.skipText}>SKIP</Text>
        </TouchableOpacity>
        <Text style={s.title}>YOUR ROUND</Text>
        <View style={{ width: 48 }} />
      </View>

      {/* STAT / ROUND toggle */}
      <View style={s.toggleRow}>
        {['STAT', 'ROUND'].map((label, i) => (
          <TouchableOpacity
            key={label}
            style={[s.togglePill, activeIndex === i && s.togglePillActive]}
            onPress={() => setActiveIndex(i)}
            activeOpacity={0.7}
          >
            <Text style={[s.toggleText, activeIndex === i && s.toggleTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Card carousel */}
      <ScrollView
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: activeIndex * SW, y: 0 }}
        onMomentumScrollEnd={e => setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / SW))}
        style={{ flexGrow: 0 }}
      >
        <View style={s.page}>
          <View ref={statRef} collapsable={false}>
            <StatCard {...cardProps} />
          </View>
        </View>
        <View style={s.page}>
          <View ref={roundRef} collapsable={false}>
            <RoundCard {...cardProps} />
          </View>
        </View>
      </ScrollView>

      {/* Dots */}
      <View style={s.dotsRow}>
        {[0, 1].map(i => (
          <View key={i} style={[s.dot, activeIndex === i && s.dotActive]} />
        ))}
      </View>

      {/* Toast */}
      {!!toast && (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={14} color="#7DC87A" style={{ marginRight: 6 }} />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={s.actions}>
        <View style={s.btnRow}>
          <TouchableOpacity style={[s.actionBtn, s.stickerBtn, saving && s.btnDisabled]} onPress={copySticker} disabled={saving} activeOpacity={0.8}>
            <Ionicons name="copy-outline" size={18} color="#C9A84C" />
            <Text style={s.actionBtnTxt}>Copy{'\n'}Sticker</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.saveBtn, saving && s.btnDisabled]} onPress={saveToCameraRoll} disabled={saving} activeOpacity={0.8}>
            <Ionicons name="download-outline" size={18} color="#090F0A" />
            <Text style={[s.actionBtnTxt, { color: '#090F0A' }]}>Save to{'\n'}Photos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.shareBtn, saving && s.btnDisabled]} onPress={shareCard} disabled={saving} activeOpacity={0.8}>
            <Ionicons name="share-outline" size={18} color="#C9A84C" />
            <Text style={s.actionBtnTxt}>Share</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={goHome} activeOpacity={0.7} style={s.laterBtn}>
          <Text style={s.laterText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#090F0A' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  skipBtn:      { paddingVertical: 8, paddingHorizontal: 4 },
  skipText:     { fontSize: 10, fontWeight: '700', color: '#B8A882', letterSpacing: 2 },
  title:        { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4 },

  toggleRow:      { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  togglePill:     { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#C9A84C55' },
  togglePillActive: { backgroundColor: '#C9A84C', borderColor: '#C9A84C' },
  toggleText:     { fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5 },
  toggleTextActive: { color: '#090F0A' },

  page:         { width: SW, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  dotsRow:      { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 10 },
  dot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C9A84C33' },
  dotActive:    { backgroundColor: '#C9A84C', width: 18, borderRadius: 3 },

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
