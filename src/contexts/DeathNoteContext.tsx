import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DeathNote, AddressInfo, FinancialAccount, Pet } from '../models/types';
import { deathNoteService } from '../services/DeathNoteService';

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

  useEffect(() => {
    loadDeathNote();
  }, []);

  const loadDeathNote = async () => {
    const note = await deathNoteService.getDeathNote();
    setDeathNote(note);
    setIsLoading(false);
  };

  const updateAddress = async (address: AddressInfo) => {
    await deathNoteService.updateAddress(address);
    await loadDeathNote();
  };

  const addFinancialAccount = async (account: Omit<FinancialAccount, 'id'>) => {
    await deathNoteService.addFinancialAccount(account);
    await loadDeathNote();
  };

  const updateFinancialAccount = async (account: FinancialAccount) => {
    await deathNoteService.updateFinancialAccount(account);
    await loadDeathNote();
  };

  const removeFinancialAccount = async (id: string) => {
    await deathNoteService.removeFinancialAccount(id);
    await loadDeathNote();
  };

  const addPet = async (pet: Omit<Pet, 'id'>) => {
    await deathNoteService.addPet(pet);
    await loadDeathNote();
  };

  const updatePet = async (pet: Pet) => {
    await deathNoteService.updatePet(pet);
    await loadDeathNote();
  };

  const removePet = async (id: string) => {
    await deathNoteService.removePet(id);
    await loadDeathNote();
  };

  const updateOtherInfo = async (info: string) => {
    await deathNoteService.updateOtherInfo(info);
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