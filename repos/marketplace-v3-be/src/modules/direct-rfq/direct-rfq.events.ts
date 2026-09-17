import { DirectRFQ } from '../../database/entities/direct-rfq.entity';
import { DirectRFQQuoteVersion } from '../../database/entities/direct-rfq-quote-version.entity';

export type DirectRFQEventName =
  | 'DIRECT_RFQ_CREATED'
  | 'DIRECT_RFQ_VIEWED'
  | 'DIRECT_RFQ_QUOTE_CREATED'
  | 'DIRECT_RFQ_COUNTER_OFFER_CREATED'
  | 'DIRECT_RFQ_QUOTE_ACCEPTED'
  | 'DIRECT_RFQ_QUOTE_REJECTED'
  | 'DIRECT_RFQ_QUOTE_EXPIRED'
  | 'DIRECT_RFQ_CANCELLED';

export type DirectRFQEventPayload = {
  event: DirectRFQEventName;
  rfqId: string;
  rfqReference: string;
  buyerId: string;
  sellerId: string;
  productId: string;
  quoteId?: string | null;
  quoteVersionId?: string | null;
  actorId?: string | null;
  actorType?: string | null;
  status: string;
};

type DirectRFQEventListener = (payload: DirectRFQEventPayload) => void | Promise<void>;

const listeners = new Map<DirectRFQEventName, Set<DirectRFQEventListener>>();

export function onDirectRFQEvent(
  eventName: DirectRFQEventName,
  listener: DirectRFQEventListener,
): () => void {
  const eventListeners = listeners.get(eventName) ?? new Set<DirectRFQEventListener>();
  eventListeners.add(listener);
  listeners.set(eventName, eventListeners);

  return () => {
    eventListeners.delete(listener);
  };
}

export function emitDirectRFQEvent(
  eventName: DirectRFQEventName,
  rfq: DirectRFQ,
  version?: DirectRFQQuoteVersion | null,
): void {
  const payload: DirectRFQEventPayload = {
    event: eventName,
    rfqId: rfq.id,
    rfqReference: rfq.rfqReference,
    buyerId: rfq.buyerId,
    sellerId: rfq.sellerId,
    productId: rfq.productId,
    quoteId: rfq.currentQuoteId,
    quoteVersionId: version?.id ?? rfq.acceptedQuoteVersionId,
    actorId: version?.createdById ?? null,
    actorType: version?.createdByType ?? null,
    status: rfq.status,
  };

  for (const listener of listeners.get(eventName) ?? []) {
    Promise.resolve(listener(payload)).catch((err) => {
      console.error(`[DirectRFQEvents] ${eventName} listener failed:`, err);
    });
  }
}
