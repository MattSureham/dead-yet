import { deathNoteService } from '../../services/DeathNoteService';
import { storageService } from '../../services/StorageService';
import { cryptoService } from '../../services/CryptoService';
import { DeathNote } from '../../models/types';

jest.mock('../../services/StorageService', () => ({
  storageService: {
    getDeathNote: jest.fn(),
    setDeathNote: jest.fn(),
    getDeathNoteRaw: jest.fn(),
    setDeathNoteRaw: jest.fn(),
  },
}));

jest.mock('../../services/CryptoService', () => ({
  cryptoService: {
    isEncrypted: jest.fn().mockReturnValue(false),
    encrypt: jest.fn().mockImplementation((_plaintext: string) =>
      Promise.resolve('DEv1:mockiv:mockciphertext'),
    ),
    decrypt: jest.fn().mockImplementation((_encrypted: string, _pinHash: string) =>
      Promise.resolve('{"id":"decrypted-1","financialAccounts":[],"pets":[],"otherImportantInfo":"secret","updatedAt":"2026-01-01T00:00:00.000Z"}'),
    ),
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
    (storageService.getDeathNoteRaw as jest.Mock).mockResolvedValue(null); // Not encrypted
    (storageService.setDeathNoteRaw as jest.Mock).mockResolvedValue(true);
    // Reset crypto mocks to safe defaults
    (cryptoService.isEncrypted as jest.Mock).mockReturnValue(false);
    (cryptoService.encrypt as jest.Mock).mockImplementation((_plaintext: string) =>
      Promise.resolve('DEv1:mockiv:mockciphertext'),
    );
    (cryptoService.decrypt as jest.Mock).mockImplementation((_encrypted: string, _pinHash: string) =>
      Promise.resolve('{"id":"decrypted-1","financialAccounts":[],"pets":[],"otherImportantInfo":"secret","updatedAt":"2026-01-01T00:00:00.000Z"}'),
    );
  });

  describe('getDeathNote', () => {
    it('returns null when no note exists', async () => {
      const result = await deathNoteService.getDeathNote();
      expect(result).toBeNull();
    });

    it('returns the saved death note from raw storage (legacy plaintext)', async () => {
      const mockNote: DeathNote = {
        id: 'note-1',
        financialAccounts: [],
        pets: [],
        otherImportantInfo: 'Hello',
        updatedAt: new Date(),
      };
      // Store as raw JSON string — simulates legacy setDeathNoteRaw or
      // old setDeathNote (which JSON.stringify's under the hood).
      (storageService.getDeathNoteRaw as jest.Mock).mockResolvedValue(
        JSON.stringify(mockNote),
      );
      const result = await deathNoteService.getDeathNote();
      // Dates are revived to Date objects via safeJsonParse
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
      (storageService.getDeathNoteRaw as jest.Mock).mockResolvedValue(
        JSON.stringify(note),
      );

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
      (storageService.getDeathNoteRaw as jest.Mock).mockResolvedValue(
        JSON.stringify(note),
      );

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
      (storageService.getDeathNoteRaw as jest.Mock).mockResolvedValue(
        JSON.stringify(note),
      );

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
      // Mock raw storage to return the note as a JSON string
      (storageService.getDeathNoteRaw as jest.Mock).mockResolvedValue(
        JSON.stringify(note),
      );
      const result = await deathNoteService.exportDeathNote();
      const parsed = JSON.parse(result);
      expect(parsed.id).toBe(note.id);
    });
  });

  // ---------------------------------------------------------------------------
  // Encryption integration tests
  // ---------------------------------------------------------------------------

  describe('encryption (save + load with pinHash)', () => {
    const PIN_HASH = 'salt123:hash456';

    it('saveDeathNote with pinHash encrypts and stores via setDeathNoteRaw', async () => {
      const note: DeathNote = {
        id: 'note-enc-1',
        financialAccounts: [],
        pets: [],
        otherImportantInfo: 'private data',
        updatedAt: new Date(),
      };

      await deathNoteService.saveDeathNote(note, PIN_HASH);

      // Should call encrypt with JSON and store the result raw
      expect(cryptoService.encrypt).toHaveBeenCalledWith(
        JSON.stringify(note),
        PIN_HASH,
      );
      expect(storageService.setDeathNoteRaw).toHaveBeenCalledWith(
        'DEv1:mockiv:mockciphertext',
      );
      // Should NOT call the legacy setDeathNote
      expect(storageService.setDeathNote).not.toHaveBeenCalled();
    });

    it('saveDeathNote without pinHash stores as plaintext via setDeathNote', async () => {
      const note: DeathNote = {
        id: 'note-plain-1',
        financialAccounts: [],
        pets: [],
        otherImportantInfo: 'public data',
        updatedAt: new Date(),
      };

      await deathNoteService.saveDeathNote(note);

      expect(cryptoService.encrypt).not.toHaveBeenCalled();
      expect(storageService.setDeathNote).toHaveBeenCalledWith(note);
      expect(storageService.setDeathNoteRaw).not.toHaveBeenCalled();
    });

    it('getDeathNote with pinHash decrypts encrypted data', async () => {
      // Simulate encrypted data in storage
      (storageService.getDeathNoteRaw as jest.Mock).mockResolvedValue(
        'DEv1:mockiv:mockciphertext',
      );
      (cryptoService.isEncrypted as jest.Mock).mockReturnValue(true);

      const result = await deathNoteService.getDeathNote(PIN_HASH);

      expect(cryptoService.decrypt).toHaveBeenCalledWith(
        'DEv1:mockiv:mockciphertext',
        PIN_HASH,
      );
      expect(result).not.toBeNull();
      expect(result!.id).toBe('decrypted-1');
      expect(result!.otherImportantInfo).toBe('secret');
    });

    it('getDeathNote without pinHash returns null for encrypted data', async () => {
      (storageService.getDeathNoteRaw as jest.Mock).mockResolvedValue(
        'DEv1:mockiv:mockciphertext',
      );
      (cryptoService.isEncrypted as jest.Mock).mockReturnValue(true);

      const result = await deathNoteService.getDeathNote(); // no pinHash

      expect(result).toBeNull();
      expect(cryptoService.decrypt).not.toHaveBeenCalled();
    });

    it('getDeathNote with wrong pinHash returns null (decryption fails)', async () => {
      (storageService.getDeathNoteRaw as jest.Mock).mockResolvedValue(
        'DEv1:mockiv:mockciphertext',
      );
      (cryptoService.isEncrypted as jest.Mock).mockReturnValue(true);
      (cryptoService.decrypt as jest.Mock).mockRejectedValue(
        new Error('Decryption failed — wrong PIN or corrupted data'),
      );

      const result = await deathNoteService.getDeathNote('wrong-hash');

      expect(result).toBeNull();
    });

    it('createEmptyDeathNote with pinHash encrypts the empty note', async () => {
      await deathNoteService.createEmptyDeathNote(PIN_HASH);

      // Should have encrypted the empty note
      expect(cryptoService.encrypt).toHaveBeenCalled();
      expect(storageService.setDeathNoteRaw).toHaveBeenCalled();
      expect(storageService.setDeathNote).not.toHaveBeenCalled();
    });

    it('getDeathNote returns plaintext data even when pinHash is provided', async () => {
      // Plaintext stored data (not encrypted)
      const plainNote = JSON.stringify({
        id: 'note-plain-2',
        financialAccounts: [],
        pets: [],
        otherImportantInfo: 'plaintext',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      (storageService.getDeathNoteRaw as jest.Mock).mockResolvedValue(plainNote);
      // isEncrypted returns false for plaintext
      (cryptoService.isEncrypted as jest.Mock).mockReturnValue(false);

      const result = await deathNoteService.getDeathNote(PIN_HASH);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('note-plain-2');
      // Should NOT have called decrypt because data isn't encrypted
      expect(cryptoService.decrypt).not.toHaveBeenCalled();
    });
  });
});
