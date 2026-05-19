import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GAME_TYPES } from '../lib/gameEngines';

export default function GamesScreen({ navigation }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color="#C9A84C" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>GOLF GAMES</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>START A GAME</Text>
        <Text style={s.subtitle}>
          Start a live round to play any game below. Tap a card to learn how it works.
        </Text>

        {GAME_TYPES.map(game => {
          const isOpen = expanded === game.id;
          return (
            <TouchableOpacity
              key={game.id}
              style={[s.card, isOpen && s.cardOpen]}
              onPress={() => setExpanded(isOpen ? null : game.id)}
              activeOpacity={0.85}
            >
              <View style={s.cardRow}>
                <View style={s.iconWrap}>
                  <Ionicons name={game.icon} size={22} color="#C9A84C" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>{game.id}</Text>
                  <Text style={s.cardDesc}>{game.desc}</Text>
                </View>
                <View style={s.playersBadge}>
                  <Text style={s.playersText}>
                    {game.minPlayers === game.maxPlayers
                      ? `${game.minPlayers}P`
                      : `${game.minPlayers}–${game.maxPlayers}P`}
                  </Text>
                </View>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#7A6E58"
                  style={{ marginLeft: 8 }}
                />
              </View>

              {isOpen && (
                <View style={s.howToWrap}>
                  <View style={s.howToDivider} />
                  <Text style={s.howToLabel}>HOW TO PLAY</Text>
                  <Text style={s.howToText}>{game.howTo}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={s.tipCard}>
          <Ionicons name="information-circle-outline" size={18} color="#C9A84C" style={{ marginRight: 10, marginTop: 1 }} />
          <Text style={s.tipText}>
            To play a game, tap <Text style={{ color: '#C9A84C', fontWeight: '700' }}>LOG</Text> → <Text style={{ color: '#C9A84C', fontWeight: '700' }}>Live Round</Text>, then tap <Text style={{ color: '#C9A84C', fontWeight: '700' }}>GAMES</Text> on the scorecard.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#090F0A' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn:      { width: 40, height: 40, justifyContent: 'center' },
  headerTitle:  { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4 },
  content:      { paddingHorizontal: 16, paddingBottom: 48, paddingTop: 8 },
  eyebrow:      { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 6 },
  subtitle:     { fontSize: 13, color: '#B8A882', lineHeight: 19, marginBottom: 20 },

  card:         { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 16, marginBottom: 10 },
  cardOpen:     { borderColor: '#C9A84C55' },
  cardRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap:     { width: 40, height: 40, borderRadius: 10, backgroundColor: '#1A2E1C', alignItems: 'center', justifyContent: 'center' },
  cardTitle:    { fontSize: 15, fontWeight: '600', color: '#F5EDD8', marginBottom: 2 },
  cardDesc:     { fontSize: 12, color: '#B8A882', lineHeight: 17 },
  playersBadge: { backgroundColor: '#1A2E1C', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  playersText:  { fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 0.5 },

  howToWrap:    { marginTop: 14 },
  howToDivider: { height: 1, backgroundColor: '#7DC87A18', marginBottom: 12 },
  howToLabel:   { fontSize: 9, fontWeight: '700', color: '#7A6E58', letterSpacing: 2, marginBottom: 6 },
  howToText:    { fontSize: 13, color: '#B8A882', lineHeight: 20 },

  tipCard:      { flexDirection: 'row', backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginTop: 6 },
  tipText:      { flex: 1, fontSize: 13, color: '#B8A882', lineHeight: 19 },
});
