import { useState, useEffect } from 'react';
import { View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCoursePhoto } from '../lib/googlePlaces';

// Module-level session cache: "courseName|city" → url string | null
const photoCache = {};

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
    getCoursePhoto(courseName, city).then(url => {
      photoCache[cacheKey] = url;
      if (!cancelled) setPhotoUrl(url);
    });
    return () => { cancelled = true; };
  }, [cacheKey]);

  const radius = 10;

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#0D1A0F', marginRight: 10 }}
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
      backgroundColor: '#0D1A0F',
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
