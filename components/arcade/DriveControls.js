// ─── DriveControls — stick + turbo under ONE gesture owner ───────────────────
// React Native gives every finger of a gesture to a single responder view, so
// a Turbo button that is a separate touchable can never be pressed while the
// stick is held. This row owns all touches inside it instead:
//   • the finger that lands on the stick steers (tracked by identifier, so a
//     second finger never shifts the centroid);
//   • any other finger that lands in the row — on the Turbo button, on the
//     readouts, anywhere — fires turbo, whether it arrives together with the
//     steering finger or later.
// Children render in the middle (hint text + readouts).

import { useRef, useMemo, useState } from 'react';
import { View, Text, Animated, PanResponder, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLOR } from '../../lib/theme';

const SIZE = 118, KNOB = 48, RANGE = (SIZE - KNOB) / 2;
const TSIZE = 74, TSTROKE = 4, TR = (TSIZE - TSTROKE) / 2, TCIRC = 2 * Math.PI * TR;

export default function DriveControls({ onChange, onTurbo, turbo = { charge: 1, active: false, ready: true }, disabled, children }) {
  const knob = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onTurboRef = useRef(onTurbo);   onTurboRef.current = onTurbo;
  const rowRef = useRef(null);
  const stickRef = useRef(null);
  const stickCenter = useRef(null);      // window coords
  const steerId = useRef(null);
  const seenIds = useRef(new Set());
  const [pressed, setPressed] = useState(false);

  const measure = () => {
    stickRef.current?.measureInWindow?.((x, y, w, h) => { stickCenter.current = { x: x + w / 2, y: y + h / 2 }; });
  };

  const onStick = (t) => {
    const c = stickCenter.current;
    return !!c && Math.hypot(t.pageX - c.x, t.pageY - c.y) <= SIZE / 2 + 12;
  };

  const steer = (touches) => {
    const c = stickCenter.current;
    const t = touches.find(tt => tt.identifier === steerId.current);
    if (!c || !t) return;
    let x = t.pageX - c.x, y = t.pageY - c.y;
    const m = Math.hypot(x, y);
    if (m > RANGE) { x = x / m * RANGE; y = y / m * RANGE; }
    knob.setValue({ x, y });
    onChangeRef.current?.({ dx: x / RANGE, dy: -y / RANGE });
  };

  // Classify every touch we have not seen yet: stick or turbo. Touch ids that
  // have lifted are forgotten, because iOS reuses identifiers: without this a
  // second turbo tap in the same drive could arrive with the first tap's id
  // and be ignored.
  const classify = (touches) => {
    const live = new Set(touches.map(t => t.identifier));
    for (const id of [...seenIds.current]) if (!live.has(id)) seenIds.current.delete(id);
    for (const t of touches) {
      if (seenIds.current.has(t.identifier)) continue;
      seenIds.current.add(t.identifier);
      if (steerId.current == null && onStick(t)) steerId.current = t.identifier;
      else { setPressed(true); onTurboRef.current?.(); }
    }
  };

  // Keep steering and the pressed state honest against the fingers that are
  // actually down. Runs on every start, move and end, because a finger that
  // lands while the steering finger is held still produces no move event.
  const sync = (touches) => {
    classify(touches);
    if (steerId.current != null && !touches.some(t => t.identifier === steerId.current)) {
      steerId.current = null; knob.setValue({ x: 0, y: 0 }); onChangeRef.current?.({ dx: 0, dy: 0 });
    }
    if (!touches.some(t => t.identifier !== steerId.current)) setPressed(false);
    steer(touches);
  };

  const endAll = (spring) => {
    steerId.current = null; seenIds.current = new Set(); setPressed(false);
    if (spring) Animated.spring(knob, { toValue: { x: 0, y: 0 }, useNativeDriver: false, speed: 40, bounciness: 2 }).start();
    else knob.setValue({ x: 0, y: 0 });
    onChangeRef.current?.({ dx: 0, dy: 0 });
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (e) => { measure(); sync(e.nativeEvent.touches); },
    // A second finger landing or lifting fires start/end, not move.
    onPanResponderStart: (e) => sync(e.nativeEvent.touches),
    onPanResponderEnd:   (e) => sync(e.nativeEvent.touches),
    onPanResponderMove:  (e) => sync(e.nativeEvent.touches),
    onPanResponderRelease: () => endAll(true),
    onPanResponderTerminate: () => endAll(false),
    onPanResponderTerminationRequest: () => false,
  }), [disabled]);

  const tColor = turbo.active ? COLOR.goldBright : turbo.ready ? COLOR.gold : COLOR.dim;

  return (
    <View ref={rowRef} style={[st.row, disabled && { opacity: 0.4 }]} {...pan.panHandlers}>
      {/* Stick */}
      <View ref={stickRef} onLayout={measure} style={st.base} accessibilityLabel="Cart joystick. Any second finger boosts." accessibilityRole="adjustable">
        <View style={st.cross} pointerEvents="none" />
        <View style={[st.cross, { transform: [{ rotate: '90deg' }] }]} pointerEvents="none" />
        <Animated.View style={[st.knob, { transform: knob.getTranslateTransform() }]} pointerEvents="none" />
      </View>

      <View style={st.middle} pointerEvents="none">{children}</View>

      {/* Turbo (visual only; the row's responder handles the touch) */}
      <View style={[st.turbo, pressed && turbo.ready && st.turboPressed]} accessibilityRole="button" accessibilityLabel="Turbo boost">
        <Svg width={TSIZE} height={TSIZE} style={StyleSheet.absoluteFill}>
          <Circle cx={TSIZE / 2} cy={TSIZE / 2} r={TR} stroke={COLOR.border} strokeWidth={TSTROKE} fill={turbo.active ? '#E8CC6E22' : COLOR.surface} />
          <Circle cx={TSIZE / 2} cy={TSIZE / 2} r={TR} stroke={tColor} strokeWidth={TSTROKE} fill="none"
            strokeDasharray={`${TCIRC}`} strokeDashoffset={TCIRC * (1 - turbo.charge)} strokeLinecap="round"
            transform={`rotate(-90 ${TSIZE / 2} ${TSIZE / 2})`} />
        </Svg>
        <Ionicons name="flash" size={22} color={tColor} />
        <Text style={[st.tLabel, { color: tColor }]}>{turbo.active ? 'BOOST' : turbo.ready ? 'TURBO' : `${Math.round(turbo.charge * 100)}%`}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center' },
  middle:{ flex: 1, marginHorizontal: 14 },
  base:  { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.borderGold, alignItems: 'center', justifyContent: 'center' },
  cross: { position: 'absolute', width: SIZE - 24, height: 1, backgroundColor: COLOR.border },
  knob:  { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: COLOR.gold, borderWidth: 2, borderColor: COLOR.goldBright },
  turbo: { width: TSIZE, height: TSIZE, alignItems: 'center', justifyContent: 'center' },
  turboPressed: { transform: [{ scale: 0.94 }] },
  tLabel:{ fontSize: 8, fontWeight: '800', letterSpacing: 1.5, marginTop: 2 },
});
