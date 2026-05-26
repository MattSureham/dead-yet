/**
 * LifecycleCoordinator — Orchestration layer for the Dead Yet dead-man's-switch.
 *
 * The existing App.tsx wiring directly couples AliveMonitorService to
 * EmergencyService and NotificationService. This coordinator extracts
 * that decision logic into a testable, observable, dependency-injected
 * service that becomes the single source of truth for cascade behavior.
 *
 * ## Responsibilities
 *
 *   1. Listens to AliveMonitorService state transitions
 *   2. Owns the cascade escalation logic (when to schedule notifications,
 *      when to trigger the emergency flow)
 *   3. Emits structured LifecycleEvent's so other parts of the system
 *      (diagnostics, logging, future analytics) can observe state changes
 *   4. Guards against duplicate triggers (idempotent phase tracking)
 *   5. Can be dependency-injected for isolated unit testing
 *
 * ## Integration
 *
 *   App.tsx replaces its current useEffect-based wiring with:
 *
 *   ```ts
 *   const coordinator = getLifecycleCoordinator();
 *   coordinator.start(activePinHashRef.current ?? undefined);
 *   // ... later, on unmount or lock:
 *   coordinator.stop();
 *   ```
 *
 *   The coordinator handles everything else — it subscribes to the monitor,
 *   manages the AppState listener, and dispatches actions at each threshold.
 */

import { AppState, AppStateStatus } from 'react-native';
import { AliveStatus } from '../models/types';
import { aliveMonitorService } from './AliveMonitorService';
import { notificationService } from './NotificationService';
import { emergencyService } from './EmergencyService';

// The service classes are not exported directly — only their singleton
// instances are. For dependency-injection we use the instance types so
// the constructor accepts structurally-compatible mocks in tests.
type AliveMonitorService = typeof aliveMonitorService;
type NotificationService = typeof notificationService;
type EmergencyService = typeof emergencyService;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Domain events the coordinator emits for observers. */
export type LifecycleEventType =
  | 'evaluation_started'
  | 'evaluation_completed'
  | 'state_transition'
  | 'notification_scheduled'
  | 'notification_cancelled'
  | 'confirmation_timeout_started'
  | 'confirmation_received'
  | 'emergency_cascade_started'
  | 'emergency_cascade_completed'
  | 'emergency_cascade_failed'
  | 'coordinator_started'
  | 'coordinator_stopped'
  | 'foreground_evaluation';

export interface LifecycleEvent {
  type: LifecycleEventType;
  timestamp: Date;
  /** The alive status at the time of the event (if applicable). */
  status?: AliveStatus;
  /** Additional metadata for diagnostics. */
  metadata?: Record<string, unknown>;
}

/** Callback for observing lifecycle events. */
export type LifecycleEventListener = (event: LifecycleEvent) => void;

/**
 * The current phase of the coordinator.
 *
 * - `idle`: Not started; no listeners active.
 * - `watching`: Monitoring alive status, no escalation in progress.
 * - `confirming`: Silent state — waiting for user confirmation.
 * - `cascading`: Emergency sequence is in progress.
 * - `terminal`: Cascade completed. Coordinator is stopped.
 */
export type CoordinatorPhase = 'idle' | 'watching' | 'confirming' | 'cascading' | 'terminal';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class LifecycleCoordinator {
  private static instance: LifecycleCoordinator;

  // ---- Injected dependencies (overridable for testing) ----
  private monitor: AliveMonitorService;
  private notifier: NotificationService;
  private emergency: EmergencyService;

  // ---- Internal state ----
  private phase: CoordinatorPhase = 'idle';
  private pinHash: string | undefined;
  private listeners = new Set<LifecycleEventListener>();

  // Cleanup handles
  private unsubMonitor: (() => void) | null = null;
  private unsubAppState: { remove: () => void } | null = null;

  // ---- Singleton ----

  static getInstance(): LifecycleCoordinator {
    if (!LifecycleCoordinator.instance) {
      LifecycleCoordinator.instance = new LifecycleCoordinator(
        aliveMonitorService,
        notificationService,
        emergencyService,
      );
    }
    return LifecycleCoordinator.instance;
  }

  constructor(
    monitor: AliveMonitorService,
    notifier: NotificationService,
    emergency: EmergencyService,
  ) {
    this.monitor = monitor;
    this.notifier = notifier;
    this.emergency = emergency;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start the lifecycle coordinator.
   *
   * Registers the AliveMonitorService listener, the AppState foreground
   * handler, and runs an initial evaluation. After calling this, the
   * coordinator will autonomously manage the dead-man's-switch lifecycle
   * until `stop()` is called.
   *
   * @param pinHash - Optional PIN hash for death-note decryption during
   *   the emergency cascade. If not provided, encrypted notes will yield
   *   generic fallback messages.
   */
  start(pinHash?: string): void {
    if (this.phase !== 'idle') {
      this.emit({
        type: 'coordinator_started',
        timestamp: new Date(),
        metadata: { skipped: true, reason: 'already_running' },
      });
      return;
    }

    this.pinHash = pinHash;
    this.phase = 'watching';

    // ---- Status-change listener ----
    this.unsubMonitor = this.monitor.onStatusChange((status) => {
      this.onStatusChanged(status);
    });

    // ---- Foreground evaluation ----
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        this.emit({ type: 'foreground_evaluation', timestamp: new Date() });
        this.monitor.evaluate().catch((err: unknown) => {
          console.error('[LifecycleCoordinator] Foreground evaluate failed:', err);
        });
      }
    };

    this.unsubAppState = AppState.addEventListener('change', handleAppStateChange);

    // ---- Initial evaluation ----
    this.monitor.evaluate().catch((err: unknown) => {
      console.error('[LifecycleCoordinator] Initial evaluate failed:', err);
    });

    this.emit({ type: 'coordinator_started', timestamp: new Date() });
  }

  /**
   * Stop the lifecycle coordinator.
   *
   * Unregisters all listeners and resets internal state. Safe to call
   * multiple times — subsequent calls are no-ops.
   */
  stop(): void {
    if (this.phase === 'idle' || this.phase === 'terminal') return;

    if (this.unsubMonitor) {
      this.unsubMonitor();
      this.unsubMonitor = null;
    }

    if (this.unsubAppState) {
      this.unsubAppState.remove();
      this.unsubAppState = null;
    }

    const previousPhase = this.phase;
    this.phase = 'terminal';

    this.emit({
      type: 'coordinator_stopped',
      timestamp: new Date(),
      metadata: { previousPhase },
    });
  }

  /**
   * Record a manual check-in, resetting silence timers and aborting any
   * in-progress escalation.
   *
   * This is typically called from the "I'm Alive!" button or from a
   * notification response handler.
   */
  async confirmAlive(): Promise<AliveStatus> {
    const status = await this.monitor.checkIn();

    this.emit({
      type: 'confirmation_received',
      timestamp: new Date(),
      status,
    });

    // If we were in the confirming phase, cancel the timeout notification
    if (this.phase === 'confirming') {
      await this.notifier.cancelAllNotifications();
      this.phase = 'watching';
    }

    return status;
  }

  /**
   * Return the current coordinator phase.
   *
   * Useful for UI that shows escalation state (e.g., "Emergency in progress").
   */
  getPhase(): CoordinatorPhase {
    return this.phase;
  }

  /**
   * Return the current alive status from the monitor (synchronous, cached).
   */
  getStatus(): AliveStatus {
    return this.monitor.getStatus();
  }

  /**
   * Register a listener for lifecycle events.
   *
   * @returns An unsubscribe function.
   */
  onEvent(listener: LifecycleEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Reset the coordinator to its idle state (useful in tests).
   */
  reset(): void {
    if (this.unsubMonitor) {
      this.unsubMonitor();
      this.unsubMonitor = null;
    }
    if (this.unsubAppState) {
      this.unsubAppState.remove();
      this.unsubAppState = null;
    }
    this.phase = 'idle';
    this.pinHash = undefined;
    this.listeners.clear();
  }

  // -------------------------------------------------------------------------
  // Private — Cascade logic
  // -------------------------------------------------------------------------

  /**
   * Handle an alive-status state transition from the monitor.
   *
   * This is the core decision engine. It inspects the new state and decides
   * whether to schedule notifications, escalate to the emergency cascade,
   * or take no action.
   */
  private onStatusChanged(status: AliveStatus): void {
    this.emit({
      type: 'state_transition',
      timestamp: new Date(),
      status,
    });

    switch (status.state) {
      case 'silent':
        this.enterSilentPhase(status);
        break;

      case 'presumed_dead':
        this.enterEmergencyCascade(status);
        break;

      case 'active':
      case 'quiet':
        // Reset confirming phase if user came back before cascade
        if (this.phase === 'confirming') {
          this.phase = 'watching';
          this.emit({
            type: 'notification_cancelled',
            timestamp: new Date(),
            status,
            metadata: { reason: 'user_returned_to_active_or_quiet' },
          });
        }
        break;
    }
  }

  /**
   * Enter the silent phase — the user has been inactive beyond the silent
   * threshold. Schedule a confirmation-timeout notification to give them
   * one final chance to respond.
   */
  private enterSilentPhase(status: AliveStatus): void {
    // Idempotency guard — only transition into silent once
    if (this.phase === 'confirming' || this.phase === 'cascading' || this.phase === 'terminal') {
      return;
    }

    this.phase = 'confirming';

    this.emit({
      type: 'confirmation_timeout_started',
      timestamp: new Date(),
      status,
    });

    this.notifier.scheduleConfirmationTimeout().catch((err: unknown) => {
      console.error('[LifecycleCoordinator] Failed to schedule confirmation timeout:', err);
    });
  }

  /**
   * Enter the emergency cascade — the user is presumed dead.
   *
   * Triggers the full death sequence: clear history → call contacts →
   * reveal death notes. This is a terminal action; the coordinator
   * moves to `cascading` then `terminal`.
   */
  private enterEmergencyCascade(status: AliveStatus): void {
    // Idempotency guard — only trigger once
    if (this.phase === 'cascading' || this.phase === 'terminal') {
      return;
    }

    this.phase = 'cascading';

    this.emit({
      type: 'emergency_cascade_started',
      timestamp: new Date(),
      status,
    });

    this.emergency.runFullDeathSequence(this.pinHash)
      .then(() => {
        this.phase = 'terminal';
        this.emit({
          type: 'emergency_cascade_completed',
          timestamp: new Date(),
          status,
        });
      })
      .catch((err: unknown) => {
        console.error('[LifecycleCoordinator] Emergency cascade failed:', err);
        this.emit({
          type: 'emergency_cascade_failed',
          timestamp: new Date(),
          status,
          metadata: { error: String(err) },
        });
        // Even on failure, we don't retry — move to terminal to avoid loops
        this.phase = 'terminal';
      });
  }

  // -------------------------------------------------------------------------
  // Private — Event emitter
  // -------------------------------------------------------------------------

  private emit(event: LifecycleEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err: unknown) {
        console.error('[LifecycleCoordinator] Event listener error:', err);
      }
    }
  }
}

/**
 * Singleton instance — use this in production code (App.tsx, contexts).
 *
 * For tests, construct a new LifecycleCoordinator directly with mocked
 * dependencies to isolate behavior.
 */
export const lifecycleCoordinator = LifecycleCoordinator.getInstance();

/**
 * Exported for test convenience — allows test files to construct fresh
 * instances without going through the singleton.
 */
export { LifecycleCoordinator };
