import { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';

export default function SplashScreen({ onFinish }) {
  const logoOpacity    = useRef(new Animated.Value(0)).current;
  const logoScale      = useRef(new Animated.Value(0.88)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity  = useRef(new Animated.Value(1)).current;

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
        <Image
          source={require('../assets/PlayThru_AppIcon.png')}
          style={s.logo}
          resizeMode="contain"
        />
        <Text style={s.wordmark}>Clocked</Text>
        <View style={s.divider} />
        <Animated.Text style={[s.tagline, { opacity: taglineOpacity }]}>
          GOLF AS A SPORT.
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
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  wordmark: {
    fontSize: 38,
    fontWeight: '400',
    color: '#C9A84C',
    letterSpacing: 8,
    fontFamily: 'serif',
    marginBottom: 20,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: '#7DC87A44',
    marginBottom: 16,
  },
  tagline: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: 4,
  },
});
