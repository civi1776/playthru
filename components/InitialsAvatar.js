import { View, Text } from 'react-native';

function InitialsAvatar({ name, size = 40 }) {
  const initials = name
    ? name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1E3D22', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#C9A84C' }}>
      <Text style={{ color: '#F5EDD8', fontSize: Math.round(size * 0.35), fontWeight: '600' }}>{initials}</Text>
    </View>
  );
}

export default InitialsAvatar;
