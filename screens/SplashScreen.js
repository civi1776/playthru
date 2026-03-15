import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

export default function SplashScreen({ onFinish }) {
  const logoOpacity   = useRef(new Animated.Value(0)).current;
  const logoScale     = useRef(new Animated.Value(0.88)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // Fade + scale logo in
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1, duration: 600, useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1, friction: 7, tension: 60, useNativeDriver: true,
        }),
      ]),
      // Fade tagline in
      Animated.timing(taglineOpacity, {
        toValue: 1, duration: 400, delay: 100, useNativeDriver: true,
      }),
      // Hold
      Animated.delay(900),
      // Fade entire screen out
      Animated.timing(screenOpacity, {
        toValue: 0, duration: 500, useNativeDriver: true,
      }),
    ]).start(() => onFinish());
  }, []);

  return (
    <Animated.View style={[s.container, { opacity: screenOpacity }]}>
      <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }], alignItems: 'center' }}>
        <Text style={s.flag}>⛳</Text>
        <Text style={s.wordmark}>PLAYTHRU</Text>
        <View style={s.divider} />
        <Animated.Text style={[s.tagline, { opacity: taglineOpacity }]}>
          PACE OF PLAY HANDICAP
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#090F0A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  flag: {
    fontSize: 48,
    marginBottom: 20,
  },
  wordmark: {
    fontSize: 36,
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: 12,
    marginBottom: 20,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: '#C9A84C44',
    marginBottom: 16,
  },
  tagline: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B8A882',
    letterSpacing: 4,
  },
});
