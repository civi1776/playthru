import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { COLOR, RADIUS } from '../lib/theme';

export default function SkeletonLoader({ width, height, style }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        { backgroundColor: COLOR.surfaceAlt, borderRadius: RADIUS.sm, width, height, opacity },
        style,
      ]}
    />
  );
}
