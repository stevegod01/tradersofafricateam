import { LogisticsQuote } from '../../database/entities/logistics-quote.entity';
import { Shipment, ShipmentStatus } from '../../database/entities/shipment.entity';
import { B2BLogisticsQuote } from '../../database/entities/b2b-logistics-quote.entity';
import { B2BLogisticsRequest } from '../../database/entities/b2b-logistics-request.entity';

export type LogisticsEventName =
  | 'LOGISTICS_QUOTE_CREATED'
  | 'LOGISTICS_QUOTE_SELECTED'
  | 'LOGISTICS_QUOTE_EXPIRED'
  | 'SHIPMENT_CREATED'
  | 'SHIPMENT_PICKED_UP'
  | 'SHIPMENT_IN_TRANSIT'
  | 'SHIPMENT_OUT_FOR_DELIVERY'
  | 'SHIPMENT_DELIVERED'
  | 'SHIPMENT_DELIVERY_FAILED'
  | 'SHIPMENT_CANCELLED'
  | 'B2B_LOGISTICS_REQUEST_CREATED'
  | 'B2B_LOGISTICS_QUOTE_CREATED'
  | 'B2B_LOGISTICS_QUOTE_ACCEPTED';

export type LogisticsEventPayload = {
  event: LogisticsEventName;
  quoteId?: string;
  shipmentId?: string;
  shipmentReference?: string;
  orderId?: string;
  providerId?: string;
  providerCode?: string;
  providerName?: string;
  status?: string;
  trackingId?: string | null;
  trackingUrl?: string | null;
  b2bRequestId?: string;
  b2bQuoteId?: string;
};

type LogisticsEventListener = (payload: LogisticsEventPayload) => void | Promise<void>;

const listeners = new Map<LogisticsEventName, Set<LogisticsEventListener>>();

export function onLogisticsEvent(
  eventName: LogisticsEventName,
  listener: LogisticsEventListener,
): () => void {
  const eventListeners = listeners.get(eventName) ?? new Set<LogisticsEventListener>();
  eventListeners.add(listener);
  listeners.set(eventName, eventListeners);

  return () => {
    eventListeners.delete(listener);
  };
}

export function emitLogisticsQuoteEvent(
  eventName: Extract<
    LogisticsEventName,
    'LOGISTICS_QUOTE_CREATED' | 'LOGISTICS_QUOTE_SELECTED' | 'LOGISTICS_QUOTE_EXPIRED'
  >,
  quote: LogisticsQuote,
): void {
  emit(eventName, {
    event: eventName,
    quoteId: quote.id,
    providerId: quote.providerId,
    providerCode: quote.provider?.code,
    providerName: quote.provider?.name,
  });
}

export function emitShipmentEvent(eventName: LogisticsEventName, shipment: Shipment): void {
  emit(eventName, {
    event: eventName,
    shipmentId: shipment.id,
    shipmentReference: shipment.shipmentReference,
    orderId: shipment.orderId,
    providerId: shipment.providerId,
    providerCode: shipment.provider?.code,
    providerName: shipment.providerNameSnapshot,
    status: shipment.status,
    trackingId: shipment.trackingId,
    trackingUrl: shipment.trackingUrl,
  });
}

export function emitB2BRequestEvent(
  eventName: Extract<LogisticsEventName, 'B2B_LOGISTICS_REQUEST_CREATED'>,
  request: B2BLogisticsRequest,
): void {
  emit(eventName, {
    event: eventName,
    b2bRequestId: request.id,
  });
}

export function emitB2BQuoteEvent(
  eventName: Extract<
    LogisticsEventName,
    'B2B_LOGISTICS_QUOTE_CREATED' | 'B2B_LOGISTICS_QUOTE_ACCEPTED'
  >,
  quote: B2BLogisticsQuote,
): void {
  emit(eventName, {
    event: eventName,
    b2bRequestId: quote.requestId,
    b2bQuoteId: quote.id,
    providerId: quote.providerId,
    providerCode: quote.provider?.code,
    providerName: quote.provider?.name,
  });
}

export function shipmentEventForStatus(status: ShipmentStatus): LogisticsEventName | null {
  const events: Partial<Record<ShipmentStatus, LogisticsEventName>> = {
    [ShipmentStatus.SHIPMENT_CREATED]: 'SHIPMENT_CREATED',
    [ShipmentStatus.PICKED_UP]: 'SHIPMENT_PICKED_UP',
    [ShipmentStatus.IN_TRANSIT]: 'SHIPMENT_IN_TRANSIT',
    [ShipmentStatus.OUT_FOR_DELIVERY]: 'SHIPMENT_OUT_FOR_DELIVERY',
    [ShipmentStatus.DELIVERED]: 'SHIPMENT_DELIVERED',
    [ShipmentStatus.DELIVERY_FAILED]: 'SHIPMENT_DELIVERY_FAILED',
    [ShipmentStatus.CANCELLED]: 'SHIPMENT_CANCELLED',
  };
  return events[status] ?? null;
}

function emit(eventName: LogisticsEventName, payload: LogisticsEventPayload): void {
  for (const listener of listeners.get(eventName) ?? []) {
    Promise.resolve(listener(payload)).catch((err) => {
      console.error(`[LogisticsEvents] ${eventName} listener failed:`, err);
    });
  }
}
