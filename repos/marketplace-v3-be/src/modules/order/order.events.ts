import { Order } from '../../database/entities/order.entity';

export type OrderEventName =
  | 'ORDERS_CREATED'
  | 'ORDER_PROCESSING'
  | 'ORDER_READY_FOR_SHIPMENT'
  | 'BUYER_LOGISTICS_DETAILS_SUBMITTED'
  | 'BUYER_LOGISTICS_DETAILS_UPDATED'
  | 'ORDER_SHIPPED'
  | 'ORDER_DELIVERED'
  | 'ORDER_RECEIVED'
  | 'ORDER_COMPLETED'
  | 'ORDER_CANCELLATION_REQUESTED'
  | 'ORDER_CANCELLATION_APPROVED'
  | 'ORDER_CANCELLATION_REJECTED'
  | 'ORDER_CANCELLED';

export type OrderEventPayload = {
  event: OrderEventName;
  orderId: string;
  orderReference: string;
  paymentId: string;
  buyerId: string;
  sellerId: string;
  sourceType: string;
  status: string;
  completedAt: Date | null;
  items: Array<{
    orderItemId: string;
    productId: string;
    variantId: string | null;
  }>;
};

type OrderEventListener = (payload: OrderEventPayload) => void | Promise<void>;

const listeners = new Map<OrderEventName, Set<OrderEventListener>>();

export function onOrderEvent(
  eventName: OrderEventName,
  listener: OrderEventListener,
): () => void {
  const eventListeners = listeners.get(eventName) ?? new Set<OrderEventListener>();
  eventListeners.add(listener);
  listeners.set(eventName, eventListeners);

  return () => {
    eventListeners.delete(listener);
  };
}

export function emitOrderEvent(eventName: OrderEventName, order: Order): void {
  const payload = serializeOrderEventPayload(eventName, order);
  for (const listener of listeners.get(eventName) ?? []) {
    Promise.resolve(listener(payload)).catch((err) => {
      console.error(`[OrderEvents] ${eventName} listener failed:`, err);
    });
  }
}

export function serializeOrderEventPayload(
  eventName: OrderEventName,
  order: Order,
): OrderEventPayload {
  return {
    event: eventName,
    orderId: order.id,
    orderReference: order.orderReference,
    paymentId: order.paymentId,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    sourceType: order.sourceType,
    status: order.status,
    completedAt: order.completedAt,
    items: (order.items ?? []).map((item) => ({
      orderItemId: item.id,
      productId: item.productId,
      variantId: item.variantId,
    })),
  };
}
