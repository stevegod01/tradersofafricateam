import { ReviewType } from '../../database/entities/review-eligibility.entity';

export type ReviewEventName =
  | 'REVIEW_ELIGIBILITY_CREATED'
  | 'REVIEW_SUBMITTED'
  | 'REVIEW_STATUS_CHANGED'
  | 'REVIEW_RESPONSE_CREATED'
  | 'POINTS_TRANSACTION_CREATED';

export type ReviewEventPayload = {
  event: ReviewEventName;
  reviewType?: ReviewType;
  reviewId?: string;
  eligibilityId?: string;
  orderId?: string;
  buyerId?: string;
  sellerId?: string;
  productId?: string | null;
  pointsTransactionId?: string;
  metadata?: Record<string, unknown>;
};

type ReviewEventListener = (payload: ReviewEventPayload) => void | Promise<void>;

const listeners = new Map<ReviewEventName, Set<ReviewEventListener>>();

export function onReviewEvent(
  eventName: ReviewEventName,
  listener: ReviewEventListener,
): () => void {
  const eventListeners = listeners.get(eventName) ?? new Set<ReviewEventListener>();
  eventListeners.add(listener);
  listeners.set(eventName, eventListeners);

  return () => {
    eventListeners.delete(listener);
  };
}

export function emitReviewEvent(
  eventName: ReviewEventName,
  payload: Omit<ReviewEventPayload, 'event'>,
): void {
  const eventPayload = { ...payload, event: eventName };
  for (const listener of listeners.get(eventName) ?? []) {
    Promise.resolve(listener(eventPayload)).catch((err) => {
      console.error(`[ReviewEvents] ${eventName} listener failed:`, err);
    });
  }
}
