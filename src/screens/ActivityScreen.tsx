import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useActivity } from '../contexts/ActivityContext';
import { formatDuration } from '../utils/format';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Activity'>;
};

/** Compute day labels for the last 7 days, ending with today. */
function getLast7DayLabels(): string[] {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayIndex = new Date().getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const idx = (todayIndex - 6 + i + 7) % 7;
    return dayNames[idx];
  });
}

export default function ActivityScreen({ navigation: _navigation }: Props) {
  const { todayScreenTime, weeklyScreenTime, appUsage, manualCheckIn, refresh } = useActivity();
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const maxWeekly = Math.max(...weeklyScreenTime, 1);
  const dayLabels = getLast7DayLabels();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.subtitle}>Track your daily habits</Text>
      </View>

      <View style={styles.todayCard}>
        <Text style={styles.cardLabel}>Today&apos;s Screen Time</Text>
        <Text style={styles.todayValue}>{formatDuration(todayScreenTime)}</Text>
        <TouchableOpacity
          style={[styles.checkInButton, isCheckingIn && styles.checkInButtonDisabled]}
          onPress={async () => {
            if (isCheckingIn) return;
            setIsCheckingIn(true);
            try {
              await manualCheckIn();
            } finally {
              setIsCheckingIn(false);
            }
          }}
          disabled={isCheckingIn}
        >
          <Text style={styles.checkInText}>
            {isCheckingIn ? 'Checking in...' : '✓ Manual Check-in'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This Week</Text>
        <View style={styles.chartContainer}>
          {weeklyScreenTime.map((minutes, index) => {
            const height = (minutes / maxWeekly) * 100;
            return (
              <View key={index} style={styles.barContainer}>
                <View style={[styles.bar, { height: `${Math.max(height, 5)}%` }]} />
                <Text style={styles.barLabel}>{dayLabels[index]}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Usage</Text>
        {appUsage.length === 0 ? (
          <Text style={styles.emptyText}>No app usage data yet</Text>
        ) : (
          appUsage.slice(0, 5).map((app, index) => (
            <View key={index} style={styles.appItem}>
              <Text style={styles.appName}>{app.appName}</Text>
              <Text style={styles.appTime}>{formatDuration(app.totalMinutes)}</Text>
            </View>
          ))
        )}
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
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  todayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  cardLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  todayValue: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginVertical: SPACING.md,
  },
  checkInButton: {
    backgroundColor: COLORS.primaryDark,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
  },
  checkInButtonDisabled: {
    opacity: 0.5,
  },
  checkInText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    height: 120,
  },
  barContainer: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    width: 24,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.sm,
    minHeight: 4,
  },
  barLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  appItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  appName: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  appTime: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    padding: SPACING.lg,
  },
});