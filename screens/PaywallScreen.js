import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useProAccess } from '../hooks/useProAccess';
import { PRO_ENABLED } from '../lib/featureFlags';

const PRO_FEATURES = [
  {
    icon: 'locate-outline',
    label: 'GPS Rangefinder',
    desc: 'Front, middle, and back yardage to every green — live on every hole.',
    hero: true,
  },
  {
    icon: 'trending-up-outline',
    label: 'AI Pace Coach',
    desc: 'Real-time pace guidance and hole-by-hole coaching powered by your Clocked Score data.',
  },
  {
    icon: 'map-outline',
    label: 'Round Heatmaps',
    desc: 'Visualize your strongest and weakest holes over time.',
  },
  {
    icon: 'stats-chart-outline',
    label: 'Strokes Gained',
    desc: 'See exactly which parts of your game cost you the most strokes.',
  },
  {
    icon: 'golf-outline',
    label: 'Handicap Tracking',
    desc: 'Your unofficial handicap index, automatically updated after every round.',
  },
  {
    icon: 'layers-outline',
    label: 'All Side Games',
    desc: 'Nassau, Wolf, Skins, Match Play, Stableford, 9 Point — all unlocked.',
  },
  {
    icon: 'trophy-outline',
    label: 'Cash Challenges',
    desc: 'Join and create wagered challenges with friends.',
  },
  {
    icon: 'share-social-outline',
    label: 'Unlimited Share Cards',
    desc: 'Share your rounds with no Clocked watermark.',
  },
];

// ─── TODO: RevenueCat integration point ───────────────────────────────────────
// When RevenueCat + StoreKit are wired up, replace handlePurchase with:
//
//   import Purchases from 'react-native-purchases';
//   const offerings = await Purchases.getOfferings();
//   const pkg = offerings.current?.monthly;
//   if (pkg) await Purchases.purchasePackage(pkg);
//
// Do NOT flip is_pro client-side. The RevenueCat webhook updates the profiles
// table server-side, and the useProAccess Realtime subscription picks it up
// automatically. This screen re-renders as soon as the webhook fires.
// ─────────────────────────────────────────────────────────────────────────────

export default function PaywallScreen({ navigation }) {
  const { hasProAccess, isPaying, isOnTrial, trialDaysRemaining, isLoading } = useProAccess();

  // ── Pro disabled globally — redirect immediately, show nothing ─────────────
  if (!PRO_ENABLED) {
    navigation.replace('Main');
    return null;
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color="#C9A84C" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  // ── Already a paying subscriber — no hard sell ─────────────────────────────
  if (isPaying) {
    return (
      <SafeAreaView style={s.container}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color="#C9A84C" />
          <Text style={s.backText}>BACK</Text>
        </TouchableOpacity>

        <View style={s.proStateWrap}>
          <Ionicons name="checkmark-circle" size={64} color="#C9A84C" style={{ marginBottom: 20 }} />
          <Text style={s.proStateTitle}>You're Pro</Text>
          <Text style={s.proStateSub}>
            All Pro features are active on your account. Thank you for supporting Clocked.
          </Text>
          <TouchableOpacity style={s.backBtnLarge} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={s.backBtnLargeText}>BACK TO ROUND</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── CTA copy — differs for trial vs. free user ─────────────────────────────
  const ctaLabel = isOnTrial ? 'KEEP PRO — $9.99/MO' : 'START 14-DAY FREE TRIAL';
  const ctaSub = isOnTrial
    ? (trialDaysRemaining === 1 ? 'Your trial ends tomorrow' : `${trialDaysRemaining} days left in your trial`)
    : 'No credit card required · Cancel anytime';

  // ── Placeholder purchase handler (see RevenueCat TODO above) ──────────────
  const handlePurchase = () => {
    // TODO: replace with RevenueCat purchase flow
    Alert.alert(
      'Coming Soon',
      'In-app purchases will be available in the next update. Your trial is active in the meantime!',
      [{ text: 'Got It' }],
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color="#C9A84C" />
        <Text style={s.backText}>BACK</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <View style={s.hero}>
          <View style={s.heroIconWrap}>
            <Ionicons name="locate-outline" size={40} color="#C9A84C" />
          </View>
          <Text style={s.heroEyebrow}>CLOCKED PRO</Text>
          <Text style={s.heroTitle}>Know Your Distance</Text>
          <Text style={s.heroSub}>
            GPS rangefinder, AI coaching, and every advanced tool — all in one subscription.
          </Text>
        </View>

        {/* ── Trial status banner (active trial users only) ── */}
        {isOnTrial && (
          <View style={s.trialBanner}>
            <Ionicons name="time-outline" size={14} color="#C9A84C" style={{ marginRight: 6 }} />
            <Text style={s.trialBannerText}>
              {trialDaysRemaining === 1
                ? 'Your free trial ends tomorrow — subscribe to keep access'
                : `${trialDaysRemaining} days left in your free trial`}
            </Text>
          </View>
        )}

        {/* ── Feature list ── */}
        <View style={s.featureSection}>
          <Text style={s.featureSectionLabel}>WHAT YOU GET</Text>

          {PRO_FEATURES.map((f, i) => (
            <View key={f.label} style={[s.featureRow, f.hero && s.featureRowHero]}>
              <View style={[s.featureIconWrap, f.hero && s.featureIconWrapHero]}>
                <Ionicons
                  name={f.icon}
                  size={f.hero ? 22 : 18}
                  color={f.hero ? '#C9A84C' : '#7DC87A'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.featureLabel, f.hero && s.featureLabelHero]}>{f.label}</Text>
                <Text style={s.featureDesc}>{f.desc}</Text>
              </View>
              {f.hero && (
                <View style={s.heroPill}>
                  <Text style={s.heroPillText}>FEATURED</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* ── Pricing card ── */}
        <View style={s.pricingCard}>
          <Text style={s.pricingLabel}>CLOCKED PRO</Text>
          <View style={s.pricingRow}>
            <Text style={s.pricingAmount}>$9.99</Text>
            <Text style={s.pricingPer}> / month</Text>
          </View>
          {!isOnTrial && (
            <Text style={s.pricingTrial}>14-day free trial included · No credit card required</Text>
          )}
          <Text style={s.pricingCancel}>Cancel anytime from your App Store account settings</Text>
        </View>

        {/* ── CTA button ── */}
        <TouchableOpacity style={s.ctaBtn} onPress={handlePurchase} activeOpacity={0.85}>
          <Text style={s.ctaBtnText}>{ctaLabel}</Text>
          <Text style={s.ctaBtnSub}>{ctaSub}</Text>
        </TouchableOpacity>

        {/* ── Legal ── */}
        <Text style={s.legalNote}>
          Subscription automatically renews at $9.99/month unless cancelled at least 24 hours before the end of the current period through your App Store account settings.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090F0A',
  },

  // Back button
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: 1.5,
    marginLeft: 4,
  },

  scroll: {
    paddingBottom: 48,
  },

  // ── "You're Pro" state ────────────────────────────────────────────────────
  proStateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  proStateTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F5EDD8',
    letterSpacing: 1,
    marginBottom: 16,
  },
  proStateSub: {
    fontSize: 15,
    color: '#B8A882',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  backBtnLarge: {
    borderWidth: 1,
    borderColor: '#C9A84C',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  backBtnLargeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: 2,
  },

  // ── Hero ─────────────────────────────────────────────────────────────────
  hero: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 28,
  },
  heroIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: 3,
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F5EDD8',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  heroSub: {
    fontSize: 15,
    color: '#B8A882',
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Trial banner ──────────────────────────────────────────────────────────
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(201,168,76,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  trialBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C9A84C',
    flex: 1,
  },

  // ── Feature list ──────────────────────────────────────────────────────────
  featureSection: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  featureSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A6E58',
    letterSpacing: 2,
    marginBottom: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0D1A0F',
    borderWidth: 1,
    borderColor: '#7DC87A22',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  featureRowHero: {
    borderColor: 'rgba(201,168,76,0.3)',
    backgroundColor: 'rgba(201,168,76,0.06)',
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(125,200,122,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  featureIconWrapHero: {
    backgroundColor: 'rgba(201,168,76,0.12)',
  },
  featureLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F5EDD8',
    marginBottom: 3,
  },
  featureLabelHero: {
    color: '#C9A84C',
  },
  featureDesc: {
    fontSize: 12,
    color: '#B8A882',
    lineHeight: 17,
  },
  heroPill: {
    backgroundColor: 'rgba(201,168,76,0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginLeft: 8,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  heroPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: 1,
  },

  // ── Pricing card ──────────────────────────────────────────────────────────
  pricingCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#0D1A0F',
    borderWidth: 1,
    borderColor: '#7DC87A22',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  pricingLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A6E58',
    letterSpacing: 2,
    marginBottom: 10,
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  pricingAmount: {
    fontSize: 40,
    fontWeight: '700',
    color: '#F5EDD8',
    lineHeight: 44,
  },
  pricingPer: {
    fontSize: 16,
    fontWeight: '500',
    color: '#B8A882',
    paddingBottom: 6,
  },
  pricingTrial: {
    fontSize: 12,
    color: '#7DC87A',
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
  },
  pricingCancel: {
    fontSize: 11,
    color: '#7A6E58',
    textAlign: 'center',
  },

  // ── CTA button ────────────────────────────────────────────────────────────
  ctaBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#C9A84C',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  ctaBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#090F0A',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  ctaBtnSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#090F0A',
    opacity: 0.65,
  },

  // ── Legal note ────────────────────────────────────────────────────────────
  legalNote: {
    marginHorizontal: 24,
    fontSize: 10,
    color: '#7A6E58',
    textAlign: 'center',
    lineHeight: 15,
  },
});
