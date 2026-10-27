// ─── Joystick — PanResponder virtual stick for cart driving ──────────────────
// Reports a {dx, dy} vector (−1..1, dy positive = toward the green / screen
// up) through `onChange` every move, and {0,0} on release. The knob is driven
// by an Animated.ValueXY with setValue so dragging never re-renders the game.

import { useRef, useMemo } from 'react';
import { View, Animated, PanResponder, StyleSheet } from 'react-native';
import { COLOR } from '../../lib/theme';

const SIZE = 118;
const KNOB = 48;
const RANGE = (SIZE - KNOB) / 2;

export default function Joystick({ onChange, disabled }) {
  const knob = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: () => {},
    onPanResponderMove: (_e, gs) => {
      let x = gs.dx, y = gs.dy;
      const m = Math.hypot(x, y);
      if (m > RANGE) { x = x / m * RANGE; y = y / m * RANGE; }
      knob.setValue({ x, y });
      onChangeRef.current?.({ dx: x / RANGE, dy: -y / RANGE });
    },
    onPanResponderRelease: () => {
      Animated.spring(knob, { toValue: { x: 0, y: 0 }, useNativeDriver: false, speed: 40, bounciness: 2 }).start();
      onChangeRef.current?.({ dx: 0, dy: 0 });
    },
    onPanResponderTerminate: () => {
      knob.setValue({ x: 0, y: 0 });
      onChangeRef.current?.({ dx: 0, dy: 0 });
    },
  }), [disabled]);

  return (
    <View style={[st.base, disabled && { opacity: 0.35 }]} {...pan.panHandlers} accessibilityLabel="Cart joystick" accessibilityRole="adjustable">
      <View style={st.cross} pointerEvents="none" />
      <View style={[st.cross, { transform: [{ rotate: '90deg' }] }]} pointerEvents="none" />
      <Animated.View style={[st.knob, { transform: knob.getTranslateTransform() }]} pointerEvents="none" />
    </View>
  );
}

const st = StyleSheet.create({
  base: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2,
    backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.borderGold,
    alignItems: 'center', justifyContent: 'center',
  },
  cross: { position: 'absolute', width: SIZE - 24, height: 1, backgroundColor: COLOR.border },
  knob: {
    width: KNOB, height: KNOB, borderRadius: KNOB / 2,
    backgroundColor: COLOR.gold, borderWidth: 2, borderColor: COLOR.goldBright,
  },
});
