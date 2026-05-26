import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useUser } from '../contexts/UserContext';
import { useSecurity } from '../contexts/SecurityContext';
import { storageService } from '../services/StorageService';
import { notificationService } from '../services/NotificationService';
import { isValidPin, pinStrength } from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;
};

/**
 * Multi-step onboarding wizard.
 *
 * Step 0 — Welcome intro.
 * Step 1 — Collect the user's name and create the profile.
 * Step 2 — Set a PIN via SecurityContext so the auth state machine is properly
 *          initialised (authenticated, auto-lock active, etc.).
 */
export default function OnboardingScreen({ navigation }: Props) {
  const { updateProfile } = useUser();
  const { setupPin } = useSecurity();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** Compute PIN strength for visual feedback — memoised to avoid re-renders. */
  const strength = useMemo(() => (pin.length > 0 ? pinStrength(pin) : null), [pin]);

  const handleNext = async () => {
    if (step === 0) {
      setStep(1);
    } else if (step === 1) {
      if (!name.trim()) {
        Alert.alert('Error', 'Please enter your name');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!isValidPin(pin)) {
        Alert.alert('Weak PIN', 'Please enter a PIN that is at least 4 digits and not a simple sequence like 1234 or 1111.');
        return;
      }

      setIsSubmitting(true);
      try {
        // Request notification permissions early so reminders work from day 1
        await notificationService.requestPermissions();

        // Create the profile *before* setupPin so SecurityContext can attach pinHash
        await updateProfile({ name: name.trim() });

        // Wire into the SecurityContext state machine: hashes the PIN,
        // stores it in the profile, and transitions to 'authenticated'.
        await setupPin(pin);
        await storageService.setOnboardingComplete(true);

        navigation.replace('Home');
      } catch (err) {
        console.error('[Onboarding] Setup failed:', err);
        Alert.alert('Error', 'Something went wrong during setup. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.emoji}>💀</Text>
            <Text style={styles.title}>Dead Yet?</Text>
            <Text style={styles.subtitle}>
              An app that monitors your daily activity and checks in on you.{'\n'}
              If you don&apos;t respond... we alert your emergency contacts.
            </Text>
            <TouchableOpacity style={styles.button} onPress={handleNext}>
              <Text style={styles.buttonText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepLabel}>Step 1 of 2</Text>
            <Text style={styles.title}>Who are you?</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <TouchableOpacity style={styles.button} onPress={handleNext}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepLabel}>Step 2 of 2</Text>
            <Text style={styles.title}>Create a PIN</Text>
            <Text style={styles.subtitle}>
              This PIN protects your Final Wishes &amp; Instructions. You&apos;ll need it to access them later.
            </Text>
            <TextInput
              style={[styles.input, pin.length > 0 && strength === 'weak' && styles.inputError]}
              placeholder="4+ digit PIN"
              placeholderTextColor={COLORS.textMuted}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
            />

            {/* PIN strength indicator */}
            {pin.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBars}>
                  <View
                    style={[
                      styles.strengthBar,
                      { backgroundColor: strength === 'weak' ? COLORS.danger : strength === 'medium' ? COLORS.warning : COLORS.success },
                    ]}
                  />
                  <View
                    style={[
                      styles.strengthBar,
                      { backgroundColor: strength === 'medium' ? COLORS.warning : strength === 'strong' ? COLORS.success : COLORS.surfaceLight },
                    ]}
                  />
                  <View
                    style={[
                      styles.strengthBar,
                      { backgroundColor: strength === 'strong' ? COLORS.success : COLORS.surfaceLight },
                    ]}
                  />
                </View>
                {strength && (
                  <Text style={[styles.strengthLabel, { color: strength === 'weak' ? COLORS.danger : strength === 'medium' ? COLORS.warning : COLORS.success }]}>
                    {strength === 'weak' ? 'Weak PIN — avoid sequences like 1234' : strength === 'medium' ? 'Medium strength' : 'Strong PIN'}
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handleNext}
              disabled={isSubmitting}
            >
              <Text style={styles.buttonText}>
                {isSubmitting ? 'Setting up...' : 'Complete Setup'}
              </Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>{renderStep()}</ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  stepContainer: {
    alignItems: 'center',
  },
  stepLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.sm,
  },
  emoji: {
    fontSize: 80,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 24,
  },
  input: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  /** PIN strength indicator — three-segment strength bar */
  strengthContainer: {
    width: '100%',
    marginBottom: SPACING.lg,
    alignItems: 'center',
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  strengthBar: {
    width: 48,
    height: 6,
    borderRadius: 3,
  },
  strengthLabel: {
    fontSize: FONT_SIZES.xs,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    width: '100%',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
  },
});