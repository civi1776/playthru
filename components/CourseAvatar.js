import { useState, useEffect } from 'react';
import { View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCoursePhoto } from '../lib/googlePlaces';
import { COLOR } from '../lib/theme';

// Module-level session cache: "courseName|city" → url string.
// Only successful lookups are cached — a null result usually just means
// this particular render burst got rate-limited by Google (course search
// lists mount many CourseAvatars at once), not that the course truly has
// no photo, so we don't want to poison the cache and hide the thumbnail
// for the rest of the session.
const photoCache = {};
// Module-level in-flight map so the same course rendered by multiple cards
// at once (e.g. the "Near You" strip and the main list both showing the
// same course) shares a single network request instead of each card
// firing its own duplicate call to the google-places edge function.
const inFlightRequests = {};

export default function CourseAvatar({ courseName, city, size = 40 }) {
  const cacheKey = `${courseName}|${city || ''}`;

  const [photoUrl, setPhotoUrl] = useState(() =>
    cacheKey in photoCache ? photoCache[cacheKey] : undefined
  );

  useEffect(() => {
    if (cacheKey in photoCache) {
      setPhotoUrl(photoCache[cacheKey]);
      return;
    }
    let cancelled = false;

    if (!inFlightRequests[cacheKey]) {
      inFlightRequests[cacheKey] = getCoursePhoto(courseName, city).finally(() => {
        delete inFlightRequests[cacheKey];
      });
    }

    inFlightRequests[cacheKey].then(url => {
      if (url) photoCache[cacheKey] = url;
      if (!cancelled) setPhotoUrl(url);
    });

    return () => { cancelled = true; };
  }, [cacheKey]);

  const radius = 10;

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: COLOR.surface, marginRight: 10 }}
        resizeMode="cover"
        accessibilityRole="image"
        accessibilityLabel={courseName ? `${courseName} course photo` : 'Course'}
      />
    );
  }

  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: radius,
      backgroundColor: COLOR.surface,
      borderWidth: 1,
      borderColor: '#7DC87A22',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    }} accessibilityRole="image" accessibilityLabel={courseName ? `${courseName} course` : 'Course'}>
      <Ionicons name="golf" size={Math.round(size * 0.45)} color="#7DC87A88" />
    </View>
  );
}
