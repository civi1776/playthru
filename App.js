import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFonts, Montserrat_700Bold } from '@expo-google-fonts/montserrat';

import HomeScreen        from './screens/HomeScreen';
import LogScreen         from './screens/LogScreen';
import CoursesScreen     from './screens/CoursesScreen';
import ProfileScreen     from './screens/ProfileScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import SplashScreen      from './screens/SplashScreen';

const Tab = createBottomTabNavigator();

const TABS = [
  { name: 'Home',        icon: '⛳', label: 'HOME' },
  { name: 'Log',         icon: '＋', label: 'LOG' },
  { name: 'Courses',     icon: '🗺', label: 'COURSES' },
  { name: 'Profile',     icon: '◎', label: 'PROFILE' },
  { name: 'Leaderboard', icon: '◈', label: 'BOARD' },
];

function BottomNav({ state, navigation }) {
  return (
    <View style={nav.container}>
      {TABS.map((tab, i) => {
        const active = state.index === i;
        return (
          <TouchableOpacity
            key={tab.name}
            style={nav.item}
            onPress={() => navigation.navigate(tab.name)}
            activeOpacity={0.7}
          >
            <Text style={[nav.icon, active ? nav.iconActive : nav.iconInactive]}>
              {tab.icon}
            </Text>
            <Text style={[nav.label, active ? nav.labelActive : nav.labelInactive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const nav = StyleSheet.create({
  container:    {
    width: '100%',
    height: 72,
    backgroundColor: '#090D0A',
    borderTopWidth: 1,
    borderTopColor: '#C9A84C33',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  item:         { alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 4 },
  icon:         { fontSize: 20, marginBottom: 3 },
  iconActive:   { opacity: 1 },
  iconInactive: { opacity: 0.4 },
  label:        { fontSize: 9, fontFamily: 'Montserrat_700Bold', letterSpacing: 1.5 },
  labelActive:  { color: '#C9A84C' },
  labelInactive:{ color: 'rgba(184,168,130,0.4)' },
});

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  useFonts({ Montserrat_700Bold });

  return (
    <NavigationContainer>
      <Tab.Navigator
        tabBar={props => <BottomNav {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
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
