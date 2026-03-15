import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Montserrat_700Bold } from '@expo-google-fonts/montserrat';

import HomeScreen        from './screens/HomeScreen';
import LogScreen         from './screens/LogScreen';
import CoursesScreen     from './screens/CoursesScreen';
import ProfileScreen     from './screens/ProfileScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import SplashScreen      from './screens/SplashScreen';

const Tab = createBottomTabNavigator();

const TAB_CONFIG = {
  Home:        { icon: '⛳', label: 'HOME' },
  Log:         { icon: '＋', label: 'LOG' },
  Courses:     { icon: '🗺', label: 'COURSES' },
  Profile:     { icon: '◎', label: 'PROFILE' },
  Leaderboard: { icon: '◈', label: 'BOARD' },
};

function CustomTabBar({ state, navigation }) {
  return (
    <View style={t.container}>
      {/* Gradient top border */}
      <LinearGradient
        colors={['transparent', '#C9A84C40', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={t.borderLine}
      />
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { icon, label } = TAB_CONFIG[route.name];
        return (
          <TouchableOpacity
            key={route.key}
            style={t.tab}
            onPress={() => navigation.navigate(route.name)}
            activeOpacity={0.7}
          >
            <Text style={[t.icon, focused ? t.iconActive : t.iconInactive]}>
              {icon}
            </Text>
            <Text style={[t.label, focused ? t.labelActive : t.labelInactive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const t = StyleSheet.create({
  container:    { flexDirection: 'row', backgroundColor: '#090D0A', height: 64, paddingBottom: 8, alignItems: 'center' },
  borderLine:   { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  tab:          { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  icon:         { fontSize: 22, marginBottom: 3 },
  iconActive:   {
    textShadowColor: '#C9A84C',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  iconInactive: { opacity: 0.4 },
  label:        { fontSize: 9, fontFamily: 'Montserrat_700Bold', letterSpacing: 2.5 },
  labelActive:  { color: '#C9A84C', textShadowColor: '#C9A84C88', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  labelInactive:{ color: '#7A6E58', opacity: 0.4 },
});

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [fontsLoaded] = useFonts({ Montserrat_700Bold });

  return (
    <NavigationContainer>
      <Tab.Navigator
        tabBar={props => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Home"        component={HomeScreen} />
        <Tab.Screen name="Log"         component={LogScreen} />
        <Tab.Screen name="Courses"     component={CoursesScreen} />
        <Tab.Screen name="Profile"     component={ProfileScreen} />
        <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      </Tab.Navigator>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </NavigationContainer>
  );
}
