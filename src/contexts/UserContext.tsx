import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
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

function createProfile(updates: Partial<UserProfile>): UserProfile {
  const { settings, ...profileUpdates } = updates;

  return {
    id: uuidv4(),
    name: '',
    createdAt: new Date(),
    lastActivityAt: new Date(),
    isConfirmedAlive: true,
    lastConfirmedAt: new Date(),
    ...profileUpdates,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(settings ?? {}),
    },
  };
}

function mergeProfiles(
  stored: UserProfile | null,
  current: UserProfile | null,
  updates: Partial<UserProfile> = {},
): UserProfile | null {
  const base = stored ?? current;
  if (!base) return null;

  const mergedCurrent = current
    ? {
        ...base,
        ...current,
        settings: {
          ...base.settings,
          ...current.settings,
        },
      }
    : base;

  return {
    ...mergedCurrent,
    ...updates,
    settings: {
      ...mergedCurrent.settings,
      ...(updates.settings ?? {}),
    },
  };
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const stored = await storageService.getUserProfile();
    if (stored) {
      setProfile(stored);
    }
    setIsLoading(false);
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    const stored = await storageService.getUserProfile();
    const updated = mergeProfiles(stored, profile, updates);

    if (!updated) {
      const newProfile = createProfile(updates);
      await storageService.setUserProfile(newProfile);
      setProfile(newProfile);
    } else {
      await storageService.setUserProfile(updated);
      setProfile(updated);
    }
  };

  const updateSettings = async (settings: Partial<UserSettings>) => {
    const stored = await storageService.getUserProfile();
    const base = mergeProfiles(stored, profile);

    if (base) {
      const updated = {
        ...base,
        settings: { ...base.settings, ...settings },
      };
      await storageService.setUserProfile(updated);
      setProfile(updated);
    }
  };

  const isConfirmingRef = useRef(false);

  const confirmAlive = async () => {
    if (!profile || isConfirmingRef.current) return;
    isConfirmingRef.current = true;
    try {
      const stored = await storageService.getUserProfile();
      const base = mergeProfiles(stored, profile);
      if (!base) return;

      const updated = {
        ...base,
        isConfirmedAlive: true,
        lastConfirmedAt: new Date(),
        lastActivityAt: new Date(),
      };
      await storageService.setUserProfile(updated);
      setProfile(updated);
    } finally {
      isConfirmingRef.current = false;
    }
  };

  return (
    <UserContext.Provider
      value={{ profile, isLoading, updateProfile, updateSettings, confirmAlive }}
    >
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
