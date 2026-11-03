// ─── Joystick — PanResponder virtual stick for cart driving ──────────────────
// Reports a {dx, dy} vector (−1..1, dy positive = toward the green / screen
// up) through `onChange` every move, and {0,0} on release. The knob is driven
// by an Animated.ValueXY with setValue so dragging never re-renders the game.
//
// Multi-touch: React Native hands every finger of a gesture to the one view
// that owns it, so a second finger can never reach a separate Turbo button
// while the stick is held. We handle it here instead: steering always follows
// the FIRST finger (measured against the stick's own centre, not the gesture
// centroid), and a second finger landing anywhere fires `onTurbo`.

import { useRef, useMemo } from 'react';
import { View, Animated, PanResponder, StyleSheet } from 'react-native';
import { COLOR } from '../../lib/theme';

const SIZE = 118;
const KNOB = 48;
const RANGE = (SIZE - KNOB) / 2;

export default function Joystick({ onChange, onTurbo, disabled }) {
  const knob = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onTurboRef = useRef(onTurbo);   onTurboRef.current = onTurbo;
  const baseRef = useRef(null);
  const centerRef = useRef(null);          // { x, y } in window coords
  const firstIdRef = useRef(null);
  const turboFiredRef = useRef(false);

  const measure = () => {
    baseRef.current?.measureInWindow?.((x, y, w, h) => { centerRef.current = { x: x + w / 2, y: y + h / 2 }; });
  };

  const steerFrom = (touches) => {
    const c = centerRef.current;
    if (!c || !touches?.length) return;
    let t = touches.find(tt => tt.identifier === firstIdRef.current) ?? touches[0];
    let x = t.pageX - c.x, y = t.pageY - c.y;
    const m = Math.hypot(x, y);
    if (m > RANGE) { x = x / m * RANGE; y = y / m * RANGE; }
    knob.setValue({ x, y });
    onChangeRef.current?.({ dx: x / RANGE, dy: -y / RANGE });
  };

  const release = (spring) => {
    firstIdRef.current = null; turboFiredRef.current = false;
    if (spring) Animated.spring(knob, { toValue: { x: 0, y: 0 }, useNativeDriver: false, speed: 40, bounciness: 2 }).start();
    else knob.setValue({ x: 0, y: 0 });
    onChangeRef.current?.({ dx: 0, dy: 0 });
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (e) => {
      measure();
      const touches = e.nativeEvent.touches;
      firstIdRef.current = touches?.[0]?.identifier ?? null;
      turboFiredRef.current = false;
      steerFrom(touches);
    },
    onPanResponderMove: (e) => {
      const touches = e.nativeEvent.touches;
      if (touches.length >= 2 && !turboFiredRef.current) {
        turboFiredRef.current = true;
        onTurboRef.current?.();
      }
      steerFrom(touches);
    },
    onPanResponderRelease: () => release(true),
    onPanResponderTerminate: () => release(false),
  }), [disabled]);

  return (
    <View
      ref={baseRef}
      onLayout={measure}
      style={[st.base, disabled && { opacity: 0.35 }]}
      {...pan.panHandlers}
      accessibilityLabel="Cart joystick. Second finger for turbo."
      accessibilityRole="adjustable"
    >
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
