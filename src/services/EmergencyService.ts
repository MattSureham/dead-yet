import { EmergencyContact } from '../models/types';
import { storageService } from './StorageService';

interface CallResult {
  contactId: string;
  success: boolean;
  timestamp: Date;
  reachedUser: boolean;
}

class EmergencyService {
  private static instance: EmergencyService;

  static getInstance(): EmergencyService {
    if (!EmergencyService.instance) {
      EmergencyService.instance = new EmergencyService();
    }
    return EmergencyService.instance;
  }

  async initiateEmergencySequence(): Promise<CallResult[]> {
    const contacts = await this.getSortedContacts();
    const results: CallResult[] = [];

    for (const contact of contacts) {
      const result = await this.makeCall(contact);
      results.push(result);

      if (result.reachedUser) {
        break;
      }
    }

    return results;
  }

  async makeCall(contact: EmergencyContact): Promise<CallResult> {
    console.log(`Calling ${contact.name} at ${contact.phoneNumber}...`);

    const result: CallResult = {
      contactId: contact.id,
      success: true,
      timestamp: new Date(),
      reachedUser: false,
    };

    return result;
  }

  async sendEmergencyMessage(contact: EmergencyContact, message: string): Promise<boolean> {
    console.log(`Sending emergency SMS to ${contact.name}: ${message}`);
    return true;
  }

  async revealDeathNotesToContact(contact: EmergencyContact): Promise<void> {
    const deathNote = await storageService.getDeathNote();
    if (!deathNote) return;

    console.log(`Revealing death notes to ${contact.name}`);
    console.log('Death Note:', JSON.stringify(deathNote, null, 2));
  }

  async getSortedContacts(): Promise<EmergencyContact[]> {
    const contacts = await storageService.getEmergencyContacts();
    return contacts.sort((a: EmergencyContact, b: EmergencyContact) => a.priority - b.priority);
  }

  async addContact(contact: EmergencyContact): Promise<void> {
    const contacts = await storageService.getEmergencyContacts();
    contacts.push(contact);
    await storageService.setEmergencyContacts(contacts);
  }

  async removeContact(contactId: string): Promise<void> {
    const contacts = await storageService.getEmergencyContacts();
    const filtered = contacts.filter((c: EmergencyContact) => c.id !== contactId);
    await storageService.setEmergencyContacts(filtered);
  }

  async updateContact(contact: EmergencyContact): Promise<void> {
    const contacts = await storageService.getEmergencyContacts();
    const index = contacts.findIndex((c: EmergencyContact) => c.id === contact.id);
    if (index !== -1) {
      contacts[index] = contact;
      await storageService.setEmergencyContacts(contacts);
    }
  }

  async getAllContacts(): Promise<EmergencyContact[]> {
    return await storageService.getEmergencyContacts();
  }

  async triggerHistoryClear(): Promise<boolean> {
    const profile = await storageService.getUserProfile();
    const webhookUrl = profile?.settings?.historyClearWebhook;

    if (!webhookUrl) {
      console.log('No history clear webhook configured');
      return false;
    }

    try {
      console.log(`Triggering history clear via webhook: ${webhookUrl}`);
      await fetch(webhookUrl, {
        method: 'GET',
        mode: 'no-cors',
      });
      console.log('History clear webhook called successfully');
      return true;
    } catch (error) {
      console.error('Failed to call history clear webhook:', error);
      return false;
    }
  }
}

export const emergencyService = EmergencyService.getInstance();