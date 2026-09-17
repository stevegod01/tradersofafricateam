import { auditPaymentWebhook } from '../audit-log/audit-log.webhooks';
import { EntityManager, In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { Order } from '../../database/entities/order.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import { Refund } from '../../database/entities/refunds.entity';
import { FinancialAdjustment } from '../../database/entities/financial-adjustments.entity';
import { OrderCancellationRequest, OrderCancellationStatus } from '../../database/entities/order-cancellation-request.entity';
import { ReturnRequest } from '../../database/entities/returns.entity';
import { AfterSalesService, Actor, assertRefundProcessorSeparated } from '../after-sales/after-sales.service';
import { recordAfterSalesEvent } from '../after-sales/after-sales.events';
import { decimal, units, proportional, reservedRefundStatuses } from '../after-sales/after-sales.policy';
import { createError, HttpError } from '../../common/utils/http-error.util';
export type RefundReceipt = {
  refundId: string;
  reference: string;
  amount: string;
  currency: string;
  status: 'successful' | 'failed';
  paymentReference?: string;
  failureReason?: string;
};
export interface RefundGatewayAdapter {
  /** False for providers without safe POST idempotency; their failures require reconciliation. */
  readonly supportsRetry?: boolean;
  fetchReceipt?(reference: string): Promise<RefundReceipt | null>;
  /** Stable refund UUID is the correlation key. A durable processing claim permits one submission. */
  submit(input: {
    idempotencyKey: string;
    paymentReference: string;
    amount: string;
    currency: string;
  }): Promise<{
    reference: string;
  }>;
  /** Must authenticate the exact raw bytes and verify the provider's financial confirmation. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, unknown>): Promise<RefundReceipt | null>;
}
const adapters = new Map<string, RefundGatewayAdapter>();
export function registerRefundGateway(code: string, adapter: RefundGatewayAdapter): void { adapters.set(code, adapter); }
/** The Payment module is the only writer of financial processing outcomes. */
export class PaymentRefundService {
  private workflows = new AfterSalesService();
  async process(actor: Actor, id: string, retry = false) {
    let submit: {
      adapter: RefundGatewayAdapter;
      reference: string;
      amount: string;
      currency: string;
    } | undefined;
    const result = await this.workflows.mutateRefund(actor, id, async (manager, order, refund) => {
      if (refund.status === 'processing' || refund.status === 'successful')
        return;
      if (refund.status !== (retry ? 'failed' : 'approved'))
        throw createError.conflict(retry ? 'Only failed refunds can be retried' : 'Refund approval is required before processing');
      assertRefundProcessorSeparated(refund, actor.id);
      const payment = await manager.findOneByOrFail(Payment, { id: refund.paymentId });
      if (payment.status !== PaymentStatus.CONFIRMED)
        throw createError.conflict('Original payment is not confirmed');
      const reserved = await manager.findBy(Refund, { paymentId: payment.id, status: In(reservedRefundStatuses) });
      if (reserved.reduce((n, r) => n + units(r.amount), 0n) > units(payment.amount))
        throw createError.conflict('Payment refund limit exceeded');
      const orderReserved = reserved.filter(r => r.orderId === order.id).reduce((n, r) => n + units(r.amount), 0n);
      if (orderReserved > units(order.paymentAmount))
        throw createError.conflict('Seller allocation refund limit exceeded');
      const adapter = adapters.get(refund.gateway);
      if (retry && adapter?.supportsRetry === false)
        throw createError.conflict('This provider does not support safe automatic retries. Reconcile the existing provider refund before any further financial action.', 'REFUND_RECONCILIATION_REQUIRED');
      if (adapter && !payment.providerReference)
        throw createError.conflict('Original provider payment reference is missing');
      if (retry && refund.processingMode === 'gateway' && !adapter)
        throw createError.conflict('Original gateway adapter is required to retry safely');
      refund.status = 'processing';
      refund.processingMode = adapter ? 'gateway' : 'manual';
      refund.processedAt = new Date();
      refund.attemptCount += 1;
      await manager.save(refund);
      await recordAfterSalesEvent(manager, order, id, retry ? 'REFUND_RETRIED' : 'REFUND_PROCESSING_STARTED', actor.id, actor.type, { attempt: refund.attemptCount });
      await recordAfterSalesEvent(manager, order, id, 'REFUND_PROCESSING', actor.id, actor.type, {
        mode: refund.processingMode, amount: refund.amount, currency: refund.currency
      });
      if (adapter)
        submit = {
          adapter, reference: payment.providerReference!, amount: refund.amount, currency: refund.currency
        };
    });
    // Commit the processing claim BEFORE external I/O. A timeout is ambiguous, never a safe failure/retry.
    if (submit) {
      try {
        const receipt = await submit.adapter.submit({
          idempotencyKey: id, paymentReference: submit.reference, amount: submit.amount, currency: submit.currency
        });
        if (!receipt.reference || receipt.reference.length > 160)
          throw new Error('Invalid refund provider reference');
        await this.workflows.mutateRefund(actor, id, async (manager, _order, refund) => {
          if (refund.gatewayRefundReference && refund.gatewayRefundReference !== receipt.reference)
            throw createError.conflict('Provider refund reference mismatch');
          refund.gatewayRefundReference = receipt.reference;
          await manager.save(refund);
        });
      }
      catch {
        // Retain processing and the stable idempotency key for provider reconciliation.
        throw createError.conflict('Provider outcome is unconfirmed. Reconcile using the refund ID; do not submit another refund.', 'REFUND_RECONCILIATION_REQUIRED');
      }
    }
    return { ...result, message: 'Refund processing recorded. Success requires financial confirmation.' };
  }
  async confirmManual(actor: Actor, id: string, dto: {
    reference: string;
    notes: string;
  }) {
    return this.workflows.mutateRefund(actor, id, async (manager, order, refund) => {
      if (refund.processingMode !== 'manual')
        throw createError.conflict('Gateway refunds require verified provider confirmation');
      if (refund.status === 'successful' && refund.gatewayRefundReference === dto.reference)
        return;
      if (refund.status !== 'processing')
        throw createError.conflict('Refund must be processing before financial confirmation');
      assertRefundProcessorSeparated(refund, actor.id);
      await this.complete(manager, order, refund, actor, dto.reference, dto.notes);
    });
  }
  async failManual(actor: Actor, id: string, dto: {
    reference: string;
    notes: string;
  }) {
    return this.workflows.mutateRefund(actor, id, async (manager, order, refund) => {
      if (refund.processingMode !== 'manual' || refund.status !== 'processing')
        throw createError.conflict('Only processing manual refunds can be marked failed');
      assertRefundProcessorSeparated(refund, actor.id);
      refund.status = 'failed';
      refund.failedAt = new Date();
      refund.failureReason = dto.notes;
      await manager.save(refund);
      await recordAfterSalesEvent(manager, order, id, 'REFUND_FAILED', actor.id, actor.type, {
        reference: dto.reference, notes: dto.notes, amount: refund.amount, currency: refund.currency
      });
    });
  }
  async webhook(gateway: string, rawBody: Buffer, headers: Record<string, unknown>) {
    const adapter = adapters.get(gateway);
    if (!adapter)
      throw createError.notFound('Refund gateway is not configured');
    let receipt: RefundReceipt | null;
    try {
      receipt = await adapter.verifyWebhook(rawBody, headers);
      await auditPaymentWebhook(gateway);
    }
    catch (err) {
      if(err instanceof HttpError && (err.statusCode===401 || err.statusCode===403)) await auditPaymentWebhook(gateway,true);
      if (err instanceof HttpError)
        throw err;
      throw createError.internal('Provider verification is unavailable; callback should be retried', 'REFUND_VERIFICATION_UNAVAILABLE');
    }
    if (!receipt)
      return { success: true, message: 'Verified non-final provider event acknowledged.' };
    return this.applyReceipt(gateway, receipt);
  }
  async reconcile(actor: Actor, id: string, suppliedReference?: string) {
    if (actor.type !== 'admin')
      throw createError.forbidden('Admin financial authorization required');
    const refund = await AppDataSource.manager.findOneBy(Refund, { id });
    if (!refund || refund.processingMode !== 'gateway')
      throw createError.conflict('A gateway refund is required');
    const reference = refund.gatewayRefundReference ?? suppliedReference;
    if (!reference)
      throw createError.conflict('Supply the provider refund reference from reconciliation records');
    const adapter = adapters.get(refund.gateway);
    if (!adapter?.fetchReceipt)
      throw createError.conflict('Provider reconciliation is unavailable');
    const receipt = await adapter.fetchReceipt(reference);
    if (!receipt)
      return { success: true, message: 'Provider has not confirmed a final refund outcome.' };
    if (receipt.refundId !== id)
      throw createError.conflict('Provider refund identity mismatch');
    return this.applyReceipt(refund.gateway, receipt, actor);
  }
  private async applyReceipt(gateway: string, receipt: RefundReceipt, initiatedBy?: Actor) {
    if (!receipt.reference || receipt.reference.length > 160 || !['successful', 'failed'].includes(receipt.status))
      throw createError.badRequest('Invalid provider refund confirmation');
    // Internal system actor; no client-supplied admin identity is accepted.
    const actor: Actor = initiatedBy ?? { id: '00000000-0000-4000-8000-000000000020', type: 'admin' };
    return this.workflows.mutateRefund(actor, receipt.refundId, async (manager, order, refund) => {
      if (receipt.paymentReference) {
        const payment = await manager.findOneByOrFail(Payment, { id: refund.paymentId });
        if (payment.providerReference !== receipt.paymentReference)
          throw createError.conflict('Provider receipt refers to another original payment');
      }
      if (refund.gateway !== gateway || refund.processingMode !== 'gateway' || units(receipt.amount) !== units(refund.amount) || receipt.currency !== refund.currency)
        throw createError.conflict('Provider receipt does not match this refund');
      if (refund.gatewayRefundReference && refund.gatewayRefundReference !== receipt.reference)
        throw createError.conflict('Provider reference mismatch');
      if (refund.status === 'successful')
        return; // Never regress confirmed money movement.
      if (!['processing', 'failed'].includes(refund.status))
        throw createError.conflict('Refund has not entered provider processing');
      if (receipt.status === 'successful')
        await this.complete(manager, order, refund, actor, receipt.reference, 'Verified provider confirmation', initiatedBy ? 'admin' : 'system');
      else {
        if (refund.status === 'failed')
          return;
        refund.status = 'failed';
        refund.gatewayRefundReference = receipt.reference;
        refund.failedAt = new Date();
        refund.failureReason = receipt.failureReason ?? 'Provider confirmed refund failure';
        await manager.save(refund);
        await recordAfterSalesEvent(manager, order, refund.id, 'REFUND_FAILED', actor.id, initiatedBy ? 'admin' : 'system', { amount: refund.amount, currency: refund.currency });
      }
    });
  }
  private async complete(manager: EntityManager, order: Order, refund: Refund, actor: Actor, reference: string, notes: string, actorType = actor.type as string) {
    refund.status = 'successful';
    refund.gatewayRefundReference = reference;
    refund.completedAt = new Date();
    await manager.save(refund);
    await manager.save(FinancialAdjustment, manager.create(FinancialAdjustment, {
      orderId: order.id, paymentId: refund.paymentId, refundId: refund.id, adjustmentType: 'refund', amount: refund.amount, currency: refund.currency, direction: 'debit', reason: refund.reason
    }));
    const s = refund.financialSnapshot;
    if (s.reverseTransactionFee && units(s.transactionFeeAmount) > 0n && units(s.productPaymentAllocation) > 0n) {
      // Reverse the cumulative proportional fee, subtracting prior reversals to avoid rounding drift.
      const successful = await manager.findBy(Refund, { orderId: order.id, status: 'successful' });
      const reversed = await manager.findBy(FinancialAdjustment, { orderId: order.id, adjustmentType: 'transaction_fee_reversal' });
      const eligibleProduct = successful.filter(r => r.financialSnapshot.reverseTransactionFee).reduce((sum, r) => sum + units(r.breakdown.productAmount), 0n);
      const target = proportional(units(s.transactionFeeAmount), eligibleProduct, units(s.productPaymentAllocation));
      const previous = reversed.reduce((sum, a) => sum + units(a.amount), 0n);
      if (target > previous) {
        const amount = decimal(target - previous);
        await manager.save(FinancialAdjustment, manager.create(FinancialAdjustment, {
          orderId: order.id, paymentId: refund.paymentId, refundId: refund.id, adjustmentType: 'transaction_fee_reversal', amount, currency: s.orderCurrency, direction: 'debit', reason: 'Proportional reversal using original transaction fee and payment allocation snapshots'
        }));
        await recordAfterSalesEvent(manager, order, refund.id, 'TRANSACTION_FEE_REVERSED', actor.id, actorType, { amount, currency: s.orderCurrency });
      }
    }
    await recordAfterSalesEvent(manager, order, refund.id, 'FINANCIAL_ADJUSTMENT_CREATED', actor.id, actorType, { amount: refund.amount, currency: refund.currency });
    await recordAfterSalesEvent(manager, order, refund.id, 'REFUND_SUCCESSFUL', actor.id, actorType, {
      amount: refund.amount, currency: refund.currency, breakdown: refund.breakdown, reference, notes
    });
    if (refund.cancellationId) {
      await manager.update(OrderCancellationRequest, refund.cancellationId, { status: OrderCancellationStatus.COMPLETED });
      await recordAfterSalesEvent(manager, order, refund.cancellationId, 'CANCELLATION_COMPLETED', actor.id, actorType);
    }
    if (refund.returnId) {
      await manager.update(ReturnRequest, refund.returnId, { status: 'completed' });
      await recordAfterSalesEvent(manager, order, refund.returnId, 'RETURN_COMPLETED', actor.id, actorType);
    }
  }
}
