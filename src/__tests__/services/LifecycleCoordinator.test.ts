/**
 * LifecycleCoordinator unit tests.
 *
 * The coordinator's design (dependency injection via constructor) makes it
 * straightforward to test. We mock all service dependencies at the module
 * level so we can import LifecycleCoordinator without triggering expo-native
 * module resolution, then inject our own mocks via the constructor.
 */

import { AliveStatus } from '../../models/types';

// ---------------------------------------------------------------------------
// Jest module mocks — must be before any imports that transitively touch
// expo-notifications or other native modules
// ---------------------------------------------------------------------------

const mockAppStateListeners = new Set<(state: string) => void>();

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_event: string, handler: (state: string) => void) => {
      mockAppStateListeners.add(handler);
      return { remove: () => mockAppStateListeners.delete(handler) };
    }),
  },
  Platform: { OS: 'ios' },
}));

jest.mock('../../services/StorageService', () => ({
  storageService: {
    getEmergencyContacts: jest.fn(),
    setEmergencyContacts: jest.fn(),
    getDeathNote: jest.fn(),
    getUserProfile: jest.fn(),
    setUserProfile: jest.fn(),
  },
}));

jest.mock('../../services/NotificationService', () => ({
  notificationService: {
    sendEmergencyNotification: jest.fn(),
    requestPermissions: jest.fn(),
    scheduleInactivityCheck: jest.fn(),
    scheduleConfirmationTimeout: jest.fn().mockResolvedValue(undefined),
    cancelAllNotifications: jest.fn().mockResolvedValue(undefined),
    sendImmediateNotification: jest.fn(),
    addNotificationReceivedListener: jest.fn(),
    addNotificationResponseListener: jest.fn(),
  },
}));

jest.mock('../../services/EmergencyService', () => ({
  emergencyService: {
    runFullDeathSequence: jest.fn().mockResolvedValue(undefined),
    getCurrentPhase: jest.fn(),
    resetEmergencySequence: jest.fn(),
  },
}));

jest.mock('../../services/AliveMonitorService', () => ({
  aliveMonitorService: {
    evaluate: jest.fn().mockResolvedValue({ state: 'active' }),
    checkIn: jest.fn().mockResolvedValue({ state: 'active' }),
    onStatusChange: jest.fn().mockReturnValue(jest.fn()),
    getStatus: jest.fn().mockReturnValue({
      state: 'active',
      lastActivity: new Date(),
      silenceHours: 0,
      nextCheckAt: null,
      confidence: 1.0,
    }),
  },
}));

jest.mock('../../services/DeathNoteService', () => ({
  deathNoteService: {
    getDeathNote: jest.fn().mockResolvedValue(null),
  },
}));

// Now we can safely import
import { LifecycleCoordinator, LifecycleEvent } from '../../services/LifecycleCoordinator';
import { aliveMonitorService } from '../../services/AliveMonitorService';
import { notificationService } from '../../services/NotificationService';
import { emergencyService } from '../../services/EmergencyService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal AliveStatus with defaults for all required fields. */
function makeStatus(overrides: Partial<AliveStatus> = {}): AliveStatus {
  return {
    state: 'active',
    lastActivity: new Date(),
    silenceHours: 0,
    nextCheckAt: new Date(Date.now() + 36 * 60 * 60 * 1000),
    confidence: 1.0,
    ...overrides,
  };
}

/** Wait for microtasks to flush (promises, mocked async work). */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LifecycleCoordinator', () => {
  let coordinator: LifecycleCoordinator;

  beforeEach(() => {
    jest.clearAllMocks();

    /* eslint-disable @typescript-eslint/no-explicit-any */
    coordinator = new LifecycleCoordinator(
      aliveMonitorService as any,
      notificationService as any,
      emergencyService as any,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
    mockAppStateListeners.clear();
  });

  afterEach(() => {
    coordinator.reset();
  });

  // -----------------------------------------------------------------------
  // Start / Stop
  // -----------------------------------------------------------------------

  describe('start()', () => {
    it('sets phase to watching and registers the monitor listener', () => {
      coordinator.start('test-hash');
      expect(coordinator.getPhase()).toBe('watching');
      expect(aliveMonitorService.onStatusChange).toHaveBeenCalledTimes(1);
    });

    it('runs an initial evaluation', () => {
      coordinator.start();
      expect(aliveMonitorService.evaluate).toHaveBeenCalledTimes(1);
    });

    it('registers an AppState listener for foreground detection', () => {
      coordinator.start();
      expect(mockAppStateListeners.size).toBe(1);
    });

    it('is idempotent — second start is a no-op with skip event', () => {
      const events: LifecycleEvent[] = [];
      coordinator.onEvent((e) => events.push(e));

      coordinator.start('hash');
      expect(coordinator.getPhase()).toBe('watching');
      expect(aliveMonitorService.onStatusChange).toHaveBeenCalledTimes(1);

      coordinator.start('different-hash');
      expect(coordinator.getPhase()).toBe('watching');
      expect(aliveMonitorService.onStatusChange).toHaveBeenCalledTimes(1);

      const skipEvent = events.find((e) => e.metadata?.skipped);
      expect(skipEvent).toBeDefined();
      expect(skipEvent?.metadata?.reason).toBe('already_running');
    });
  });

  describe('stop()', () => {
    it('unregisters the monitor listener and transitions to terminal', () => {
      const unsub = jest.fn();
      (aliveMonitorService.onStatusChange as jest.Mock).mockReturnValue(unsub);

      coordinator.start();
      coordinator.stop();

      expect(unsub).toHaveBeenCalledTimes(1);
      expect(coordinator.getPhase()).toBe('terminal');
    });

    it('is idempotent — second stop is a no-op', () => {
      const unsub = jest.fn();
      (aliveMonitorService.onStatusChange as jest.Mock).mockReturnValue(unsub);

      coordinator.start();
      coordinator.stop();
      coordinator.stop();

      expect(unsub).toHaveBeenCalledTimes(1);
    });

    it('emits coordinator_stopped with previous phase', () => {
      const events: LifecycleEvent[] = [];
      coordinator.onEvent((e) => events.push(e));

      coordinator.start();
      coordinator.stop();

      const stopEvent = events.find((e) => e.type === 'coordinator_stopped');
      expect(stopEvent).toBeDefined();
      expect(stopEvent?.metadata?.previousPhase).toBe('watching');
    });
  });

  // -----------------------------------------------------------------------
  // silent → confirmation timeout
  // -----------------------------------------------------------------------

  describe('silent → confirmation timeout', () => {
    it('schedules a confirmation timeout when entering silent', () => {
      const events: LifecycleEvent[] = [];
      coordinator.onEvent((e) => events.push(e));

      coordinator.start();

      const cb = (aliveMonitorService.onStatusChange as jest.Mock).mock.calls[0][0];
      cb(makeStatus({ state: 'silent', silenceHours: 80 }));

      expect(notificationService.scheduleConfirmationTimeout).toHaveBeenCalledTimes(1);
      expect(coordinator.getPhase()).toBe('confirming');

      const transitionEvent = events.find((e) => e.type === 'state_transition');
      expect(transitionEvent?.status?.state).toBe('silent');

      const timeoutEvent = events.find((e) => e.type === 'confirmation_timeout_started');
      expect(timeoutEvent).toBeDefined();
    });

    it('is idempotent — does not schedule twice', () => {
      coordinator.start();

      const cb = (aliveMonitorService.onStatusChange as jest.Mock).mock.calls[0][0];
      cb(makeStatus({ state: 'silent' }));
      cb(makeStatus({ state: 'silent' }));

      expect(notificationService.scheduleConfirmationTimeout).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // presumed_dead → emergency cascade
  // -----------------------------------------------------------------------

  describe('presumed_dead → emergency cascade', () => {
    it('triggers the full death sequence with the pin hash', async () => {
      const events: LifecycleEvent[] = [];
      coordinator.onEvent((e) => events.push(e));

      coordinator.start('my-pin-hash');

      const cb = (aliveMonitorService.onStatusChange as jest.Mock).mock.calls[0][0];
      cb(makeStatus({ state: 'presumed_dead', silenceHours: 200 }));

      expect(emergencyService.runFullDeathSequence).toHaveBeenCalledWith('my-pin-hash');
      expect(coordinator.getPhase()).toBe('cascading');

      const cascadeEvent = events.find((e) => e.type === 'emergency_cascade_started');
      expect(cascadeEvent).toBeDefined();
      expect(cascadeEvent?.status?.state).toBe('presumed_dead');

      await flush();
      expect(coordinator.getPhase()).toBe('terminal');

      const completedEvent = events.find((e) => e.type === 'emergency_cascade_completed');
      expect(completedEvent).toBeDefined();
    });

    it('transitions to terminal on cascade failure', async () => {
      (emergencyService.runFullDeathSequence as jest.Mock).mockRejectedValue(
        new Error('Network failure'),
      );

      const events: LifecycleEvent[] = [];
      coordinator.onEvent((e) => events.push(e));

      coordinator.start();

      const cb = (aliveMonitorService.onStatusChange as jest.Mock).mock.calls[0][0];
      cb(makeStatus({ state: 'presumed_dead' }));

      await flush();

      expect(coordinator.getPhase()).toBe('terminal');
      const failedEvent = events.find((e) => e.type === 'emergency_cascade_failed');
      expect(failedEvent).toBeDefined();
      expect(failedEvent?.metadata?.error).toContain('Network failure');
    });

    it('is idempotent — does not trigger cascade twice', () => {
      coordinator.start();

      const cb = (aliveMonitorService.onStatusChange as jest.Mock).mock.calls[0][0];
      cb(makeStatus({ state: 'presumed_dead' }));
      cb(makeStatus({ state: 'presumed_dead' }));

      expect(emergencyService.runFullDeathSequence).toHaveBeenCalledTimes(1);
    });

    it('does not trigger cascade if already terminal', () => {
      coordinator.start();
      coordinator.stop();

      const cb = (aliveMonitorService.onStatusChange as jest.Mock).mock.calls[0][0];
      cb(makeStatus({ state: 'presumed_dead' }));

      expect(emergencyService.runFullDeathSequence).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // confirmAlive()
  // -----------------------------------------------------------------------

  describe('confirmAlive()', () => {
    it('calls monitor.checkIn() and emits confirmation_received', async () => {
      coordinator.start();
      const events: LifecycleEvent[] = [];
      coordinator.onEvent((e) => events.push(e));

      await coordinator.confirmAlive();

      expect(aliveMonitorService.checkIn).toHaveBeenCalledTimes(1);
      const confirmEvent = events.find((e) => e.type === 'confirmation_received');
      expect(confirmEvent).toBeDefined();
    });

    it('cancels notifications and resets phase when confirming', async () => {
      coordinator.start();

      const cb = (aliveMonitorService.onStatusChange as jest.Mock).mock.calls[0][0];
      cb(makeStatus({ state: 'silent' }));
      expect(coordinator.getPhase()).toBe('confirming');

      await coordinator.confirmAlive();

      expect(notificationService.cancelAllNotifications).toHaveBeenCalledTimes(1);
      expect(coordinator.getPhase()).toBe('watching');
    });

    it('does not cancel notifications if not in confirming phase', async () => {
      coordinator.start();
      await coordinator.confirmAlive();

      expect(notificationService.cancelAllNotifications).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Foreground evaluation
  // -----------------------------------------------------------------------

  describe('foreground evaluation', () => {
    it('triggers evaluate() when app returns to foreground', () => {
      coordinator.start();

      expect(mockAppStateListeners.size).toBe(1);
      const handler = [...mockAppStateListeners][0];

      (aliveMonitorService.evaluate as jest.Mock).mockClear();

      handler('background');
      expect(aliveMonitorService.evaluate).not.toHaveBeenCalled();

      handler('active');
      expect(aliveMonitorService.evaluate).toHaveBeenCalledTimes(1);
    });

    it('emits foreground_evaluation event', () => {
      const events: LifecycleEvent[] = [];
      coordinator.onEvent((e) => events.push(e));

      coordinator.start();

      const handler = [...mockAppStateListeners][0];
      handler('active');

      const fgEvent = events.find((e) => e.type === 'foreground_evaluation');
      expect(fgEvent).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Recovery — user returns from silent
  // -----------------------------------------------------------------------

  describe('recovery from silent', () => {
    it('resets to watching when user returns to active during confirming', () => {
      const events: LifecycleEvent[] = [];
      coordinator.onEvent((e) => events.push(e));

      coordinator.start();

      const cb = (aliveMonitorService.onStatusChange as jest.Mock).mock.calls[0][0];

      cb(makeStatus({ state: 'silent' }));
      expect(coordinator.getPhase()).toBe('confirming');

      cb(makeStatus({ state: 'active' }));

      expect(coordinator.getPhase()).toBe('watching');

      const cancelEvent = events.find((e) => e.type === 'notification_cancelled');
      expect(cancelEvent).toBeDefined();
      expect(cancelEvent?.metadata?.reason).toBe('user_returned_to_active_or_quiet');
    });

    it('resets to watching when user returns to quiet during confirming', () => {
      coordinator.start();

      const cb = (aliveMonitorService.onStatusChange as jest.Mock).mock.calls[0][0];
      cb(makeStatus({ state: 'silent' }));
      expect(coordinator.getPhase()).toBe('confirming');

      cb(makeStatus({ state: 'quiet' }));
      expect(coordinator.getPhase()).toBe('watching');
    });
  });

  // -----------------------------------------------------------------------
  // Event system
  // -----------------------------------------------------------------------

  describe('event emitter', () => {
    it('delivers events to all registered listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsub1 = coordinator.onEvent(listener1);
      coordinator.onEvent(listener2);

      coordinator.start();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      unsub1();
      const listener1CallsBeforeStop = listener1.mock.calls.length;

      coordinator.stop();

      // listener1 should not receive the stop event (unsubscribed)
      expect(listener1.mock.calls.length).toBe(listener1CallsBeforeStop);
      // listener2 should have received the stop event
      const stopEventsForListener2 = listener2.mock.calls.filter(
        (call: LifecycleEvent[]) => call[0].type === 'coordinator_stopped',
      );
      expect(stopEventsForListener2.length).toBe(1);
    });

    it('continues delivering to remaining listeners if one throws', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener explosion');
      });
      const goodListener = jest.fn();

      coordinator.onEvent(errorListener);
      coordinator.onEvent(goodListener);

      expect(() => coordinator.start()).not.toThrow();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getPhase / getStatus passthrough
  // -----------------------------------------------------------------------

  describe('passthrough methods', () => {
    it('getStatus() delegates to monitor.getStatus()', () => {
      const expected = makeStatus({ state: 'quiet' });
      (aliveMonitorService.getStatus as jest.Mock).mockReturnValue(expected);

      expect(coordinator.getStatus()).toEqual(expected);
    });

    it('getPhase() returns current phase', () => {
      expect(coordinator.getPhase()).toBe('idle');
      coordinator.start();
      expect(coordinator.getPhase()).toBe('watching');
    });
  });

  // -----------------------------------------------------------------------
  // reset()
  // -----------------------------------------------------------------------

  describe('reset()', () => {
    it('clears all listeners, unregisters handles, returns to idle', () => {
      const unsub = jest.fn();
      (aliveMonitorService.onStatusChange as jest.Mock).mockReturnValue(unsub);

      const listener = jest.fn();
      coordinator.onEvent(listener);
      coordinator.start();

      coordinator.reset();

      expect(unsub).toHaveBeenCalled();
      expect(coordinator.getPhase()).toBe('idle');

      listener.mockClear();
      coordinator.start();
      expect(listener).not.toHaveBeenCalled(); // old listener removed
    });
  });

  // -----------------------------------------------------------------------
  // Phase transition guards
  // -----------------------------------------------------------------------

  describe('phase transition guards', () => {
    it('blocks silent escalation when cascading', () => {
      coordinator.start();

      const cb = (aliveMonitorService.onStatusChange as jest.Mock).mock.calls[0][0];
      cb(makeStatus({ state: 'presumed_dead' }));
      expect(coordinator.getPhase()).toBe('cascading');

      (notificationService.scheduleConfirmationTimeout as jest.Mock).mockClear();
      cb(makeStatus({ state: 'silent' }));

      expect(notificationService.scheduleConfirmationTimeout).not.toHaveBeenCalled();
    });

    it('blocks silent escalation when terminal', () => {
      coordinator.start();
      coordinator.stop();

      const cb = (aliveMonitorService.onStatusChange as jest.Mock).mock.calls[0][0];
      cb(makeStatus({ state: 'silent' }));

      expect(notificationService.scheduleConfirmationTimeout).not.toHaveBeenCalled();
    });
  });
});
