import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UserProvider } from './src/contexts/UserContext';
import { ContactsProvider } from './src/contexts/ContactsContext';
import { DeathNoteProvider } from './src/contexts/DeathNoteContext';
import { ActivityProvider } from './src/contexts/ActivityContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import AppNavigator from './src/navigation/AppNavigator';
import { storageService } from './src/services/StorageService';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from './src/constants/theme';

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function initialize() {
      await storageService.isOnboardingComplete();
      setIsReady(true);
    }
    initialize();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <UserProvider>
          <ContactsProvider>
            <DeathNoteProvider>
              <ActivityProvider>
                <StatusBar style="light" />
                <AppNavigator />
              </ActivityProvider>
            </DeathNoteProvider>
          </ContactsProvider>
        </UserProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});