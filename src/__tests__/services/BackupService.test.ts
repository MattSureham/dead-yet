/**
 * Unit tests for BackupService — encrypted export/restore.
 *
 * Uses the same mock crypto implementation as CryptoService tests to
 * avoid native module resolution.
 */

import { backupService } from '../../services/BackupService';
import {
  cryptoService,
  setCryptoImpl,
  resetCryptoImpl,
  CryptoServiceCryptoImpl,
} from '../../services/CryptoService';
import { storageService } from '../../services/StorageService';
import * as nodeCrypto from 'crypto';

// ---------------------------------------------------------------------------
// Mock crypto implementation (same pattern as CryptoService tests)
// ---------------------------------------------------------------------------

function mockSha256(data: Uint8Array): Promise<ArrayBuffer> {
  const hash = nodeCrypto.createHash('sha256');
  hash.update(data);
  const buf = hash.digest();
  const ab = new ArrayBuffer(buf.byteLength);
  const view = new Uint8Array(ab);
  view.set(buf);
  return Promise.resolve(ab);
}

let mockCounter = 0;

function mockRandomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    bytes[i] = (mockCounter + i) % 256;
  }
  mockCounter += count;
  return bytes;
}

const mockCrypto: CryptoServiceCryptoImpl = {
  getRandomBytes: mockRandomBytes,
  digestAsync: (_algo, data) => mockSha256(data),
};

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const samplePinHash =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6:a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8';

const sampleProfile = {
  id: 'user-1',
  name: 'Test User',
  createdAt: new Date('2025-01-01'),
  lastActivityAt: new Date('2025-06-01'),
  isConfirmedAlive: true,
  lastConfirmedAt: new Date('2025-06-01'),
  settings: {
    inactivityThresholdDays: 3,
    confirmationTimeoutHours: 24,
    notificationsEnabled: true,
    pinHash: 'should-be-stripped:salt-and-hash-value',
  },
};

const sampleContacts = [
  {
    id: 'contact-1',
    name: 'Jane Doe',
    phoneNumber: '+15551234567',
    email: 'jane@example.com',
    relationship: 'Spouse',
    priority: 1,
    isVerified: true,
    createdAt: new Date('2025-01-15'),
  },
  {
    id: 'contact-2',
    name: 'John Smith',
    phoneNumber: '+15559876543',
    email: 'john@example.com',
    relationship: 'Friend',
    priority: 2,
    isVerified: false,
    createdAt: new Date('2025-02-01'),
  },
];

const sampleDeathNote = {
  id: 'note-1',
  financialAccounts: [
    {
      id: 'acct-1',
      institution: 'Bank of America',
      accountType: 'bank' as const,
      accountName: 'Checking',
      notes: 'Primary account',
    },
  ],
  pets: [
    {
      id: 'pet-1',
      name: 'Rex',
      species: 'Dog',
      feedingInstructions: 'Twice daily',
      veterinaryContact: 'Dr. Smith',
      otherCareNotes: 'Needs walks',
    },
  ],
  otherImportantInfo: 'Burial wishes: under the oak tree',
  updatedAt: new Date('2025-03-01'),
};

const sampleActivityLogs = [
  {
    id: 'log-1',
    type: 'manual_checkin' as const,
    duration: 0,
    timestamp: new Date('2025-06-01T10:00:00Z'),
  },
  {
    id: 'log-2',
    type: 'screen_time' as const,
    duration: 120,
    appName: 'Dead Yet',
    timestamp: new Date('2025-06-01T09:00:00Z'),
  },
];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockCounter = 0;
  resetCryptoImpl();
  setCryptoImpl(mockCrypto);
});

afterEach(() => {
  resetCryptoImpl();
});

// Warning: these tests interact with AsyncStorage through storageService.
// In the jest-expo environment, AsyncStorage is mocked, so writes are
// in-memory and don't persist across tests. But we should still clean up.
afterEach(async () => {
  await storageService.clear();
  // The backup time key isn't in STORAGE_KEYS, so clear it separately
  await storageService.remove('@dead_yet_last_backup');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BackupService', () => {
  describe('isBackup', () => {
    it('returns true for DBv1: prefix', () => {
      expect(backupService.isBackup('DBv1:someEncryptedData')).toBe(true);
    });

    it('returns false for regular text', () => {
      expect(backupService.isBackup('{"key": "value"}')).toBe(false);
    });

    it('returns false for DEv1: (encrypted, not backup)', () => {
      expect(backupService.isBackup('DEv1:abc:def')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(backupService.isBackup('')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(backupService.isBackup(null)).toBe(false);
      expect(backupService.isBackup(undefined)).toBe(false);
    });

    it('returns false for numbers', () => {
      expect(backupService.isBackup(123)).toBe(false);
    });
  });

  describe('exportBackup + importBackup roundtrip', () => {
    beforeEach(async () => {
      // Seed storage with sample data
      await storageService.setUserProfile(
        JSON.parse(JSON.stringify(sampleProfile)),
      );
      await storageService.setEmergencyContacts(
        JSON.parse(JSON.stringify(sampleContacts)),
      );
      await storageService.setDeathNote(
        JSON.parse(JSON.stringify(sampleDeathNote)),
      );
      await storageService.setActivityLogs(
        JSON.parse(JSON.stringify(sampleActivityLogs)),
      );
    });

    it('exports and imports a complete backup', async () => {
      // Export
      const blob = await backupService.exportBackup(samplePinHash);
      expect(blob.startsWith('DBv1:')).toBe(true);
      expect(typeof blob).toBe('string');

      // Clear storage to simulate a fresh device
      await storageService.clear();

      // Import
      const summary = await backupService.importBackup(blob, samplePinHash);
      expect(summary.profile).toBe(true);
      expect(summary.contacts).toBe(2);
      expect(summary.deathNote).toBe(true);
      expect(summary.activityLogs).toBe(2);
    });

    it('restores profile data correctly', async () => {
      const blob = await backupService.exportBackup(samplePinHash);
      await storageService.clear();

      await backupService.importBackup(blob, samplePinHash);
      const profile = await storageService.getUserProfile();

      expect(profile).not.toBeNull();
      expect(profile!.name).toBe('Test User');
      expect(profile!.id).toBe('user-1');
    });

    it('strips pinHash from exported backup', async () => {
      const blob = await backupService.exportBackup(samplePinHash);

      // Extract the payload and check it doesn't contain pinHash
      const encrypted = blob.slice(5); // remove 'DBv1:'
      const plaintext = await cryptoService.decrypt(encrypted, samplePinHash);
      const payload = JSON.parse(plaintext);

      expect(payload.data.profile).not.toBeNull();
      expect(payload.data.profile.settings.pinHash).toBeUndefined();
    });

    it('preserves existing pinHash on import', async () => {
      // Set a pinHash before import
      const profileWithPin = JSON.parse(JSON.stringify(sampleProfile));
      profileWithPin.settings.pinHash = 'existing:hash-value';
      await storageService.setUserProfile(profileWithPin);

      // Export and re-import
      const blob = await backupService.exportBackup(samplePinHash);
      await storageService.clear();

      // Restore the pinHash that existed before
      await storageService.setUserProfile(profileWithPin);

      await backupService.importBackup(blob, samplePinHash);
      const profile = await storageService.getUserProfile();

      expect(profile!.settings.pinHash).toBe('existing:hash-value');
    });

    it('restores contacts correctly', async () => {
      const blob = await backupService.exportBackup(samplePinHash);
      await storageService.clear();

      await backupService.importBackup(blob, samplePinHash);

      // Store as encrypted; decrypt to verify
      const raw = await storageService.getEmergencyContactsRaw();
      expect(raw).not.toBeNull();
      expect(cryptoService.isEncrypted(raw!)).toBe(true);

      const plaintext = await cryptoService.decrypt(raw!, samplePinHash);
      const contacts = JSON.parse(plaintext);
      expect(contacts).toHaveLength(2);
      expect(contacts[0].name).toBe('Jane Doe');
      expect(contacts[1].name).toBe('John Smith');
    });

    it('restores death note correctly', async () => {
      const blob = await backupService.exportBackup(samplePinHash);
      await storageService.clear();

      await backupService.importBackup(blob, samplePinHash);

      const raw = await storageService.getDeathNoteRaw();
      expect(raw).not.toBeNull();
      expect(cryptoService.isEncrypted(raw!)).toBe(true);

      const plaintext = await cryptoService.decrypt(raw!, samplePinHash);
      const note = JSON.parse(plaintext);
      expect(note.financialAccounts).toHaveLength(1);
      expect(note.pets).toHaveLength(1);
      expect(note.otherImportantInfo).toBe('Burial wishes: under the oak tree');
    });

    it('restores activity logs correctly', async () => {
      const blob = await backupService.exportBackup(samplePinHash);
      await storageService.clear();

      await backupService.importBackup(blob, samplePinHash);

      const logs = await storageService.getActivityLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].type).toBe('manual_checkin');
    });
  });

  describe('exportBackup with encrypted source data', () => {
    beforeEach(async () => {
      // Store contacts and death note in encrypted form (simulating real usage)
      const contactsJson = JSON.stringify(sampleContacts);
      const contactsEncrypted = await cryptoService.encrypt(
        contactsJson,
        samplePinHash,
      );
      await storageService.setEmergencyContactsRaw(contactsEncrypted);

      const noteJson = JSON.stringify(sampleDeathNote);
      const noteEncrypted = await cryptoService.encrypt(
        noteJson,
        samplePinHash,
      );
      await storageService.setDeathNoteRaw(noteEncrypted);

      await storageService.setUserProfile(
        JSON.parse(JSON.stringify(sampleProfile)),
      );
      await storageService.setActivityLogs(
        JSON.parse(JSON.stringify(sampleActivityLogs)),
      );
    });

    it('exports and imports correctly when source data is encrypted', async () => {
      const blob = await backupService.exportBackup(samplePinHash);
      await storageService.clear();

      const summary = await backupService.importBackup(blob, samplePinHash);
      expect(summary.contacts).toBe(2);
      expect(summary.deathNote).toBe(true);

      // Verify contacts are restored (as encrypted)
      const contactsRaw = await storageService.getEmergencyContactsRaw();
      const contactsPlain = await cryptoService.decrypt(
        contactsRaw!,
        samplePinHash,
      );
      const contacts = JSON.parse(contactsPlain);
      expect(contacts[0].name).toBe('Jane Doe');
    });
  });

  describe('importBackup with empty data', () => {
    it('handles backup with no contacts', async () => {
      // Create a minimal backup with just a profile
      const safeProfile = JSON.parse(JSON.stringify(sampleProfile));
      delete safeProfile.settings.pinHash;

      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          profile: safeProfile,
          contacts: [],
          deathNote: null,
          activityLogs: [],
        },
      };

      const encrypted = await cryptoService.encrypt(
        JSON.stringify(payload),
        samplePinHash,
      );
      const blob = `DBv1:${encrypted}`;

      const summary = await backupService.importBackup(blob, samplePinHash);
      expect(summary.profile).toBe(true);
      expect(summary.contacts).toBe(0);
      expect(summary.deathNote).toBe(false);
      expect(summary.activityLogs).toBe(0);
    });
  });

  describe('error handling', () => {
    it('throws when exporting with empty pinHash', async () => {
      await expect(backupService.exportBackup('')).rejects.toThrow(
        'pinHash is required',
      );
    });

    it('throws when importing with empty pinHash', async () => {
      await expect(
        backupService.importBackup('DBv1:someData', ''),
      ).rejects.toThrow('pinHash is required');
    });

    it('throws when importing non-backup data', async () => {
      await expect(
        backupService.importBackup('plain text', samplePinHash),
      ).rejects.toThrow('not in backup format');
    });

    it('throws when importing with wrong pinHash', async () => {
      // First create a valid backup
      await storageService.setUserProfile(
        JSON.parse(JSON.stringify(sampleProfile)),
      );
      const blob = await backupService.exportBackup(samplePinHash);

      const wrongPinHash =
        'ffffffffffffffffffffffffffffffff:0000000000000000000000000000000000000000000000000000000000000000';

      await expect(
        backupService.importBackup(blob, wrongPinHash),
      ).rejects.toThrow();
    });

    it('throws when importing corrupted backup', async () => {
      await storageService.setUserProfile(
        JSON.parse(JSON.stringify(sampleProfile)),
      );
      const blob = await backupService.exportBackup(samplePinHash);

      // Corrupt the encrypted data
      const corrupted = blob.slice(0, -4) + 'ffff';

      await expect(
        backupService.importBackup(corrupted, samplePinHash),
      ).rejects.toThrow();
    });

    it('throws when importing invalid JSON payload', async () => {
      // Manually create a backup with garbage encrypted content that
      // decrypts to invalid JSON
      const garbage = 'not-valid-json-at-all';
      const encrypted = await cryptoService.encrypt(garbage, samplePinHash);
      const blob = `DBv1:${encrypted}`;

      await expect(
        backupService.importBackup(blob, samplePinHash),
      ).rejects.toThrow('not valid JSON');
    });

    it('throws when importing unsupported version', async () => {
      const payload = {
        version: 999,
        exportedAt: new Date().toISOString(),
        data: {},
      };

      const encrypted = await cryptoService.encrypt(
        JSON.stringify(payload),
        samplePinHash,
      );
      const blob = `DBv1:${encrypted}`;

      await expect(
        backupService.importBackup(blob, samplePinHash),
      ).rejects.toThrow('Unsupported backup version: 999');
    });

    it('throws when importing payload with missing data field', async () => {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
      };

      const encrypted = await cryptoService.encrypt(
        JSON.stringify(payload),
        samplePinHash,
      );
      const blob = `DBv1:${encrypted}`;

      await expect(
        backupService.importBackup(blob, samplePinHash),
      ).rejects.toThrow('missing data field');
    });
  });

  describe('backup time tracking', () => {
    it('records backup time on export', async () => {
      await storageService.setUserProfile(
        JSON.parse(JSON.stringify(sampleProfile)),
      );

      const before = await backupService.getLastBackupTime();
      expect(before).toBeNull();

      await backupService.exportBackup(samplePinHash);

      const after = await backupService.getLastBackupTime();
      expect(after).toBeInstanceOf(Date);
      expect(after!.getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it('records backup time on import', async () => {
      await storageService.setUserProfile(
        JSON.parse(JSON.stringify(sampleProfile)),
      );
      const blob = await backupService.exportBackup(samplePinHash);

      // Clear the backup time to prove import sets it
      await storageService.remove('@dead_yet_last_backup');

      await backupService.importBackup(blob, samplePinHash);

      const time = await backupService.getLastBackupTime();
      expect(time).toBeInstanceOf(Date);
    });

    it('getLastBackupTime returns null when no backup has been done', async () => {
      const time = await backupService.getLastBackupTime();
      expect(time).toBeNull();
    });
  });

  describe('export with empty storage', () => {
    it('exports successfully even with no data stored', async () => {
      const blob = await backupService.exportBackup(samplePinHash);
      expect(blob.startsWith('DBv1:')).toBe(true);

      // Import should succeed with all zeros
      await storageService.clear();
      const summary = await backupService.importBackup(blob, samplePinHash);
      expect(summary.profile).toBe(false);
      expect(summary.contacts).toBe(0);
      expect(summary.deathNote).toBe(false);
      expect(summary.activityLogs).toBe(0);
    });
  });
});
