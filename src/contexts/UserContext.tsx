import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile, UserSettings } from '../models/types';
import { storageService } from '../services/StorageService';
import { DEFAULT_SETTINGS } from '../constants/theme';
import { v4 as uuidv4 } from 'uuid';

interface UserContextType {
  profile: UserProfile | null;
  isLoading: boolean;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
  confirmAlive: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const stored = await storageService.getUserProfile();
    if (stored) {
      setProfile(stored as UserProfile);
    }
    setIsLoading(false);
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!profile) {
      const newProfile: UserProfile = {
        id: uuidv4(),
        createdAt: new Date(),
        lastActivityAt: new Date(),
        isConfirmedAlive: true,
        lastConfirmedAt: new Date(),
        settings: DEFAULT_SETTINGS,
        ...updates,
      } as UserProfile;
      await storageService.setUserProfile(newProfile);
      setProfile(newProfile);
    } else {
      const updated = { ...profile, ...updates };
      await storageService.setUserProfile(updated);
      setProfile(updated);
    }
  };

  const updateSettings = async (settings: Partial<UserSettings>) => {
    if (profile) {
      const updated = {
        ...profile,
        settings: { ...profile.settings, ...settings },
      };
      await storageService.setUserProfile(updated);
      setProfile(updated);
    }
  };

  const confirmAlive = async () => {
    if (profile) {
      const updated = {
        ...profile,
        isConfirmedAlive: true,
        lastConfirmedAt: new Date(),
        lastActivityAt: new Date(),
      };
      await storageService.setUserProfile(updated);
      setProfile(updated);
    }
  };

  return (
    <UserContext.Provider value={{ profile, isLoading, updateProfile, updateSettings, confirmAlive }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextType {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}