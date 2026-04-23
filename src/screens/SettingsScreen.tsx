import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useUser } from '../contexts/UserContext';
import { storageService } from '../services/StorageService';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

export default function SettingsScreen({ navigation }: Props) {
  const { profile, updateSettings } = useUser();

  const handleToggleNotifications = async () => {
    if (profile) {
      await updateSettings({ notificationsEnabled: !profile.settings.notificationsEnabled });
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Delete All Data',
      'This will permanently delete all your data including emergency contacts and Final Wishes & Instructions. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await storageService.clear();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Onboarding' }],
            });
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <TouchableOpacity style={styles.toggleItem} onPress={handleToggleNotifications}>
          <View>
            <Text style={styles.itemTitle}>Enable Notifications</Text>
            <Text style={styles.itemSubtitle}>Receive check-in reminders and alerts</Text>
          </View>
          <View style={[styles.toggle, profile?.settings.notificationsEnabled && styles.toggleOn]}>
            <View style={[styles.toggleKnob, profile?.settings.notificationsEnabled && styles.toggleKnobOn]} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Timers</Text>
        <View style={styles.infoItem}>
          <Text style={styles.itemTitle}>Inactivity Threshold</Text>
          <Text style={styles.itemValue}>{profile?.settings.inactivityThresholdDays || 3} days</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.itemTitle}>Confirmation Timeout</Text>
          <Text style={styles.itemValue}>{profile?.settings.confirmationTimeoutHours || 24} hours</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity style={styles.dangerItem} onPress={handleClearData}>
          <Text style={styles.dangerText}>Delete All Data</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Dead Yet v1.0.0</Text>
        <Text style={styles.footerSubtext}>May you live long and prosper 🖖</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg },
  header: { marginBottom: SPACING.xl },
  title: { fontSize: FONT_SIZES.xxl, fontWeight: 'bold', color: COLORS.text },
  section: { marginBottom: SPACING.xl },
  sectionTitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginBottom: SPACING.md, textTransform: 'uppercase', letterSpacing: 1 },
  toggleItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md },
  itemTitle: { color: COLORS.text, fontSize: FONT_SIZES.md },
  itemSubtitle: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, marginTop: 2 },
  itemValue: { color: COLORS.primary, fontSize: FONT_SIZES.md },
  toggle: { width: 50, height: 30, borderRadius: 15, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', padding: 2 },
  toggleOn: { backgroundColor: COLORS.primary },
  toggleKnob: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.text, alignSelf: 'flex-start' },
  toggleKnobOn: { alignSelf: 'flex-end' },
  infoItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm },
  dangerItem: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, alignItems: 'center' },
  dangerText: { color: COLORS.danger, fontSize: FONT_SIZES.md },
  footer: { alignItems: 'center', padding: SPACING.xl },
  footerText: { color: COLORS.textMuted, fontSize: FONT_SIZES.sm },
  footerSubtext: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, marginTop: SPACING.xs },
});