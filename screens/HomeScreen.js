import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Gauge from '../components/guage';

const PRO_FEATURES = [
  { emoji: '🗺️', title: 'Round Heatmaps',  subtitle: 'Hole-by-hole pace' },
  { emoji: '🤖', title: 'AI Pace Coach',   subtitle: 'Weekly insights' },
  { emoji: '👥', title: 'Private Groups',  subtitle: 'Club leaderboards' },
];

function ProCard() {
  return (
    <View style={styles.proCard}>
      <View style={styles.proBadge}>
        <Text style={styles.proBadgeText}>✦ PRO MEMBER</Text>
      </View>
      <Text style={styles.proSubtitle}>Unlock your full performance profile</Text>
      <View style={styles.proFeatureRow}>
        {PRO_FEATURES.map(f => (
          <TouchableOpacity
            key={f.title}
            style={styles.proFeature}
            onPress={() => Alert.alert('Upgrade to Pro', 'Coming Soon')}
            activeOpacity={0.7}
          >
            <Text style={styles.proLock}>🔒</Text>
            <Text style={styles.proEmoji}>{f.emoji}</Text>
            <Text style={styles.proFeatureTitle}>{f.title}</Text>
            <Text style={styles.proFeatureSub}>{f.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.wordmark}>PLAYTHRU</Text>
            <Text style={styles.greeting}>Good morning, Jake</Text>
            <Text style={styles.subGreeting}>You're playing 12% faster this season ↑</Text>
          </View>
        </View>

        {/* POPScore Card */}
        <View style={styles.scoreCard}>
          <Gauge score={4.2} />
          <View style={styles.scoreRow}>
            <View style={styles.scoreStat}>
              <Text style={styles.scoreStatLabel}>NAT'L AVG</Text>
              <Text style={styles.scoreStatValue}>3.9</Text>
            </View>
            <View style={styles.scoreStat}>
              <Text style={styles.scoreStatLabel}>YOU</Text>
              <Text style={styles.scoreStatValue}>4.2</Text>
            </View>
            <View style={styles.scoreStat}>
              <Text style={styles.scoreStatLabel}>MONTHLY</Text>
              <Text style={[styles.scoreStatValue, { color: '#7DC87A' }]}>↑12%</Text>
            </View>
          </View>
        </View>

        {/* Last Round Card */}
        <View style={styles.card}>
          <Text style={styles.insight}>⚡ Fastest back 9 this year</Text>
          <Text style={styles.courseName}>TPC Sawgrass</Text>
          <Text style={styles.roundDetail}>Feb 28 · 18 holes · Cart · 4 players · 3h 22m</Text>
          <View style={styles.row}>
            <Text style={styles.popBadge}>4.3</Text>
            <Text style={styles.verified}>✓ VERIFIED</Text>
          </View>
        </View>

        {/* Standing Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>YOUR STANDING AT TPC SAWGRASS</Text>
          <Text style={styles.standingText}>Faster than <Text style={{ color: '#7DC87A' }}>82%</Text> of players</Text>
        </View>

        {/* Pro Member Teaser */}
        <ProCard />

      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Log')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+ LOG ROUND</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#090F0A' },
  header:           { padding: 22, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: '#C9A84C22' },
  wordmark:         { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5, marginBottom: 4 },
  greeting:         { fontSize: 20, fontWeight: '600', color: '#F5EDD8' },
  subGreeting:      { fontSize: 11, fontWeight: '600', color: '#7DC87A', marginTop: 3 },
  scoreCard:        { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#C9A84C22', alignItems: 'center' },
  scoreRow:         { flexDirection: 'row', gap: 32, marginTop: 12 },
  scoreStat:        { alignItems: 'center' },
  scoreStatLabel:   { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 4 },
  scoreStatValue:   { fontSize: 18, fontWeight: '400', color: '#B8A882' },
  card:             { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#C9A84C22' },
  insight:          { fontSize: 11, fontWeight: '600', color: '#7DC87A', marginBottom: 4 },
  courseName:       { fontSize: 19, fontWeight: '600', color: '#F5EDD8' },
  roundDetail:      { fontSize: 11, color: '#B8A882', marginTop: 3 },
  row:              { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  popBadge:         { fontFamily: 'monospace', fontSize: 13, color: '#7DC87A', borderWidth: 1, borderColor: '#7DC87A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  verified:         { fontSize: 9, fontWeight: '700', color: '#7DC87A', letterSpacing: 1.5 },
  cardLabel:        { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 8 },
  standingText:     { fontSize: 18, fontWeight: '500', color: '#F5EDD8' },
  proCard:        { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#1A2E1C', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)' },
  proBadge:       { alignSelf: 'flex-start', backgroundColor: '#0D1A0F', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 10 },
  proBadgeText:   { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  proSubtitle:    { fontSize: 12, color: '#B8A882', marginBottom: 14 },
  proFeatureRow:  { flexDirection: 'row', gap: 8 },
  proFeature:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
  proLock:        { fontSize: 10, alignSelf: 'flex-end', marginBottom: 6 },
  proEmoji:       { fontSize: 22, marginBottom: 6 },
  proFeatureTitle:{ fontSize: 11, fontWeight: '600', color: '#B8A882', marginBottom: 2 },
  proFeatureSub:  { fontSize: 10, color: '#7A6E58' },
  fab: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    width: 180,
    paddingVertical: 14,
    borderRadius: 50,
    backgroundColor: '#1E4825',
    borderWidth: 1,
    borderColor: '#C9A84C66',
    alignItems: 'center',
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DFC07A',
    letterSpacing: 2,
  },
});
