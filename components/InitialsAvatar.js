import { useState } from 'react';
import { View, Text, Image } from 'react-native';

const BG_COLORS = ['#1E3D22', '#1A2E3D', '#2D1A3D', '#3D2A1A', '#1A3D35', '#3D1A2A', '#252030', '#2A2D1A'];
function avatarBg(name) {
  if (!name) return BG_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return BG_COLORS[Math.abs(h) % BG_COLORS.length];
}

// avatarUrl prop: when provided and loadable, shows the photo.
// Falls back to initials on load error or when url is null/undefined.
function InitialsAvatar({ name, size = 40, avatarUrl }) {
  const [imgError, setImgError] = useState(false);
  const showImage = !!avatarUrl && !imgError;

  const initials = name
    ? name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: avatarBg(name),
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#C9A84C44',
        overflow: 'hidden',
      }}
      accessibilityRole="image"
      accessibilityLabel={name ? `${name} avatar` : 'User avatar'}
    >
      {showImage ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setImgError(true)}
        />
      ) : (
        <Text style={{ color: '#F5EDD8', fontSize: Math.round(size * 0.35), fontWeight: '600' }}>{initials}</Text>
      )}
    </View>
  );
}

export default InitialsAvatar;
