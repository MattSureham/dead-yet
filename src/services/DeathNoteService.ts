import { DeathNote, AddressInfo, FinancialAccount, Pet } from '../models/types';
import { storageService } from './StorageService';
import { v4 as uuidv4 } from 'uuid';

class DeathNoteService {
  private static instance: DeathNoteService;

  static getInstance(): DeathNoteService {
    if (!DeathNoteService.instance) {
      DeathNoteService.instance = new DeathNoteService();
    }
    return DeathNoteService.instance;
  }

  async getDeathNote(): Promise<DeathNote | null> {
    const result = await storageService.getDeathNote();
    return result as DeathNote | null;
  }

  async saveDeathNote(deathNote: DeathNote): Promise<void> {
    deathNote.updatedAt = new Date();
    await storageService.setDeathNote(deathNote);
  }

  async createEmptyDeathNote(): Promise<DeathNote> {
    const note: DeathNote = {
      id: uuidv4(),
      financialAccounts: [],
      pets: [],
      otherImportantInfo: '',
      updatedAt: new Date(),
    };
    await storageService.setDeathNote(note);
    return note;
  }

  async updateAddress(address: AddressInfo): Promise<void> {
    const note = await this.getOrCreateNote();
    note.address = address;
    await this.saveDeathNote(note);
  }

  async addFinancialAccount(account: Omit<FinancialAccount, 'id'>): Promise<void> {
    const note = await this.getOrCreateNote();
    note.financialAccounts.push({ ...account, id: uuidv4() });
    await this.saveDeathNote(note);
  }

  async updateFinancialAccount(account: FinancialAccount): Promise<void> {
    const note = await this.getOrCreateNote();
    const index = note.financialAccounts.findIndex(a => a.id === account.id);
    if (index !== -1) {
      note.financialAccounts[index] = account;
      await this.saveDeathNote(note);
    }
  }

  async removeFinancialAccount(accountId: string): Promise<void> {
    const note = await this.getOrCreateNote();
    note.financialAccounts = note.financialAccounts.filter(a => a.id !== accountId);
    await this.saveDeathNote(note);
  }

  async addPet(pet: Omit<Pet, 'id'>): Promise<void> {
    const note = await this.getOrCreateNote();
    note.pets.push({ ...pet, id: uuidv4() });
    await this.saveDeathNote(note);
  }

  async updatePet(pet: Pet): Promise<void> {
    const note = await this.getOrCreateNote();
    const index = note.pets.findIndex(p => p.id === pet.id);
    if (index !== -1) {
      note.pets[index] = pet;
      await this.saveDeathNote(note);
    }
  }

  async removePet(petId: string): Promise<void> {
    const note = await this.getOrCreateNote();
    note.pets = note.pets.filter(p => p.id !== petId);
    await this.saveDeathNote(note);
  }

  async updateOtherInfo(info: string): Promise<void> {
    const note = await this.getOrCreateNote();
    note.otherImportantInfo = info;
    await this.saveDeathNote(note);
  }

  private async getOrCreateNote(): Promise<DeathNote> {
    let note = await this.getDeathNote();
    if (!note) {
      note = await this.createEmptyDeathNote();
    }
    return note;
  }

  async exportDeathNote(): Promise<string> {
    const note = await this.getDeathNote();
    if (!note) return '';
    return JSON.stringify(note, null, 2);
  }
}

export const deathNoteService = DeathNoteService.getInstance();