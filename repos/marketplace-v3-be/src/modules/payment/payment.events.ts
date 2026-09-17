import { Payment } from '../../database/entities/payment.entity';

export type PaymentEventName =
  | 'PAYMENT_CREATED'
  | 'PAYMENT_INITIALIZED'
  | 'PAYMENT_RETRY_STARTED'
  | 'PAYMENT_METHOD_CHANGED'
  | 'PAYMENT_PROOF_UPLOADED'
  | 'PAYMENT_REVIEW_STARTED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_EXPIRED'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_READY_FOR_ORDER'
  | 'PAYMENT_FAILED';

export type PaymentEventPayload = {
  paymentId: string;
  paymentReference: string;
  payerId: string;
  sourceType: string;
  sourceId: string;
  purpose: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  paidAt: Date | null;
  metadata: Record<string, unknown> | null;
};

type PaymentEventListener = (payload: PaymentEventPayload) => void | Promise<void>;

const listeners = new Map<PaymentEventName, Set<PaymentEventListener>>();

export function onPaymentEvent(
  eventName: PaymentEventName,
  listener: PaymentEventListener,
): () => void {
  const eventListeners = listeners.get(eventName) ?? new Set<PaymentEventListener>();
  eventListeners.add(listener);
  listeners.set(eventName, eventListeners);

  return () => {
    eventListeners.delete(listener);
  };
}

export function emitPaymentEvent(
  eventName: PaymentEventName,
  payment: Payment,
): void {
  const payload = serializePaymentEventPayload(payment);
  for (const listener of listeners.get(eventName) ?? []) {
    Promise.resolve(listener(payload)).catch((err) => {
      console.error(`[PaymentEvents] ${eventName} listener failed:`, err);
    });
  }
}

export function serializePaymentEventPayload(payment: Payment): PaymentEventPayload {
  return {
    paymentId: payment.id,
    paymentReference: payment.paymentReference,
    payerId: payment.payerId,
    sourceType: payment.sourceType,
    sourceId: payment.sourceId,
    purpose: payment.purpose,
    amount: Number(payment.amount),
    currency: payment.currency,
    status: payment.status,
    paymentMethod: payment.paymentMethod,
    paidAt: payment.paidAt,
    metadata: payment.metadata,
  };
}
