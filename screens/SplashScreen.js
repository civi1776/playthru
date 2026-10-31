import { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import { COLOR } from '../lib/theme';

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
          source={require('../assets/PlayThru_Logo.png')}
          style={s.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Text style={s.wordmark}>CLOCKED</Text>
        <View style={s.divider} />
        <Animated.Text style={[s.tagline, { opacity: taglineOpacity }]}>
          THE WAY TO PLAY GOLF FOR ATHLETES.
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLOR.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  logo: {
    width: 150,
    height: 100,
    marginBottom: 20,
    tintColor: COLOR.gold,
  },
  wordmark: {
    fontFamily: 'Montserrat_800ExtraBold',
    fontSize: 34,
    color: COLOR.goldBright,
    letterSpacing: 10,
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
    color: COLOR.gold,
    letterSpacing: 3,
  },
});
