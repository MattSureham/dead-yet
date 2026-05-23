import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useUser } from '../contexts/UserContext';
import { useActivity } from '../contexts/ActivityContext';
import { formatDuration, daysBetween } from '../utils/format';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: Props) {
  const { profile, confirmAlive } = useUser();
  const { todayScreenTime, manualCheckIn, refresh } = useActivity();
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  const getDaysSinceActivity = () => {
    if (!profile?.lastActivityAt) return 0;
    const last = new Date(profile.lastActivityAt);
    const now = new Date();
    return daysBetween(last, now);
  };

  /** Handle the "I'm Alive" tap with feedback. */
  const handleCheckIn = async () => {
    setIsCheckingIn(true);
    try {
      await manualCheckIn();
      await confirmAlive();
      Alert.alert(
        '✓ Check-in recorded',
        `You're confirmed alive as of ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. We'll check again soon.`,
        [{ text: 'OK' }],
      );
    } catch (err) {
      console.error('[HomeScreen] Check-in error:', err);
      Alert.alert('Error', 'Failed to record check-in. Please try again.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const days = getDaysSinceActivity();
  const isAtRisk = days >= 2;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{days >= 3 ? '😰' : days >= 2 ? '😟' : '😊'}</Text>
        {profile?.name ? (
          <Text style={styles.greeting}>Hey, {profile.name}</Text>
        ) : null}
        <Text style={styles.title}>
          {days >= 3 ? 'Are you alive?' : days >= 2 ? 'Getting quiet...' : 'All good!'}
        </Text>
        {profile?.lastActivityAt && (
          <Text style={styles.lastActivity}>
            Last activity: {days === 0 ? 'Today' : `${days} day${days > 1 ? 's' : ''} ago`}
          </Text>
        )}
      </View>

      <View style={styles.statsContainer}>
        <View style={[styles.statCard, isAtRisk && styles.statCardWarning]}>
          <Text style={styles.statValue}>{days}</Text>
          <Text style={styles.statLabel}>Days Silent</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatDuration(todayScreenTime)}</Text>
          <Text style={styles.statLabel}>Screen Time Today</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.checkInButton, isCheckingIn && styles.checkInButtonDisabled]}
        onPress={handleCheckIn}
        disabled={isCheckingIn}
      >
        <Text style={styles.checkInText}>
          {isCheckingIn ? 'Recording...' : '✓ I\'m Alive!'}
        </Text>
      </TouchableOpacity>

      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Activity')}>
          <Text style={styles.menuIcon}>📱</Text>
          <Text style={styles.menuText}>Activity</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('EmergencyContacts')}>
          <Text style={styles.menuIcon}>📞</Text>
          <Text style={styles.menuText}>Emergency Contacts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('DeathNote')}>
          <Text style={styles.menuIcon}>📝</Text>
          <Text style={styles.menuText}>Final Wishes & Instructions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.menuIcon}>⚙️</Text>
          <Text style={styles.menuText}>Settings</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  emoji: {
    fontSize: 64,
    marginBottom: SPACING.md,
  },
  greeting: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  lastActivity: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  statCardWarning: {
    borderColor: COLORS.warning,
    borderWidth: 2,
  },
  statValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  checkInButton: {
    backgroundColor: COLORS.success,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  checkInButtonDisabled: {
    opacity: 0.6,
  },
  checkInText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
  },
  menuContainer: {
    gap: SPACING.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  menuIcon: {
    fontSize: 24,
    marginRight: SPACING.md,
  },
  menuText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
});