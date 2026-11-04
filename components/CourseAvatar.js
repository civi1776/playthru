// ─── CourseAvatar — a course's mark ─────────────────────────────────────────
// Default is the crest: monogram, hashed colour, gold hairline. It reads at
// 32px, needs no network, and never falls back to a different-looking tile,
// so a list of rounds looks like one list.
//
// Pass `aerial` for the places where a photograph earns its space — a course
// page header at 120px or more. There the USGS tile is framed tighter and
// tinted into the palette, and it still falls back to the crest when we have
// no coordinates or the course is outside coverage.
//
// Square by default (`size`); pass `width`/`height` for a banner.

import { useState, useEffect } from 'react';
import { View, Text, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCoursePhoto, courseImageUrl } from '../lib/courseImage';
import { crestInitials, crestColor } from '../lib/courseCrest';
import { COLOR, RADIUS, TYPE } from '../lib/theme';

const urlCache = {};
const inFlight = {};

function Crest({ w, h, radius, name, style }) {
  const initials = crestInitials(name);
  const small = Math.min(w, h);
  return (
    <View
      style={[{
        width: w, height: h, borderRadius: radius,
        backgroundColor: initials ? crestColor(name) : COLOR.surface,
        borderWidth: 1, borderColor: COLOR.gold + '55',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }, style]}
      accessibilityRole="image"
      accessibilityLabel={name ? `${name} course mark` : 'Course'}
    >
      {initials ? (
        <Text
          style={{
            ...TYPE.display,
            color: COLOR.gold,
            fontSize: Math.max(10, Math.round(small * 0.36)),
            letterSpacing: small > 48 ? 1 : 0.3,
          }}
          numberOfLines={1}
        >
          {initials}
        </Text>
      ) : (
        <Ionicons name="golf" size={Math.round(small * 0.45)} color={COLOR.green + '88'} />
      )}
    </View>
  );
}

export default function CourseAvatar({
  courseName, city, size = 40, width, height, radius = RADIUS.sm,
  latitude, longitude, aerial = false, style,
}) {
  const w = width ?? size, h = height ?? size;
  const px = Math.max(w, h);
  const spacing = width ? {} : { marginRight: 10 };

  const direct = aerial && latitude != null && longitude != null
    ? courseImageUrl(Number(latitude), Number(longitude), px)
    : null;
  const cacheKey = `${courseName}`;

  const [url, setUrl] = useState(() => direct ?? (aerial && cacheKey in urlCache ? urlCache[cacheKey] : undefined));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!aerial) return;
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
  }, [cacheKey, direct, aerial]);

  if (!aerial || !url || failed) {
    return <Crest w={w} h={h} radius={radius} name={courseName} style={[spacing, style]} />;
  }

  // Aerial, hero sizes only. The green wash pulls the photograph into the
  // palette so it sits beside designed elements instead of fighting them.
  return (
    <View style={[{ width: w, height: h, borderRadius: radius, overflow: 'hidden', backgroundColor: COLOR.surface }, spacing, style]}>
      <Image
        source={{ uri: url }}
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
        onError={() => setFailed(true)}
        accessibilityRole="image"
        accessibilityLabel={courseName ? `Aerial view of ${courseName}` : 'Course'}
      />
      <View style={{ position: 'absolute', inset: 0, backgroundColor: '#0B2A12', opacity: 0.34 }} pointerEvents="none" />
      <View style={{ position: 'absolute', inset: 0, borderRadius: radius, borderWidth: 1, borderColor: COLOR.gold + '33' }} pointerEvents="none" />
    </View>
  );
}
