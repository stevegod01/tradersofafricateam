import { MarketRFQ } from '../../database/entities/market-rfq.entity';
import { MarketRFQQuoteVersion } from '../../database/entities/market-rfq-quote-version.entity';

export type MarketRFQEventName =
  | 'MARKET_RFQ_CREATED'
  | 'MARKET_RFQ_SELLER_VIEWED'
  | 'MARKET_RFQ_QUOTE_CREATED'
  | 'MARKET_RFQ_COUNTER_OFFER_CREATED'
  | 'MARKET_RFQ_QUOTE_REJECTED'
  | 'MARKET_RFQ_QUOTE_EXPIRED'
  | 'MARKET_RFQ_AWARDED'
  | 'MARKET_RFQ_QUOTE_CLOSED'
  | 'MARKET_RFQ_CANCELLED'
  | 'MARKET_RFQ_EXPIRED';

export type MarketRFQEventPayload = {
  event: MarketRFQEventName;
  rfqId: string;
  rfqReference: string;
  buyerId: string;
  awardedSellerId?: string | null;
  quoteVersionId?: string | null;
  quoteVersion?: MarketRFQQuoteVersion | null;
  rfq: MarketRFQ;
};

type MarketRFQEventListener = (payload: MarketRFQEventPayload) => void | Promise<void>;

const listeners = new Map<MarketRFQEventName, Set<MarketRFQEventListener>>();

export function onMarketRFQEvent(
  eventName: MarketRFQEventName,
  listener: MarketRFQEventListener,
): () => void {
  const eventListeners = listeners.get(eventName) ?? new Set<MarketRFQEventListener>();
  eventListeners.add(listener);
  listeners.set(eventName, eventListeners);

  return () => {
    eventListeners.delete(listener);
  };
}

export function emitMarketRFQEvent(
  eventName: MarketRFQEventName,
  rfq: MarketRFQ,
  version?: MarketRFQQuoteVersion | null,
): void {
  const payload: MarketRFQEventPayload = {
    event: eventName,
    rfqId: rfq.id,
    rfqReference: rfq.rfqReference,
    buyerId: rfq.buyerId,
    awardedSellerId: rfq.awardedSellerId,
    quoteVersionId: version?.id ?? null,
    quoteVersion: version ?? null,
    rfq,
  };

  for (const listener of listeners.get(eventName) ?? []) {
    Promise.resolve(listener(payload)).catch((err) => {
      console.error(`[MarketRFQEvents] ${eventName} listener failed:`, err);
    });
  }
}
