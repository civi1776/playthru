// ─── CourseAvatar — aerial thumbnail of a course ─────────────────────────────
// Square by default (`size`); pass `width`/`height` for a banner. Pass
// `latitude`/`longitude` when the caller already has them to skip the lookup.
// Falls back to the course mark when there are no coordinates, the course is
// outside USGS coverage, or the tile fails to load.

import { useState, useEffect } from 'react';
import { View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCoursePhoto, courseImageUrl } from '../lib/courseImage';
import { COLOR, RADIUS } from '../lib/theme';

const urlCache = {};        // courseName → url (successful lookups only)
const inFlight = {};

export default function CourseAvatar({ courseName, city, size = 40, width, height, radius = RADIUS.sm, latitude, longitude, style }) {
  const w = width ?? size, h = height ?? size;
  const px = Math.max(w, h);
  const direct = latitude != null && longitude != null ? courseImageUrl(Number(latitude), Number(longitude), px) : null;
  const cacheKey = `${courseName}`;

  const [url, setUrl] = useState(() => direct ?? (cacheKey in urlCache ? urlCache[cacheKey] : undefined));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (direct) { setUrl(direct); return; }
    if (cacheKey in urlCache) { setUrl(urlCache[cacheKey]); return; }
    let cancelled = false;
    if (!inFlight[cacheKey]) {
      inFlight[cacheKey] = getCoursePhoto(courseName, city, px).finally(() => { delete inFlight[cacheKey]; });
    }
    inFlight[cacheKey].then(u => {
      if (u) urlCache[cacheKey] = u;
      if (!cancelled) setUrl(u);
    });
    return () => { cancelled = true; };
  }, [cacheKey, direct]);

  const box = { width: w, height: h, borderRadius: radius, backgroundColor: COLOR.surface, marginRight: width ? 0 : 10 };

  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={[box, style]}
        resizeMode="cover"
        onError={() => setFailed(true)}
        accessibilityRole="image"
        accessibilityLabel={courseName ? `Aerial view of ${courseName}` : 'Course'}
      />
    );
  }

  return (
    <View
      style={[box, { borderWidth: 1, borderColor: COLOR.border, alignItems: 'center', justifyContent: 'center' }, style]}
      accessibilityRole="image"
      accessibilityLabel={courseName ? `${courseName} course` : 'Course'}
    >
      <Ionicons name="golf" size={Math.round(Math.min(w, h) * 0.45)} color={COLOR.green + '88'} />
    </View>
  );
}
