import { Linking, Platform } from 'react-native';
import { EmergencyContact, DeathNote, Pet, FinancialAccount } from '../models/types';
import { storageService } from './StorageService';
import { notificationService } from './NotificationService';
import { deathNoteService } from './DeathNoteService';

type LinkingApi = {
  canOpenURL?: (url: string) => Promise<boolean>;
  openURL?: (url: string) => Promise<unknown>;
};

interface CallResult {
  contactId: string;
  contactName: string;
  success: boolean;
  timestamp: Date;
  method: 'call' | 'sms' | 'both';
  error?: string;
}

export type EmergencyPhase =
  | 'idle'
  | 'checking_activity'
  | 'notifying_user'
  | 'calling_contacts'
  | 'revealing_notes'
  | 'clearing_history'
  | 'complete';

class EmergencyService {
  private static instance: EmergencyService;
  private currentPhase: EmergencyPhase = 'idle';
  private results: CallResult[] = [];
  private waitBetweenCallsMs = 30000; // 30s between contact attempts

  static getInstance(): EmergencyService {
    if (!EmergencyService.instance) {
      EmergencyService.instance = new EmergencyService();
    }
    return EmergencyService.instance;
  }

  getCurrentPhase(): EmergencyPhase {
    return this.currentPhase;
  }

  getResults(): CallResult[] {
    return [...this.results];
  }

  async initiateEmergencySequence(): Promise<CallResult[]> {
    this.currentPhase = 'calling_contacts';
    this.results = [];

    const contacts = await this.getSortedContacts();
    if (contacts.length === 0) {
      console.warn('[Emergency] No emergency contacts configured');
      this.currentPhase = 'complete';
      return [];
    }

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      // Call the contact
      const callResult = await this.makeCall(contact);
      this.results.push(callResult);

      // Send SMS to the same contact
      const message = this.buildEmergencyMessage();
      const smsResult = await this.sendEmergencyMessage(contact, message);
      if (smsResult) {
        this.results.push({
          contactId: contact.id,
          contactName: contact.name,
          success: true,
          timestamp: new Date(),
          method: 'sms',
        });
      }

      // Wait before trying next contact (unless it's the last one)
      if (i < contacts.length - 1) {
        await this.wait(this.waitBetweenCallsMs);
      }
    }

    return [...this.results];
  }

  async makeCall(contact: EmergencyContact): Promise<CallResult> {
    const telUrl =
      Platform.OS === 'ios' ? `telprompt:${contact.phoneNumber}` : `tel:${contact.phoneNumber}`;

    const opened = await this.openUrlIfSupported(telUrl);
    if (opened) {
      return {
        contactId: contact.id,
        contactName: contact.name,
        success: true,
        timestamp: new Date(),
        method: 'call',
      };
    }

    return {
      contactId: contact.id,
      contactName: contact.name,
      success: false,
      timestamp: new Date(),
      method: 'call',
      error: 'Unable to initiate call',
    };
  }

  async sendEmergencyMessage(contact: EmergencyContact, message: string): Promise<boolean> {
    const smsUrl = `sms:${contact.phoneNumber}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`;

    if (await this.openUrlIfSupported(smsUrl)) {
      return true;
    }

    return this.openUrlIfSupported(`sms:${contact.phoneNumber}`);
  }

  /**
   * Reveal the user's death note to an emergency contact.
   *
   * When a `pinHash` is provided, the death note is decrypted before
   * being sent. Without a `pinHash`, only legacy plaintext notes (or
   * unencrypted data) will be revealed; encrypted notes will produce
   * a generic fallback message.
   *
   * @param contact - The emergency contact to reveal to.
   * @param pinHash - Optional PIN hash for decrypting the death note.
   */
  async revealDeathNotesToContact(contact: EmergencyContact, pinHash?: string): Promise<void> {
    this.currentPhase = 'revealing_notes';

    // Try encrypted-aware path first, fall back to legacy plaintext
    const deathNote = await deathNoteService.getDeathNote(pinHash);

    if (!deathNote) {
      console.warn('[Emergency] No death note to reveal');
      // Send a generic message so the contact knows to check the app
      const fallback = this.buildDeathNoteSummary(null);
      await this.sendEmergencyMessage(contact, fallback);
      return;
    }

    const message = this.buildDeathNoteSummary(deathNote);
    await this.sendEmergencyMessage(contact, message);

    // Also send a local notification with the info
    await notificationService.sendEmergencyNotification({
      title: 'Emergency: Death Note Released',
      body: `Your emergency contact ${contact.name} has been given access to your Final Wishes & Instructions.`,
    });
  }

  /**
   * Run the full death sequence: clear browser history, call contacts,
   * Send emergency messages, and reveal death notes. This is the
   * ultimate fallback when the user is presumed dead.
   *
   * @param pinHash - Optional PIN hash for decrypting the death note.
   *   If omitted, encrypted notes will produce generic fallback messages.
   */
  async runFullDeathSequence(pinHash?: string): Promise<void> {
    // 1. Trigger history clear webhook
    this.currentPhase = 'clearing_history';
    await this.triggerHistoryClear();

    // 2. Call emergency contacts in priority order
    this.currentPhase = 'calling_contacts';
    const contacts = await this.getSortedContacts();

    for (const contact of contacts) {
      await this.makeCall(contact);
      const message = this.buildEmergencyMessage();
      await this.sendEmergencyMessage(contact, message);

      // Wait between contacts
      if (contacts.indexOf(contact) < contacts.length - 1) {
        await this.wait(this.waitBetweenCallsMs);
      }
    }

    // 3. Reveal death notes to all contacts with decryption support
    this.currentPhase = 'revealing_notes';
    for (const contact of contacts) {
      await this.revealDeathNotesToContact(contact, pinHash);
    }

    this.currentPhase = 'complete';
  }

  async triggerHistoryClear(): Promise<boolean> {
    const profile = await storageService.getUserProfile();
    const webhookUrl = profile?.settings?.historyClearWebhook;

    if (!webhookUrl) {
      // eslint-disable-next-line no-console
      console.log('[Emergency] No history clear webhook configured');
      return false;
    }

    try {
      await fetch(webhookUrl, { method: 'GET', mode: 'no-cors' });
      // eslint-disable-next-line no-console
      console.log('[Emergency] History clear webhook triggered');
      return true;
    } catch (error) {
      console.error('[Emergency] History clear webhook failed:', error);
      return false;
    }
  }

  async getSortedContacts(): Promise<EmergencyContact[]> {
    const contacts = await storageService.getEmergencyContacts();
    return [...contacts].sort((a, b) => a.priority - b.priority);
  }

  async addContact(contact: EmergencyContact): Promise<void> {
    const contacts = await storageService.getEmergencyContacts();
    contacts.push(contact);
    await storageService.setEmergencyContacts(contacts);
  }

  async removeContact(contactId: string): Promise<void> {
    const contacts = await storageService.getEmergencyContacts();
    await storageService.setEmergencyContacts(contacts.filter((c) => c.id !== contactId));
  }

  async updateContact(contact: EmergencyContact): Promise<void> {
    const contacts = await storageService.getEmergencyContacts();
    const index = contacts.findIndex((c) => c.id === contact.id);
    if (index !== -1) {
      contacts[index] = contact;
      await storageService.setEmergencyContacts(contacts);
    }
  }

  async getAllContacts(): Promise<EmergencyContact[]> {
    return await storageService.getEmergencyContacts();
  }

  resetEmergencySequence(): void {
    this.currentPhase = 'idle';
    this.results = [];
  }

  // ---- Private helpers ----

  private buildEmergencyMessage(): string {
    return `DEAD YET ALERT: This person has not responded to activity check-ins. Please try to contact them immediately. If you cannot reach them, their Final Wishes & Instructions will be released.`;
  }

  private buildDeathNoteSummary(deathNote: DeathNote | null): string {
    if (!deathNote) {
      return 'FINAL WISHES & INSTRUCTIONS:\n\nThe user has configured Final Wishes & Instructions. Please open the Dead Yet app on their device to access them.';
    }

    const parts: string[] = ['FINAL WISHES & INSTRUCTIONS:\n'];

    if (deathNote.address) {
      parts.push(
        `Address: ${deathNote.address.street}, ${deathNote.address.city}, ${deathNote.address.state} ${deathNote.address.zipCode}`,
      );
    }
    if (deathNote.pets?.length) {
      parts.push(`Pets: ${deathNote.pets.map((p: Pet) => `${p.name} (${p.species})`).join(', ')}`);
    }
    if (deathNote.financialAccounts?.length) {
      parts.push(
        `Financial accounts: ${deathNote.financialAccounts.map((a: FinancialAccount) => `${a.institution} - ${a.accountName}`).join(', ')}`,
      );
    }
    if (deathNote.otherImportantInfo) {
      parts.push(`Other info: ${deathNote.otherImportantInfo}`);
    }

    return parts.join('\n');
  }

  /** Reset mutable state — called when the user clears security data. */
  reset(): void {
    this.currentPhase = 'idle';
    this.results = [];
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getLinking(): LinkingApi | null {
    return (Linking as unknown as LinkingApi | null) ?? null;
  }

  private async openUrlIfSupported(url: string): Promise<boolean> {
    const linking = this.getLinking();

    if (typeof linking?.canOpenURL !== 'function' || typeof linking.openURL !== 'function') {
      return false;
    }

    try {
      if (!(await linking.canOpenURL(url))) {
        return false;
      }

      await linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }
}

export const emergencyService = EmergencyService.getInstance();
