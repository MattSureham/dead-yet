export interface AddressInfo {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  entryCode?: string;
}

export interface FinancialAccount {
  id: string;
  institution: string;
  accountType: 'bank' | 'investment' | 'crypto' | 'other';
  accountName: string;
  notes?: string;
}

export interface Pet {
  id: string;
  name: string;
  species: string;
  feedingInstructions: string;
  veterinaryContact: string;
  otherCareNotes: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phoneNumber: string;
  email: string;
  relationship: string;
  priority: number;
  isVerified: boolean;
  createdAt: Date;
}

export interface DeathNote {
  id: string;
  address?: AddressInfo;
  financialAccounts: FinancialAccount[];
  pets: Pet[];
  otherImportantInfo: string;
  updatedAt: Date;
}

export interface UserSettings {
  inactivityThresholdDays: number;
  confirmationTimeoutHours: number;
  notificationsEnabled: boolean;
  pinHash?: string;
  historyClearWebhook?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  createdAt: Date;
  lastActivityAt: Date;
  isConfirmedAlive: boolean;
  lastConfirmedAt: Date;
  settings: UserSettings;
}

export type ActivityType = 'screen_time' | 'app_usage' | 'manual_checkin';

export interface ActivityLog {
  id: string;
  type: ActivityType;
  duration: number;
  appName?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** AliveMonitorService state — describes how recently the user was active. */
export type AliveState = 'active' | 'quiet' | 'silent' | 'presumed_dead';

export interface AliveStatus {
  state: AliveState;
  /** The most recent activity timestamp, or null if no activity has ever been recorded. */
  lastActivity: Date | null;
  /** Hours since the last recorded activity (0 = within the last hour). */
  silenceHours: number;
  /** When the next automated status check should occur, or null if in terminal state. */
  nextCheckAt: Date | null;
  /** Confidence level (0–1) that the current state assessment is correct. */
  confidence: number;
}