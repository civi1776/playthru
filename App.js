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
      <Tab.Navigator screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0D1A0F', borderTopColor: '#C9A84C22' },
        tabBarActiveTintColor: '#C9A84C',
        tabBarInactiveTintColor: '#7A6E58',
      }}>
        <Tab.Screen name="Home"        component={HomeScreen}        options={{ tabBarIcon: () => <Text>⛳</Text> }} />
        <Tab.Screen name="Log"         component={LogScreen}         options={{ tabBarIcon: () => <Text>＋</Text> }} />
        <Tab.Screen name="Courses"     component={CoursesScreen}     options={{ tabBarIcon: () => <Text>🗺</Text> }} />
        <Tab.Screen name="Profile"     component={ProfileScreen}     options={{ tabBarIcon: () => <Text>◎</Text> }} />
        <Tab.Screen name="Leaderboard" component={LeaderboardScreen} options={{ tabBarIcon: () => <Text>◈</Text> }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
