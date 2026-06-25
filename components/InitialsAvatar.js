import { useState } from 'react';
import { View, Text, Image } from 'react-native';

const BG_COLORS = ['#1E3D22', '#1A2E3D', '#2D1A3D', '#3D2A1A', '#1A3D35', '#3D1A2A', '#252030', '#2A2D1A'];
function avatarBg(name) {
  if (!name) return BG_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return BG_COLORS[Math.abs(h) % BG_COLORS.length];
}

function getInitials(name, username) {
  if (name) {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length > 0) return parts.map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
  if (username) {
    return username.slice(0, 2).toUpperCase();
  }
  return null; // signals: show icon fallback
}

// avatarUrl: shows photo when provided and loadable.
// Falls back to initials from name, then username, then a person icon.
function InitialsAvatar({ name, size = 40, avatarUrl, username }) {
  const [imgError, setImgError] = useState(false);
  const showImage = !!avatarUrl && !imgError;
  const initials = getInitials(name, username);

  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: avatarBg(name || username),
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#C9A84C44',
        overflow: 'hidden',
      }}
      accessibilityRole="image"
      accessibilityLabel={name || username ? `${name || username} avatar` : 'User avatar'}
    >
      {showImage ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setImgError(true)}
        />
      ) : initials ? (
        <Text style={{ color: '#F5EDD8', fontSize: Math.round(size * 0.35), fontWeight: '600' }}>{initials}</Text>
      ) : (
        <View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, backgroundColor: '#C9A84C33', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#C9A84C88', fontSize: Math.round(size * 0.28) }}>{'\u{1F464}'}</Text>
        </View>
      )}
    </View>
  );
}

export default InitialsAvatar;
