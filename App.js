import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

const Tab = createBottomTabNavigator();

import HomeScreen from './screens/HomeScreen';

function LogScreen()         { return <Text>Log</Text> }
function CoursesScreen()     { return <Text>Courses</Text> }
function ProfileScreen()     { return <Text>Profile</Text> }
function LeaderboardScreen() { return <Text>Leaderboard</Text> }

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{
        tabBarStyle: { backgroundColor: '#0D1A0F', borderTopColor: '#C9A84C22' },
        tabBarActiveTintColor: '#C9A84C',
        tabBarInactiveTintColor: '#7A6E58',
        headerStyle: { backgroundColor: '#0D1A0F' },
        headerTintColor: '#F5EDD8',
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