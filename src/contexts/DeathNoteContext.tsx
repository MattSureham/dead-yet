import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { DeathNote, AddressInfo, FinancialAccount, Pet } from '../models/types';
import { deathNoteService } from '../services/DeathNoteService';
import { useSecurity } from './SecurityContext';

interface DeathNoteContextType {
  deathNote: DeathNote | null;
  isLoading: boolean;
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
  const { getPinHash } = useSecurity();

  const loadDeathNote = useCallback(async () => {
    const pinHash = getPinHash() ?? undefined;
    const note = await deathNoteService.getDeathNote(pinHash);
    setDeathNote(note);
    setIsLoading(false);
  }, [getPinHash]);

  useEffect(() => {
    loadDeathNote();
  }, [loadDeathNote]);

  const updateAddress = async (address: AddressInfo) => {
    const pinHash = getPinHash() ?? undefined;
    await deathNoteService.updateAddress(address, pinHash);
    await loadDeathNote();
  };

  const addFinancialAccount = async (account: Omit<FinancialAccount, 'id'>) => {
    const pinHash = getPinHash() ?? undefined;
    await deathNoteService.addFinancialAccount(account, pinHash);
    await loadDeathNote();
  };

  const updateFinancialAccount = async (account: FinancialAccount) => {
    const pinHash = getPinHash() ?? undefined;
    await deathNoteService.updateFinancialAccount(account, pinHash);
    await loadDeathNote();
  };

  const removeFinancialAccount = async (id: string) => {
    const pinHash = getPinHash() ?? undefined;
    await deathNoteService.removeFinancialAccount(id, pinHash);
    await loadDeathNote();
  };

  const addPet = async (pet: Omit<Pet, 'id'>) => {
    const pinHash = getPinHash() ?? undefined;
    await deathNoteService.addPet(pet, pinHash);
    await loadDeathNote();
  };

  const updatePet = async (pet: Pet) => {
    const pinHash = getPinHash() ?? undefined;
    await deathNoteService.updatePet(pet, pinHash);
    await loadDeathNote();
  };

  const removePet = async (id: string) => {
    const pinHash = getPinHash() ?? undefined;
    await deathNoteService.removePet(id, pinHash);
    await loadDeathNote();
  };

  const updateOtherInfo = async (info: string) => {
    const pinHash = getPinHash() ?? undefined;
    await deathNoteService.updateOtherInfo(info, pinHash);
    await loadDeathNote();
  };

  return (
    <DeathNoteContext.Provider
      value={{
        deathNote,
        isLoading,
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