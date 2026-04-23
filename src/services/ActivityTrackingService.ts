import { storageService } from './StorageService';
import { ActivityLog, ActivityType } from '../models/types';
import { v4 as uuidv4 } from 'uuid';

class ActivityTrackingService {
  private static instance: ActivityTrackingService;

  static getInstance(): ActivityTrackingService {
    if (!ActivityTrackingService.instance) {
      ActivityTrackingService.instance = new ActivityTrackingService();
    }
    return ActivityTrackingService.instance;
  }

  async logActivity(
    type: ActivityType,
    duration: number,
    appName?: string,
    metadata?: Record<string, unknown>
  ): Promise<ActivityLog> {
    const log: ActivityLog = {
      id: uuidv4(),
      type,
      duration,
      appName,
      timestamp: new Date(),
      metadata,
    };

    const logs = await storageService.getActivityLogs();
    logs.push(log);
    await storageService.setActivityLogs(logs);

    const profile = await storageService.getUserProfile();
    if (profile) {
      profile.lastActivityAt = new Date();
      profile.isConfirmedAlive = true;
      await storageService.setUserProfile(profile);
    }

    return log;
  }

  async manualCheckIn(): Promise<ActivityLog> {
    return this.logActivity('manual_checkin', 0);
  }

  async getRecentLogs(limit: number = 50): Promise<ActivityLog[]> {
    const logs = await storageService.getActivityLogs();
    return logs
      .sort((a: ActivityLog, b: ActivityLog) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async getTodayScreenTime(): Promise<number> {
    const logs = await storageService.getActivityLogs();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return logs
      .filter((log: ActivityLog) => {
        const logDate = new Date(log.timestamp);
        return logDate >= today && log.type === 'screen_time';
      })
      .reduce((total: number, log: ActivityLog) => total + log.duration, 0);
  }

  async getWeeklyScreenTime(): Promise<number[]> {
    const logs = await storageService.getActivityLogs();
    const result: number[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayTotal = logs
        .filter((log: ActivityLog) => {
          const logDate = new Date(log.timestamp);
          return logDate >= date && logDate < nextDate && log.type === 'screen_time';
        })
        .reduce((total: number, log: ActivityLog) => total + log.duration, 0);

      result.push(dayTotal);
    }

    return result;
  }

  async getAppUsage(): Promise<{ appName: string; totalMinutes: number }[]> {
    const logs = await storageService.getActivityLogs();
    const usageMap = new Map<string, number>();

    logs
      .filter((log: ActivityLog) => log.type === 'app_usage' && log.appName)
      .forEach((log: ActivityLog) => {
        const current = usageMap.get(log.appName!) || 0;
        usageMap.set(log.appName!, current + log.duration);
      });

    return Array.from(usageMap.entries())
      .map(([appName, totalMinutes]) => ({ appName, totalMinutes }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
  }

  async clearLogs(): Promise<void> {
    await storageService.setActivityLogs([]);
  }
}

export const activityTrackingService = ActivityTrackingService.getInstance();