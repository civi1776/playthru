import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import { supabase } from './lib/supabase';

import HomeScreen        from './screens/HomeScreen';
import LogScreen         from './screens/LogScreen';
import CoursesScreen     from './screens/CoursesScreen';
import ProfileScreen     from './screens/ProfileScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import SplashScreen      from './screens/SplashScreen';
import WelcomeScreen     from './screens/WelcomeScreen';
import SignUpScreen      from './screens/SignUpScreen';
import SignInScreen      from './screens/SignInScreen';

const Tab       = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();

const TABS = [
  { name: 'Home',        icon: 'home',        label: 'HOME' },
  { name: 'Log',         icon: 'add-circle',  label: 'LOG' },
  { name: 'Courses',     icon: 'location',    label: 'COURSES' },
  { name: 'Profile',     icon: 'person',      label: 'PROFILE' },
  { name: 'Leaderboard', icon: 'trophy',      label: 'RANKS' },
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
            <Ionicons
              name={tab.icon}
              size={24}
              color={active ? '#C9A84C' : 'rgba(184,168,130,0.4)'}
            />
            <Text style={[nav.label, { color: active ? '#C9A84C' : 'rgba(184,168,130,0.4)' }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const nav = StyleSheet.create({
  container: {
    width: '100%',
    height: 72,
    backgroundColor: '#090D0A',
    borderTopWidth: 1,
    borderTopColor: '#C9A84C33',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  item:  { alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 4 },
  label: { fontSize: 9, fontFamily: 'Montserrat_700Bold', letterSpacing: 1.5, textAlign: 'center', marginTop: 3 },
});

export default function App() {
  const [session, setSession]             = useState(undefined); // undefined = loading
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showSplash, setShowSplash]       = useState(true);
  useFonts({ Montserrat_700Bold });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setIsAuthenticated(true);
      setSession(data.session ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (newSession) setIsAuthenticated(true);
        setSession(newSession);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Callback passed to auth screens — called after successful signup/signin
  // regardless of whether a Supabase session was established (handles email confirmation)
  const onAuthSuccess = () => {
    setIsAuthenticated(true);
    setSession('authenticated'); // truthy non-null value
  };

  // Loading state — session not yet determined
  if (session === undefined && !isAuthenticated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#C9A84C" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {(session || isAuthenticated) ? (
        <>
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
        </>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
          <AuthStack.Screen name="SignUp">
            {props => <SignUpScreen {...props} onAuthSuccess={onAuthSuccess} />}
          </AuthStack.Screen>
          <AuthStack.Screen name="SignIn">
            {props => <SignInScreen {...props} onAuthSuccess={onAuthSuccess} />}
          </AuthStack.Screen>
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#090F0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
