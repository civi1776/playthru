import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

export default function Gauge({ score = 4.2, size = 220 }) {
  const scale = size / 220;
  const cx = size / 2;
  const cy = size / 2;
  const R  = 88 * scale;
  const totalDeg   = 300;
  const startAngle = 210;
  const strokeW    = Math.round(10 * scale);
  const scoreFontSize = Math.round(52 * scale);

  const color = score >= 4.0 ? '#7DC87A' : score >= 3.0 ? '#D4B86A' : '#C07A6A';

  // Count-up animation for the score number (setInterval — works in Expo Go)
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    if (!score) return;
    const target   = score;
    const steps    = 60;
    const duration = 1500;
    let current    = 0;
    const increment = target / steps;
    const interval = setInterval(() => {
      current += increment;
      if (current >= target) {
        setDisplayScore(target);
        clearInterval(interval);
      } else {
        setDisplayScore(parseFloat(current.toFixed(1)));
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [score]);

  // Continuous pulse on the outer ring via opacity
  const pulseAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.7, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  function xy(deg) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad) };
  }

  function arcPath(startDeg, endDeg) {
    const s = xy(startDeg);
    const e = xy(endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const trackPath = arcPath(startAngle, startAngle + totalDeg);
  const fillDeg   = (score / 5.0) * totalDeg;   // static arc — always full score
  const fillPath  = arcPath(startAngle, startAngle + fillDeg);
  const tip       = xy(startAngle + fillDeg);
  const tipOuter  = 8 * scale;
  const tipInner  = 5 * scale;

  return (
    <View style={styles.container}>
      {/* SVG arc wrapped in Animated.View so opacity pulses on native thread */}
      <Animated.View style={{ opacity: pulseAnim }}>
        <Svg width={size} height={size}>
          {/* Track */}
          <Path d={trackPath} fill="none" stroke="rgba(125,200,122,0.08)" strokeWidth={strokeW} strokeLinecap="round" />
          {/* Fill */}
          <Path d={fillPath} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" opacity="0.9" />
          {/* Tip dot */}
          <Circle cx={tip.x} cy={tip.y} r={tipOuter} fill={color} opacity="0.2" />
          <Circle cx={tip.x} cy={tip.y} r={tipInner} fill={color} opacity="0.9" />
        </Svg>
      </Animated.View>

      {/* Score number — counts up from 0 */}
      <View style={styles.center}>
        <Text style={[styles.score, { fontSize: scoreFontSize }]}>{displayScore.toFixed(1)}</Text>
        <Text style={[styles.label, { fontSize: Math.max(6, Math.round(8 * scale)) }]}>CLOCKED SCORE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  center:    { position: 'absolute', alignItems: 'center' },
  score:     { fontWeight: '300', color: '#F5EDD8' },
  label:     { fontWeight: '700', color: '#C9A84C', letterSpacing: 3 },
});
