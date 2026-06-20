import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UserProvider } from './src/contexts/UserContext';
import { ContactsProvider } from './src/contexts/ContactsContext';
import { DeathNoteProvider } from './src/contexts/DeathNoteContext';
import { ActivityProvider } from './src/contexts/ActivityContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { SecurityProvider, activePinHashRef } from './src/contexts/SecurityContext';
import SecurityGate from './src/components/SecurityGate';
import AppNavigator, { navigationRef } from './src/navigation/AppNavigator';
import { storageService } from './src/services/StorageService';
import { notificationService } from './src/services/NotificationService';
import { aliveMonitorService } from './src/services/AliveMonitorService';
import { emergencyService } from './src/services/EmergencyService';
import { COLORS } from './src/constants/theme';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);

  useEffect(() => {
    async function initialize() {
      try {
        const complete = await storageService.isOnboardingComplete();
        setIsOnboardingComplete(complete);
      } catch (err) {
        console.error('[App] Init error:', err);
      } finally {
        setIsReady(true);
      }
    }
    initialize();
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setIsOnboardingComplete(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Dead man's switch — connects AliveMonitorService to EmergencyService
  // ---------------------------------------------------------------------------
  //
  // This is the critical wiring that makes the dead man's switch actually work.
  // The AliveMonitorService state machine (active → quiet → silent → presumed_dead)
  // drives real-world actions: notifications, emergency calls, and death note
  // revelations through EmergencyService.
  //
  // The listener is registered once onboarding is complete and persists for the
  // lifetime of the app. It also re-evaluates the alive status whenever the app
  // returns to the foreground, so the state machine can progress even without
  // manual check-ins.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isReady || !isOnboardingComplete) return;

    // ---- Status-change listener ----
    // Fires whenever the AliveMonitorService state machine transitions to a
    // new state (e.g., active → quiet, silent → presumed_dead).
    const unsubMonitor = aliveMonitorService.onStatusChange((status) => {
      switch (status.state) {
        case 'silent': {
          // User has been inactive beyond the silent threshold.
          // Schedule a confirmation-timeout notification — if they don't
          // respond within the configured timeout, the cascade escalates.
          notificationService.scheduleConfirmationTimeout().catch((err) => {
            console.error('[App] Failed to schedule confirmation timeout:', err);
          });
          break;
        }

        case 'presumed_dead': {
          // User has exceeded all thresholds. Trigger the full death sequence:
          // 1. Clear browser history (webhook)
          // 2. Call emergency contacts in priority order
          // 3. Reveal encrypted death notes to contacts
          // The activePinHashRef provides the decryption key if the user is
          // currently authenticated (or was recently authed — the ref persists
          // until the next lock or app restart).
          const pinHash = activePinHashRef.current ?? undefined;
          emergencyService.runFullDeathSequence(pinHash).catch((err) => {
            console.error('[App] Full death sequence failed:', err);
          });
          break;
        }

        default:
          // active / quiet — no action needed
          break;
      }
    });

    // ---- Foreground evaluation ----
    // When the app returns to the foreground, re-evaluate the alive status.
    // This ensures the state machine progresses even if the user hasn't
    // manually checked in for a while (e.g., background fetch not available).
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        aliveMonitorService.evaluate().catch((err) => {
          console.error('[App] Foreground evaluate failed:', err);
        });
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // ---- Initial evaluation ----
    // Run immediately so the state machine is primed with the user's
    // current activity status on app launch.
    aliveMonitorService.evaluate().catch((err) => {
      console.error('[App] Initial evaluate failed:', err);
    });

    // ---- Cleanup ----
    return () => {
      unsubMonitor();
      appStateSub.remove();
    };
  }, [isReady, isOnboardingComplete]);

  // ---------------------------------------------------------------------------
  // Notification response handler — dispatches notification taps
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const subscription = notificationService.addNotificationResponseListener((response) => {
      const type = response.notification?.request?.content?.data?.type as string | undefined;

      switch (type) {
        case 'inactivity_check':
          // User tapped a "still alive?" notification — record a check-in
          aliveMonitorService.checkIn().catch((err) => {
            console.error('[App] Auto check-in from notification failed:', err);
          });
          // Navigate to Home so they see confirmation
          if (navigationRef.isReady()) {
            navigationRef.navigate('Home');
          }
          break;

        case 'confirmation_timeout':
          // User tapped the emergency warning — navigate to Home
          if (navigationRef.isReady()) {
            navigationRef.navigate('Home');
          }
          break;

        case 'emergency':
          // User tapped the final emergency notification — navigate to Home
          if (navigationRef.isReady()) {
            navigationRef.navigate('Home');
          }
          break;

        default:
          // Unknown notification type — navigate to Home as fallback
          if (navigationRef.isReady()) {
            navigationRef.navigate('Home');
          }
          break;
      }
    });

    return () => {
      subscription.remove();
    };
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
        <SecurityProvider>
          <SecurityGate>
            <UserProvider>
              <ContactsProvider>
                <DeathNoteProvider>
                  <ActivityProvider>
                    <StatusBar style="light" />
                    <AppNavigator
                      isOnboardingComplete={isOnboardingComplete}
                      onOnboardingComplete={handleOnboardingComplete}
                    />
                  </ActivityProvider>
                </DeathNoteProvider>
              </ContactsProvider>
            </UserProvider>
          </SecurityGate>
        </SecurityProvider>
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
