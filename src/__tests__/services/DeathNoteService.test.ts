import { deathNoteService } from '../../services/DeathNoteService';
import { storageService } from '../../services/StorageService';
import { DeathNote } from '../../models/types';

jest.mock('../../services/StorageService', () => ({
  storageService: {
    getDeathNote: jest.fn(),
    setDeathNote: jest.fn(),
  },
}));

jest.mock('uuid', () => {
  let counter = 0;
  return {
    v4: jest.fn(() => `mock-uuid-${++counter}`),
  };
});

describe('DeathNoteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storageService.getDeathNote as jest.Mock).mockResolvedValue(null);
    (storageService.setDeathNote as jest.Mock).mockResolvedValue(true);
  });

  describe('getDeathNote', () => {
    it('returns null when no note exists', async () => {
      const result = await deathNoteService.getDeathNote();
      expect(result).toBeNull();
    });

    it('returns the saved death note', async () => {
      const mockNote: DeathNote = {
        id: 'note-1',
        financialAccounts: [],
        pets: [],
        otherImportantInfo: 'Hello',
        updatedAt: new Date(),
      };
      (storageService.getDeathNote as jest.Mock).mockResolvedValue(mockNote);
      const result = await deathNoteService.getDeathNote();
      expect(result).toEqual(mockNote);
    });
  });

  describe('createEmptyDeathNote', () => {
    it('creates a new empty death note with a UUID', async () => {
      const note = await deathNoteService.createEmptyDeathNote();
      expect(note.id).toMatch(/^mock-uuid-/);
      expect(note.financialAccounts).toEqual([]);
      expect(note.pets).toEqual([]);
      expect(note.otherImportantInfo).toBe('');
      expect(storageService.setDeathNote).toHaveBeenCalled();
    });
  });

  describe('updateAddress', () => {
    it('updates the address on an existing note', async () => {
      const note = await deathNoteService.createEmptyDeathNote();
      (storageService.getDeathNote as jest.Mock).mockResolvedValue(note);

      const address = {
        street: '123 Main St',
        city: 'NYC',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
      };
      await deathNoteService.updateAddress(address);

      const setCall = (storageService.setDeathNote as jest.Mock).mock.calls.slice(-1)[0][0];
      expect(setCall.address).toEqual(address);
    });
  });

  describe('addFinancialAccount', () => {
    it('adds a financial account with a generated ID', async () => {
      const note = await deathNoteService.createEmptyDeathNote();
      (storageService.getDeathNote as jest.Mock).mockResolvedValue(note);

      await deathNoteService.addFinancialAccount({
        institution: 'Chase',
        accountType: 'bank',
        accountName: 'Checking',
      });

      const setCall = (storageService.setDeathNote as jest.Mock).mock.calls.slice(-1)[0][0];
      expect(setCall.financialAccounts).toHaveLength(1);
      expect(setCall.financialAccounts[0].institution).toBe('Chase');
      expect(setCall.financialAccounts[0].id).toMatch(/^mock-uuid-/);
    });
  });

  describe('addPet', () => {
    it('adds a pet with a generated ID', async () => {
      const note = await deathNoteService.createEmptyDeathNote();
      (storageService.getDeathNote as jest.Mock).mockResolvedValue(note);

      await deathNoteService.addPet({
        name: 'Rex',
        species: 'Dog',
        feedingInstructions: 'Twice daily',
        veterinaryContact: 'Dr. Smith',
        otherCareNotes: '',
      });

      const setCall = (storageService.setDeathNote as jest.Mock).mock.calls.slice(-1)[0][0];
      expect(setCall.pets).toHaveLength(1);
      expect(setCall.pets[0].name).toBe('Rex');
      expect(setCall.pets[0].id).toMatch(/^mock-uuid-/);
    });
  });

  describe('exportDeathNote', () => {
    it('returns empty string when no note exists', async () => {
      (storageService.getDeathNote as jest.Mock).mockResolvedValue(null);
      const result = await deathNoteService.exportDeathNote();
      expect(result).toBe('');
    });

    it('returns JSON string of the death note', async () => {
      const note = await deathNoteService.createEmptyDeathNote();
      (storageService.getDeathNote as jest.Mock).mockResolvedValue(note);
      const result = await deathNoteService.exportDeathNote();
      const parsed = JSON.parse(result);
      expect(parsed.id).toBe(note.id);
    });
  });
});
