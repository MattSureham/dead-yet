/**
 * SecurityGate — Auth gate that sits inside <SecurityProvider>.
 *
 * Reads the SecurityContext auth state and decides what to render:
 *
 *   - 'not_setup'       → children (OnboardingScreen handles PIN setup)
 *   - 'unauthenticated'  → <LockScreen /> (user must enter PIN)
 *   - 'locked_out'       → <LockScreen /> (shows countdown)
 *   - 'authenticated'    → children (app is accessible)
 *
 * During initial SecurityContext load (isLoading), shows a branded splash
 * screen so the user never sees an unauthenticated flash of content.
 */

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useSecurity } from '../contexts/SecurityContext';
import { COLORS, FONT_SIZES, SPACING } from '../constants/theme';
import LockScreen from './LockScreen';

interface Props {
  children: React.ReactNode;
}

export default function SecurityGate({ children }: Props) {
  const { authState, isLoading } = useSecurity();

  // -------- Loading state --------
  if (isLoading) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashEmoji}>💀</Text>
        <Text style={styles.splashTitle}>Dead Yet?</Text>
        <ActivityIndicator
          size="small"
          color={COLORS.primary}
          style={styles.splashLoader}
        />
      </View>
    );
  }

  // -------- No PIN set — let onboarding handle it --------
  if (authState === 'not_setup') {
    return <>{children}</>;
  }

  // -------- Locked or unauthenticated — show PIN entry --------
  if (authState === 'unauthenticated' || authState === 'locked_out') {
    return <LockScreen />;
  }

  // -------- Authenticated — show the app --------
  return <>{children}</>;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashEmoji: {
    fontSize: 64,
    marginBottom: SPACING.md,
  },
  splashTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  splashLoader: {
    marginTop: SPACING.md,
  },
});
