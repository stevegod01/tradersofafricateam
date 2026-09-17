import { UserSubscription } from '../../database/entities/user-subscription.entity';

export type SubscriptionEventName =
  | 'SUBSCRIPTION_PLAN_CREATED'
  | 'SUBSCRIPTION_PLAN_UPDATED'
  | 'SUBSCRIPTION_PLAN_ACTIVATED'
  | 'SUBSCRIPTION_PLAN_DEACTIVATED'
  | 'SUBSCRIPTION_ACTIVATED'
  | 'SUBSCRIPTION_UPGRADED'
  | 'SUBSCRIPTION_RENEWED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_AUTO_RENEW_UPDATED';

export type SubscriptionEventPayload = {
  subscriptionId?: string;
  userId?: string;
  planId?: string;
  status?: string;
  billingPeriod?: string;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown> | null;
};

type SubscriptionEventListener = (
  payload: SubscriptionEventPayload,
) => void | Promise<void>;

const listeners = new Map<SubscriptionEventName, Set<SubscriptionEventListener>>();

export function onSubscriptionEvent(
  eventName: SubscriptionEventName,
  listener: SubscriptionEventListener,
): () => void {
  const eventListeners = listeners.get(eventName) ?? new Set<SubscriptionEventListener>();
  eventListeners.add(listener);
  listeners.set(eventName, eventListeners);

  return () => {
    eventListeners.delete(listener);
  };
}

export function emitSubscriptionEvent(
  eventName: SubscriptionEventName,
  subscription: UserSubscription | null,
  metadata: Record<string, unknown> | null = null,
): void {
  const payload = subscription
    ? {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        planId: subscription.planId,
        status: subscription.status,
        billingPeriod: subscription.billingPeriod,
        expiresAt: subscription.expiresAt,
        metadata,
      }
    : { metadata };

  for (const listener of listeners.get(eventName) ?? []) {
    Promise.resolve(listener(payload)).catch((err) => {
      console.error(`[SubscriptionEvents] ${eventName} listener failed:`, err);
    });
  }
}
