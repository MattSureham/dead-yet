import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ActivityLog } from '../models/types';
import { activityTrackingService } from '../services/ActivityTrackingService';

interface ActivityContextType {
  recentLogs: ActivityLog[];
  todayScreenTime: number;
  weeklyScreenTime: number[];
  appUsage: { appName: string; totalMinutes: number }[];
  isLoading: boolean;
  manualCheckIn: () => Promise<void>;
  refresh: () => Promise<void>;
}

const ActivityContext = createContext<ActivityContextType | undefined>(undefined);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
  const [todayScreenTime, setTodayScreenTime] = useState(0);
  const [weeklyScreenTime, setWeeklyScreenTime] = useState<number[]>([]);
  const [appUsage, setAppUsage] = useState<{ appName: string; totalMinutes: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    refresh();
  }, []);

  const refresh = async () => {
    setIsLoading(true);
    const [logs, today, weekly, usage] = await Promise.all([
      activityTrackingService.getRecentLogs(50),
      activityTrackingService.getTodayScreenTime(),
      activityTrackingService.getWeeklyScreenTime(),
      activityTrackingService.getAppUsage(),
    ]);
    setRecentLogs(logs);
    setTodayScreenTime(today);
    setWeeklyScreenTime(weekly);
    setAppUsage(usage);
    setIsLoading(false);
  };

  const manualCheckIn = async () => {
    await activityTrackingService.manualCheckIn();
    await refresh();
  };

  return (
    <ActivityContext.Provider
      value={{
        recentLogs,
        todayScreenTime,
        weeklyScreenTime,
        appUsage,
        isLoading,
        manualCheckIn,
        refresh,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity(): ActivityContextType {
  const context = useContext(ActivityContext);
  if (!context) {
    throw new Error('useActivity must be used within ActivityProvider');
  }
  return context;
}