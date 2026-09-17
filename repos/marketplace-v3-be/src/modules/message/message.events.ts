export type MessageEventName =
  | 'CONVERSATION_CREATED'
  | 'CONVERSATION_BLOCKED'
  | 'MESSAGE_SENT'
  | 'MESSAGE_DELIVERED'
  | 'MESSAGE_READ'
  | 'MESSAGE_EDITED'
  | 'MESSAGE_DELETED'
  | 'MESSAGE_REPORTED'
  | 'MESSAGE_REPORT_RESOLVED';

export type MessageEventPayload = {
  event: MessageEventName;
  conversationId?: string;
  messageId?: string;
  reportId?: string;
  actorId?: string | null;
  senderId?: string;
  recipientUserId?: string;
  status?: string;
  metadata?: Record<string, unknown>;
};

type MessageEventListener = (payload: MessageEventPayload) => void | Promise<void>;

const listeners = new Map<MessageEventName, Set<MessageEventListener>>();

export function onMessageEvent(
  eventName: MessageEventName,
  listener: MessageEventListener,
): () => void {
  const eventListeners = listeners.get(eventName) ?? new Set<MessageEventListener>();
  eventListeners.add(listener);
  listeners.set(eventName, eventListeners);

  return () => {
    eventListeners.delete(listener);
  };
}

export function emitMessageEvent(
  eventName: MessageEventName,
  payload: Omit<MessageEventPayload, 'event'>,
): void {
  const eventPayload = { ...payload, event: eventName };
  for (const listener of listeners.get(eventName) ?? []) {
    Promise.resolve(listener(eventPayload)).catch((err) => {
      console.error(`[MessageEvents] ${eventName} listener failed:`, err);
    });
  }
}
