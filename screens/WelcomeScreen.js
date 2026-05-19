import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';

export default function WelcomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require('../assets/PlayThru_AppIcon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.wordmark}>PLAYTHRU</Text>
        <Text style={styles.subtitle}>SPEED HANDICAP</Text>
        <View style={styles.divider} />
        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => navigation.navigate('SignUp')}
            activeOpacity={0.8}
          >
            <Text style={styles.btnPrimaryText}>CREATE ACCOUNT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={() => navigation.navigate('SignIn')}
            activeOpacity={0.8}
          >
            <Text style={styles.btnSecondaryText}>SIGN IN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnExplore}
            onPress={() => navigation.navigate('PreviewMode')}
            activeOpacity={0.7}
          >
            <Text style={styles.btnExploreText}>EXPLORE THE APP →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090F0A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  content: {
    width: '100%',
    alignItems: 'center',
  },
  logo: {
    width: 360,
    height: 360,
    marginBottom: -40,
  },
  wordmark: {
    fontSize: 32,
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: 12,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 11,
    color: '#B8A882',
    letterSpacing: 4,
    marginBottom: 28,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(125,200,122,0.3)',
    marginBottom: 40,
  },
  buttons: {
    width: '100%',
    gap: 14,
  },
  btnPrimary: {
    backgroundColor: '#C9A84C',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    width: '100%',
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#090F0A',
    letterSpacing: 2,
  },
  btnSecondary: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#C9A84C',
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: 2,
  },
  btnExplore: {
    marginTop: 4,
    padding: 12,
    alignItems: 'center',
  },
  btnExploreText: {
    color: '#B8A882',
    fontSize: 13,
    letterSpacing: 1,
  },
});
