import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/theme';
import { UserProfile, EmergencyContact, DeathNote, ActivityLog } from '../models/types';

class StorageService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      console.error(`StorageService get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`StorageService set error for key ${key}:`, error);
      return false;
    }
  }

  async remove(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`StorageService remove error for key ${key}:`, error);
      return false;
    }
  }

  async clear(): Promise<boolean> {
    try {
      const keys = Object.values(STORAGE_KEYS);
      for (const key of keys) {
        await AsyncStorage.removeItem(key);
      }
      return true;
    } catch (error) {
      console.error('StorageService clear error:', error);
      return false;
    }
  }

  async getUserProfile(): Promise<UserProfile | null> {
    return this.get<UserProfile>(STORAGE_KEYS.USER_PROFILE);
  }

  async setUserProfile(profile: UserProfile): Promise<boolean> {
    return this.set(STORAGE_KEYS.USER_PROFILE, profile);
  }

  async getEmergencyContacts(): Promise<EmergencyContact[]> {
    const result = await this.get<EmergencyContact[]>(STORAGE_KEYS.EMERGENCY_CONTACTS);
    return Array.isArray(result) ? result : [];
  }

  async setEmergencyContacts(contacts: EmergencyContact[]): Promise<boolean> {
    return this.set(STORAGE_KEYS.EMERGENCY_CONTACTS, contacts);
  }

  async getDeathNote(): Promise<DeathNote | null> {
    return this.get<DeathNote>(STORAGE_KEYS.DEATH_NOTE);
  }

  async setDeathNote(note: DeathNote): Promise<boolean> {
    return this.set(STORAGE_KEYS.DEATH_NOTE, note);
  }

  async getActivityLogs(): Promise<ActivityLog[]> {
    const result = await this.get<ActivityLog[]>(STORAGE_KEYS.ACTIVITY_LOGS);
    return Array.isArray(result) ? result : [];
  }

  async setActivityLogs(logs: ActivityLog[]): Promise<boolean> {
    return this.set(STORAGE_KEYS.ACTIVITY_LOGS, logs);
  }

  async isOnboardingComplete(): Promise<boolean> {
    const value = await this.get<boolean>(STORAGE_KEYS.ONBOARDING_COMPLETE);
    return value === true;
  }

  async setOnboardingComplete(complete: boolean): Promise<boolean> {
    return this.set(STORAGE_KEYS.ONBOARDING_COMPLETE, complete);
  }
}

export const storageService = new StorageService();