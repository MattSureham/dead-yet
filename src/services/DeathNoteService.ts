import { DeathNote, AddressInfo, FinancialAccount, Pet } from '../models/types';
import { storageService } from './StorageService';
import { cryptoService } from './CryptoService';
import { v4 as uuidv4 } from 'uuid';

class DeathNoteService {
  private static instance: DeathNoteService;

  static getInstance(): DeathNoteService {
    if (!DeathNoteService.instance) {
      DeathNoteService.instance = new DeathNoteService();
    }
    return DeathNoteService.instance;
  }

  /**
   * Load the death note from storage.
   *
   * @param pinHash - Optional PIN hash for decryption. If omitted, only
   *   legacy plaintext data will be returned. If the stored data is
   *   encrypted and no pinHash is provided, returns null.
   */
  async getDeathNote(pinHash?: string): Promise<DeathNote | null> {
    const raw = await storageService.getDeathNoteRaw();

    if (raw) {
      // Encrypted path
      if (cryptoService.isEncrypted(raw)) {
        if (!pinHash) return null; // Can't decrypt without PIN
        try {
          const plaintext = await cryptoService.decrypt(raw, pinHash);
          return JSON.parse(plaintext) as DeathNote;
        } catch (err) {
          console.error('[DeathNoteService] Failed to decrypt death note:', err);
          return null;
        }
      }
      // Legacy plaintext JSON stored via setDeathNoteRaw (or direct AsyncStorage)
      try {
        return JSON.parse(raw) as DeathNote;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Persist the death note. Encrypts at rest when pinHash is provided.
   *
   * @param deathNote - The note to save.
   * @param pinHash   - Optional PIN hash for encryption.
   */
  async saveDeathNote(deathNote: DeathNote, pinHash?: string): Promise<void> {
    deathNote.updatedAt = new Date();

    if (pinHash) {
      const plaintext = JSON.stringify(deathNote);
      const encrypted = await cryptoService.encrypt(plaintext, pinHash);
      await storageService.setDeathNoteRaw(encrypted);
    } else {
      await storageService.setDeathNote(deathNote);
    }
  }

  async createEmptyDeathNote(pinHash?: string): Promise<DeathNote> {
    const note: DeathNote = {
      id: uuidv4(),
      financialAccounts: [],
      pets: [],
      otherImportantInfo: '',
      updatedAt: new Date(),
    };
    await this.saveDeathNote(note, pinHash);
    return note;
  }

  async updateAddress(address: AddressInfo, pinHash?: string): Promise<void> {
    const note = await this.getOrCreateNote(pinHash);
    note.address = address;
    await this.saveDeathNote(note, pinHash);
  }

  async addFinancialAccount(account: Omit<FinancialAccount, 'id'>, pinHash?: string): Promise<void> {
    const note = await this.getOrCreateNote(pinHash);
    note.financialAccounts.push({ ...account, id: uuidv4() });
    await this.saveDeathNote(note, pinHash);
  }

  async updateFinancialAccount(account: FinancialAccount, pinHash?: string): Promise<void> {
    const note = await this.getOrCreateNote(pinHash);
    const index = note.financialAccounts.findIndex(a => a.id === account.id);
    if (index !== -1) {
      note.financialAccounts[index] = account;
      await this.saveDeathNote(note, pinHash);
    }
  }

  async removeFinancialAccount(accountId: string, pinHash?: string): Promise<void> {
    const note = await this.getOrCreateNote(pinHash);
    note.financialAccounts = note.financialAccounts.filter(a => a.id !== accountId);
    await this.saveDeathNote(note, pinHash);
  }

  async addPet(pet: Omit<Pet, 'id'>, pinHash?: string): Promise<void> {
    const note = await this.getOrCreateNote(pinHash);
    note.pets.push({ ...pet, id: uuidv4() });
    await this.saveDeathNote(note, pinHash);
  }

  async updatePet(pet: Pet, pinHash?: string): Promise<void> {
    const note = await this.getOrCreateNote(pinHash);
    const index = note.pets.findIndex(p => p.id === pet.id);
    if (index !== -1) {
      note.pets[index] = pet;
      await this.saveDeathNote(note, pinHash);
    }
  }

  async removePet(petId: string, pinHash?: string): Promise<void> {
    const note = await this.getOrCreateNote(pinHash);
    note.pets = note.pets.filter(p => p.id !== petId);
    await this.saveDeathNote(note, pinHash);
  }

  async updateOtherInfo(info: string, pinHash?: string): Promise<void> {
    const note = await this.getOrCreateNote(pinHash);
    note.otherImportantInfo = info;
    await this.saveDeathNote(note, pinHash);
  }

  private async getOrCreateNote(pinHash?: string): Promise<DeathNote> {
    let note = await this.getDeathNote(pinHash);
    if (!note) {
      note = await this.createEmptyDeathNote(pinHash);
    }
    return note;
  }

  async exportDeathNote(pinHash?: string): Promise<string> {
    const note = await this.getDeathNote(pinHash);
    if (!note) return '';
    return JSON.stringify(note, null, 2);
  }
}

export const deathNoteService = DeathNoteService.getInstance();