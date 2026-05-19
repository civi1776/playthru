import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

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
        { backgroundColor: '#1A2E1C', borderRadius: 8, width, height, opacity },
        style,
      ]}
    />
  );
}
