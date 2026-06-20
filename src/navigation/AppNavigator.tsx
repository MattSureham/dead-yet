import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { COLORS } from '../constants/theme';

import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import ActivityScreen from '../screens/ActivityScreen';
import EmergencyContactsScreen from '../screens/EmergencyContactsScreen';
import DeathNoteScreen from '../screens/DeathNoteScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Exported navigation ref so that notification response handlers
 * (in App.tsx) can navigate without being inside the React tree.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

interface Props {
  /** When true, skip onboarding and show Home. Checked via storageService at app init. */
  isOnboardingComplete?: boolean;
  /** Called when the onboarding flow persists its completion flag. */
  onOnboardingComplete?: () => void;
}

export default function AppNavigator({
  isOnboardingComplete = false,
  onOnboardingComplete,
}: Props) {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={isOnboardingComplete ? 'Home' : 'Onboarding'}
        screenOptions={{
          headerStyle: {
            backgroundColor: COLORS.background,
          },
          headerTintColor: COLORS.text,
          headerTitleStyle: {
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: COLORS.background,
          },
        }}
      >
        <Stack.Screen name="Onboarding" options={{ headerShown: false }}>
          {(props) => <OnboardingScreen {...props} onOnboardingComplete={onOnboardingComplete} />}
        </Stack.Screen>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Dead Yet?', headerShown: false }}
        />
        <Stack.Screen name="Activity" component={ActivityScreen} options={{ title: 'Activity' }} />
        <Stack.Screen
          name="EmergencyContacts"
          component={EmergencyContactsScreen}
          options={{ title: 'Emergency Contacts' }}
        />
        <Stack.Screen
          name="DeathNote"
          component={DeathNoteScreen}
          options={{ title: 'Final Wishes & Instructions' }}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
