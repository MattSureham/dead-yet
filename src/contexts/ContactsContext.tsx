import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { EmergencyContact } from '../models/types';
import { storageService } from '../services/StorageService';
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

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    const stored = await storageService.getEmergencyContacts();
    setContacts(stored as EmergencyContact[]);
    setIsLoading(false);
  };

  const addContact = async (contactData: Omit<EmergencyContact, 'id' | 'createdAt' | 'isVerified'>) => {
    const contact: EmergencyContact = {
      ...contactData,
      id: uuidv4(),
      createdAt: new Date(),
      isVerified: false,
    } as EmergencyContact;
    const updated = [...contacts, contact];
    await storageService.setEmergencyContacts(updated);
    setContacts(updated);
  };

  const updateContact = async (contact: EmergencyContact) => {
    const updated = contacts.map(c => c.id === contact.id ? contact : c);
    await storageService.setEmergencyContacts(updated);
    setContacts(updated);
  };

  const removeContact = async (id: string) => {
    const updated = contacts.filter(c => c.id !== id);
    await storageService.setEmergencyContacts(updated);
    setContacts(updated);
  };

  const reorderContacts = async (reordered: EmergencyContact[]) => {
    await storageService.setEmergencyContacts(reordered);
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