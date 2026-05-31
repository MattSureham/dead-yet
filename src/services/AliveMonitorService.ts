/**
 * AliveMonitorService — Decision engine for the Dead Yet app.
 *
 * Reads the user's last activity timestamp and manual check-in records,
 * then evaluates whether the user is active, quiet, silent, or presumed
 * dead based on configurable thresholds from the user profile settings.
 *
 * ## Integration Points
 *
 *   - HomeScreen: calls `getStatus()` / `evaluate()` for the status dashboard
 *   - EmergencyCascadeService: reads `status.state === 'presumed_dead'` to trigger
 *   - CheckInScheduler (future): calls `evaluate()` on each background fetch tick
 *   - MiniMax's UI: `useAliveStatus()` hook for the animated status badge
 *
 * ## State Definitions
 *
 *   | State         | Meaning                                         |
 *   |---------------|-------------------------------------------------|
 *   | active        | Recent activity detected (manual or automatic)  |
 *   | quiet         | Silence exceeds the early threshold             |
 *   | silent        | Extended silence — notification escalation      |
 *   | presumed_dead | Severe silence — emergency cascade trigger      |
 *
 * ## Thresholds
 *
 *   Thresholds are read from UserProfile.settings. When unavailable,
 *   sensible defaults are used:
 *
 *     silent threshold  = inactivityThresholdDays * 24 hours (default 72h)
 *     quiet threshold   = silent threshold / 2            (default 36h)
 *     presumed_dead     = silent threshold * 2            (default 144h)
 *
 *   These can be tuned by the user in SettingsScreen.
 */

import { AliveStatus, AliveState } from '../models/types';
import { storageService } from './StorageService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback invoked whenever the alive status transitions to a new state. */
export type StatusChangeCallback = (status: AliveStatus) => void;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class AliveMonitorService {
  private static instance: AliveMonitorService;

  /** Cached status from the last evaluate() call. */
  private currentStatus: AliveStatus = {
    state: 'active',
    lastActivity: null,
    silenceHours: 0,
    nextCheckAt: null,
    confidence: 1.0,
  };

  /** Registered status-change listeners. */
  private listeners = new Set<StatusChangeCallback>();

  // -----------------------------------------------------------------------
  // Singleton
  // -----------------------------------------------------------------------

  static getInstance(): AliveMonitorService {
    if (!AliveMonitorService.instance) {
      AliveMonitorService.instance = new AliveMonitorService();
    }
    return AliveMonitorService.instance;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Evaluate the user's current alive status.
   *
   * Reads the latest activity data, computes the state, and — if the state
   * has changed since the last evaluation — notifies all registered listeners.
   *
   * @returns The current AliveStatus after evaluation.
   */
  async evaluate(): Promise<AliveStatus> {
    const profile = await storageService.getUserProfile();

    const lastActivity = profile?.lastActivityAt
      ? new Date(profile.lastActivityAt)
      : null;

    // Derive thresholds from user settings (with defaults)
    const inactivityDays = profile?.settings?.inactivityThresholdDays ?? 3;
    const confirmationHours = profile?.settings?.confirmationTimeoutHours ?? 24;

    // Map the two user-facing settings to our three internal thresholds
    const silentThresholdHours = inactivityDays * 24; // e.g., 3 days → 72h
    const quietThresholdHours = Math.max(1, silentThresholdHours / 2); // e.g., 36h
    const deadThresholdHours = silentThresholdHours * 2; // e.g., 144h

    const silenceHours = lastActivity
      ? Math.max(0, (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60))
      : Infinity; // No profile means never active — treat as dead

    // Determine state
    let state: AliveState;
    let confidence: number;

    if (silenceHours < quietThresholdHours) {
      state = 'active';
      confidence = 1.0 - silenceHours / quietThresholdHours;
    } else if (silenceHours < silentThresholdHours) {
      state = 'quiet';
      confidence = 1.0 - (silenceHours - quietThresholdHours) / (silentThresholdHours - quietThresholdHours);
    } else if (silenceHours < deadThresholdHours) {
      state = 'silent';
      confidence = 1.0 - (silenceHours - silentThresholdHours) / (deadThresholdHours - silentThresholdHours);
    } else {
      state = 'presumed_dead';
      confidence = 1.0; // High confidence after exceeding dead threshold
    }

    // Clamp confidence to [0, 1]
    confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

    // Compute next check time
    let nextCheckAt: Date | null = null;
    if (state === 'presumed_dead') {
      nextCheckAt = null; // No more checks — cascade should fire
    } else if (state === 'silent') {
      nextCheckAt = new Date(Date.now() + confirmationHours * 60 * 60 * 1000);
    } else if (state === 'quiet') {
      const remainingToSilent = Math.max(0, silentThresholdHours - silenceHours);
      nextCheckAt = new Date(Date.now() + remainingToSilent * 60 * 60 * 1000);
    } else {
      const remainingToQuiet = Math.max(0, quietThresholdHours - silenceHours);
      nextCheckAt = new Date(Date.now() + remainingToQuiet * 60 * 60 * 1000);
    }

    const previousState = this.currentStatus.state;

    const newStatus: AliveStatus = {
      state,
      lastActivity,
      silenceHours: Math.round(silenceHours * 10) / 10,
      nextCheckAt,
      confidence,
    };

    this.currentStatus = newStatus;

    // Notify listeners if the state transitioned
    if (state !== previousState) {
      this.notifyListeners(newStatus);
    }

    return newStatus;
  }

  /**
   * Record a manual check-in, resetting silence timers.
   *
   * This is the handler for the "I'm Alive!" button on the HomeScreen.
   * After recording, re-evaluates and returns the new status.
   */
  async checkIn(): Promise<AliveStatus> {
    // Update the user profile's lastActivityAt
    const profile = await storageService.getUserProfile();
    if (profile) {
      profile.lastActivityAt = new Date();
      profile.isConfirmedAlive = true;
      profile.lastConfirmedAt = new Date();
      await storageService.setUserProfile(profile);
    }

    return this.evaluate();
  }

  /**
   * Return the cached alive status from the last evaluate() call.
   *
   * Synchronous — safe to call during render. Returns the default
   * 'active' status if evaluate() has never been called.
   */
  getStatus(): AliveStatus {
    return { ...this.currentStatus };
  }

  /**
   * Register a listener that fires whenever the alive status changes state.
   *
   * @returns An unsubscribe function.
   *
   * @example
   *   const unsub = aliveMonitorService.onStatusChange((status) => {
   *     if (status.state === 'presumed_dead') {
   *       // Trigger emergency cascade
   *     }
   *   });
   *   // Later: unsub();
   */
  onStatusChange(callback: StatusChangeCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Remove all status change listeners (useful in tests).
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * Reset the cached status to defaults (useful in tests).
   */
  reset(): void {
    this.currentStatus = {
      state: 'active',
      lastActivity: null,
      silenceHours: 0,
      nextCheckAt: null,
      confidence: 1.0,
    };
    this.listeners.clear();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private notifyListeners(status: AliveStatus): void {
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[AliveMonitorService] Listener error:', err);
      }
    }
  }
}

export const aliveMonitorService = AliveMonitorService.getInstance();
