import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { haversineYards } from '../lib/geo';
import { PRO_ENABLED } from '../lib/featureFlags';

/**
 * RangefinderCard
 *
 * Displays GPS distances to the front, middle, and back of the green for the
 * current hole. Requires Pro access — free users see Gaussian-blurred placeholder
 * numbers and a CTA button to upgrade.
 *
 * @param {object|null} currentLocation  - { latitude, longitude } from useCurrentLocation
 * @param {object|null} greenCoords      - hole object from getMockGreensForCourse
 * @param {number}      holeNumber       - current hole (1–18)
 * @param {number}      par              - par for this hole
 * @param {boolean}     hasProAccess     - from useProAccess
 * @param {boolean}     isOnTrial        - from useProAccess
 * @param {number|null} trialDaysRemaining - from useProAccess
 */
export default function RangefinderCard({
  currentLocation,
  greenCoords,
  holeNumber,
  par,
  hasProAccess,
  isOnTrial,
  trialDaysRemaining,
  onLockedPress,
}) {
  // When Pro is disabled globally the card is completely absent — no locked
  // state, no upgrade prompt, just nothing.
  if (!PRO_ENABLED) return null;

  const showTrialBanner =
    isOnTrial && trialDaysRemaining !== null && trialDaysRemaining <= 5;

  // Navigate to paywall when locked or when trial-expiry banner is shown.
  // No-op for paying users with live yardages visible.
  const onPress = (!hasProAccess || showTrialBanner) ? onLockedPress : undefined;

  // Compute live distances (all null when not yet available)
  const frontYards =
    currentLocation && greenCoords
      ? haversineYards(
          currentLocation.latitude,
          currentLocation.longitude,
          greenCoords.green_front_lat,
          greenCoords.green_front_lng,
        )
      : null;

  const midYards =
    currentLocation && greenCoords
      ? haversineYards(
          currentLocation.latitude,
          currentLocation.longitude,
          greenCoords.green_center_lat,
          greenCoords.green_center_lng,
        )
      : null;

  const backYards =
    currentLocation && greenCoords
      ? haversineYards(
          currentLocation.latitude,
          currentLocation.longitude,
          greenCoords.green_back_lat,
          greenCoords.green_back_lng,
        )
      : null;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>

      {/* ── Header ── */}
      <Text style={s.header}>HOLE {holeNumber} · PAR {par}</Text>

      {/* ── Trial expiry banner (≤ 5 days left) ── */}
      {showTrialBanner && (
        <Text style={s.trialBanner}>
          Trial ends in {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} · Tap to keep Pro
        </Text>
      )}

      {/* ── Content ── */}
      {!hasProAccess ? (

        /* ─ LOCKED: real Gaussian blur over full-opacity numbers + CTA ─ */
        <View>
          <View style={s.numbersRow}>
            <View style={s.yardColumn}>
              <View style={{ position: 'relative' }}>
                <Text style={s.yardSmall}>145</Text>
                <BlurView
                  intensity={28}
                  tint="dark"
                  style={{
                    position: 'absolute',
                    top: -4,
                    left: -8,
                    right: -8,
                    bottom: -4,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                />
              </View>
              <Text style={s.yardLabel}>FRONT</Text>
            </View>

            <View style={s.yardColumn}>
              <View style={{ position: 'relative' }}>
                <Text style={s.yardLarge}>162</Text>
                <BlurView
                  intensity={28}
                  tint="dark"
                  style={{
                    position: 'absolute',
                    top: -4,
                    left: -8,
                    right: -8,
                    bottom: -4,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                />
              </View>
              <Text style={s.yardLabel}>MIDDLE</Text>
            </View>

            <View style={s.yardColumn}>
              <View style={{ position: 'relative' }}>
                <Text style={s.yardSmall}>178</Text>
                <BlurView
                  intensity={28}
                  tint="dark"
                  style={{
                    position: 'absolute',
                    top: -4,
                    left: -8,
                    right: -8,
                    bottom: -4,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                />
              </View>
              <Text style={s.yardLabel}>BACK</Text>
            </View>
          </View>

          <Text style={s.ydsLabel}>yds</Text>

          <View style={s.ctaButton}>
            <Text style={s.ctaTitle}>Unlock with Pro</Text>
            <Text style={s.ctaSub}>Distance to every green</Text>
          </View>
        </View>

      ) : currentLocation === null ? (

        /* ─ GPS LOADING ─ */
        <View style={s.stateRow}>
          <ActivityIndicator size="small" color="#B8A882" style={{ marginRight: 8 }} />
          <Text style={s.stateText}>Acquiring GPS…</Text>
        </View>

      ) : greenCoords === null ? (

        /* ─ NO GREEN DATA ─ */
        <View style={s.stateRow}>
          <Text style={s.stateText}>No green data for this hole</Text>
        </View>

      ) : (

        /* ─ LIVE YARDAGES ─ */
        <View>
          <View style={s.numbersRow}>
            <View style={s.yardColumn}>
              <Text style={s.yardSmall}>
                {frontYards !== null ? frontYards : '—'}
              </Text>
              <Text style={s.yardLabel}>FRONT</Text>
            </View>

            <View style={s.yardColumn}>
              <Text style={s.yardLarge}>
                {midYards !== null ? midYards : '—'}
              </Text>
              <Text style={s.yardLabel}>MIDDLE</Text>
            </View>

            <View style={s.yardColumn}>
              <Text style={s.yardSmall}>
                {backYards !== null ? backYards : '—'}
              </Text>
              <Text style={s.yardLabel}>BACK</Text>
            </View>
          </View>

          <Text style={s.ydsLabel}>yds</Text>
        </View>

      )}
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#0D1A0F',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#7DC87A22',
  },

  // Header
  header: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B8A882',
    letterSpacing: 2,
    marginBottom: 12,
  },

  // Trial banner
  trialBanner: {
    fontSize: 10,
    fontWeight: '600',
    color: '#C9A84C',
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  // Number display
  numbersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',   // bottom-align columns of different heights to a shared baseline
    marginBottom: 4,
  },
  yardColumn: {
    alignItems: 'center',
  },
  yardLarge: {
    fontSize: 52,
    fontWeight: '700',
    color: '#F5EDD8',
    lineHeight: 58,
  },
  yardSmall: {
    fontSize: 30,
    fontWeight: '600',
    color: '#F5EDD8',
    lineHeight: 36,
  },
  yardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7A6E58',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  ydsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7A6E58',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 4,
  },

  // CTA button (styled View — outer card TouchableOpacity handles the press)
  ctaButton: {
    backgroundColor: '#C9A84C',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 14,
  },
  ctaTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#090F0A',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  ctaSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#090F0A',
    opacity: 0.7,
  },

  // GPS / no-data states
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  stateText: {
    fontSize: 13,
    color: '#7A6E58',
  },
});
