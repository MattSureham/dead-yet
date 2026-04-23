import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useUser } from '../contexts/UserContext';
import { useActivity } from '../contexts/ActivityContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: Props) {
  const { profile } = useUser();
  const { todayScreenTime, manualCheckIn, refresh } = useActivity();

  useEffect(() => {
    refresh();
  }, []);

  const getDaysSinceActivity = () => {
    if (!profile?.lastActivityAt) return 0;
    const last = new Date(profile.lastActivityAt);
    const now = new Date();
    const diff = now.getTime() - last.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const days = getDaysSinceActivity();
  const isAtRisk = days >= 2;

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{days >= 3 ? '😰' : days >= 2 ? '😟' : '😊'}</Text>
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
          <Text style={styles.statValue}>{formatTime(todayScreenTime)}</Text>
          <Text style={styles.statLabel}>Screen Time Today</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.checkInButton} onPress={manualCheckIn}>
        <Text style={styles.checkInText}>✓ I'm Alive!</Text>
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