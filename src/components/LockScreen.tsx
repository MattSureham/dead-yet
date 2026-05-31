/**
 * LockScreen — PIN entry gate for the Dead Yet app.
 *
 * Rendered when SecurityContext.authState is 'unauthenticated' or 'locked_out'.
 * Provides a numeric keypad (0-9, delete) with visual PIN dots, failure
 * feedback, lockout countdown, and a "Forgot PIN?" recovery flow.
 *
 * ## States Handled
 *
 *   unauthenticated → Shows full keypad, accepts PIN entry
 *   locked_out       → Shows countdown timer instead of keypad
 *   (authenticated)  → Component is never rendered (SecurityGate hides it)
 *
 * ## Integration
 *
 *   - SecurityGate in App.tsx conditionally renders this or the main navigator
 *   - Calls useSecurity().unlock(pin) on PIN submit
 *   - Calls useSecurity().resetSecurity() on "Forgot PIN?" confirmation
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useSecurity } from '../contexts/SecurityContext';
import { storageService } from '../services/StorageService';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single PIN dot — filled or empty. */
function PinDot({ filled, error }: { filled: boolean; error: boolean }) {
  return (
    <View
      style={[
        styles.pinDot,
        filled && styles.pinDotFilled,
        error && styles.pinDotError,
      ]}
    />
  );
}

/** A single keypad button (0-9, delete, or blank spacer). */
function KeyButton({
  label,
  sublabel,
  onPress,
  disabled,
}: {
  label: string;
  sublabel?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.keyButton, disabled && styles.keyButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      accessibilityLabel={label}
    >
      <Text style={[styles.keyLabel, disabled && styles.keyLabelDisabled]}>
        {label}
      </Text>
      {sublabel ? <Text style={styles.keySublabel}>{sublabel}</Text> : null}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format seconds remaining into a human-readable countdown string. */
function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
  return s + 's';
}

/** Calculate seconds remaining until a given Date. */
function secondsUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function LockScreen() {
  const {
    authState,
    failedAttempts,
    lockoutUntil,
    unlock,
    resetSecurity,
  } = useSecurity();

  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showError, setShowError] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Shake animation for wrong PIN feedback
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Countdown timer for lockout state
  useEffect(() => {
    if (authState === 'locked_out' && lockoutUntil) {
      const update = () => {
        const sec = secondsUntil(lockoutUntil);
        setCountdown(sec);
      };
      update();
      const interval = setInterval(update, 500);
      return () => clearInterval(interval);
    }
  }, [authState, lockoutUntil]);

  // When lockout ends, clear state
  useEffect(() => {
    if (authState === 'unauthenticated') {
      setPin('');
      setShowError(false);
    }
  }, [authState]);

  // Reset error on typing
  useEffect(() => {
    if (pin.length > 0) setShowError(false);
  }, [pin]);

  // -------------------------------------------------------------------
  // Shake animation
  // -------------------------------------------------------------------

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // -------------------------------------------------------------------
  // Keypad handlers
  // -------------------------------------------------------------------

  const handleDigit = useCallback((digit: string) => {
    setPin((prev) => prev.length < 8 ? prev + digit : prev);
  }, []);

  const handleDelete = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (pin.length < 4 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const success = await unlock(pin);
      if (!success) {
        triggerShake();
        setShowError(true);
        setPin('');
      }
    } catch (err) {
      console.error('[LockScreen] unlock error:', err);
      triggerShake();
      setShowError(true);
      setPin('');
    } finally {
      setIsSubmitting(false);
    }
  }, [pin, isSubmitting, unlock, triggerShake]);

  const handleForgotPin = useCallback(() => {
    Alert.alert(
      'Forgot PIN?',
      'If you reset your PIN, all stored data (emergency contacts, death notes, settings) will be permanently deleted. You will need to set up the app again.\n\nAre you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await storageService.clear();
              await resetSecurity();
            } catch (err) {
              console.error('[LockScreen] reset error:', err);
              Alert.alert('Error', 'Failed to reset. Please try again.');
            }
          },
        },
      ],
      { cancelable: true },
    );
  }, [resetSecurity]);

  // Auto-submit when PIN reaches 4+ digits
  useEffect(() => {
    if (pin.length >= 4 && authState === 'unauthenticated') {
      handleSubmit();
    }
  }, [pin, handleSubmit, authState]);

  // -------------------------------------------------------------------
  // Keypad layout
  // -------------------------------------------------------------------

  const keypad = useMemo(() => {
    const keys: { label: string; sublabel?: string; onPress: () => void }[] = [
      { label: '1', onPress: () => handleDigit('1') },
      { label: '2', sublabel: 'ABC', onPress: () => handleDigit('2') },
      { label: '3', sublabel: 'DEF', onPress: () => handleDigit('3') },
      { label: '4', sublabel: 'GHI', onPress: () => handleDigit('4') },
      { label: '5', sublabel: 'JKL', onPress: () => handleDigit('5') },
      { label: '6', sublabel: 'MNO', onPress: () => handleDigit('6') },
      { label: '7', sublabel: 'PQRS', onPress: () => handleDigit('7') },
      { label: '8', sublabel: 'TUV', onPress: () => handleDigit('8') },
      { label: '9', sublabel: 'WXYZ', onPress: () => handleDigit('9') },
      { label: '', onPress: () => {} },
      { label: '0', onPress: () => handleDigit('0') },
      { label: '⌫', onPress: handleDelete },
    ];
    return keys;
  }, [handleDigit, handleDelete]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  const pinDots = [0, 1, 2, 3].map((i) => (
    <PinDot key={i} filled={pin.length > i} error={showError} />
  ));

  const isDisabled = isSubmitting || authState === 'locked_out';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{'🔒'}</Text>
        <Text style={styles.title}>Enter PIN</Text>
        {authState === 'locked_out' ? (
          <View style={styles.lockoutBanner}>
            <Text style={styles.lockoutText}>
              Too many attempts. Try again in {formatCountdown(countdown)}.
            </Text>
          </View>
        ) : (
          <Text style={styles.subtitle}>Enter your PIN to unlock the app</Text>
        )}
      </View>

      <Animated.View style={[styles.pinRow, { transform: [{ translateX: shakeAnim }] }]}>
        {pinDots}
      </Animated.View>

      {showError && (
        <Text style={styles.errorText}>
          {failedAttempts >= 8
            ? 'Wrong PIN — one more try before 30-minute lockout'
            : failedAttempts >= 5
              ? 'Wrong PIN — a few more tries before longer lockout'
              : failedAttempts >= 2
                ? 'Wrong PIN — try again'
                : 'Wrong PIN'}
        </Text>
      )}

      <View style={styles.keypad}>
        {keypad.map((key, i) => (
          <KeyButton
            key={i}
            label={key.label}
            sublabel={key.sublabel}
            onPress={key.onPress}
            disabled={isDisabled && key.label !== ''}
          />
        ))}
      </View>

      <View style={styles.bottom}>
        <TouchableOpacity onPress={handleForgotPin} disabled={isSubmitting}>
          <Text style={styles.forgotText}>Forgot PIN?</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  emoji: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  lockoutBanner: {
    backgroundColor: COLORS.danger + '22',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  lockoutText: {
    color: COLORS.danger,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  pinRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pinDotError: {
    borderColor: COLORS.danger,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZES.sm,
    marginTop: -SPACING.md,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  keypad: {
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  keyButton: {
    width: 90,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  keyButtonDisabled: {
    opacity: 0.3,
  },
  keyLabel: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    color: COLORS.text,
  },
  keyLabelDisabled: {
    color: COLORS.textMuted,
  },
  keySublabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: -2,
    letterSpacing: 1,
  },
  bottom: {
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  forgotText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
    textDecorationLine: 'underline',
  },
});