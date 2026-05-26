import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useUser } from '../contexts/UserContext';
import { useSecurity } from '../contexts/SecurityContext';
import { storageService } from '../services/StorageService';
import { backupService } from '../services/BackupService';
import { isValidUrl, isValidPin, pinStrength } from '../utils/validation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INACTIVITY_OPTIONS = [1, 2, 3, 5, 7, 14];
const TIMEOUT_OPTIONS = [1, 3, 6, 12, 24, 48];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Render a row of selectable preset chips. */
function ChipSelector({
  options,
  selected,
  unit,
  onSelect,
}: {
  options: number[];
  selected: number;
  unit: string;
  onSelect: (value: number) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const active = opt === selected;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(opt)}
            accessibilityLabel={`${opt} ${unit}`}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {opt}
              <Text style={[styles.chipUnit, active && styles.chipTextActive]}>
                {' '}{unit}
              </Text>
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SettingsScreen({ navigation }: Props) {
  const { profile, updateSettings } = useUser();
  const { changePin, resetSecurity, getPinHash } = useSecurity();

  // ---- Backup state ----
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importBlob, setImportBlob] = useState('');

  // Load last backup time
  useEffect(() => {
    backupService.getLastBackupTime().then(setLastBackupAt);
  }, []);

  // ---- Backup handlers ----

  const handleExportBackup = async () => {
    const pinHash = getPinHash();
    if (!pinHash) {
      Alert.alert('Error', 'You must be authenticated to export a backup.');
      return;
    }
    setIsExporting(true);
    try {
      const blob = await backupService.exportBackup(pinHash);
      await Share.share({ message: blob, title: 'Dead Yet Backup' });
      const now = new Date();
      setLastBackupAt(now);
      Alert.alert('Backup Exported', 'Your encrypted backup has been shared.');
    } catch (err) {
      console.error('[Settings] Export backup error:', err);
      Alert.alert('Error', 'Failed to export backup. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportBackup = async () => {
    if (!importBlob.trim()) {
      Alert.alert('Missing Data', 'Please paste your backup blob first.');
      return;
    }
    const pinHash = getPinHash();
    if (!pinHash) {
      Alert.alert('Error', 'You must be authenticated to import a backup.');
      return;
    }
    try {
      const summary = await backupService.importBackup(importBlob.trim(), pinHash);
      const parts = [
        summary.profile ? '✓ Profile restored' : '— No profile in backup',
        `✓ ${summary.contacts} contact${summary.contacts !== 1 ? 's' : ''} restored`,
        summary.deathNote ? '✓ Death note restored' : '— No death note in backup',
        `✓ ${summary.activityLogs} activity log${summary.activityLogs !== 1 ? 's' : ''} restored`,
      ];
      Alert.alert('Backup Restored', parts.join('\n'));
      setShowImportDialog(false);
      setImportBlob('');
      const now = new Date();
      setLastBackupAt(now);
    } catch (err) {
      console.error('[Settings] Import backup error:', err);
      Alert.alert('Error', 'Failed to import backup. The blob may be corrupt or the PIN may not match.');
    }
  };

  const formatLastBackup = (date: Date | null): string => {
    if (!date) return 'Never';
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // ---- Webhook state ----
  const [webhookUrl, setWebhookUrl] = useState(
    profile?.settings?.historyClearWebhook || '',
  );

  // ---- PIN change state ----
  const [showPinChange, setShowPinChange] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);

  // ---- Memoised validation ----
  const webhookError = useMemo(() => {
    if (!webhookUrl.trim()) return null;
    return isValidUrl(webhookUrl.trim()) ? null : 'Must start with https:// and be a valid URL';
  }, [webhookUrl]);

  const newPinStrength = useMemo(
    () => (newPin.length > 0 ? pinStrength(newPin) : null),
    [newPin],
  );

  // ---- Handlers ----

  const handleToggleNotifications = async () => {
    if (profile) {
      await updateSettings({
        notificationsEnabled: !profile.settings.notificationsEnabled,
      });
    }
  };

  const handleSetInactivity = async (days: number) => {
    await updateSettings({ inactivityThresholdDays: days });
  };

  const handleSetTimeout = async (hours: number) => {
    await updateSettings({ confirmationTimeoutHours: hours });
  };

  const handleSaveWebhook = async () => {
    if (webhookUrl.trim() && !isValidUrl(webhookUrl.trim())) {
      Alert.alert('Invalid URL', 'Please enter a valid URL starting with https://');
      return;
    }
    await updateSettings({ historyClearWebhook: webhookUrl.trim() });
    Alert.alert('Saved', 'History clear webhook URL saved.');
  };

  const handleChangePin = async () => {
    if (!oldPin.trim() || !newPin.trim()) {
      Alert.alert('Missing Fields', 'Please enter both your old and new PIN.');
      return;
    }
    if (!isValidPin(newPin)) {
      Alert.alert(
        'Weak PIN',
        'Please enter a PIN that is at least 4 digits and not a simple sequence like 1234 or 1111.',
      );
      return;
    }
    if (oldPin === newPin) {
      Alert.alert('Same PIN', 'Your new PIN must be different from your old PIN.');
      return;
    }

    setIsChangingPin(true);
    try {
      const success = await changePin(oldPin, newPin);
      if (success) {
        Alert.alert('PIN Changed', 'Your PIN has been updated successfully.');
        setShowPinChange(false);
        setOldPin('');
        setNewPin('');
      } else {
        Alert.alert('Wrong PIN', 'Your old PIN is incorrect. Please try again.');
        setOldPin('');
      }
    } catch (err) {
      console.error('[Settings] PIN change error:', err);
      Alert.alert('Error', 'Failed to change PIN. Please try again.');
    } finally {
      setIsChangingPin(false);
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
            await resetSecurity();
            await storageService.clear();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Onboarding' }],
            });
          },
        },
      ],
    );
  };

  // ---- Derived values ----

  const currentInactivity = profile?.settings.inactivityThresholdDays ?? 3;
  const currentTimeout = profile?.settings.confirmationTimeoutHours ?? 24;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* ================================================================ */}
        {/*  NOTIFICATIONS                                                    */}
        {/* ================================================================ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <TouchableOpacity
            style={styles.toggleItem}
            onPress={handleToggleNotifications}
          >
            <View style={styles.toggleInfo}>
              <Text style={styles.itemTitle}>Enable Notifications</Text>
              <Text style={styles.itemSubtitle}>
                Receive check-in reminders and alerts
              </Text>
            </View>
            <View
              style={[
                styles.toggle,
                profile?.settings.notificationsEnabled && styles.toggleOn,
              ]}
            >
              <View
                style={[
                  styles.toggleKnob,
                  profile?.settings.notificationsEnabled && styles.toggleKnobOn,
                ]}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* ================================================================ */}
        {/*  TIMERS — now editable                                            */}
        {/* ================================================================ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timers</Text>

          <View style={styles.pickerCard}>
            <Text style={styles.pickerLabel}>Inactivity Threshold</Text>
            <Text style={styles.pickerDescription}>
              Days of no activity before we start checking in
            </Text>
            <ChipSelector
              options={INACTIVITY_OPTIONS}
              selected={currentInactivity}
              unit="days"
              onSelect={handleSetInactivity}
            />
          </View>

          <View style={styles.pickerCard}>
            <Text style={styles.pickerLabel}>Confirmation Timeout</Text>
            <Text style={styles.pickerDescription}>
              Hours to respond before emergency contacts are alerted
            </Text>
            <ChipSelector
              options={TIMEOUT_OPTIONS}
              selected={currentTimeout}
              unit="hours"
              onSelect={handleSetTimeout}
            />
          </View>
        </View>

        {/* ================================================================ */}
        {/*  SECURITY — PIN change                                            */}
        {/* ================================================================ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>

          {!showPinChange ? (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setShowPinChange(true)}
            >
              <Text style={styles.menuIcon}>🔑</Text>
              <View style={styles.menuInfo}>
                <Text style={styles.itemTitle}>Change PIN</Text>
                <Text style={styles.itemSubtitle}>
                  Update your app lock PIN
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Change PIN</Text>

              <TextInput
                style={styles.input}
                placeholder="Old PIN"
                placeholderTextColor={COLORS.textMuted}
                value={oldPin}
                onChangeText={setOldPin}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
              />

              <TextInput
                style={[
                  styles.input,
                  newPin.length > 0 &&
                    newPinStrength === 'weak' &&
                    styles.inputError,
                ]}
                placeholder="New PIN (4+ digits)"
                placeholderTextColor={COLORS.textMuted}
                value={newPin}
                onChangeText={setNewPin}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
              />

              {/* PIN strength indicator (reused pattern from Onboarding) */}
              {newPin.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBars}>
                    <View
                      style={[
                        styles.strengthBar,
                        {
                          backgroundColor:
                            newPinStrength === 'weak'
                              ? COLORS.danger
                              : newPinStrength === 'medium'
                                ? COLORS.warning
                                : COLORS.success,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.strengthBar,
                        {
                          backgroundColor:
                            newPinStrength === 'medium'
                              ? COLORS.warning
                              : newPinStrength === 'strong'
                                ? COLORS.success
                                : COLORS.surfaceLight,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.strengthBar,
                        {
                          backgroundColor:
                            newPinStrength === 'strong'
                              ? COLORS.success
                              : COLORS.surfaceLight,
                        },
                      ]}
                    />
                  </View>
                  {newPinStrength && (
                    <Text
                      style={[
                        styles.strengthLabel,
                        {
                          color:
                            newPinStrength === 'weak'
                              ? COLORS.danger
                              : newPinStrength === 'medium'
                                ? COLORS.warning
                                : COLORS.success,
                        },
                      ]}
                    >
                      {newPinStrength === 'weak'
                        ? 'Weak PIN — avoid sequences like 1234'
                        : newPinStrength === 'medium'
                          ? 'Medium strength'
                          : 'Strong PIN'}
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setShowPinChange(false);
                    setOldPin('');
                    setNewPin('');
                  }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    isChangingPin && styles.buttonDisabled,
                  ]}
                  onPress={handleChangePin}
                  disabled={isChangingPin}
                >
                  <Text style={styles.saveText}>
                    {isChangingPin ? 'Updating...' : 'Update PIN'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ================================================================ */}
        {/*  BROWSER HISTORY                                                  */}
        {/* ================================================================ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Browser History Clearing</Text>
          <Text style={styles.sectionSubtitle}>
            When you&apos;re confirmed dead, this webhook is called to clear your
            browser history. Requires the &quot;Dead Yet&quot; browser extension.
          </Text>
          <TextInput
            style={[styles.input, webhookError && styles.inputError]}
            placeholder="https://your-webhook-url.com/clear"
            placeholderTextColor={COLORS.textMuted}
            value={webhookUrl}
            onChangeText={setWebhookUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {webhookError && (
            <Text style={styles.errorText}>{webhookError}</Text>
          )}
          <TouchableOpacity
            style={[styles.saveButton, webhookError && styles.buttonDisabled]}
            onPress={handleSaveWebhook}
            disabled={!!webhookError}
          >
            <Text style={styles.saveButtonText}>Save Webhook URL</Text>
          </TouchableOpacity>
        </View>

        {/* ================================================================ */}
        {/*  BACKUP & RESTORE                                                 */}
        {/* ================================================================ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backup & Restore</Text>
          <Text style={styles.sectionSubtitle}>
            Export your encrypted data to share across devices, or restore from
            a previous backup. Data is encrypted with your PIN.
          </Text>
          <Text style={styles.lastBackupText}>
            Last backup: {formatLastBackup(lastBackupAt)}
          </Text>
          <TouchableOpacity
            style={[styles.backupButton, isExporting && styles.buttonDisabled]}
            onPress={handleExportBackup}
            disabled={isExporting}
          >
            <Text style={styles.backupButtonText}>
              {isExporting ? 'Exporting...' : '📤 Export Encrypted Backup'}
            </Text>
          </TouchableOpacity>
          {!showImportDialog ? (
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={() => setShowImportDialog(true)}
            >
              <Text style={styles.restoreButtonText}>📥 Import Backup</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.importCard}>
              <Text style={styles.importLabel}>Paste your backup blob below:</Text>
              <TextInput
                style={[styles.input, styles.importInput]}
                placeholder="DBv1:..."
                placeholderTextColor={COLORS.textMuted}
                value={importBlob}
                onChangeText={setImportBlob}
                multiline
                numberOfLines={3}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.importButtons}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setShowImportDialog(false);
                    setImportBlob('');
                  }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleImportBackup}>
                  <Text style={styles.saveText}>Restore</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ================================================================ */}
        {/*  ACCOUNT                                                          */}
        {/* ================================================================ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.dangerItem} onPress={handleClearData}>
            <Text style={styles.dangerText}>Delete All Data</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Dead Yet v1.0.0</Text>
          <Text style={styles.footerSubtext}>
            May you live long and prosper 🖖
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },

  // Header
  header: { marginBottom: SPACING.xl },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
  },

  // Sections
  section: { marginBottom: SPACING.xl },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },

  // Toggle
  toggleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  toggleInfo: { flex: 1, marginRight: SPACING.md },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    padding: 2,
  },
  toggleOn: { backgroundColor: COLORS.primary },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.text,
    alignSelf: 'flex-start',
  },
  toggleKnobOn: { alignSelf: 'flex-end' },

  // Timer pickers
  pickerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  pickerLabel: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    marginBottom: 2,
  },
  pickerDescription: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
  },

  // Chip selector
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: COLORS.text,
  },
  chipUnit: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },

  // Menu item
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  menuIcon: {
    fontSize: 24,
    marginRight: SPACING.md,
  },
  menuInfo: { flex: 1 },
  chevron: {
    fontSize: 24,
    color: COLORS.textMuted,
    marginLeft: SPACING.sm,
  },

  // Typography
  itemTitle: { color: COLORS.text, fontSize: FONT_SIZES.md },
  itemSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginTop: 2,
  },

  // Form card (PIN change)
  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  formTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },

  // Inputs
  input: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZES.xs,
    marginBottom: SPACING.sm,
    marginTop: -SPACING.xs,
  },

  // PIN strength indicator
  strengthContainer: {
    marginBottom: SPACING.md,
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

  // Buttons
  formButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  cancelBtn: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
  },
  cancelText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
  },
  saveBtn: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
  },
  saveText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  buttonDisabled: { opacity: 0.6 },

  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },

  // Danger
  dangerItem: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
  },
  dangerText: { color: COLORS.danger, fontSize: FONT_SIZES.md },

  // Backup
  lastBackupText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
  },
  backupButton: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  backupButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  restoreButton: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  restoreButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
  },
  importCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  importLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.sm,
  },
  importInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  importButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },

  // Footer
  footer: { alignItems: 'center', padding: SPACING.xl },
  footerText: { color: COLORS.textMuted, fontSize: FONT_SIZES.sm },
  footerSubtext: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs,
  },
});