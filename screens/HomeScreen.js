import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Gauge from '../components/guage';
export default function HomeScreen() {
  return (
    <ScrollView style={styles.container}>
      
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
        <Text style={styles.scoreLabel}>POPSCORE</Text>
        <Text style={styles.scoreValue}>4.2</Text>
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

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#090F0A' },
  header:           { padding: 22, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: '#C9A84C22' },
  wordmark:         { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5, marginBottom: 4 },
  greeting:         { fontSize: 20, fontWeight: '600', color: '#F5EDD8' },
  subGreeting:      { fontSize: 11, fontWeight: '600', color: '#7DC87A', marginTop: 3 },
  scoreCard:        { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#C9A84C22', alignItems: 'center' },
  scoreLabel:       { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 8 },
  scoreValue:       { fontSize: 72, fontWeight: '300', color: '#F5EDD8' },
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
});