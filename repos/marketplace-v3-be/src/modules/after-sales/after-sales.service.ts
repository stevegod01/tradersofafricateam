import { getSetting } from '../system-settings/settings.reader';
import { updateSetting } from '../system-settings/settings.service';
import crypto from 'crypto';
import { EntityManager, In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { OrderDelivery } from '../../database/entities/order-delivery.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { OrderCancellationRequest, OrderCancellationStatus } from '../../database/entities/order-cancellation-request.entity';
import { OrderActorType } from '../../database/entities/order-status-history.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import { Shipment, ShipmentStatus } from '../../database/entities/shipment.entity';
import { Dispute, DisputeStatus } from '../../database/entities/dispute.entity';
import { ReturnRequest } from '../../database/entities/returns.entity';
import { ReturnItem } from '../../database/entities/return-items.entity';
import { ReturnEvidence } from '../../database/entities/return-evidence.entity';
import { Refund } from '../../database/entities/refunds.entity';
import { FinancialAdjustment } from '../../database/entities/financial-adjustments.entity';
import { AfterSalesSetting } from '../../database/entities/after-sales-settings.entity';
import { AfterSalesEvent } from '../../database/entities/after-sales-events.entity';
import { DeliveryType } from '../../database/entities/checkout-session.entity';
import { createError } from '../../common/utils/http-error.util';
import { processUpload, UploadedFile, UploadValidationError } from '../../common/utils/file-upload.util';
import { activeReturnStatuses, reservedRefundStatuses, cancellationReasons, returnReasons, units, decimal, proportional, assertRefundCapacity, assertReturnQuantity } from './after-sales.policy';
import { recordAfterSalesEvent } from './after-sales.events';
export type Actor = {
  id: string;
  type: 'buyer' | 'seller' | 'admin';
};
export type RefundInput = {
  sellerOrderId: string;
  sourceType: 'cancellation' | 'return' | 'dispute' | 'payment_adjustment' | 'admin';
  cancellationId?: string;
  returnId?: string;
  disputeId?: string;
  refundType: 'full' | 'partial';
  amount?: number | string;
  reason: string;
  breakdown?: {
    productAmount: number | string;
    logisticsAmount: number | string;
    otherAmount: number | string;
  };
};
export function assertRefundApproverSeparated(refund: Pick<Refund, 'requestedBy'>, actorId: string): void {
  if (refund.requestedBy === actorId)
    throw createError.conflict('Refund requester and approver must be different administrators');
}
export function assertRefundProcessorSeparated(refund: Pick<Refund, 'approvedBy'>, actorId: string): void {
  if (refund.approvedBy === actorId)
    throw createError.conflict('Refund approver cannot perform financial processing for the same refund');
}
type ReturnUpdateInput = {
  decision?: 'approve' | 'reject'; notes?: string; refundRequired?: boolean;
  providerName?: string; trackingId?: string; trackingUrl?: string; deliveryContact?: string;
};
type AfterSalesListQuery = Record<string, string | number | undefined> & { page?: number; limit?: number };
const settingId = '00000000-0000-4000-8000-000000000020';
const numberFor = (prefix: string) => `${prefix}-${new Date().getUTCFullYear()}-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
export const result = (data: unknown, message?: string) => ({
  success: true as const, ...(message ? { message } : {}), data
});
export async function lockOrder(manager: EntityManager, id: string): Promise<Order> {
  const order = await manager.findOne(Order, { where: { id }, lock: { mode: 'pessimistic_write' } });
  if (!order)
    throw createError.notFound('Order not found');
  return order;
}
export function authorize(order: Order, actor: Actor): void {
  if (actor.type !== 'admin' && (actor.type === 'buyer' ? order.buyerId : order.sellerId) !== actor.id)
    throw createError.notFound('Order not found');
}
export class AfterSalesService {
  async settings(manager = AppDataSource.manager): Promise<AfterSalesSetting> {
    const settings = await manager.findOneBy(AfterSalesSetting, { id: settingId });
    if (!settings)
      throw createError.conflict('After-sales policy is not configured; run migrations');
    settings.returnWindowDays=await getSetting<number>('returnWindowDays',manager);
    return settings;
  }
  async updateSettings(actor: Actor, dto: Partial<AfterSalesSetting>) {
    return AppDataSource.transaction('READ COMMITTED', async (manager) => {
      const previous = await this.settings(manager);
      const {returnWindowDays,...legacy}=dto;
      if(returnWindowDays!==undefined)await updateSetting(manager,actor.id,'returnWindowDays',returnWindowDays);
      if(Object.keys(legacy).length)await manager.update(AfterSalesSetting, settingId, legacy);
      const { AdminAuditEvent } = await import('../../database/entities/admin-audit-event.entity');
      await manager.save(AdminAuditEvent, manager.create(AdminAuditEvent, {
        eventType: 'AFTER_SALES_POLICY_UPDATED', actorAdminId: actor.id, metadata: { previous, changes: dto }
      }));
      return result(await this.settings(manager));
    });
  }
  async assertNoDispute(manager: EntityManager, orderId: string): Promise<void> {
    if (await manager.exists(Dispute, { where: { orderId, status: In([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_BUYER, DisputeStatus.AWAITING_SELLER]) } }))
      throw createError.conflict('An active dispute controls this order', 'ACTIVE_DISPUTE_EXISTS');
  }
  async assertCancellable(manager: EntityManager, order: Order): Promise<void> {
    if (![OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.READY_FOR_SHIPMENT].includes(order.status))
      throw createError.conflict('Orders can only be cancelled before shipment', 'ORDER_NOT_CANCELLABLE');
    const delivery = await manager.findOneBy(OrderDelivery, { orderId: order.id });
    if (delivery?.shippedAt)
      throw createError.conflict('Goods have already been handed over');
    // Require outstanding integrated shipments to be cancelled by Logistics first.
    if (await manager.getRepository(Shipment).createQueryBuilder('s').where('s.orderId = :id', { id: order.id }).andWhere('s.status != :status', { status: ShipmentStatus.CANCELLED }).getExists())
      throw createError.conflict('Cancel the outstanding shipment through Logistics before cancelling this order', 'ACTIVE_SHIPMENT_EXISTS');
    await this.assertNoDispute(manager, order.id);
    if (await manager.exists(Refund, { where: { orderId: order.id, status: In(reservedRefundStatuses) } }))
      throw createError.conflict('A refund already controls this order');
  }
  async cancellation(actor: Actor, orderId: string, dto: {
    reason: string;
    description?: string;
  }, legacy = false) {
    return AppDataSource.transaction('READ COMMITTED', async (manager) => {
      const order = await lockOrder(manager, orderId);
      authorize(order, actor);
      if (!legacy && !cancellationReasons[actor.type].includes(dto.reason))
        throw createError.badRequest('Invalid cancellation reason');
      await this.assertCancellable(manager, order);
      if (await manager.exists(OrderCancellationRequest, { where: { orderId, status: In([OrderCancellationStatus.PENDING, OrderCancellationStatus.APPROVED, OrderCancellationStatus.COMPLETED]) } }))
        throw createError.conflict('An active cancellation request already exists for this order.', 'ACTIVE_CANCELLATION_EXISTS');
      const payment = await manager.findOneByOrFail(Payment, { id: order.paymentId });
      const cancellation = await manager.save(OrderCancellationRequest, manager.create(OrderCancellationRequest, {
        orderId, cancellationNumber: numberFor('CAN'), requestedById: actor.id, requestedByType: actor.type as OrderActorType,
        reason: dto.reason, notes: dto.description ?? null, status: OrderCancellationStatus.PENDING,
        refundRequired: payment.status === PaymentStatus.CONFIRMED, refundId: null, cancelledAt: null,
      }));
      await recordAfterSalesEvent(manager, order, cancellation.id, 'CANCELLATION_CREATED', actor.id, actor.type);
      await recordAfterSalesEvent(manager, order, cancellation.id, 'CANCELLATION_REQUESTED', actor.id, actor.type, { reason: dto.reason });
      // RFQ terms are retained; all participant requests require admin review.
      if (actor.type === 'admin')
        await this.approveCancellation(manager, order, cancellation, actor);
      return result(this.serializeCancellation(cancellation), 'Cancellation request submitted successfully.');
    });
  }
  async reviewCancellation(actor: Actor, id: string, decision: 'approve' | 'reject', notes?: string, orderId?: string) {
    if (actor.type !== 'admin')
      throw createError.forbidden('Admin review required');
    return AppDataSource.transaction('READ COMMITTED', async (manager) => {
      const initial = await manager.findOneBy(OrderCancellationRequest, { id });
      if (!initial || (orderId && initial.orderId !== orderId))
        throw createError.notFound('Cancellation not found');
      const order = await lockOrder(manager, initial.orderId);
      const cancellation = await manager.findOneByOrFail(OrderCancellationRequest, { id });
      if (cancellation.status !== OrderCancellationStatus.PENDING)
        throw createError.conflict('Cancellation is no longer pending');
      cancellation.reviewNotes = notes ?? null;
      if (decision === 'approve') {
        await this.assertCancellable(manager, order);
        await this.approveCancellation(manager, order, cancellation, actor);
      }
      else {
        cancellation.status = OrderCancellationStatus.REJECTED;
        cancellation.reviewedBy = actor.id;
        cancellation.reviewedAt = new Date();
        await manager.save(cancellation);
        await recordAfterSalesEvent(manager, order, id, 'CANCELLATION_REJECTED', actor.id, actor.type, { notes });
      }
      return result(this.serializeCancellation(cancellation));
    });
  }
  private async approveCancellation(manager: EntityManager, order: Order, cancellation: OrderCancellationRequest, actor: Actor) {
    cancellation.status = OrderCancellationStatus.APPROVED;
    cancellation.reviewedBy = actor.id;
    cancellation.reviewedAt = new Date();
    cancellation.cancelledAt = new Date();
    await manager.save(cancellation);
    const { OrderService } = await import('../order/order.service');
    await new OrderService().finalizeCancellation(manager, order, actor.id, cancellation.reason);
    await recordAfterSalesEvent(manager, order, cancellation.id, 'CANCELLATION_APPROVED', actor.id, actor.type);
    const payment = await manager.findOneByOrFail(Payment, { id: order.paymentId });
    cancellation.refundRequired = payment.status === PaymentStatus.CONFIRMED;
    if (cancellation.refundRequired) {
      const refund = await this.createRefund(manager, actor, {
        sellerOrderId: order.id, sourceType: 'cancellation', cancellationId: cancellation.id, refundType: 'full', reason: cancellation.reason
      });
      cancellation.refundId = refund.id;
    }
    else {
      cancellation.status = OrderCancellationStatus.COMPLETED;
      await recordAfterSalesEvent(manager, order, cancellation.id, 'CANCELLATION_COMPLETED', actor.id, actor.type);
    }
    await manager.save(cancellation);
  }
  serializeCancellation(c: OrderCancellationRequest) {
    return {
      id: c.id, cancellationRequestId: c.id, cancellationNumber: c.cancellationNumber, orderId: c.orderId, sellerOrderId: c.orderId, requestedBy: c.requestedById, requestedByType: c.requestedByType, reason: c.reason, description: c.notes, status: c.status, refundRequired: c.refundRequired, refundId: c.refundId, reviewedAt: c.reviewedAt, reviewNotes: c.reviewNotes, cancelledAt: c.cancelledAt, createdAt: c.createdAt
    };
  }
  async uploadEvidence(userId: string, file: UploadedFile) {
    try {
      const b = file.buffer;
      const validSignature = file.mimetype === 'image/jpeg' ? b.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        : file.mimetype === 'image/png' ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : file.mimetype === 'image/webp' ? b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'
            : file.mimetype === 'application/pdf' && b.subarray(0, 5).toString() === '%PDF-';
      if (!validSignature)
        throw createError.badRequest('Evidence content does not match its declared file type');
      const processed = await processUpload(file, {
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], maxFileSizeMb: 10, pathPrefix: 'return-evidence'
      });
      const evidence = await AppDataSource.manager.save(ReturnEvidence, AppDataSource.manager.create(ReturnEvidence, {
        userId, returnId: null, fileName: [...file.filename].filter(character => character.charCodeAt(0) >= 32 && character !== '<' && character !== '>').join('').slice(0, 255), fileUrl: processed.url, storedName: processed.storedName,
        mimeType: processed.mimetype, sizeBytes: processed.sizeBytes, expiresAt: new Date(Date.now() + 86400000),
      }));
      return result({
        fileId: evidence.id, fileName: evidence.fileName, expiresAt: evidence.expiresAt
      });
    }
    catch (err) {
      if (err instanceof UploadValidationError)
        throw createError.badRequest(err.message);
      throw err;
    }
  }
  async createReturn(actor: Actor, dto: {
    sellerOrderId: string;
    reason: string;
    description: string;
    items: {
      orderItemId: string;
      quantity: number | string;
      reason?: string;
    }[];
    evidence: string[];
  }) {
    return AppDataSource.transaction('READ COMMITTED', async (manager) => {
      const order = await lockOrder(manager, dto.sellerOrderId);
      authorize(order, { ...actor, type: 'buyer' });
      const policy = await this.settings(manager);
      if (!(returnReasons as readonly string[]).includes(dto.reason) || (dto.reason === 'changed_mind' && !policy.allowChangedMind))
        throw createError.badRequest('Return reason is not allowed by policy');
      if (![OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.RECEIVED, OrderStatus.COMPLETED].includes(order.status))
        throw createError.conflict('This order is not eligible for a return');
      const delivery = await manager.findOneBy(OrderDelivery, { orderId: order.id });
      const deliveredAt = delivery?.deliveredAt ?? order.receivedAt;
      if (order.status !== OrderStatus.SHIPPED && !deliveredAt)
        throw createError.conflict('Confirmed delivery timestamp is required to establish return eligibility');
      if (deliveredAt && Date.now() > deliveredAt.getTime() + policy.returnWindowDays * 86400000)
        throw createError.conflict('Return window has expired', 'RETURN_WINDOW_EXPIRED');
      await this.assertNoDispute(manager, order.id);
      const items = await manager.findBy(OrderItem, { orderId: order.id });
      if (new Set(dto.items.map(x => x.orderItemId)).size !== dto.items.length)
        throw createError.badRequest('Duplicate return items');
      for (const input of dto.items) {
        const item = items.find(x => x.id === input.orderItemId);
        if (!item)
          throw createError.badRequest('Return item does not belong to this order');
        if ((policy.nonReturnableProductIds as unknown as string[]).includes(item.productId) || item.attributesSnapshot?.returnable === false)
          throw createError.conflict('This product is not returnable');
        const existing = await manager.getRepository(ReturnItem).createQueryBuilder('i').innerJoin(ReturnRequest, 'r', 'r.id = i.returnId')
          .where('i.orderItemId = :id', { id: item.id }).andWhere('r.status IN (:...statuses)', { statuses: activeReturnStatuses }).getMany();
        const reserved = existing.reduce((sum, x) => sum + units(x.quantity, 3), 0n);
        assertReturnQuantity(units(input.quantity, 3), reserved, units(item.quantity, 3));
        if (await manager.getRepository(ReturnItem).createQueryBuilder('i').innerJoin(ReturnRequest, 'r', 'r.id = i.returnId').where('i.orderItemId = :id', { id: item.id }).andWhere('r.status IN (:...statuses)', { statuses: activeReturnStatuses.filter(s => s !== 'completed') }).getExists())
          throw createError.conflict('An active return already exists for an affected item', 'ACTIVE_RETURN_EXISTS');
      }
      if(dto.evidence.length>await getSetting<number>('maximumReturnEvidenceFiles',manager))throw createError.badRequest('Return evidence limit exceeded');
      if (new Set(dto.evidence).size !== dto.evidence.length)
        throw createError.badRequest('Duplicate evidence references');
      const uploads = dto.evidence.length ? await manager.find(ReturnEvidence, { where: { id: In(dto.evidence), userId: actor.id }, lock: { mode: 'pessimistic_write' } }) : [];
      if (uploads.length !== dto.evidence.length || uploads.some(x => x.returnId || x.expiresAt.getTime() < Date.now()))
        throw createError.badRequest('Evidence is unavailable, expired, or belongs to another user');
      const ret = await manager.save(ReturnRequest, manager.create(ReturnRequest, {
        orderId: order.id, buyerId: order.buyerId, sellerId: order.sellerId,
        returnNumber: numberFor('RET'), reason: dto.reason, description: dto.description, status: 'requested', refundId: null,
        policySnapshot: {
          returnWindowDays: policy.returnWindowDays, allowChangedMind: policy.allowChangedMind, reverseTransactionFee: policy.reverseTransactionFee
        },
      }));
      for (const item of dto.items)
        await manager.save(ReturnItem, manager.create(ReturnItem, {
          returnId: ret.id, orderItemId: item.orderItemId, quantity: decimal(units(item.quantity, 3), 3), reason: item.reason ?? null
        }));
      for (const upload of uploads)
        await manager.update(ReturnEvidence, upload.id, { returnId: ret.id });
      await recordAfterSalesEvent(manager, order, ret.id, 'RETURN_CREATED', actor.id, actor.type);
      await recordAfterSalesEvent(manager, order, ret.id, 'RETURN_REQUESTED', actor.id, actor.type, { reason: dto.reason });
      return result({ ...ret, sellerOrderId: order.id }, 'Return request submitted successfully.');
    });
  }
  async updateReturn(actor: Actor, id: string, action: 'respond' | 'shipment' | 'received' | 'cancel', dto: ReturnUpdateInput = {}) {
    return AppDataSource.transaction('READ COMMITTED', async (manager) => {
      const initial = await manager.findOneBy(ReturnRequest, { id });
      if (!initial)
        throw createError.notFound('Return not found');
      const order = await lockOrder(manager, initial.orderId);
      authorize(order, actor);
      const ret = await manager.findOneByOrFail(ReturnRequest, { id });
      await this.assertNoDispute(manager, order.id);
      let event: string;
      if (action === 'respond') {
        if (!['seller', 'admin'].includes(actor.type))
          throw createError.forbidden('Seller or admin review required');
        if (ret.status !== 'requested')
          throw createError.conflict('Return is no longer awaiting review');
        ret.responseNotes = dto.notes ?? null;
        if (dto.refundRequired !== undefined) {
          if (actor.type !== 'admin')
            throw createError.forbidden('Only an admin can authorize a return without refund');
          ret.refundRequired = dto.refundRequired;
        }
        if (dto.decision === 'approve') {
          ret.status = 'awaiting_return';
          ret.approvedBy = actor.id;
          ret.approvedAt = new Date();
          event = 'RETURN_APPROVED';
        }
        else {
          ret.status = 'rejected';
          event = 'RETURN_REJECTED';
        }
      }
      else if (action === 'shipment') {
        if (actor.type !== 'buyer')
          throw createError.forbidden('Buyer shipment submission required');
        if (!['approved', 'awaiting_return'].includes(ret.status))
          throw createError.conflict('Return must be approved before shipment');
        ret.status = 'in_transit';
        ret.returnMethod = 'buyer_arranged';
        ret.returnProviderName = dto.providerName!;
        ret.returnTrackingId = dto.trackingId!;
        ret.returnTrackingUrl = dto.trackingUrl ?? null;
        ret.deliveryContact = dto.deliveryContact ?? null;
        ret.shipmentNotes = dto.notes ?? null;
        event = 'RETURN_SHIPPED';
      }
      else if (action === 'received') {
        if (!['seller', 'admin'].includes(actor.type))
          throw createError.forbidden('Seller or admin receipt required');
        if (ret.status !== 'in_transit')
          throw createError.conflict('Only an in-transit return can be received');
        ret.status = 'received';
        ret.receivedAt = new Date();
        event = 'RETURN_RECEIVED';
        await manager.save(ret);
        if (ret.refundRequired) {
          const refund = await this.createRefund(manager, actor, {
            sellerOrderId: order.id, sourceType: 'return', returnId: ret.id, refundType: 'partial', reason: ret.reason
          });
          ret.refundId = refund.id;
        }
        else {
          ret.status = 'completed';
        }
      }
      else {
        if (actor.type !== 'buyer' && actor.type !== 'admin')
          throw createError.forbidden('Buyer withdrawal required');
        if (!['requested', 'approved', 'awaiting_return'].includes(ret.status))
          throw createError.conflict('Return cannot be withdrawn after shipment');
        ret.status = 'cancelled';
        event = 'RETURN_CANCELLED';
      }
      await manager.save(ret);
      await recordAfterSalesEvent(manager, order, id, event, actor.id, actor.type, { notes: dto.notes });
      if (action === 'received' && !ret.refundRequired) await recordAfterSalesEvent(manager, order, id, 'RETURN_COMPLETED', actor.id, actor.type, { refundRequired: false });
      if (action === 'shipment') await recordAfterSalesEvent(manager, order, id, 'RETURN_SHIPMENT_ADDED', actor.id, actor.type);
      return result({ ...ret, sellerOrderId: order.id });
    });
  }
  /** Caller transaction locks the order before the payment; all sources share these locks. */
  async createRefund(manager: EntityManager, actor: Actor, dto: RefundInput): Promise<Refund> {
    const order = await lockOrder(manager, dto.sellerOrderId);
    const payment = await manager.findOne(Payment, { where: { id: order.paymentId }, lock: { mode: 'pessimistic_write' } });
    if (!payment || payment.status !== PaymentStatus.CONFIRMED || payment.payerId !== order.buyerId || payment.currency !== order.paymentCurrency)
      throw createError.conflict('A confirmed payment with a matching buyer and currency is required');
    const policy = await this.settings(manager);
    const sourceIds = [dto.cancellationId, dto.returnId, dto.disputeId].filter(Boolean);
    if (sourceIds.length !== (['cancellation', 'return', 'dispute'].includes(dto.sourceType) ? 1 : 0))
      throw createError.badRequest('Exactly the matching source reference must be supplied');
    let sourceProductLimit: bigint | undefined;
    let sourceTotalLimit: bigint | undefined;
    let reverseTransactionFee = policy.reverseTransactionFee;
    if (dto.sourceType === 'cancellation') {
      if (!dto.cancellationId)
        throw createError.badRequest('cancellationId is required');
      const source = await manager.findOneBy(OrderCancellationRequest, {
        id: dto.cancellationId, orderId: order.id, status: OrderCancellationStatus.APPROVED
      });
      if (!source || order.status !== OrderStatus.CANCELLED)
        throw createError.conflict('An approved, finalized cancellation is required');
    }
    else if (dto.sourceType === 'return') {
      if (!dto.returnId)
        throw createError.badRequest('returnId is required');
      const source = await manager.findOneBy(ReturnRequest, {
        id: dto.returnId, orderId: order.id, status: 'received'
      });
      if (!source)
        throw createError.conflict('Return receipt must be confirmed before requesting a refund');
      const items = await manager.findBy(ReturnItem, { returnId: source.id });
      sourceProductLimit = 0n;
      for (const item of items) {
        const original = await manager.findOneByOrFail(OrderItem, { id: item.orderItemId, orderId: order.id });
        const subtotal = proportional(units(original.subtotal), units(item.quantity, 3), units(original.quantity, 3));
        sourceProductLimit += proportional(subtotal, units(order.paymentAmount), units(order.orderTotal));
      }
      reverseTransactionFee = source.policySnapshot.reverseTransactionFee === true;
    }
    else if (dto.sourceType === 'dispute') {
      if (!dto.disputeId)
        throw createError.badRequest('disputeId is required');
      const source = await manager.findOneBy(Dispute, { id: dto.disputeId, orderId: order.id });
      if (!source || ![DisputeStatus.RESOLVED, DisputeStatus.CLOSED].includes(source.status) || !source.financialAction || !['refund', 'partial_refund'].includes(source.financialAction.type))
        throw createError.conflict('A resolved dispute authorizing a refund is required');
      if (source.financialAction.currency?.toUpperCase() !== payment.currency)
        throw createError.conflict('Dispute refund currency does not match payment');
      sourceTotalLimit = units(source.financialAction.amount!);
    }
    else {
      if (actor.type !== 'admin')
        throw createError.forbidden('Admin financial authorization required');
      if (dto.refundType === 'partial' && dto.amount === undefined)
        throw createError.badRequest('Amount is required for a partial admin adjustment');
    }
    for (const key of ['cancellationId', 'returnId', 'disputeId'] as const) {
      if (dto[key]) {
        const existing = await manager.findOneBy(Refund, { [key]: dto[key] });
        if (existing)
          return existing; // A source is idempotent, including failed attempts.
      }
    }
    const maximum = units(order.paymentAmount);
    const productMaximum = proportional(units(order.productsSubtotal), maximum, units(order.orderTotal));
    const rawLogisticsMaximum = order.deliveryType === DeliveryType.BUYER_ARRANGED ? 0n : proportional(units(order.logisticsAmount ?? 0), maximum, units(order.orderTotal));
    const logisticsMaximum = rawLogisticsMaximum > maximum - productMaximum ? maximum - productMaximum : rawLogisticsMaximum;
    if (productMaximum > maximum)
      throw createError.conflict('Original seller payment allocation is inconsistent');
    const reserved = await manager.find(Refund, { where: { orderId: order.id, status: In(reservedRefundStatuses) }, lock: { mode: 'pessimistic_write' } });
    const totalReserved = reserved.reduce((n, r) => n + units(r.amount), 0n);
    const productReserved = reserved.reduce((n, r) => n + units(r.breakdown.productAmount), 0n);
    const logisticsReserved = reserved.reduce((n, r) => n + units(r.breakdown.logisticsAmount), 0n);
    const refundableLogistics = dto.sourceType === 'return' || (dto.sourceType === 'cancellation' && !policy.refundLogisticsOnCancellation) ? 0n : logisticsMaximum;
    const productAvailable = productMaximum - productReserved;
    const logisticsAvailable = refundableLogistics > logisticsReserved ? refundableLogistics - logisticsReserved : 0n;
    const eligible = (sourceProductLimit === undefined ? productAvailable : (sourceProductLimit < productAvailable ? sourceProductLimit : productAvailable)) + logisticsAvailable;
    let amount = dto.amount === undefined ? eligible : units(dto.amount);
    if (sourceTotalLimit !== undefined) {
      if (dto.amount === undefined)
        amount = sourceTotalLimit;
      if (amount > sourceTotalLimit)
        throw createError.conflict('Amount exceeds the dispute resolution');
    }
    if (amount > eligible)
      throw createError.conflict('Amount exceeds source eligibility');
    if (dto.refundType === 'full' && amount !== eligible)
      throw createError.badRequest('A full refund must equal the remaining eligible source amount');
    assertRefundCapacity(amount, totalReserved, maximum);
    const paymentRefunds = await manager.find(Refund, { where: { paymentId: payment.id, status: In(reservedRefundStatuses) }, lock: { mode: 'pessimistic_write' } });
    assertRefundCapacity(amount, paymentRefunds.reduce((n, r) => n + units(r.amount), 0n), units(payment.amount));
    const product = dto.breakdown ? units(dto.breakdown.productAmount) : (amount <= productAvailable ? amount : productAvailable);
    const logistics = dto.breakdown ? units(dto.breakdown.logisticsAmount) : amount - product;
    const other = dto.breakdown ? units(dto.breakdown.otherAmount) : 0n;
    if (other !== 0n || product + logistics !== amount || product > productAvailable || logistics > logisticsAvailable || (sourceProductLimit !== undefined && product > sourceProductLimit))
      throw createError.badRequest('Refund breakdown exceeds collected product or eligible logistics amounts');
    const refund = await manager.save(Refund, manager.create(Refund, {
      refundNumber: numberFor('REF'), paymentId: payment.id, orderId: order.id, buyerId: order.buyerId, sellerId: order.sellerId,
      cancellationId: dto.cancellationId ?? null, returnId: dto.returnId ?? null, disputeId: dto.disputeId ?? null,
      sourceType: dto.sourceType, refundType: dto.refundType, amount: decimal(amount), currency: payment.currency,
      status: 'pending', reason: dto.reason, gateway: payment.paymentMethod, requestedBy: actor.id, approvedBy: null,
      gatewayRefundReference: null, processingMode: null, attemptCount: 0,
      breakdown: {
        productAmount: decimal(product), logisticsAmount: decimal(logistics), otherAmount: '0.00', totalRefundAmount: decimal(amount)
      },
      financialSnapshot: {
        orderCurrency: order.orderCurrency, paymentCurrency: order.paymentCurrency, paymentAmount: String(order.paymentAmount), orderTotal: String(order.orderTotal), productsSubtotal: String(order.productsSubtotal),
        fxApplied: order.fxApplied, fxRateSnapshot: order.fxRateSnapshot, fxSourceCurrency: order.fxSourceCurrency, fxTargetCurrency: order.fxTargetCurrency, fxSourceAmount: order.fxSourceAmount, fxConvertedAmount: order.fxConvertedAmount, fxQuotedAt: order.fxQuotedAt, fxProvider: order.fxProvider,
        transactionFeeAmount: String(order.transactionFeeAmount ?? 0), transactionFeePercentage: order.transactionFeePercentage, feeBaseAmount: order.feeBaseAmount,
        orderProductRefundAmount: decimal(productMaximum > 0n ? proportional(product, units(order.productsSubtotal), productMaximum) : 0n),
        reverseTransactionFee, productPaymentAllocation: decimal(productMaximum), logisticsPaymentAllocation: decimal(logisticsMaximum), deliveryType: order.deliveryType,
      },
    }));
    if (dto.cancellationId)
      await manager.update(OrderCancellationRequest, dto.cancellationId, { refundId: refund.id, refundRequired: true });
    if (dto.returnId)
      await manager.update(ReturnRequest, dto.returnId, { refundId: refund.id });
    await recordAfterSalesEvent(manager, order, refund.id, 'REFUND_CREATED', actor.id, actor.type, {
      amount: refund.amount, currency: refund.currency, sourceType: refund.sourceType
    });
    return refund;
  }
  async adminCreateRefund(actor: Actor, dto: RefundInput) {
    if (actor.type !== 'admin')
      throw createError.forbidden('Admin financial authorization required');
    return AppDataSource.transaction('READ COMMITTED', async (manager) => result(await this.createRefund(manager, actor, dto)));
  }
  async approveRefund(actor: Actor, id: string) {
    return this.mutateRefund(actor, id, async (manager, order, refund) => {
      if (refund.status === 'approved')
        return;
      if (refund.status !== 'pending')
        throw createError.conflict('Only pending refunds can be approved');
      assertRefundApproverSeparated(refund, actor.id);
      refund.status = 'approved';
      refund.approvedBy = actor.id;
      await manager.save(refund);
      await recordAfterSalesEvent(manager, order, id, 'REFUND_APPROVED', actor.id, actor.type);
    });
  }
  async cancelRefund(actor: Actor, id: string, notes: string) {
    return this.mutateRefund(actor, id, async (manager, order, refund) => {
      if (!['pending', 'approved'].includes(refund.status) || refund.attemptCount > 0)
        throw createError.conflict('Only refunds that have never entered financial processing can be cancelled');
      refund.status = 'cancelled';
      await manager.save(refund);
      await recordAfterSalesEvent(manager, order, id, 'REFUND_CANCELLED', actor.id, actor.type, { notes });
    });
  }
  async mutateRefund(actor: Actor, id: string, fn: (manager: EntityManager, order: Order, refund: Refund) => Promise<void>) {
    if (actor.type !== 'admin')
      throw createError.forbidden('Admin financial authorization required');
    return AppDataSource.transaction('READ COMMITTED', async (manager) => {
      const initial = await manager.findOneBy(Refund, { id });
      if (!initial)
        throw createError.notFound('Refund not found');
      const order = await lockOrder(manager, initial.orderId);
      await manager.findOne(Payment, { where: { id: initial.paymentId }, lock: { mode: 'pessimistic_write' } });
      const refund = await manager.findOneOrFail(Refund, { where: { id }, lock: { mode: 'pessimistic_write' } });
      await fn(manager, order, refund);
      return result({ ...refund, sellerOrderId: order.id });
    });
  }
  async eligibility(actor: Actor, id: string) {
    const manager = AppDataSource.manager;
    const order = await manager.findOneBy(Order, { id });
    if (!order || (actor.type !== 'admin' && ![order.buyerId, order.sellerId].includes(actor.id)))
      throw createError.notFound('Order not found');
    const policy = await this.settings();
    let cancellationBlocked: string | null = null;
    try {
      await this.assertCancellable(manager, order);
      if (await manager.exists(OrderCancellationRequest, { where: { orderId: id, status: In([OrderCancellationStatus.PENDING, OrderCancellationStatus.APPROVED, OrderCancellationStatus.COMPLETED]) } }))
        cancellationBlocked = 'An active cancellation exists';
    }
    catch (err) {
      if (err instanceof Error && 'statusCode' in err)
        cancellationBlocked = err.message;
      else
        throw err;
    }
    const delivery = await manager.findOneBy(OrderDelivery, { orderId: id });
    const anchor = delivery?.deliveredAt ?? order.receivedAt;
    const deadline = anchor ? new Date(anchor.getTime() + policy.returnWindowDays * 86400000) : null;
    let returnBlocked: string | null = null;
    if (actor.id !== order.buyerId)
      returnBlocked = 'Only the buyer may request a return';
    else if (![OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.RECEIVED, OrderStatus.COMPLETED].includes(order.status))
      returnBlocked = 'Order has not shipped';
    else if (order.status !== OrderStatus.SHIPPED && !anchor)
      returnBlocked = 'Confirmed delivery timestamp is unavailable';
    else if (deadline && Date.now() > deadline.getTime())
      returnBlocked = 'Return window has expired';
    try {
      await this.assertNoDispute(manager, id);
    }
    catch (err) {
      if (err instanceof Error && 'statusCode' in err)
        returnBlocked = err.message;
      else
        throw err;
    }
    const items = await manager.findBy(OrderItem, { orderId: id });
    const eligibleItems = [];
    for (const item of items) {
      const requests = await manager.getRepository(ReturnItem).createQueryBuilder('i').innerJoin(ReturnRequest, 'r', 'r.id = i.returnId')
        .select('i.quantity', 'quantity').addSelect('r.status', 'status').where('i.orderItemId = :id', { id: item.id }).andWhere('r.status IN (:...statuses)', { statuses: activeReturnStatuses }).getRawMany();
      const reserved = requests.reduce((n, row) => n + units(row.quantity, 3), 0n);
      const available = units(item.quantity, 3) - reserved;
      const blocked = requests.some(row => row.status !== 'completed') || (policy.nonReturnableProductIds as unknown as string[]).includes(item.productId) || item.attributesSnapshot?.returnable === false;
      eligibleItems.push({ orderItemId: item.id, returnableQuantity: decimal(blocked || available < 0n ? 0n : available, 3) });
    }
    if (!eligibleItems.some(x => units(x.returnableQuantity, 3) > 0n))
      returnBlocked ??= 'No eligible item quantities remain';
    return result({
      sellerOrderId: id, canRequestCancellation: cancellationBlocked === null, cancellationBlockedReason: cancellationBlocked,
      cancellationReasons: cancellationReasons[actor.id === order.sellerId ? 'seller' : 'buyer'],
      canRequestReturn: returnBlocked === null, returnBlockedReason: returnBlocked, returnDeadline: deadline,
      returnReasons: returnReasons.filter(r => r !== 'changed_mind' || policy.allowChangedMind), items: eligibleItems,
      requiresCancellationReview: true, sourceType: order.sourceType,
    });
  }
  async list(kind: 'cancellations' | 'returns' | 'refunds', actor: Actor, query: AfterSalesListQuery) {
    const target = kind === 'cancellations' ? OrderCancellationRequest : kind === 'returns' ? ReturnRequest : Refund;
    const qb = AppDataSource.getRepository<OrderCancellationRequest | ReturnRequest | Refund>(target).createQueryBuilder('r').innerJoin(Order, 'o', 'o.id = r.orderId');
    if (actor.type !== 'admin') {
      if (kind === 'refunds')
        qb.andWhere('o.buyerId = :userId', { userId: actor.id });
      else
        qb.andWhere('(o.buyerId = :userId OR o.sellerId = :userId)', { userId: actor.id });
    }
    if (query.status)
      qb.andWhere('r.status = :status', { status: query.status });
    if (query.orderId || query.sellerOrderId)
      qb.andWhere('r.orderId = :orderId', { orderId: query.sellerOrderId ?? query.orderId });
    if (kind === 'refunds')
      for (const key of ['paymentId', 'currency', 'sourceType', 'refundType'])
        if (query[key])
          qb.andWhere(`r.${key} = :${key}`, { [key]: query[key] });
    if (query.dateFrom)
      qb.andWhere('r.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo)
      qb.andWhere('r.createdAt <= :dateTo', { dateTo: query.dateTo });
    if (query.search)
      qb.andWhere(`r.${kind === 'refunds' ? 'refundNumber' : kind === 'returns' ? 'returnNumber' : 'cancellationNumber'} LIKE :search`, { search: `%${query.search}%` });
    const page = query.page ?? 1, limit = query.limit ?? 20;
    const [rows, total] = await qb.orderBy('r.createdAt', 'DESC').addOrderBy('r.id', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { ...result(rows.map(row => kind === 'cancellations' ? this.serializeCancellation(row as unknown as OrderCancellationRequest) : this.publicRecord(row as Refund | ReturnRequest, actor))), pagination: {
        page, limit, total, totalPages: Math.ceil(total / limit)
      } };
  }
  publicRecord(row: Refund | ReturnRequest, actor: Actor) {
    if (actor.type === 'admin' || row instanceof ReturnRequest)
      return { ...row, sellerOrderId: row.orderId };
    return {
      id: row.id, refundNumber: row.refundNumber, paymentId: row.paymentId, orderId: row.orderId, sellerOrderId: row.orderId, sourceType: row.sourceType, cancellationId: row.cancellationId, returnId: row.returnId, disputeId: row.disputeId, refundType: row.refundType, amount: row.amount, currency: row.currency, status: row.status, reason: row.reason, breakdown: row.breakdown, createdAt: row.createdAt, completedAt: row.completedAt
    };
  }
  async detail(kind: 'cancellations' | 'returns' | 'refunds', actor: Actor, id: string) {
    const target = kind === 'cancellations' ? OrderCancellationRequest : kind === 'returns' ? ReturnRequest : Refund;
    const row = await AppDataSource.getRepository<OrderCancellationRequest | ReturnRequest | Refund>(target).findOneBy({ id });
    if (!row)
      throw createError.notFound('Record not found');
    const order = await AppDataSource.manager.findOneByOrFail(Order, { id: row.orderId });
    if (actor.type !== 'admin' && (kind === 'refunds' ? order.buyerId !== actor.id : order.buyerId !== actor.id && order.sellerId !== actor.id))
      throw createError.notFound('Record not found');
    const data: Record<string, unknown> = kind === 'cancellations' ? this.serializeCancellation(row as unknown as OrderCancellationRequest) : this.publicRecord(row as Refund | ReturnRequest, actor);
    if (kind === 'returns') {
      data.items = await AppDataSource.manager.findBy(ReturnItem, { returnId: id });
      data.evidence = (await AppDataSource.manager.findBy(ReturnEvidence, { returnId: id })).map(x => ({
        fileId: x.id, fileName: x.fileName, url: x.fileUrl, mimeType: x.mimeType
      }));
    }
    const history = await AppDataSource.manager.find(AfterSalesEvent, { where: { entityId: id }, order: { createdAt: 'ASC' } });
    data.timeline = actor.type === 'admin' ? history : history.map(e => ({ event: e.eventType, createdAt: e.createdAt }));
    if (actor.type === 'admin' && kind === 'refunds') {
      const refund = row as unknown as Refund;
      data.financialAdjustments = await AppDataSource.manager.findBy(FinancialAdjustment, { refundId: id });
      const payment = await AppDataSource.manager.findOneByOrFail(Payment, { id: refund.paymentId });
      data.originalPayment = {
        id: payment.id, paymentReference: payment.paymentReference, amount: payment.amount, currency: payment.currency, status: payment.status, method: payment.paymentMethod, providerReference: payment.providerReference
      };
      const { User } = await import('../../database/entities/user.entity');
      data.buyer = await AppDataSource.manager.findOne(User, { where: { id: order.buyerId }, select: ['id', 'firstName', 'lastName', 'email'] });
      data.seller = await AppDataSource.manager.findOne(User, { where: { id: order.sellerId }, select: ['id', 'firstName', 'lastName', 'storeName', 'email'] });
      data.sellerOrder = {
        id: order.id, orderReference: order.orderReference, status: order.status, orderTotal: order.orderTotal, orderCurrency: order.orderCurrency, paymentAmount: order.paymentAmount, paymentCurrency: order.paymentCurrency, buyerId: order.buyerId, sellerId: order.sellerId
      };
      if (refund.cancellationId)
        data.cancellation = (await this.detail('cancellations', actor, refund.cancellationId)).data;
      if (refund.returnId)
        data.return = (await this.detail('returns', actor, refund.returnId)).data;
      if (refund.disputeId) {
        const dispute = await AppDataSource.manager.findOneBy(Dispute, { id: refund.disputeId });
        data.dispute = dispute ? {
          id: dispute.id, disputeNumber: dispute.disputeNumber, status: dispute.status, resolutionType: dispute.resolutionType, financialAction: dispute.financialAction
        } : null;
      }
    }
    return result(data);
  }
}
