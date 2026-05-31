import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { DeathNote, AddressInfo, FinancialAccount, Pet } from '../models/types';
import { deathNoteService } from '../services/DeathNoteService';
import { useSecurity } from './SecurityContext';

interface DeathNoteContextType {
  deathNote: DeathNote | null;
  isLoading: boolean;
  lastError: string | null;
  clearError: () => void;
  updateAddress: (address: AddressInfo) => Promise<void>;
  addFinancialAccount: (account: Omit<FinancialAccount, 'id'>) => Promise<void>;
  updateFinancialAccount: (account: FinancialAccount) => Promise<void>;
  removeFinancialAccount: (id: string) => Promise<void>;
  addPet: (pet: Omit<Pet, 'id'>) => Promise<void>;
  updatePet: (pet: Pet) => Promise<void>;
  removePet: (id: string) => Promise<void>;
  updateOtherInfo: (info: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const DeathNoteContext = createContext<DeathNoteContextType | undefined>(undefined);

export function DeathNoteProvider({ children }: { children: ReactNode }) {
  const [deathNote, setDeathNote] = useState<DeathNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const { getPinHash } = useSecurity();

  const clearError = () => setLastError(null);

  const loadDeathNote = useCallback(async () => {
    const pinHash = getPinHash() ?? undefined;
    try {
      const note = await deathNoteService.getDeathNote(pinHash);
      setDeathNote(note);
    } catch (err) {
      console.error('[DeathNoteContext] load failed:', err);
      setLastError('Failed to load Final Wishes & Instructions.');
    } finally {
      setIsLoading(false);
    }
  }, [getPinHash]);

  useEffect(() => {
    loadDeathNote();
  }, [loadDeathNote]);

  const withErrorHandling = async (operation: () => Promise<void>, label: string) => {
    try {
      clearError();
      await operation();
      await loadDeathNote();
    } catch (err) {
      console.error(`[DeathNoteContext] ${label} failed:`, err);
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setLastError(message);
    }
  };

  const updateAddress = async (address: AddressInfo) => {
    const pinHash = getPinHash() ?? undefined;
    await withErrorHandling(
      () => deathNoteService.updateAddress(address, pinHash),
      'updateAddress',
    );
  };

  const addFinancialAccount = async (account: Omit<FinancialAccount, 'id'>) => {
    const pinHash = getPinHash() ?? undefined;
    await withErrorHandling(
      () => deathNoteService.addFinancialAccount(account, pinHash),
      'addFinancialAccount',
    );
  };

  const updateFinancialAccount = async (account: FinancialAccount) => {
    const pinHash = getPinHash() ?? undefined;
    await withErrorHandling(
      () => deathNoteService.updateFinancialAccount(account, pinHash),
      'updateFinancialAccount',
    );
  };

  const removeFinancialAccount = async (id: string) => {
    const pinHash = getPinHash() ?? undefined;
    await withErrorHandling(
      () => deathNoteService.removeFinancialAccount(id, pinHash),
      'removeFinancialAccount',
    );
  };

  const addPet = async (pet: Omit<Pet, 'id'>) => {
    const pinHash = getPinHash() ?? undefined;
    await withErrorHandling(
      () => deathNoteService.addPet(pet, pinHash),
      'addPet',
    );
  };

  const updatePet = async (pet: Pet) => {
    const pinHash = getPinHash() ?? undefined;
    await withErrorHandling(
      () => deathNoteService.updatePet(pet, pinHash),
      'updatePet',
    );
  };

  const removePet = async (id: string) => {
    const pinHash = getPinHash() ?? undefined;
    await withErrorHandling(
      () => deathNoteService.removePet(id, pinHash),
      'removePet',
    );
  };

  const updateOtherInfo = async (info: string) => {
    const pinHash = getPinHash() ?? undefined;
    await withErrorHandling(
      () => deathNoteService.updateOtherInfo(info, pinHash),
      'updateOtherInfo',
    );
  };

  return (
    <DeathNoteContext.Provider
      value={{
        deathNote,
        isLoading,
        lastError,
        clearError,
        updateAddress,
        addFinancialAccount,
        updateFinancialAccount,
        removeFinancialAccount,
        addPet,
        updatePet,
        removePet,
        updateOtherInfo,
        refresh: loadDeathNote,
      }}
    >
      {children}
    </DeathNoteContext.Provider>
  );
}

export function useDeathNote(): DeathNoteContextType {
  const context = useContext(DeathNoteContext);
  if (!context) {
    throw new Error('useDeathNote must be used within DeathNoteProvider');
  }
  return context;
}