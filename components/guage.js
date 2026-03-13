import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

export default function Gauge({ score = 4.2 }) {
  const size = 220;
  const cx = 110;
  const cy = 110;
  const R = 88;
  const totalDeg = 300;
  const startAngle = 210;

  const color = score >= 4.0 ? '#7DC87A' : score >= 3.0 ? '#D4B86A' : '#C07A6A';

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
  const fillDeg = (score / 5.0) * totalDeg;
  const fillPath = arcPath(startAngle, startAngle + fillDeg);
  const tip = xy(startAngle + fillDeg);

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        {/* Track */}
        <Path d={trackPath} fill="none" stroke="rgba(201,168,76,0.08)" strokeWidth="10" strokeLinecap="round" />
        {/* Fill */}
        <Path d={fillPath} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" opacity="0.9" />
        {/* Tip dot */}
        <Circle cx={tip.x} cy={tip.y} r="8" fill={color} opacity="0.2" />
        <Circle cx={tip.x} cy={tip.y} r="5" fill={color} opacity="0.9" />
      </Svg>

      {/* Score in center */}
      <View style={styles.center}>
        <Text style={styles.score}>{score.toFixed(1)}</Text>
        <Text style={styles.label}>POPSCORE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  center:    { position: 'absolute', alignItems: 'center' },
  score:     { fontSize: 52, fontWeight: '300', color: '#F5EDD8' },
  label:     { fontSize: 8, fontWeight: '700', color: '#C9A84C', letterSpacing: 3 },
});