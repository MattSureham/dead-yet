import { storageService } from '../../services/StorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../constants/theme';
import { UserProfile, EmergencyContact, DeathNote, ActivityLog } from '../../models/types';

// AsyncStorage is already mocked globally in jest.setup.js

const mockProfile: UserProfile = {
  id: 'test-user-1',
  createdAt: new Date('2025-01-01'),
  lastActivityAt: new Date('2025-06-01'),
  isConfirmedAlive: true,
  lastConfirmedAt: new Date('2025-06-01'),
  settings: {
    inactivityThresholdDays: 3,
    confirmationTimeoutHours: 24,
    notificationsEnabled: true,
  },
};

const mockContact: EmergencyContact = {
  id: 'contact-1',
  name: 'Jane Doe',
  phoneNumber: '+1234567890',
  email: 'jane@example.com',
  relationship: 'Spouse',
  priority: 1,
  isVerified: false,
  createdAt: new Date('2025-01-01'),
};

const mockDeathNote: DeathNote = {
  id: 'note-1',
  financialAccounts: [],
  pets: [],
  otherImportantInfo: 'Test info',
  updatedAt: new Date('2025-06-01'),
};

const mockActivityLog: ActivityLog = {
  id: 'log-1',
  type: 'manual_checkin',
  duration: 0,
  timestamp: new Date('2025-06-01'),
};

describe('StorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
    (AsyncStorage.removeItem as jest.Mock).mockClear();
  });

  describe('getUserProfile / setUserProfile', () => {
    it('returns null when no profile is stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const result = await storageService.getUserProfile();
      expect(result).toBeNull();
    });

    it('stores and retrieves a profile', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockProfile));
      const result = await storageService.getUserProfile();
      expect(result).toMatchObject({
        id: 'test-user-1',
        isConfirmedAlive: true,
        settings: {
          inactivityThresholdDays: 3,
          confirmationTimeoutHours: 24,
          notificationsEnabled: true,
        },
      });
    });

    it('sets a profile and returns true', async () => {
      const result = await storageService.setUserProfile(mockProfile);
      expect(result).toBe(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.USER_PROFILE,
        JSON.stringify(mockProfile),
      );
    });
  });

  describe('getEmergencyContacts / setEmergencyContacts', () => {
    it('returns empty array when no contacts stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const result = await storageService.getEmergencyContacts();
      expect(result).toEqual([]);
    });

    it('stores and retrieves contacts', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([mockContact]));
      const result = await storageService.getEmergencyContacts();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Jane Doe');
    });
  });

  describe('getDeathNote / setDeathNote', () => {
    it('returns null when no death note stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const result = await storageService.getDeathNote();
      expect(result).toBeNull();
    });

    it('stores and retrieves a death note', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockDeathNote));
      const result = await storageService.getDeathNote();
      expect(result).toMatchObject({
        id: 'note-1',
        otherImportantInfo: 'Test info',
        financialAccounts: [],
        pets: [],
      });
    });
  });

  describe('getActivityLogs / setActivityLogs', () => {
    it('returns empty array when no logs stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const result = await storageService.getActivityLogs();
      expect(result).toEqual([]);
    });

    it('stores and retrieves activity logs', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([mockActivityLog]));
      const result = await storageService.getActivityLogs();
      expect(result).toHaveLength(1);
    });
  });

  describe('isOnboardingComplete', () => {
    it('returns false by default', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const result = await storageService.isOnboardingComplete();
      expect(result).toBe(false);
    });

    it('returns true after onboarding is set', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(true));
      const result = await storageService.isOnboardingComplete();
      expect(result).toBe(true);
    });
  });

  describe('clear', () => {
    it('removes all known storage keys', async () => {
      const result = await storageService.clear();
      expect(result).toBe(true);
      const keys = Object.values(STORAGE_KEYS);
      for (const key of keys) {
        expect(AsyncStorage.removeItem).toHaveBeenCalledWith(key);
      }
    });
  });
});
