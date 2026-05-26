/**
 * BackupService — Encrypted export/restore for the Dead Yet app.
 *
 * Bundles all user data (profile, contacts, death note, activity logs) into
 * an encrypted blob that can be shared via the system Share sheet, clipboard,
 * or file export for device migration and safekeeping.
 *
 * ## Design
 *
 *   Export:  Read all storage keys → decrypt contacts & death note if needed
 *            → bundle as JSON → encrypt with pinHash → prefix `DBv1:`
 *            → return blob string
 *   Import:  Verify `DBv1:` prefix → decrypt with pinHash → validate JSON
 *            shape → re-encrypt contacts & death note → restore to storage
 *
 * ## Backup payload format
 *
 *   DBv1:{encrypted_payload}
 *     where encrypted_payload = CryptoService.encrypt(JSON.stringify({
 *       version: 1,
 *       exportedAt: "2026-05-25T00:00:00.000Z",
 *       data: {
 *         profile: UserProfile | null,      // pinHash STRIPPED
 *         contacts: EmergencyContact[],      // plaintext (payload is encrypted)
 *         deathNote: DeathNote | null,       // plaintext (payload is encrypted)
 *         activityLogs: ActivityLog[],       // plaintext
 *       }
 *     }), pinHash)
 *
 * ## Security considerations
 *
 *   - The profile's `pinHash` is STRIPPED from the backup so it can't be
 *     extracted and brute-forced offline.
 *   - On import, the existing `pinHash` in AsyncStorage is preserved so the
 *     user doesn't get locked out.
 *   - Data is always plaintext inside the encrypted payload so decrypting
 *     the outer layer gives the importer full access.
 *
 * ## Dependencies
 *
 *   - CryptoService (encrypt/decrypt/isEncrypted)
 *   - StorageService (getRaw/setRaw for encrypted blobs, get/set for others)
 */

import { UserProfile, EmergencyContact, DeathNote, ActivityLog } from '../models/types';
import { storageService } from './StorageService';
import { cryptoService } from './CryptoService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKUP_PREFIX = 'DBv1:';
const LAST_BACKUP_KEY = '@dead_yet_last_backup';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackupPayload {
  version: 1;
  exportedAt: string;
  data: {
    profile: UserProfile | null;
    contacts: EmergencyContact[];
    deathNote: DeathNote | null;
    activityLogs: ActivityLog[];
  };
}

export interface BackupImportSummary {
  /** Whether the user profile was restored. */
  profile: boolean;
  /** Number of emergency contacts restored. */
  contacts: number;
  /** Whether a death note was restored. */
  deathNote: boolean;
  /** Number of activity logs restored. */
  activityLogs: number;
}

// ---------------------------------------------------------------------------
// BackupService
// ---------------------------------------------------------------------------

class BackupService {
  private static instance: BackupService;

  static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService();
    }
    return BackupService.instance;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Export all user data as an encrypted backup blob.
   *
   * Reads every storage key, decrypts contacts and death note if they were
   * stored encrypted, bundles everything into a JSON payload, and encrypts
   * the result with the user's PIN hash.
   *
   * @param pinHash - The user's PIN hash from `SecurityContext.getPinHash()`.
   * @returns A `DBv1:...` encrypted blob string suitable for sharing.
   * @throws If pinHash is empty, decryption fails (wrong PIN), or there's
   *         nothing to back up.
   */
  async exportBackup(pinHash: string): Promise<string> {
    if (!pinHash) {
      throw new Error('pinHash is required for backup export');
    }

    // 1. Read all data from storage (decrypting where needed)
    const [profile, contacts, deathNote, activityLogs] = await Promise.all([
      this.readProfileForBackup(),
      this.readContactsForBackup(pinHash),
      this.readDeathNoteForBackup(pinHash),
      storageService.getActivityLogs(),
    ]);

    // 2. Build the payload
    const payload: BackupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { profile, contacts, deathNote, activityLogs },
    };

    // 3. Encrypt with the user's PIN hash
    const plaintext = JSON.stringify(payload);
    const encrypted = await cryptoService.encrypt(plaintext, pinHash);

    // 4. Record the backup time
    await this.recordBackupTime();

    return `${BACKUP_PREFIX}${encrypted}`;
  }

  /**
   * Import data from an encrypted backup blob.
   *
   * Decrypts the blob, validates the payload structure, and restores each
   * key to AsyncStorage (re-encrypting contacts and death note). The
   * existing `pinHash` is preserved so the user doesn't get locked out.
   *
   * @param encryptedBlob - The `DBv1:...` backup string.
   * @param pinHash        - The user's PIN hash (must match the one used
   *                         during export).
   * @returns A summary of what was restored.
   * @throws If the blob is invalid, decryption fails, or the payload is
   *         malformed.
   */
  async importBackup(
    encryptedBlob: string,
    pinHash: string,
  ): Promise<BackupImportSummary> {
    if (!pinHash) {
      throw new Error('pinHash is required for backup import');
    }
    if (!encryptedBlob || !this.isBackup(encryptedBlob)) {
      throw new Error(
        'Data is not in backup format (must start with "DBv1:")',
      );
    }

    // 1. Decrypt
    const encrypted = encryptedBlob.slice(BACKUP_PREFIX.length);
    const plaintext = await cryptoService.decrypt(encrypted, pinHash);

    // 2. Parse and validate the payload
    let payload: BackupPayload;
    try {
      payload = JSON.parse(plaintext) as BackupPayload;
    } catch {
      throw new Error('Backup payload is not valid JSON');
    }

    if (payload.version !== 1) {
      throw new Error(`Unsupported backup version: ${payload.version}`);
    }

    const { data } = payload;
    if (!data || typeof data !== 'object') {
      throw new Error('Backup payload is missing data field');
    }

    // 3. Restore each key to storage
    const summary: BackupImportSummary = {
      profile: false,
      contacts: 0,
      deathNote: false,
      activityLogs: 0,
    };

    // Restore profile (preserve existing pinHash)
    if (data.profile) {
      await this.restoreProfile(data.profile);
      summary.profile = true;
    }

    // Restore contacts (re-encrypt before storing)
    if (Array.isArray(data.contacts) && data.contacts.length > 0) {
      await this.restoreContacts(data.contacts, pinHash);
      summary.contacts = data.contacts.length;
    }

    // Restore death note (re-encrypt before storing)
    if (data.deathNote) {
      await this.restoreDeathNote(data.deathNote, pinHash);
      summary.deathNote = true;
    }

    // Restore activity logs (plaintext, no encryption needed)
    if (Array.isArray(data.activityLogs) && data.activityLogs.length > 0) {
      await storageService.setActivityLogs(data.activityLogs);
      summary.activityLogs = data.activityLogs.length;
    }

    // Record backup import time
    await this.recordBackupTime();

    return summary;
  }

  /**
   * Check whether a string is a valid backup blob.
   *
   * @returns `true` if the string starts with the `DBv1:` prefix.
   */
  isBackup(data: unknown): boolean {
    return typeof data === 'string' && data.startsWith(BACKUP_PREFIX);
  }

  /**
   * Get the timestamp of the last backup (export or import).
   *
   * @returns A Date object, or null if no backup has ever been performed.
   */
  async getLastBackupTime(): Promise<Date | null> {
    const raw = await storageService.getRaw(LAST_BACKUP_KEY);
    if (!raw) return null;

    const timestamp = parseInt(raw, 10);
    if (isNaN(timestamp)) return null;

    return new Date(timestamp);
  }

  /**
   * Record that a backup was just performed (writes the current timestamp).
   *
   * Called automatically by `exportBackup()` and `importBackup()`.
   */
  async recordBackupTime(): Promise<void> {
    await storageService.setRaw(LAST_BACKUP_KEY, String(Date.now()));
  }

  // -----------------------------------------------------------------------
  // Private helpers — reading data for export
  // -----------------------------------------------------------------------

  /**
   * Read the user profile for backup, stripping the pinHash for security.
   */
  private async readProfileForBackup(): Promise<UserProfile | null> {
    const profile = await storageService.getUserProfile();
    if (!profile) return null;

    // Deep-clone and strip the pinHash so it can't be extracted from the
    // backup file and brute-forced offline.
    const safe: UserProfile = JSON.parse(JSON.stringify(profile));
    if (safe.settings?.pinHash) {
      delete safe.settings.pinHash;
    }
    return safe;
  }

  /**
   * Read emergency contacts for backup.
   *
   * If stored encrypted (DEv1:...), decrypts so the backup payload contains
   * plaintext data. If stored as legacy plaintext JSON, returns as-is.
   */
  private async readContactsForBackup(
    pinHash: string,
  ): Promise<EmergencyContact[]> {
    const raw = await storageService.getEmergencyContactsRaw();

    if (raw) {
      if (cryptoService.isEncrypted(raw)) {
        // Decrypt to get plaintext for the backup
        const plaintext = await cryptoService.decrypt(raw, pinHash);
        return JSON.parse(plaintext) as EmergencyContact[];
      }

      // Legacy plaintext JSON
      try {
        return JSON.parse(raw) as EmergencyContact[];
      } catch {
        return [];
      }
    }

    // Fallback: use the legacy getter (which does JSON.parse internally)
    return storageService.getEmergencyContacts();
  }

  /**
   * Read the death note for backup.
   *
   * If stored encrypted (DEv1:...), decrypts so the backup payload contains
   * plaintext data. If stored as legacy plaintext JSON, returns as-is.
   */
  private async readDeathNoteForBackup(
    pinHash: string,
  ): Promise<DeathNote | null> {
    const raw = await storageService.getDeathNoteRaw();

    if (raw) {
      if (cryptoService.isEncrypted(raw)) {
        const plaintext = await cryptoService.decrypt(raw, pinHash);
        return JSON.parse(plaintext) as DeathNote;
      }

      try {
        return JSON.parse(raw) as DeathNote;
      } catch {
        return null;
      }
    }

    // Fallback: use the legacy getter
    return storageService.getDeathNote();
  }

  // -----------------------------------------------------------------------
  // Private helpers — restoring data on import
  // -----------------------------------------------------------------------

  /**
   * Restore a user profile, preserving the existing pinHash so the user
   * doesn't get locked out after a restore.
   */
  private async restoreProfile(profile: UserProfile): Promise<void> {
    const current = await storageService.getUserProfile();
    const existingPinHash = current?.settings?.pinHash;

    // Deep-clone so we don't mutate the input
    const safe: UserProfile = JSON.parse(JSON.stringify(profile));

    // Remove any pinHash that may have snuck into the backup
    if (safe.settings?.pinHash) {
      delete safe.settings.pinHash;
    }

    // Restore the existing pinHash (if any)
    if (existingPinHash && safe.settings) {
      safe.settings.pinHash = existingPinHash;
    }

    await storageService.setUserProfile(safe);
  }

  /**
   * Restore contacts, re-encrypting them before storage.
   */
  private async restoreContacts(
    contacts: EmergencyContact[],
    pinHash: string,
  ): Promise<void> {
    const plaintext = JSON.stringify(contacts);
    const encrypted = await cryptoService.encrypt(plaintext, pinHash);
    await storageService.setEmergencyContactsRaw(encrypted);
  }

  /**
   * Restore the death note, re-encrypting it before storage.
   */
  private async restoreDeathNote(
    deathNote: DeathNote,
    pinHash: string,
  ): Promise<void> {
    const plaintext = JSON.stringify(deathNote);
    const encrypted = await cryptoService.encrypt(plaintext, pinHash);
    await storageService.setDeathNoteRaw(encrypted);
  }
}

export const backupService = BackupService.getInstance();
