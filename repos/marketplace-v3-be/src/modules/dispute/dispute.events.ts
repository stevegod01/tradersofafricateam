import { Dispute, DisputeFinancialAction } from '../../database/entities/dispute.entity';

export type DisputeEventName =
  | 'DISPUTE_CREATED'
  | 'DISPUTE_ASSIGNED'
  | 'DISPUTE_REVIEW_STARTED'
  | 'DISPUTE_MESSAGE_SENT'
  | 'DISPUTE_EVIDENCE_ADDED'
  | 'DISPUTE_BUYER_INFORMATION_REQUESTED'
  | 'DISPUTE_SELLER_INFORMATION_REQUESTED'
  | 'DISPUTE_BUYER_RESPONDED'
  | 'DISPUTE_SELLER_RESPONDED'
  | 'DISPUTE_RESOLVED'
  | 'DISPUTE_REFUND_REQUESTED'
  | 'DISPUTE_CLOSED';

export type DisputeEventPayload = {
  event: DisputeEventName;
  disputeId: string;
  disputeNumber: string;
  orderId: string;
  orderReference?: string;
  sellerOrderId: string;
  buyerId: string;
  sellerId: string;
  raisedBy?: string;
  raisedByType?: string;
  actorId?: string | null;
  actorType?: string;
  status: string;
  resolutionType?: string | null;
  financialAction?: DisputeFinancialAction | null;
  metadata?: Record<string, unknown>;
};

type DisputeEventListener = (payload: DisputeEventPayload) => void | Promise<void>;

const listeners = new Map<DisputeEventName, Set<DisputeEventListener>>();

export function onDisputeEvent(
  eventName: DisputeEventName,
  listener: DisputeEventListener,
): () => void {
  const eventListeners = listeners.get(eventName) ?? new Set<DisputeEventListener>();
  eventListeners.add(listener);
  listeners.set(eventName, eventListeners);

  return () => {
    eventListeners.delete(listener);
  };
}

export function emitDisputeEvent(
  eventName: DisputeEventName,
  dispute: Dispute,
  extras: Partial<Omit<DisputeEventPayload, 'event' | 'disputeId' | 'disputeNumber'>> = {},
): void {
  const payload: DisputeEventPayload = {
    event: eventName,
    disputeId: dispute.id,
    disputeNumber: dispute.disputeNumber,
    orderId: dispute.orderId,
    orderReference: dispute.order?.orderReference,
    sellerOrderId: dispute.sellerOrderId,
    buyerId: dispute.buyerId,
    sellerId: dispute.sellerId,
    raisedBy: dispute.raisedBy,
    raisedByType: dispute.raisedByType,
    status: dispute.status,
    resolutionType: dispute.resolutionType,
    financialAction: dispute.financialAction,
    ...extras,
  };

  for (const listener of listeners.get(eventName) ?? []) {
    Promise.resolve(listener(payload)).catch((err) => {
      console.error(`[DisputeEvents] ${eventName} listener failed:`, err);
    });
  }
}
