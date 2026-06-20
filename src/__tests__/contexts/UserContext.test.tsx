import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { UserProfile } from '../../models/types';
import { UserProvider, useUser } from '../../contexts/UserContext';
import { storageService } from '../../services/StorageService';

jest.mock('../../services/StorageService', () => ({
  storageService: {
    getUserProfile: jest.fn(),
    setUserProfile: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-user-id'),
}));

type UserContextValue = ReturnType<typeof useUser>;

const baseProfile: UserProfile = {
  id: 'user-1',
  name: 'Alice',
  createdAt: new Date('2026-01-01'),
  lastActivityAt: new Date('2026-01-02'),
  isConfirmedAlive: true,
  lastConfirmedAt: new Date('2026-01-02'),
  settings: {
    inactivityThresholdDays: 3,
    confirmationTimeoutHours: 24,
    notificationsEnabled: true,
    pinHash: 'stored-pin-hash',
  },
};

function Probe({ onChange }: { onChange: (value: UserContextValue) => void }) {
  const value = useUser();

  useEffect(() => {
    onChange(value);
  }, [onChange, value]);

  return null;
}

async function renderUserProvider(): Promise<{ getValue: () => UserContextValue }> {
  let latestValue: UserContextValue | null = null;

  render(
    <UserProvider>
      <Probe
        onChange={(value) => {
          latestValue = value;
        }}
      />
    </UserProvider>,
  );

  await waitFor(() => {
    expect(latestValue?.isLoading).toBe(false);
  });

  return {
    getValue: () => {
      if (!latestValue) {
        throw new Error('UserContext value was not captured');
      }
      return latestValue;
    },
  };
}

describe('UserContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storageService.getUserProfile as jest.Mock).mockResolvedValue(null);
    (storageService.setUserProfile as jest.Mock).mockResolvedValue(true);
  });

  it('preserves a stored pinHash when settings are updated from stale profile state', async () => {
    (storageService.getUserProfile as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(baseProfile);

    const provider = await renderUserProvider();

    await act(async () => {
      await provider.getValue().updateProfile({ name: 'Alice' });
    });

    await waitFor(() => {
      expect(provider.getValue().profile?.name).toBe('Alice');
    });

    await act(async () => {
      await provider.getValue().updateSettings({ notificationsEnabled: false });
    });

    const calls = (storageService.setUserProfile as jest.Mock).mock.calls;
    const savedProfile = calls[calls.length - 1][0] as UserProfile;

    expect(savedProfile.name).toBe('Alice');
    expect(savedProfile.settings.notificationsEnabled).toBe(false);
    expect(savedProfile.settings.pinHash).toBe('stored-pin-hash');
  });

  it('preserves a stored pinHash when profile details are updated', async () => {
    (storageService.getUserProfile as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(baseProfile);

    const provider = await renderUserProvider();

    await act(async () => {
      await provider.getValue().updateProfile({ name: 'Alice Updated' });
    });

    const calls = (storageService.setUserProfile as jest.Mock).mock.calls;
    const savedProfile = calls[calls.length - 1][0] as UserProfile;

    expect(savedProfile.name).toBe('Alice Updated');
    expect(savedProfile.settings.pinHash).toBe('stored-pin-hash');
  });

  it('preserves a stored pinHash when confirming alive', async () => {
    (storageService.getUserProfile as jest.Mock)
      .mockResolvedValueOnce(baseProfile)
      .mockResolvedValueOnce(baseProfile);

    const provider = await renderUserProvider();

    await act(async () => {
      await provider.getValue().confirmAlive();
    });

    const calls = (storageService.setUserProfile as jest.Mock).mock.calls;
    const savedProfile = calls[calls.length - 1][0] as UserProfile;

    expect(savedProfile.isConfirmedAlive).toBe(true);
    expect(savedProfile.lastActivityAt).toBeInstanceOf(Date);
    expect(savedProfile.settings.pinHash).toBe('stored-pin-hash');
  });
});
