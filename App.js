import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import HomeScreen        from './screens/HomeScreen';
import LogScreen         from './screens/LogScreen';
import CoursesScreen     from './screens/CoursesScreen';
import ProfileScreen     from './screens/ProfileScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0D1A0F',
          borderTopColor: '#C9A84C33',
          borderTopWidth: 1,
          height: 70,
        },
        tabBarActiveTintColor: '#C9A84C',
        tabBarInactiveTintColor: '#7A6E58',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 1,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
        tabBarIcon: ({ color }) => {
          const icons = { Home: '⛳', Log: '＋', Courses: '🗺', Profile: '◎', Leaderboard: '◈' };
          return <Text style={{ fontSize: 28, color }}>{icons[route.name]}</Text>;
        },
      })}>
        <Tab.Screen name="Home"        component={HomeScreen} />
        <Tab.Screen name="Log"         component={LogScreen} />
        <Tab.Screen name="Courses"     component={CoursesScreen} />
        <Tab.Screen name="Profile"     component={ProfileScreen} />
        <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
