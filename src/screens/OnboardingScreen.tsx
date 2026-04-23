import React, { useState } from 'react';
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
import { useContacts } from '../contexts/ContactsContext';
import { notificationService } from '../services/NotificationService';
import { v4 as uuidv4 } from 'uuid';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;
};

export default function OnboardingScreen({ navigation }: Props) {
  const { updateProfile } = useUser();
  const { addContact } = useContacts();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');

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
      if (pin.length < 4) {
        Alert.alert('Error', 'PIN must be at least 4 digits');
        return;
      }
      await notificationService.requestPermissions();
      await updateProfile({
        id: uuidv4(),
        createdAt: new Date(),
        lastActivityAt: new Date(),
        isConfirmedAlive: true,
        lastConfirmedAt: new Date(),
        settings: {
          inactivityThresholdDays: 3,
          confirmationTimeoutHours: 24,
          notificationsEnabled: true,
          pinHash: pin,
        },
      });
      navigation.replace('Home');
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
              If you don't respond... we alert your emergency contacts.
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
              This PIN protects your Final Wishes & Instructions. You'll need it to access them later.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="4+ digit PIN"
              placeholderTextColor={COLORS.textMuted}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
            />
            <TouchableOpacity style={styles.button} onPress={handleNext}>
              <Text style={styles.buttonText}>Complete Setup</Text>
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
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
  },
});