import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { EmergencyContact } from '../models/types';
import { storageService } from '../services/StorageService';
import { cryptoService } from '../services/CryptoService';
import { useSecurity } from './SecurityContext';
import { v4 as uuidv4 } from 'uuid';

interface ContactsContextType {
  contacts: EmergencyContact[];
  isLoading: boolean;
  addContact: (contact: Omit<EmergencyContact, 'id' | 'createdAt' | 'isVerified'>) => Promise<void>;
  updateContact: (contact: EmergencyContact) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  reorderContacts: (contacts: EmergencyContact[]) => Promise<void>;
}

const ContactsContext = createContext<ContactsContextType | undefined>(undefined);

export function ContactsProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { getPinHash } = useSecurity();

  const loadContacts = useCallback(async () => {
    const pinHash = getPinHash() ?? undefined;
    const raw = await storageService.getEmergencyContactsRaw();

    if (raw) {
      // Encrypted path
      if (cryptoService.isEncrypted(raw)) {
        if (pinHash) {
          try {
            const plaintext = await cryptoService.decrypt(raw, pinHash);
            setContacts(JSON.parse(plaintext) as EmergencyContact[]);
          } catch (err) {
            console.error('[ContactsContext] Failed to decrypt contacts:', err);
            setContacts([]);
          }
        }
        // No pinHash → leave contacts empty (user hasn't unlocked yet)
      } else {
        // Legacy plaintext JSON
        try {
          setContacts(JSON.parse(raw) as EmergencyContact[]);
        } catch {
          setContacts([]);
        }
      }
    } else {
      // Fallback: legacy getEmergencyContacts (JSON.parse internally)
      const stored = await storageService.getEmergencyContacts();
      setContacts(stored);
    }

    setIsLoading(false);
  }, [getPinHash]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const persistContacts = async (updated: EmergencyContact[]) => {
    const pinHash = getPinHash() ?? undefined;
    if (pinHash) {
      const plaintext = JSON.stringify(updated);
      const encrypted = await cryptoService.encrypt(plaintext, pinHash);
      await storageService.setEmergencyContactsRaw(encrypted);
    } else {
      await storageService.setEmergencyContacts(updated);
    }
  };

  const addContact = async (contactData: Omit<EmergencyContact, 'id' | 'createdAt' | 'isVerified'>) => {
    const contact: EmergencyContact = {
      ...contactData,
      id: uuidv4(),
      createdAt: new Date(),
      isVerified: false,
    };
    const updated = [...contacts, contact];
    await persistContacts(updated);
    setContacts(updated);
  };

  const updateContact = async (contact: EmergencyContact) => {
    const updated = contacts.map(c => c.id === contact.id ? contact : c);
    await persistContacts(updated);
    setContacts(updated);
  };

  const removeContact = async (id: string) => {
    const updated = contacts.filter(c => c.id !== id);
    await persistContacts(updated);
    setContacts(updated);
  };

  const reorderContacts = async (reordered: EmergencyContact[]) => {
    await persistContacts(reordered);
    setContacts(reordered);
  };

  return (
    <ContactsContext.Provider value={{ contacts, isLoading, addContact, updateContact, removeContact, reorderContacts }}>
      {children}
    </ContactsContext.Provider>
  );
}

export function useContacts(): ContactsContextType {
  const context = useContext(ContactsContext);
  if (!context) {
    throw new Error('useContacts must be used within ContactsProvider');
  }
  return context;
}