export type NotificationEventName =
  | 'NOTIFICATION_CREATED'
  | 'NOTIFICATION_READ'
  | 'NOTIFICATIONS_READ_ALL'
  | 'NOTIFICATION_DELETED'
  | 'ANNOUNCEMENT_CREATED'
  | 'ANNOUNCEMENT_SCHEDULED'
  | 'ANNOUNCEMENT_SENT'
  | 'ANNOUNCEMENT_CANCELLED'
  | 'NOTIFICATION_PREFERENCES_UPDATED';

export type NotificationEventPayload = {
  event: NotificationEventName;
  notificationId?: string;
  announcementId?: string;
  userId?: string;
  adminId?: string;
  category?: string;
  type?: string;
  updatedCount?: number;
  metadata?: Record<string, unknown>;
};

type NotificationEventListener = (
  payload: NotificationEventPayload,
) => void | Promise<void>;

const listeners = new Map<NotificationEventName, Set<NotificationEventListener>>();

export function onNotificationEvent(
  eventName: NotificationEventName,
  listener: NotificationEventListener,
): () => void {
  const eventListeners =
    listeners.get(eventName) ?? new Set<NotificationEventListener>();
  eventListeners.add(listener);
  listeners.set(eventName, eventListeners);

  return () => {
    eventListeners.delete(listener);
  };
}

export function emitNotificationEvent(
  eventName: NotificationEventName,
  payload: Omit<NotificationEventPayload, 'event'>,
): void {
  const eventPayload = { ...payload, event: eventName };
  for (const listener of listeners.get(eventName) ?? []) {
    Promise.resolve(listener(eventPayload)).catch((err) => {
      console.error(`[NotificationEvents] ${eventName} listener failed:`, err);
    });
  }
}
