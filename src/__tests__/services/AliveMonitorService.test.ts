import { UserProfile } from '../../models/types';

// Mock storage service with a controllable profile
const mockProfile: UserProfile = {
  id: 'u1',
  name: 'Test User',
  createdAt: new Date('2026-01-01'),
  lastActivityAt: new Date(), // default: just now
  isConfirmedAlive: true,
  lastConfirmedAt: new Date(),
  settings: {
    inactivityThresholdDays: 3,
    confirmationTimeoutHours: 24,
    notificationsEnabled: true,
  },
};

jest.mock('../../services/StorageService', () => ({
  storageService: {
    getUserProfile: jest.fn(),
    setUserProfile: jest.fn(),
  },
}));

import { storageService } from '../../services/StorageService';
import { aliveMonitorService } from '../../services/AliveMonitorService';

describe('AliveMonitorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: profile exists with activity "just now"
    (storageService.getUserProfile as jest.Mock).mockResolvedValue({
      ...mockProfile,
      lastActivityAt: new Date(),
    });
    (storageService.setUserProfile as jest.Mock).mockResolvedValue(true);
    aliveMonitorService.reset();
  });

  // -----------------------------------------------------------------------
  // State evaluation
  // -----------------------------------------------------------------------

  describe('evaluate', () => {
    it('returns active when activity is recent', async () => {
      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('active');
      expect(status.confidence).toBeGreaterThan(0.9);
    });

    it('returns active when within quiet threshold', async () => {
      // Default quiet threshold = (3*24)/2 = 36h. Set activity to 30h ago.
      const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: thirtyHoursAgo,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('active');
      expect(status.confidence).toBeLessThan(1.0);
      expect(status.confidence).toBeGreaterThan(0);
    });

    it('returns quiet when silence exceeds quiet threshold but not silent threshold', async () => {
      // Default: quiet = 36h, silent = 72h. Set activity to 50h ago.
      const fiftyHoursAgo = new Date(Date.now() - 50 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: fiftyHoursAgo,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('quiet');
    });

    it('returns silent when silence exceeds silent threshold but not dead threshold', async () => {
      // Default: silent = 72h, dead = 144h. Set activity to 100h ago.
      const hundredHoursAgo = new Date(Date.now() - 100 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: hundredHoursAgo,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('silent');
    });

    it('returns presumed_dead when silence exceeds dead threshold', async () => {
      // Default dead = 144h. Set activity to 200h ago.
      const twoHundredHoursAgo = new Date(Date.now() - 200 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: twoHundredHoursAgo,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('presumed_dead');
      expect(status.confidence).toBe(1.0);
    });

    it('returns active when no profile exists', async () => {
      (storageService.getUserProfile as jest.Mock).mockResolvedValue(null);

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('active');
      expect(status.lastActivity).toBeNull();
      expect(status.nextCheckAt).toBeNull();
    });

    it('returns active when no lastActivityAt is set and falls back to last confirmation', async () => {
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: undefined,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('active');
    });
  });

  // -----------------------------------------------------------------------
  // Threshold boundaries
  // -----------------------------------------------------------------------

  describe('threshold boundaries', () => {
    it('transitions from active to quiet at exactly quiet threshold', async () => {
      // quiet = 36h. Set activity exactly 36h ago.
      const thirtySixHoursAgo = new Date(Date.now() - 36 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: thirtySixHoursAgo,
      });

      const status = await aliveMonitorService.evaluate();
      // At exactly 36h, silenceHours >= quietThreshold → quiet
      expect(status.state).toBe('quiet');
    });

    it('transitions from quiet to silent at exactly silent threshold', async () => {
      // silent = 72h. Set activity exactly 72h ago.
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: seventyTwoHoursAgo,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('silent');
    });

    it('transitions from silent to presumed_dead at exactly dead threshold', async () => {
      // dead = 144h. Set activity exactly 144h ago.
      const oneFortyFourHoursAgo = new Date(Date.now() - 144 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: oneFortyFourHoursAgo,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('presumed_dead');
    });

    it('just below quiet threshold stays active', async () => {
      // quiet = 36h. Set activity 35h ago.
      const thirtyFiveHoursAgo = new Date(Date.now() - 35 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: thirtyFiveHoursAgo,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('active');
    });
  });

  // -----------------------------------------------------------------------
  // Custom thresholds from user settings
  // -----------------------------------------------------------------------

  describe('custom thresholds', () => {
    it('uses custom inactivityThresholdDays for thresholds', async () => {
      // inactivityThresholdDays = 1 → silent = 24h, quiet = 12h, dead = 48h
      // Activity 20h ago should be quiet (12h < 20h < 24h)
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: twentyHoursAgo,
        settings: {
          ...mockProfile.settings,
          inactivityThresholdDays: 1, // silent = 24h, quiet = 12h
        },
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('quiet');
    });

    it('respects confirmationTimeoutHours for nextCheckAt in silent state', async () => {
      // silent = 72h. Activity 100h ago → silent.
      const hundredHoursAgo = new Date(Date.now() - 100 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: hundredHoursAgo,
        settings: {
          ...mockProfile.settings,
          confirmationTimeoutHours: 6, // shorter timeout
        },
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('silent');
      // nextCheckAt should be ~6h from now
      expect(status.nextCheckAt).not.toBeNull();
      const diffMs = status.nextCheckAt!.getTime() - Date.now();
      const diffHours = diffMs / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(6, 0);
    });
  });

  // -----------------------------------------------------------------------
  // checkIn
  // -----------------------------------------------------------------------

  describe('checkIn', () => {
    it('resets status to active regardless of previous state', async () => {
      // First, set up a "dead" state
      const twoHundredHoursAgo = new Date(Date.now() - 200 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: twoHundredHoursAgo,
      });

      const deadStatus = await aliveMonitorService.evaluate();
      expect(deadStatus.state).toBe('presumed_dead');

      // Now check in — should update profile and return active
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: new Date(), // updated by checkIn
      });

      const status = await aliveMonitorService.checkIn();
      expect(status.state).toBe('active');
      expect(status.confidence).toBeGreaterThan(0.9);
    });

    it('updates the user profile via storageService', async () => {
      await aliveMonitorService.checkIn();

      expect(storageService.setUserProfile).toHaveBeenCalledTimes(1);
      const updatedProfile = (storageService.setUserProfile as jest.Mock).mock.calls[0][0];
      expect(updatedProfile.isConfirmedAlive).toBe(true);
      expect(updatedProfile.lastConfirmedAt).toBeDefined();
    });

    it('handles missing profile gracefully', async () => {
      (storageService.getUserProfile as jest.Mock).mockResolvedValue(null);

      const status = await aliveMonitorService.checkIn();
      expect(status.state).toBe('active');
    });
  });

  // -----------------------------------------------------------------------
  // getStatus (synchronous cache)
  // -----------------------------------------------------------------------

  describe('getStatus', () => {
    it('returns the cached status from last evaluate', async () => {
      // Evaluate first
      await aliveMonitorService.evaluate();

      const cached = aliveMonitorService.getStatus();
      expect(cached.state).toBe('active');

      // Now make the world "dead" and evaluate
      const twoHundredHoursAgo = new Date(Date.now() - 200 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: twoHundredHoursAgo,
      });
      await aliveMonitorService.evaluate();

      const cachedDead = aliveMonitorService.getStatus();
      expect(cachedDead.state).toBe('presumed_dead');
    });

    it('returns a copy, not a reference', async () => {
      await aliveMonitorService.evaluate();

      const status1 = aliveMonitorService.getStatus();
      const status2 = aliveMonitorService.getStatus();
      expect(status1).not.toBe(status2); // Different object references
      expect(status1.state).toBe(status2.state);
    });
  });

  // -----------------------------------------------------------------------
  // Status change listeners
  // -----------------------------------------------------------------------

  describe('onStatusChange', () => {
    it('notifies listeners when state transitions', async () => {
      const listener = jest.fn();
      const unsub = aliveMonitorService.onStatusChange(listener);

      // Start from active (default)
      await aliveMonitorService.evaluate();
      expect(listener).not.toHaveBeenCalled(); // No transition yet

      // Transition to quiet
      const fiftyHoursAgo = new Date(Date.now() - 50 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: fiftyHoursAgo,
      });
      await aliveMonitorService.evaluate();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ state: 'quiet' }));

      unsub();
    });

    it('does not notify when state stays the same', async () => {
      const listener = jest.fn();
      aliveMonitorService.onStatusChange(listener);

      // First eval → active (no transition from initial default)
      await aliveMonitorService.evaluate();
      expect(listener).not.toHaveBeenCalled();

      // Second eval → still active
      await aliveMonitorService.evaluate();
      expect(listener).not.toHaveBeenCalled();
    });

    it('handles listener errors gracefully', async () => {
      const badListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();

      aliveMonitorService.onStatusChange(badListener);
      aliveMonitorService.onStatusChange(goodListener);

      // Trigger a transition
      const fiftyHoursAgo = new Date(Date.now() - 50 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: fiftyHoursAgo,
      });

      // Should not throw
      await aliveMonitorService.evaluate();

      // Bad listener threw but good listener was still called
      expect(badListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });

    it('returns unsubscribe function that works', async () => {
      const listener = jest.fn();
      const unsub = aliveMonitorService.onStatusChange(listener);
      unsub();

      // Transition — listener shouldn't fire
      const fiftyHoursAgo = new Date(Date.now() - 50 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: fiftyHoursAgo,
      });
      await aliveMonitorService.evaluate();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Confidence values
  // -----------------------------------------------------------------------

  describe('confidence', () => {
    it('decreases as silence approaches quiet threshold', async () => {
      // quiet = 36h. At 18h, confidence should be ~0.5
      const eighteenHoursAgo = new Date(Date.now() - 18 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: eighteenHoursAgo,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('active');
      expect(status.confidence).toBeCloseTo(0.5, 1);
    });

    it('is 1.0 for presumed_dead', async () => {
      const twoHundredHoursAgo = new Date(Date.now() - 200 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: twoHundredHoursAgo,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('presumed_dead');
      expect(status.confidence).toBe(1.0);
    });
  });

  // -----------------------------------------------------------------------
  // nextCheckAt
  // -----------------------------------------------------------------------

  describe('nextCheckAt', () => {
    it('is null for presumed_dead (terminal state)', async () => {
      const twoHundredHoursAgo = new Date(Date.now() - 200 * 60 * 60 * 1000);
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: twoHundredHoursAgo,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.nextCheckAt).toBeNull();
    });

    it('is in the future for active state', async () => {
      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('active');
      expect(status.nextCheckAt).not.toBeNull();
      expect(status.nextCheckAt!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles future lastActivityAt dates gracefully', async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour in future
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: futureDate,
      });

      const status = await aliveMonitorService.evaluate();
      // silenceHours clamped to 0
      expect(status.state).toBe('active');
      expect(status.silenceHours).toBe(0);
    });

    it('handles very old activity dates', async () => {
      const veryOldDate = new Date('2020-01-01');
      (storageService.getUserProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        lastActivityAt: veryOldDate,
      });

      const status = await aliveMonitorService.evaluate();
      expect(status.state).toBe('presumed_dead');
    });

    it('handles storage service errors gracefully', async () => {
      (storageService.getUserProfile as jest.Mock).mockRejectedValue(new Error('Storage error'));

      await expect(aliveMonitorService.evaluate()).rejects.toThrow('Storage error');
    });
  });
});
