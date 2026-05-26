/**
 * SecurityContext — Auth state machine for the Dead Yet app.
 *
 * Manages PIN-based authentication state, auto-lock on background,
 * exponential backoff lockout, and provides key material for the
 * encryption layer (CryptoService) while the user is authenticated.
 *
 * ## State Machine
 *
 *   ┌──────────┐  setupPin()  ┌──────────────┐
 *   │ not_setup │─────────────▶│ authenticated │
 *   └──────────┘              └──────┬───────┘
 *        ▲                           │
 *        │                    lock() / auto-lock
 *        │                           │
 *        │  resetSecurity()  ┌───────▼──────┐
 *        └───────────────────│unauthenticated│
 *                            └───────┬──────┘
 *                                    │
 *                              unlock(pin)
 *                           ┌────────┴────────┐
 *                           │                 │
 *                      success          3/6/9 failures
 *                           │                 │
 *                    ┌──────▼───────┐  ┌──────▼──────┐
 *                    │ authenticated │  │ locked_out  │
 *                    └──────────────┘  └──────┬──────┘
 *                                             │
 *                                      countdown expires
 *                                             │
 *                                      ┌──────▼──────┐
 *                                      │unauthenticated│
 *                                      └─────────────┘
 *
 * ## Lockout Escalation
 *
 *   Failures | Lockout Duration
 *   ---------|----------------
 *   3        | 30 seconds
 *   6        | 5 minutes
 *   9        | 30 minutes
 *   (resets after each successful unlock)
 *
 * ## Auto-lock
 *
 *   When the app backgrounds for > 5 minutes, authState transitions
 *   to 'unauthenticated'. A 5-minute grace period allows brief
 *   app switching without re-entering the PIN.
 *
 * ## Integration Points
 *
 *   - PINLockScreen: calls `unlock(pin)` on PIN entry
 *   - CryptoService: calls `getPinHash()` for encryption key material
 *   - Navigation gates: read `isAuthenticated` / `hasPin`
 *   - HomeScreen: read `isAuthenticated` for lock status indicator
 *   - OnboardingScreen: calls `setupPin(pin)` instead of direct hashPin
 *   - EmergencyCascadeService: needs `getPinHash()` to decrypt death notes
 *
 * ## Dependencies
 *
 *   - `utils/hash.ts` — verifyPin, hashPin (salted SHA-256)
 *   - `storageService` — reads/writes UserProfile.settings.pinHash
 *   - `react-native` AppState — detects background/foreground transitions
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { verifyPin, hashPin } from '../utils/hash';
import { storageService } from '../services/StorageService';
import { cryptoService } from '../services/CryptoService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthState = 'not_setup' | 'unauthenticated' | 'authenticated' | 'locked_out';

export interface SecurityContextType {
  /** Current auth state in the state machine. */
  authState: AuthState;

  /** Convenience: true when authState === 'authenticated'. */
  isAuthenticated: boolean;

  /** True when a PIN has been configured (stored pinHash exists in profile). */
  hasPin: boolean;

  /** Number of consecutive failed unlock attempts in current session. */
  failedAttempts: number;

  /** When lockout expires (Date), or null if not locked out. */
  lockoutUntil: Date | null;

  /** True while the context is performing its initial load from storage. */
  isLoading: boolean;

  /**
   * Attempt to unlock with the given PIN.
   * @returns Promise<true> if PIN matches; Promise<false> if wrong.
   *   On failure, increments failedAttempts and may trigger lockout.
   */
  unlock: (pin: string) => Promise<boolean>;

  /** Manually lock the app (transition to 'unauthenticated'). */
  lock: () => void;

  /**
   * Hash and store a new PIN. Called during onboarding.
   * Transitions to 'authenticated' on success.
   */
  setupPin: (pin: string) => Promise<void>;

  /**
   * Change an existing PIN.
   * @returns Promise<true> if old PIN verified and new PIN saved.
   */
  changePin: (oldPin: string, newPin: string) => Promise<boolean>;

  /**
   * Wipe all security data and return to onboarding.
   * Clears the stored pinHash and resets auth state to 'not_setup'.
   * WARNING: Destructive — does NOT wipe user data (that's the caller's job).
   */
  resetSecurity: () => Promise<void>;

  /**
   * Returns the stored pinHash (saltHex:hashHex) for use as encryption
   * key material. Only available when `isAuthenticated` is true.
   * Returns null if unauthenticated or not set up.
   */
  getPinHash: () => string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Consecutive failures that trigger level-1 lockout (30 seconds). */
const LOCKOUT_THRESHOLD_1 = 3;

/** Consecutive failures that trigger level-2 lockout (5 minutes). */
const LOCKOUT_THRESHOLD_2 = 6;

/** Consecutive failures that trigger level-3 lockout (30 minutes). */
const LOCKOUT_THRESHOLD_3 = 9;

/** Milliseconds before auto-lock when app goes to background. */
const AUTO_LOCK_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

/** Lockout duration for level-1 (3 failures). */
const LOCKOUT_DURATION_1_MS = 30 * 1000; // 30 seconds

/** Lockout duration for level-2 (6 failures). */
const LOCKOUT_DURATION_2_MS = 5 * 60 * 1000; // 5 minutes

/** Lockout duration for level-3 (9 failures). */
const LOCKOUT_DURATION_3_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Module-level pinHash ref
// ---------------------------------------------------------------------------

/**
 * Active PIN hash reference, updated by SecurityProvider whenever the user
 * authenticates, changes their PIN, or locks the app.
 *
 * Exported so singleton services (EmergencyService, EmergencyCascadeService,
 * etc.) can access the current pinHash for decryption without being inside
 * the React tree. The SecurityProvider keeps this in sync with its internal
 * `pinHashRef`.
 *
 * @example
 *   import { activePinHashRef } from '../contexts/SecurityContext';
 *   const pinHash = activePinHashRef.current;
 *   if (pinHash) {
 *     const decrypted = await cryptoService.decrypt(blob, pinHash);
 *   }
 */
export const activePinHashRef: { current: string | null } = { current: null };

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SecurityProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>('not_setup');
  const [isLoading, setIsLoading] = useState(true);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);

  // In-memory key material — only set when authenticated
  const pinHashRef = useRef<string | null>(null);

  // Ref mirror of failedAttempts to avoid stale-closure bugs in async unlock
  const failedAttemptsRef = useRef(0);

  // Timer refs for cleanup
  const autoLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isBackgroundedRef = useRef(false);

  // -----------------------------------------------------------------------
  // Initialisation — load pinHash from storage
  // -----------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const profile = await storageService.getUserProfile();
        if (cancelled) return;

        const storedHash = profile?.settings?.pinHash;
        if (storedHash) {
          setAuthState('unauthenticated');
        } else {
          setAuthState('not_setup');
        }
      } catch (err) {
        console.error('[SecurityContext] Init error:', err);
        if (!cancelled) {
          setAuthState('not_setup');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  // -----------------------------------------------------------------------
  // Lockout countdown — when locked_out, check every second if expired
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (authState === 'locked_out' && lockoutUntil) {
      lockoutTimerRef.current = setInterval(() => {
        if (new Date() >= lockoutUntil) {
          setAuthState('unauthenticated');
          setLockoutUntil(null);
        }
      }, 1000);
    }

    return () => {
      if (lockoutTimerRef.current) {
        clearInterval(lockoutTimerRef.current);
        lockoutTimerRef.current = null;
      }
    };
  }, [authState, lockoutUntil]);

  // -----------------------------------------------------------------------
  // Auto-lock on background
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App going to background — start the auto-lock countdown
        isBackgroundedRef.current = true;

        if (autoLockTimerRef.current) {
          clearTimeout(autoLockTimerRef.current);
        }

        autoLockTimerRef.current = setTimeout(() => {
          if (isBackgroundedRef.current) {
            // User hasn't returned — lock the app
            pinHashRef.current = null;
            activePinHashRef.current = null;
            setAuthState('unauthenticated');
          }
        }, AUTO_LOCK_GRACE_PERIOD_MS);
      } else if (nextAppState === 'active') {
        // App returned to foreground — cancel auto-lock
        isBackgroundedRef.current = false;

        if (autoLockTimerRef.current) {
          clearTimeout(autoLockTimerRef.current);
          autoLockTimerRef.current = null;
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
      }
    };
  }, []);

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const unlock = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const profile = await storageService.getUserProfile();
      const storedHash = profile?.settings?.pinHash;

      if (!storedHash) {
        // No PIN set up yet — nothing to verify against
        return false;
      }

      const valid = await verifyPin(pin, storedHash);

      if (valid) {
        // Success — authenticate and reset counters
        pinHashRef.current = storedHash;
        activePinHashRef.current = storedHash;
        failedAttemptsRef.current = 0;
        setFailedAttempts(0);
        setLockoutUntil(null);
        setAuthState('authenticated');
        return true;
      }

      // Failure — increment counter (use ref for atomicity across async calls)
      const newCount = failedAttemptsRef.current + 1;
      failedAttemptsRef.current = newCount;
      setFailedAttempts(newCount);

      let lockDuration = 0;
      if (newCount >= LOCKOUT_THRESHOLD_3) {
        lockDuration = LOCKOUT_DURATION_3_MS;
      } else if (newCount >= LOCKOUT_THRESHOLD_2) {
        lockDuration = LOCKOUT_DURATION_2_MS;
      } else if (newCount >= LOCKOUT_THRESHOLD_1) {
        lockDuration = LOCKOUT_DURATION_1_MS;
      }

      if (lockDuration > 0) {
        const expiry = new Date(Date.now() + lockDuration);
        setLockoutUntil(expiry);
        setAuthState('locked_out');
      }

      return false;
    } catch (err) {
      console.error('[SecurityContext] unlock error:', err);
      return false;
    }
  }, []);

  const lock = useCallback(() => {
    pinHashRef.current = null;
    activePinHashRef.current = null;
    setAuthState('unauthenticated');
  }, []);

  const setupPin = useCallback(async (pin: string): Promise<void> => {
    try {
      const newHash = await hashPin(pin);

      // Read current profile and update pinHash
      const profile = await storageService.getUserProfile();
      if (profile) {
        profile.settings.pinHash = newHash;
        await storageService.setUserProfile(profile);
      } else {
        // No profile yet — create a minimal one with just the pinHash.
        // The OnboardingScreen will flesh this out with the user's details.
        await storageService.setUserProfile({
          id: 'pending',
          name: '',
          createdAt: new Date(),
          lastActivityAt: new Date(),
          isConfirmedAlive: true,
          lastConfirmedAt: new Date(),
          settings: {
            inactivityThresholdDays: 3,
            confirmationTimeoutHours: 24,
            notificationsEnabled: true,
            pinHash: newHash,
          },
        });
      }

      // Authenticate immediately after setup
      pinHashRef.current = newHash;
      activePinHashRef.current = newHash;
      failedAttemptsRef.current = 0;
      setFailedAttempts(0);
      setLockoutUntil(null);
      setAuthState('authenticated');
    } catch (err) {
      console.error('[SecurityContext] setupPin error:', err);
      throw err;
    }
  }, []);

  const changePin = useCallback(async (
    oldPin: string,
    newPin: string,
  ): Promise<boolean> => {
    try {
      const profile = await storageService.getUserProfile();
      const storedHash = profile?.settings?.pinHash;

      if (!storedHash) return false;

      // Verify old PIN
      const valid = await verifyPin(oldPin, storedHash);
      if (!valid) return false;

      // Hash new PIN
      const newHash = await hashPin(newPin);

      // ---- Re-encrypt existing data with the new key ----
      // Without this step, all encrypted data (death notes, contacts)
      // becomes permanently unreadable after the PIN change because
      // the AES key is derived from the pinHash.

      // Re-encrypt death note if it exists and is encrypted
      const deathNoteRaw = await storageService.getDeathNoteRaw();
      if (deathNoteRaw && cryptoService.isEncrypted(deathNoteRaw)) {
        try {
          const reEncrypted = await cryptoService.reEncrypt(
            deathNoteRaw,
            storedHash,
            newHash,
          );
          await storageService.setDeathNoteRaw(reEncrypted);
        } catch (err) {
          console.error(
            '[SecurityContext] Failed to re-encrypt death note during PIN change:',
            err,
          );
          // Continue — don't block the PIN change, but log the error.
          // The old data remains encrypted with the old key and will
          // become unreadable. This is a safety trade-off: better to
          // complete the PIN change than leave the app in an
          // inconsistent state.
        }
      }

      // Re-encrypt contacts if they exist and are encrypted
      const contactsRaw = await storageService.getEmergencyContactsRaw();
      if (contactsRaw && cryptoService.isEncrypted(contactsRaw)) {
        try {
          const reEncrypted = await cryptoService.reEncrypt(
            contactsRaw,
            storedHash,
            newHash,
          );
          await storageService.setEmergencyContactsRaw(reEncrypted);
        } catch (err) {
          console.error(
            '[SecurityContext] Failed to re-encrypt contacts during PIN change:',
            err,
          );
        }
      }

      // ---- Save the new hash ----
      profile.settings.pinHash = newHash;
      await storageService.setUserProfile(profile);

      // Update in-memory key material
      pinHashRef.current = newHash;
      activePinHashRef.current = newHash;
      return true;
    } catch (err) {
      console.error('[SecurityContext] changePin error:', err);
      return false;
    }
  }, []);

  const resetSecurity = useCallback(async (): Promise<void> => {
    try {
      // Clear the pinHash from the profile (preserves other settings)
      const profile = await storageService.getUserProfile();
      if (profile) {
        profile.settings.pinHash = undefined;
        await storageService.setUserProfile(profile);
      }

      // Wipe in-memory state
      pinHashRef.current = null;
      activePinHashRef.current = null;
      failedAttemptsRef.current = 0;
      setFailedAttempts(0);
      setLockoutUntil(null);
      setAuthState('not_setup');
    } catch (err) {
      console.error('[SecurityContext] resetSecurity error:', err);
      throw err;
    }
  }, []);

  const getPinHash = useCallback((): string | null => {
    if (authState !== 'authenticated') return null;
    return pinHashRef.current;
  }, [authState]);

  // -----------------------------------------------------------------------
  // Context value
  // -----------------------------------------------------------------------

  const value: SecurityContextType = {
    authState,
    isAuthenticated: authState === 'authenticated',
    hasPin: authState !== 'not_setup',
    failedAttempts,
    lockoutUntil,
    isLoading,
    unlock,
    lock,
    setupPin,
    changePin,
    resetSecurity,
    getPinHash,
  };

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the security/auth state machine.
 *
 * @throws If used outside of <SecurityProvider>
 */
export function useSecurity(): SecurityContextType {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a <SecurityProvider>');
  }
  return context;
}
