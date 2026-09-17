import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { SellerSettlement as Settlement, SellerPayout as Payout, SellerPayoutAccount as Account, SettlementHold as Hold, SellerSettlementAdjustment as Adjustment, SettlementAdjustmentAllocation as Allocation, PayoutAttempt, SettlementEvent } from '../../database/entities/settlement.entities';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import { User, UserStatus, UserType } from '../../database/entities/user.entity';
import { Refund } from '../../database/entities/refunds.entity';
import { FinancialAdjustment } from '../../database/entities/financial-adjustments.entity';
import { AnalyticsEvent } from '../../database/entities/analytics-event.entity';
import { createError } from '../../common/utils/http-error.util';
import { getSetting } from '../system-settings/settings.reader';
import { writeAudit } from '../audit-log/audit-log.writer';
import { units, decimal, checkedMoney, signedUnits, signedDecimal, refundImpact } from './settlement.money';
import { adjustmentSchema, listSchema } from './settlement.schemas';
export async function settlementEvent(m: EntityManager, s: Settlement, code: string, actorId: string | null = null, payoutId: string | null = null, reason?: string) {
  const payout = payoutId ? await m.findOneBy(Payout, { id: payoutId }) : null;
  const payload = {
    settlementId: s.id, payoutId, sellerId: s.sellerId, orderId: s.orderId, amount: payout?.amount ?? s.netSettlementAmount, currency: s.settlementCurrency, status: payout?.status ?? s.status
  };
  const e = await m.save(SettlementEvent, m.create(SettlementEvent, { sellerId: s.sellerId, settlementId: s.id, payoutId, eventCode: code, actorId, payload, deliveredAt: null }));
  await writeAudit(m, {
    eventId: e.id, eventCode: code, module: 'settlements', entityType: payoutId ? 'payout' : 'settlement', entityId: payoutId ?? s.id, actorType: actorId ? 'admin' : 'system', actorId, metadata: payload, reason
  });
  await m.save(AnalyticsEvent, m.create(AnalyticsEvent, { sourceModule: 'settlements', eventName: code, sourceEventId: e.id, entityType: 'settlement', entityId: s.id, actorId, payload }));
}
export function publicPayout(p: Payout) { const safe = { ...p }; delete (safe as Partial<Payout>).destinationEncrypted; return safe; }
/** All mutations serialize on order, then seller, then settlement. No network IO in these transactions. */
export class SettlementService {
  async syncOrder(m: EntityManager, order: Order): Promise<Settlement | null> {
    order = await m.findOneOrFail(Order, { where: { id: order.id }, lock: { mode: 'pessimistic_write' } });
    const seller = await m.findOneOrFail(User, { where: { id: order.sellerId }, lock: { mode: 'pessimistic_write' } });
    const payment = await m.findOneBy(Payment, { id: order.paymentId });
    let s = await m.findOne(Settlement, { where: { sellerOrderId: order.id }, lock: { mode: 'pessimistic_write' } });
    if (!s) {
      if (payment?.status !== PaymentStatus.CONFIRMED)
        return null;
      const missing = order.transactionFeeAmount == null || order.transactionFeePercentage == null || order.feeBaseAmount == null || order.sellerNetProductAmount == null;
      const gross = units(order.productsSubtotal), logistics = order.deliveryType === 'seller_arranged' ? units(order.logisticsAmount ?? 0) : 0n, fee = units(order.transactionFeeAmount ?? 0);
      const holdDays = await getSetting<number>('settlementHoldDays', m);
      s = await m.save(Settlement, m.create(Settlement, {
        settlementNumber: 'STL-' + randomUUID(), sellerId: order.sellerId, orderId: order.id, sellerOrderId: order.id, paymentId: order.paymentId, status: 'pending', grossProductAmount: decimal(gross), logisticsAmount: decimal(logistics), transactionFeePercentage: String(order.transactionFeePercentage ?? 0), transactionFeeAmount: decimal(fee), refundAmount: '0.00', adjustmentAmount: '0.00', netSettlementAmount: decimal(gross + logistics > fee ? gross + logistics - fee : 0n), settlementCurrency: order.orderCurrency, holdDays, eligibleAt: null, payoutId: null, financialSnapshot: {
          missing, orderCurrency: order.orderCurrency, paymentCurrency: order.paymentCurrency, paymentAmount: order.paymentAmount, orderTotal: order.orderTotal, deliveryType: order.deliveryType, subscriptionId: order.subscriptionId, subscriptionPlanId: order.subscriptionPlanId, feeBaseAmount: order.feeBaseAmount, sellerNetProductAmount: order.sellerNetProductAmount, fxApplied: order.fxApplied, fxRateSnapshot: order.fxRateSnapshot, fxSourceCurrency: order.fxSourceCurrency, fxTargetCurrency: order.fxTargetCurrency, fxSourceAmount: order.fxSourceAmount, fxConvertedAmount: order.fxConvertedAmount, fxProvider: order.fxProvider, fxQuotedAt: order.fxQuotedAt
        }
      }));
      await settlementEvent(m, s, 'SETTLEMENT_CREATED');
    }
    const p = await m.findOneBy(Payout, { settlementId: s.id });
    const refunds = await m.find(Refund, { where: { orderId: order.id, status: 'successful' } });
    const reversals = await m.find(FinancialAdjustment, { where: { orderId: order.id, adjustmentType: 'transaction_fee_reversal' } });
    const reversal = reversals.reduce((v, a) => { if (a.currency !== s!.settlementCurrency)
      throw createError.conflict('Fee reversal currency mismatch'); return v + units(a.amount); }, 0n);
    if (reversal > units(s.transactionFeeAmount))
      throw createError.conflict('Fee reversals exceed original fee');
    const impact = refundImpact({ gross: s.grossProductAmount, logistics: s.logisticsAmount }, refunds, decimal(reversal));
    if (p?.status === 'successful') {
      // Successful statements stay frozen; only the delta beyond their refund snapshot becomes a future debit.
      const captured = signedUnits(String(p.financialSnapshot.refundLiability ?? '0.00'));
      const liabilities = await m.find(Adjustment, { where: { sellerOrderId: order.id, sourceType: 'post_payout_refund' } });
      const recorded = liabilities.reduce((v, a) => v + (a.direction === 'debit' ? units(a.amount) : -units(a.amount)), 0n);
      const delta = impact.liability - captured - recorded;
      if (delta !== 0n) {
        await m.save(Adjustment, m.create(Adjustment, {
          sellerId: s.sellerId, settlementId: null, sellerOrderId: order.id, adjustmentType: 'refund_recovery', amount: decimal(delta < 0n ? -delta : delta), currency: s.settlementCurrency, direction: delta > 0n ? 'debit' : 'credit', sourceType: 'post_payout_refund', sourceId: order.id, reason: 'Refund impact after successful payout', status: 'active', idempotencyKey: `recovery:${s.id}:${impact.liability}`, createdBy: null
        }));
        await settlementEvent(m, s, 'SETTLEMENT_REFUND_RECOVERY_CREATED');
      }
      return s;
    }
    if (p?.status === 'processing')
      return s;
    if (!s.eligibleAt && order.completedAt)
      s.eligibleAt = new Date(order.completedAt.getTime() + s.holdDays * 86400000);
    const adjustments = await m.find(Adjustment, { where: { settlementId: s.id } });
    const manual = adjustments.reduce((v, a) => v + (a.direction === 'credit' ? units(a.amount) : -units(a.amount)), 0n);
    const net = units(s.grossProductAmount) + units(s.logisticsAmount) - units(s.transactionFeeAmount) - impact.liability + manual;
    s.financialSnapshot = { ...s.financialSnapshot, refundLiability: signedDecimal(impact.liability), rawNet: signedDecimal(net) };
    s.refundAmount = decimal(impact.refund);
    s.adjustmentAmount = signedDecimal(manual + reversal);
    s.netSettlementAmount = checkedMoney(net > 0n ? net : 0n);
    const account = await m.findOneBy(Account, { sellerId: s.sellerId, currency: s.settlementCurrency, isDefault: true, status: 'verified' });
    const blocks: Record<string, string> = {};
    if (payment?.status !== PaymentStatus.CONFIRMED)
      blocks.payment = 'Buyer payment is not confirmed';
    if (payment && (s.financialSnapshot.paymentCurrency !== payment.currency || units(String(s.financialSnapshot.paymentAmount)) <= 0n || units(String(s.financialSnapshot.paymentAmount)) > units(payment.amount)))
      blocks.payment = 'Historical seller payment allocation is inconsistent';
    if (s.financialSnapshot.missing)
      blocks.snapshot = 'Historical fee snapshot is incomplete';
    if (units(s.transactionFeeAmount) > units(s.grossProductAmount) || (!s.financialSnapshot.missing && (units(String(s.financialSnapshot.feeBaseAmount)) !== units(s.grossProductAmount) || units(String(s.financialSnapshot.sellerNetProductAmount)) !== units(s.grossProductAmount) - units(s.transactionFeeAmount))))
      blocks.snapshot = 'Historical fee totals are inconsistent';
    if (s.financialSnapshot.orderCurrency !== s.financialSnapshot.paymentCurrency && (!s.financialSnapshot.fxApplied || !s.financialSnapshot.fxRateSnapshot || !s.financialSnapshot.fxSourceAmount || !s.financialSnapshot.fxConvertedAmount || units(String(s.financialSnapshot.fxRateSnapshot), 8) <= 0n || units(String(s.financialSnapshot.fxSourceAmount)) <= 0n || units(String(s.financialSnapshot.fxConvertedAmount)) <= 0n))
      blocks.snapshot = 'Historical currency conversion snapshot is incomplete';
    if (seller.userType !== UserType.SELLER || seller.status !== UserStatus.ACTIVE || !seller.isCompanyVerified)
      blocks.seller = 'Seller must be active and company verified';
    if (!account)
      blocks.payout_account = 'A verified default account in the settlement currency is required';
    const disputes = await m.query("SELECT id FROM disputes WHERE orderId=? AND status IN ('open','under_review','awaiting_buyer','awaiting_seller') LIMIT 1", [order.id]);
    if (disputes.length)
      blocks.dispute = 'An active dispute blocks settlement';
    const returns = await m.query("SELECT id FROM returns WHERE orderId=? AND (status IN ('requested','approved','awaiting_return','in_transit','received') OR (status='completed' AND refundRequired=true AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.returnId=returns.id AND r.status='successful'))) LIMIT 1", [order.id]);
    if (returns.length)
      blocks.return = 'An active return blocks settlement';
    const pendingRefunds = await m.query("SELECT id FROM refunds WHERE orderId=? AND status IN ('pending','approved','processing','failed') LIMIT 1", [order.id]);
    if (pendingRefunds.length)
      blocks.refund = 'An unresolved refund blocks settlement';
    const holds = await m.find(Hold, { where: { settlementId: s.id } });
    for (const h of holds.filter(h => h.sourceType === 'system')) {
      if (!blocks[h.holdCode] && h.status === 'active') {
        h.status = 'released';
        h.releasedAt = new Date();
        await m.save(h);
      }
    }
    for (const [code, reason] of Object.entries(blocks)) {
      const old = holds.find(h => h.holdCode === code);
      if (old?.status === 'active')
        continue;
      await m.save(Hold, m.create(Hold, {
        ...old, settlementId: s.id, holdCode: code, reason, sourceType: 'system', sourceId: order.id, status: 'active', heldBy: null, heldAt: new Date(), releasedBy: null, releasedAt: null
      }));
    }
    const active = Object.keys(blocks).length > 0 || holds.some(h => h.sourceType !== 'system' && h.status === 'active');
    const oldStatus = s.status;
    s.status = order.status === OrderStatus.CANCELLED ? 'cancelled' : active ? 'on_hold' : order.status === OrderStatus.COMPLETED && s.eligibleAt && s.eligibleAt <= new Date() ? 'eligible' : 'pending';
    await m.save(s);
    if (oldStatus !== s.status)
      await settlementEvent(m, s, s.status === 'on_hold' ? 'SETTLEMENT_ON_HOLD' : 'SETTLEMENT_STATUS_CHANGED');
    // Any eligibility/amount/destination change invalidates an unprocessed approval.
    if (p && (s.status !== 'eligible' || p.financialSnapshot.baseNet !== s.netSettlementAmount || p.financialSnapshot.refundAmount !== s.refundAmount || p.financialSnapshot.adjustmentAmount !== s.adjustmentAmount || p.payoutAccountId !== account?.id || p.accountVersion !== account?.version)) {
      if (p.status === 'approved') {
        p.status = 'pending';
        p.approvedBy = null;
        p.approvedAt = null;
        await m.save(p);
        await m.update(Allocation, { payoutId: p.id, status: 'reserved' }, { status: 'released' });
        await settlementEvent(m, s, 'PAYOUT_APPROVAL_INVALIDATED', null, p.id);
      }
    }
    if (s.status === 'cancelled' && p && ['pending', 'approved'].includes(p.status)) {
      p.status = 'cancelled';
      p.approvedAt = null;
      p.approvedBy = null;
      await m.save(p);
      await m.update(Allocation, { payoutId: p.id, status: 'reserved' }, { status: 'released' });
      await settlementEvent(m, s, 'PAYOUT_CANCELLED', null, p.id);
    }
    if (s.status === 'eligible' && !p) {
      const { PayoutService } = await import('./payout.service');
      await new PayoutService().prepare(m, s);
    }
    return s;
  }
  async refreshOrder(orderId: string) { return AppDataSource.transaction('READ COMMITTED', async (m) => this.syncOrder(m, await m.findOneOrFail(Order, { where: { id: orderId } }))); }
  async locked<T>(id: string, fn: (m: EntityManager, s: Settlement) => Promise<T>): Promise<T> {
    return AppDataSource.transaction('READ COMMITTED', async (m) => {
      const initial = await m.findOneBy(Settlement, { id });
      if (!initial)
        throw createError.notFound('Settlement not found');
      const s = await this.syncOrder(m, await m.findOneOrFail(Order, { where: { id: initial.orderId } }));
      if (!s)
        throw createError.conflict('Settlement unavailable');
      return fn(m, s);
    });
  }
  async hold(id: string, adminId: string, reason: string, release = false) {
    return this.locked(id, async (m, s) => {
      if (['settled', 'processing', 'cancelled'].includes(s.status))
        throw createError.conflict('Settlement can no longer be held or released');
      const code = 'manual:' + adminId;
      const h = await m.findOneBy(Hold, { settlementId: id, holdCode: code });
      if (release) {
        if (!h || h.status !== 'active')
          throw createError.conflict('No active hold created by this administrator');
        h.status = 'released';
        h.releasedBy = adminId;
        h.releasedAt = new Date();
        await m.save(h);
      }
      else
        await m.save(Hold, m.create(Hold, {
          ...h, settlementId: id, holdCode: code, reason, sourceType: 'manual', sourceId: null, status: 'active', heldBy: adminId, heldAt: new Date(), releasedBy: null, releasedAt: null
        }));
      await settlementEvent(m, s, release ? 'SETTLEMENT_HOLD_RELEASED' : 'SETTLEMENT_HELD', adminId, null, reason);
      return { success: true, data: await this.syncOrder(m, await m.findOneOrFail(Order, { where: { id: s.orderId } })) };
    });
  }
  async adjust(id: string, adminId: string, dto: z.infer<typeof adjustmentSchema>) {
    return this.locked(id, async (m, s) => {
      if (s.status === 'processing' || s.status === 'cancelled')
        throw createError.conflict('Settlement cannot be adjusted in its current state');
      if (dto.currency !== s.settlementCurrency)
        throw createError.badRequest('Adjustment currency must match settlement currency');
      const key = 'manual:' + dto.idempotencyKey, existing = await m.findOneBy(Adjustment, { idempotencyKey: key });
      if (existing) {
        if (existing.sellerOrderId !== s.orderId || existing.amount !== dto.amount || existing.adjustmentType !== dto.adjustmentType || existing.reason !== dto.reason)
          throw createError.conflict('Idempotency key already used with different details');
        return { success: true, data: existing };
      }
      const a = await m.save(Adjustment, m.create(Adjustment, {
        sellerId: s.sellerId, settlementId: s.status === 'settled' ? null : s.id, sellerOrderId: s.orderId, adjustmentType: dto.adjustmentType, amount: dto.amount, currency: dto.currency, direction: dto.adjustmentType === 'manual_credit' ? 'credit' : 'debit', sourceType: 'manual', sourceId: null, reason: dto.reason, status: 'active', idempotencyKey: key, createdBy: adminId
      }));
      await settlementEvent(m, s, 'SETTLEMENT_ADJUSTED', adminId, null, dto.reason);
      await this.syncOrder(m, await m.findOneOrFail(Order, { where: { id: s.orderId } }));
      return { success: true, data: a };
    });
  }
  async list(kind: 'settlement' | 'payout', query: z.infer<typeof listSchema>, sellerId?: string) {
    const q = AppDataSource.manager.createQueryBuilder(kind === 'settlement' ? Settlement : Payout, 's');
    const currency = kind === 'settlement' ? 'settlementCurrency' : 'currency';
    if (sellerId ?? query.sellerId)
      q.andWhere('s.sellerId=:sellerId', { sellerId: sellerId ?? query.sellerId });
    if (query.status)
      q.andWhere('s.status=:status', { status: query.status });
    if (query.currency)
      q.andWhere(`s.${currency}=:currency`, { currency: query.currency });
    if (query.dateFrom)
      q.andWhere('s.createdAt>=:from', { from: query.dateFrom });
    if (query.dateTo)
      q.andWhere('s.createdAt<=:to', { to: query.dateTo });
    if (kind === 'settlement') {
      if (query.orderId ?? query.sellerOrderId)
        q.andWhere('s.orderId=:order', { order: query.orderId ?? query.sellerOrderId });
      if (query.eligibleFrom)
        q.andWhere('s.eligibleAt>=:ef', { ef: query.eligibleFrom });
      if (query.eligibleTo)
        q.andWhere('s.eligibleAt<=:et', { et: query.eligibleTo });
    }
    else if (query.orderId || query.sellerOrderId || query.eligibleFrom || query.eligibleTo) {
      q.innerJoin(Settlement, 'st', 'st.id=s.settlementId');
      if (query.orderId ?? query.sellerOrderId)
        q.andWhere('st.orderId=:order', { order: query.orderId ?? query.sellerOrderId });
      if (query.eligibleFrom)
        q.andWhere('st.eligibleAt>=:ef', { ef: query.eligibleFrom });
      if (query.eligibleTo)
        q.andWhere('st.eligibleAt<=:et', { et: query.eligibleTo });
    }
    if (query.search)
      q.andWhere(`s.${kind === 'settlement' ? 'settlementNumber' : 'payoutNumber'} LIKE :search`, { search: `%${query.search.replace(/[\\%_]/g, '\\$&')}%` });
    const [data, total] = await q.orderBy('s.createdAt', 'DESC').addOrderBy('s.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return { success: true, data, pagination: { page: query.page, limit: query.limit, total } };
  }
  async detail(id: string, sellerId?: string) {
    const s = await AppDataSource.manager.findOneBy(Settlement, { id, ...(sellerId ? { sellerId } : {}) });
    if (!s)
      throw createError.notFound('Settlement not found');
    const [holds, adjustments, payout] = await Promise.all([
      AppDataSource.manager.find(Hold, { where: { settlementId: id } }), AppDataSource.manager.find(Adjustment, { where: { sellerOrderId: s.orderId } }), AppDataSource.manager.findOneBy(Payout, { settlementId: id })
    ]);
    return { success: true, data: { ...s, holds, adjustments, payout: payout ? publicPayout(payout) : null } };
  }
  async statement(id: string, sellerId?: string) { const p = await AppDataSource.manager.findOneBy(Payout, { id, ...(sellerId ? { sellerId } : {}) }); if (!p)
    throw createError.notFound('Payout not found'); return {
    success: true, data: {
      ...publicPayout(p), attempts: await AppDataSource.manager.find(PayoutAttempt, { where: { payoutId: id }, order: { attemptNumber: 'ASC' } })
    }
  }; }
  async summary(sellerId?: string) { const q = AppDataSource.manager.createQueryBuilder(Settlement, 's').select('s.settlementCurrency', 'currency').addSelect('s.status', 'status').addSelect('COUNT(*)', 'count').addSelect('SUM(s.netSettlementAmount)', 'amount').groupBy('s.settlementCurrency').addGroupBy('s.status'); if (sellerId)
    q.where('s.sellerId=:sellerId', { sellerId }); return { success: true, data: await q.getRawMany() }; }
}
