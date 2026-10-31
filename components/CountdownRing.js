// ─── CountdownRing — generic progress ring ───────────────────────────────────
// Shared visual signature: a thin ring that fills/drains smoothly. Used by
// the Live Round shot clock (its own internal copy, tuned for zone-pulsing)
// and by onboarding (this component) where each answer visibly fills the
// ring instead of a plain progress bar — same DNA, lower stakes.

import { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLOR } from '../lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function CountdownRing({
  progress = 0,       // 0–1
  size = 220,
  strokeWidth = 5,
  color = COLOR.gold,
  trackColor = COLOR.surface,
  duration = 500,
  children,
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedProgress = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // SVG stroke props aren't native-driver compatible
    }).start();
  }, [progress]);

  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}
