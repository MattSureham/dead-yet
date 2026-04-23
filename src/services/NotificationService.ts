import * as Notifications from 'expo-notifications';
import { storageService } from './StorageService';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class NotificationService {
  private static instance: NotificationService;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async requestPermissions(): Promise<boolean> {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }

  async scheduleInactivityCheck(): Promise<void> {
    const profile = await storageService.getUserProfile();
    if (!profile) return;

    const { inactivityThresholdDays } = profile.settings;
    const lastActivity = new Date(profile.lastActivityAt);
    const checkDate = new Date(lastActivity);
    checkDate.setDate(checkDate.getDate() + inactivityThresholdDays);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '😨 Dead Yet?',
        body: "We haven't heard from you in a while. Are you still alive?",
        data: { type: 'inactivity_check' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: checkDate,
      },
    });
  }

  async scheduleConfirmationTimeout(): Promise<void> {
    const profile = await storageService.getUserProfile();
    if (!profile) return;

    const { confirmationTimeoutHours } = profile.settings;
    const timeoutDate = new Date();
    timeoutDate.setHours(timeoutDate.getHours() + confirmationTimeoutHours);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Emergency Alert',
        body: "You haven't confirmed you're alive. We're initiating emergency protocols.",
        data: { type: 'confirmation_timeout' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: timeoutDate,
      },
    });
  }

  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  async sendImmediateNotification(payload: { title: string; body: string; data?: Record<string, unknown> }): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: payload.title,
        body: payload.body,
        data: payload.data,
      },
      trigger: null,
    });
  }

  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(callback);
  }

  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }
}

export const notificationService = NotificationService.getInstance();