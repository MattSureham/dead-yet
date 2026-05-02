import { emergencyService } from '../../services/EmergencyService';
import { storageService } from '../../services/StorageService';
import { EmergencyContact } from '../../models/types';

jest.mock('../../services/StorageService', () => ({
  storageService: {
    getEmergencyContacts: jest.fn(),
    setEmergencyContacts: jest.fn(),
    getDeathNote: jest.fn(),
    getUserProfile: jest.fn(),
  },
}));

const mockContact: EmergencyContact = {
  id: 'c1',
  name: 'Alice',
  phoneNumber: '+11111111111',
  email: 'alice@test.com',
  relationship: 'Friend',
  priority: 2,
  isVerified: false,
  createdAt: new Date(),
};

const mockContact2: EmergencyContact = {
  id: 'c2',
  name: 'Bob',
  phoneNumber: '+22222222222',
  email: 'bob@test.com',
  relationship: 'Spouse',
  priority: 1,
  isVerified: true,
  createdAt: new Date(),
};

describe('EmergencyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storageService.getEmergencyContacts as jest.Mock).mockResolvedValue([]);
    (storageService.setEmergencyContacts as jest.Mock).mockResolvedValue(true);
    (storageService.getDeathNote as jest.Mock).mockResolvedValue(null);
    (storageService.getUserProfile as jest.Mock).mockResolvedValue(null);
  });

  describe('getSortedContacts', () => {
    it('sorts contacts by priority ascending', async () => {
      (storageService.getEmergencyContacts as jest.Mock).mockResolvedValue([
        mockContact,
        mockContact2,
      ]);

      const sorted = await emergencyService.getSortedContacts();
      expect(sorted[0].priority).toBeLessThanOrEqual(sorted[1].priority);
      expect(sorted[0].name).toBe('Bob'); // priority 1
      expect(sorted[1].name).toBe('Alice'); // priority 2
    });

    it('returns empty array when no contacts exist', async () => {
      const result = await emergencyService.getSortedContacts();
      expect(result).toEqual([]);
    });
  });

  describe('addContact', () => {
    it('appends a new contact and persists', async () => {
      await emergencyService.addContact(mockContact);
      expect(storageService.setEmergencyContacts).toHaveBeenCalledWith([mockContact]);
    });
  });

  describe('removeContact', () => {
    it('removes a contact by id', async () => {
      (storageService.getEmergencyContacts as jest.Mock).mockResolvedValue([
        mockContact,
        mockContact2,
      ]);

      await emergencyService.removeContact('c1');

      const setCall = (storageService.setEmergencyContacts as jest.Mock).mock.calls[0][0];
      expect(setCall).toHaveLength(1);
      expect(setCall[0].id).toBe('c2');
    });
  });

  describe('triggerHistoryClear', () => {
    it('returns false when no webhook configured', async () => {
      const result = await emergencyService.triggerHistoryClear();
      expect(result).toBe(false);
    });

    it('calls fetch with the webhook URL when configured', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        settings: { historyClearWebhook: 'https://example.com/clear' },
      });

      const result = await emergencyService.triggerHistoryClear();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/clear',
        { method: 'GET', mode: 'no-cors' },
      );
      expect(result).toBe(true);
    });
  });

  describe('initiateEmergencySequence', () => {
    it('iterates contacts by priority order', async () => {
      (storageService.getEmergencyContacts as jest.Mock).mockResolvedValue([
        mockContact,
        mockContact2,
      ]);

      const results = await emergencyService.initiateEmergencySequence();
      // Bob (priority 1) should be first
      expect(results[0].contactId).toBe('c2');
      expect(results[1].contactId).toBe('c1');
    });
  });
});
