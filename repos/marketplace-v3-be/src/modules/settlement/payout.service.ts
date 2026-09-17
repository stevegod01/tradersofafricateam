import { randomUUID } from 'crypto';
import { EntityManager, IsNull } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { SellerSettlement as Settlement, SellerPayout as Payout, SellerPayoutAccount as Account, PayoutAttempt as Attempt, SellerSettlementAdjustment as Adjustment, SettlementAdjustmentAllocation as Allocation, SettlementEvent } from '../../database/entities/settlement.entities';
import { Order } from '../../database/entities/order.entity';
import { createError } from '../../common/utils/http-error.util';
import { getSetting } from '../system-settings/settings.reader';
import { SettlementService, settlementEvent, publicPayout } from './settlement.service';
import { publicAccount } from './settlement.accounts';
import { checkedMoney, units, decimal, signedUnits } from './settlement.money';
import { decryptAccount } from './settlement.crypto';
export interface TransferReceipt {
  reference: string;
  providerReference: string;
  recipientId: string;
  amount: string;
  currency: string;
  status: 'successful' | 'failed' | 'processing';
}
export interface PayoutGateway {
  createRecipient(account: Account, number: string): Promise<string>;
  submit(attempt: Attempt): Promise<void>;
  receipt(reference: string): Promise<TransferReceipt>;
  verifyEvent(raw: Buffer, headers: Record<string, unknown>): {
    event?: string;
    data?: Record<string, unknown>;
  };
}
const gateways = new Map<string, PayoutGateway>();
export function registerPayoutGateway(code: string, adapter: PayoutGateway) { gateways.set(code, adapter); }
export class PayoutService {
  private settlements = new SettlementService();
  private gateway(code = 'paystack') {
    const gateway = gateways.get(code);
    if (!gateway) throw createError.conflict('Payout gateway is not enabled');
    return gateway;
  }
  async prepare(m: EntityManager, s: Settlement): Promise<Payout> {
    let p = await m.findOneBy(Payout, { settlementId: s.id });
    if (p)
      return p;
    const account = await m.createQueryBuilder(Account, 'a').addSelect('a.accountNumberEncrypted').where('a.sellerId=:seller AND a.currency=:currency AND a.status=:status AND a.isDefault=true', { seller: s.sellerId, currency: s.settlementCurrency, status: 'verified' }).getOne();
    if (s.status !== 'eligible' || !account)
      throw createError.conflict('Settlement is not eligible');
    p = await m.save(Payout, m.create(Payout, {
      payoutNumber: 'PAYO-' + randomUUID(), sellerId: s.sellerId, settlementId: s.id, payoutAccountId: account.id, accountVersion: account.version, destinationEncrypted: account.accountNumberEncrypted, destination: publicAccount(account), financialSnapshot: {
        ...s.financialSnapshot, baseNet: s.netSettlementAmount, grossProductAmount: s.grossProductAmount, logisticsAmount: s.logisticsAmount, transactionFeePercentage: s.transactionFeePercentage, transactionFeeAmount: s.transactionFeeAmount, refundAmount: s.refundAmount, adjustmentAmount: s.adjustmentAmount, netSettlementAmount: s.netSettlementAmount, currency: s.settlementCurrency, orderId: s.orderId, sellerOrderId: s.sellerOrderId
      }, amount: s.netSettlementAmount, currency: s.settlementCurrency, status: 'pending', method: 'manual', provider: null, providerReference: null, approvedBy: null, approvedAt: null, processingBy: null, processingAt: null, completedAt: null, failedAt: null, failureReason: null, attemptCount: 0
    }));
    s.payoutId = p.id;
    await m.save(s);
    await settlementEvent(m, s, 'PAYOUT_CREATED', null, p.id);
    return p;
  }
  private async locked<T>(id: string, fn: (m: EntityManager, s: Settlement, p: Payout) => Promise<T>) {
    const p = await AppDataSource.manager.findOneBy(Payout, { id });
    if (!p)
      throw createError.notFound('Payout not found');
    return this.settlements.locked(p.settlementId, async (m, s) => fn(m, s, await m.findOneOrFail(Payout, { where: { id }, lock: { mode: 'pessimistic_write' } })));
  }
  async approve(id: string, adminId: string, method: 'manual' | 'paystack' = 'manual') {
    return this.locked(id, async (m, s, p) => {
      if (!await getSetting<boolean>('settlementProcessingEnabled', m))
        throw createError.conflict('Settlement processing is disabled');
      if (s.status !== 'eligible' || !['pending', 'approved'].includes(p.status))
        throw createError.conflict('Payout must be pending and settlement eligible');
      if (method === 'paystack')
        this.gateway();
      const account = await m.createQueryBuilder(Account, 'a').addSelect('a.accountNumberEncrypted').where('a.sellerId=:seller AND a.currency=:currency AND a.status=:status AND a.isDefault=true', { seller: s.sellerId, currency: s.settlementCurrency, status: 'verified' }).getOne();
      if (!account)
        throw createError.conflict('Verified default account required');
      if (method === 'paystack' && (!account.providerRecipientId || account.currency !== 'NGN' || account.country !== 'NG'))
        throw createError.conflict('Link the verified NGN bank account to Paystack first');
      // Release this payout's old reservations, then allocate credits before debits under the seller lock.
      await m.update(Allocation, { payoutId: id, status: 'reserved' }, { status: 'released' });
      const ledger = await m.find(Adjustment, { where: { sellerId: s.sellerId, currency: s.settlementCurrency, settlementId: IsNull() }, order: { createdAt: 'ASC', id: 'ASC' } });
      let amount = signedUnits(String(s.financialSnapshot.rawNet ?? s.netSettlementAmount));
      const allocations: Array<{
        adjustmentId: string;
        direction: string;
        amount: string;
      }> = [];
      for (const direction of ['credit', 'debit'])
        for (const a of ledger.filter(a => a.direction === direction)) {
          const rows = await m.query("SELECT COALESCE(SUM(amount),0) AS used FROM settlement_adjustment_allocations WHERE adjustmentId=? AND status IN ('reserved','applied')", [a.id]);
          const remaining = units(a.amount) - units(String(rows[0].used));
          if (remaining < 0n)
            throw createError.conflict('Adjustment is over allocated');
          const take = direction === 'credit' ? remaining : amount <= 0n ? 0n : (remaining < amount ? remaining : amount);
          if (take === 0n)
            continue;
          const old = await m.findOneBy(Allocation, { adjustmentId: a.id, payoutId: id });
          await m.save(Allocation, m.create(Allocation, { ...old, adjustmentId: a.id, payoutId: id, amount: decimal(take), status: 'reserved' }));
          amount += direction === 'credit' ? take : -take;
          allocations.push({ adjustmentId: a.id, direction, amount: decimal(take) });
        }
      const carriedDebit = amount < 0n ? decimal(-amount) : '0.00';
      if (amount < 0n) amount = 0n;
      const minimums = await getSetting<Record<string, string | number>>('minimumPayoutAmounts', m);
      if (amount > 0n && amount < units(minimums[s.settlementCurrency] ?? 0))
        throw createError.conflict('Payout is below the configured currency minimum');
      const attached = await m.find(Adjustment, { where: { settlementId: s.id } });
      if ([...attached, ...ledger.filter(a => allocations.some(v => v.adjustmentId === a.id))].some(a => a.createdBy === adminId))
        throw createError.conflict('An adjustment creator cannot approve its payout');
      Object.assign(p, {
        amount: checkedMoney(amount), payoutAccountId: account.id, accountVersion: account.version, destinationEncrypted: account.accountNumberEncrypted, destination: { ...publicAccount(account), providerRecipientId: account.providerRecipientId }, method: amount === 0n ? 'offset' : method, provider: method === 'paystack' && amount > 0n ? 'paystack' : null, status: 'approved', approvedBy: adminId, approvedAt: new Date(), financialSnapshot: {
          ...s.financialSnapshot, carriedDebit, grossProductAmount: s.grossProductAmount, logisticsAmount: s.logisticsAmount, transactionFeePercentage: s.transactionFeePercentage, transactionFeeAmount: s.transactionFeeAmount, refundAmount: s.refundAmount, adjustmentAmount: s.adjustmentAmount, baseNet: s.netSettlementAmount, refundLiability: s.financialSnapshot.refundLiability, allocations, ledgerRevision: await m.countBy(Adjustment, { sellerId: s.sellerId, currency: s.settlementCurrency }), netSettlementAmount: checkedMoney(amount), currency: s.settlementCurrency, orderId: s.orderId, sellerOrderId: s.sellerOrderId
        }
      });
      await m.save(p);
      await settlementEvent(m, s, 'PAYOUT_APPROVED', adminId, id);
      return { success: true, data: publicPayout(p) };
    });
  }
  async process(id: string, adminId: string | null) {
    const result = await this.locked(id, async (m, s, p) => {
      if (!await getSetting<boolean>('settlementProcessingEnabled', m))
        throw createError.conflict('Settlement processing is disabled');
      if (p.status !== 'approved' || s.status !== 'eligible')
        throw createError.conflict('A current approval and eligible settlement are required');
      if (adminId === null) {
        const limits = await getSetting<Record<string, string | number>>('maximumAutomaticPayoutAmount', m);
        if (process.env.PAYOUT_AUTOMATIC_PROCESSING_ENABLED !== 'true' || !await getSetting<boolean>('automaticSettlementEnabled', m) || p.provider !== 'paystack' || units(limits[p.currency] ?? 0) < units(p.amount))
          throw createError.conflict('Automatic payout is not authorized by currency policy');
      }
      if (p.approvedBy === adminId)
        throw createError.conflict('Approver cannot process their own payout');
      const revision = await m.countBy(Adjustment, { sellerId: s.sellerId, currency: s.settlementCurrency });
      if (revision !== Number(p.financialSnapshot.ledgerRevision))
        throw createError.conflict('Seller ledger changed; approve the payout again');
      const minimums = await getSetting<Record<string, string | number>>('minimumPayoutAmounts', m);
      if (units(p.amount) > 0n && units(p.amount) < units(minimums[p.currency] ?? 0))
        throw createError.conflict('Payout is below the currency minimum');
      if (p.provider)
        this.gateway(p.provider);
      const a = await m.save(Attempt, m.create(Attempt, {
        payoutId: id, attemptNumber: p.attemptCount + 1, reference: randomUUID(), status: 'processing', amount: p.amount, currency: p.currency, recipientId: p.destination.providerRecipientId ?? null, destination: p.destination, provider: p.provider ?? p.method, providerReference: null, initiatedBy: adminId, completedAt: null, failureReason: null
      }));
      Object.assign(p, { status: 'processing', processingBy: adminId, processingAt: new Date(), attemptCount: a.attemptNumber });
      s.status = 'processing';
      await m.save(p);
      await m.save(s);
      await settlementEvent(m, s, 'PAYOUT_PROCESSING', adminId, id);
      if (p.method === 'offset')
        await this.finish(m, s, p, a, 'successful', 'offset:' + a.reference, adminId, 'Settlement fully consumed by ledger offsets');
      return { p, a };
    });
    // Claim and attempt reference have committed before contacting a financial provider.
    if (result.p.provider) {
      try {
        await this.gateway(result.p.provider).submit(result.a);
        await this.reconcile(id);
      }
      catch {
        throw createError.conflict('Transfer outcome is unconfirmed. Reconcile this payout; do not submit another transfer.', 'PAYOUT_RECONCILIATION_REQUIRED');
      }
    }
    return this.settlements.statement(id);
  }
  private async finish(m: EntityManager, s: Settlement, p: Payout, a: Attempt, status: 'successful' | 'failed', reference: string, adminId: string | null, notes: string) {
    if (a.status === status && a.providerReference === reference)
      return;
    if (p.status !== 'processing' || a.status !== 'processing' || a.attemptNumber !== p.attemptCount)
      throw createError.conflict('Attempt is not the active processing attempt');
    const now = new Date();
    Object.assign(a, { status, providerReference: reference, completedAt: now, failureReason: status === 'failed' ? notes : null });
    await m.save(a);
    Object.assign(p, {
      status, providerReference: reference, completedAt: status === 'successful' ? now : null, failedAt: status === 'failed' ? now : null, failureReason: status === 'failed' ? notes : null
    });
    await m.save(p);
    s.status = status === 'successful' ? 'settled' : 'pending';
    if (status === 'successful')
      s.netSettlementAmount = p.amount;
    await m.save(s);
    await m.update(Allocation, { payoutId: p.id, status: 'reserved' }, { status: status === 'successful' ? 'applied' : 'released' });
    if (status === 'successful' && units(String(p.financialSnapshot.carriedDebit ?? '0.00')) > 0n) {
      await m.save(Adjustment, m.create(Adjustment, {
        sellerId:s.sellerId,settlementId:null,sellerOrderId:s.orderId,adjustmentType:'uncovered_settlement_debit',
        amount:String(p.financialSnapshot.carriedDebit),currency:s.settlementCurrency,direction:'debit',sourceType:'negative_settlement',sourceId:s.id,
        reason:'Uncovered debit carried forward after zero-value settlement',status:'active',idempotencyKey:'negative:'+s.id,createdBy:null
      }));
      await settlementEvent(m,s,'SETTLEMENT_DEBIT_CARRIED_FORWARD',adminId,p.id);
    }
    await settlementEvent(m, s, status === 'successful' ? 'PAYOUT_SUCCESSFUL' : 'PAYOUT_FAILED', adminId, p.id, notes);
    await this.settlements.syncOrder(m, await m.findOneOrFail(Order, { where: { id: s.orderId } }));
  }
  async confirm(id: string, adminId: string, dto: {
    reference: string;
    notes: string;
  }, failed = false) {
    return this.locked(id, async (m, s, p) => {
      if (p.method !== 'manual')
        throw createError.conflict('Only manual transfers can be confirmed by an administrator');
      if (p.approvedBy === adminId)
        throw createError.conflict('Approver cannot confirm their own payout');
      const a = await m.findOneBy(Attempt, { payoutId: id, attemptNumber: p.attemptCount });
      if (!a)
        throw createError.conflict('Process payout before confirming bank outcome');
      await this.finish(m, s, p, a, failed ? 'failed' : 'successful', dto.reference, adminId, dto.notes);
      return { success: true, data: publicPayout(p) };
    });
  }
  async retry(id: string, adminId: string, reason: string) {
    return this.locked(id, async (m, s, p) => {
      if (!await getSetting<boolean>('payoutRetryEnabled', m))
        throw createError.conflict('Payout retries are disabled');
      if (p.status !== 'failed')
        throw createError.conflict('Only definitively failed payouts can be retried; reconcile uncertain transfers');
      p.status = 'pending';
      p.approvedBy = null;
      p.approvedAt = null;
      p.providerReference = null;
      p.processingBy = null;
      p.processingAt = null;
      await m.save(p);
      await settlementEvent(m, s, 'PAYOUT_RETRY_REQUESTED', adminId, id, reason);
      return { success: true, data: publicPayout(p) };
    });
  }
  async destination(id: string, adminId: string, reason: string) {
    return this.locked(id, async (m, s, p) => {
      if (p.method !== 'manual' || p.status !== 'processing' || p.processingBy !== adminId)
        throw createError.conflict('Only the manual payout processor may retrieve its frozen destination');
      const row = await m.createQueryBuilder(Payout, 'p').addSelect('p.destinationEncrypted').where('p.id=:id', { id }).getOneOrFail();
      const accountNumber = decryptAccount(row.destinationEncrypted, p.payoutAccountId, p.sellerId);
      await settlementEvent(m, s, 'PAYOUT_DESTINATION_ACCESSED', adminId, id, reason);
      return { success: true, data: { ...p.destination, accountNumber } };
    });
  }
  async linkAccount(id: string, adminId: string, reason: string) {
    const account = await AppDataSource.manager.createQueryBuilder(Account, 'a').addSelect('a.accountNumberEncrypted').where('a.id=:id', { id }).getOne();
    if (!account)
      throw createError.notFound('Payout account not found');
    if (account.status !== 'verified' || account.currency !== 'NGN' || account.country !== 'NG')
      throw createError.conflict('Verified Nigerian NGN bank account required');
    const recipient = await this.gateway().createRecipient(account, decryptAccount(account.accountNumberEncrypted, id, account.sellerId));
    return AppDataSource.transaction(async (m) => {
      const current = await m.findOneOrFail(Account, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (current.version !== account.version || current.status !== 'verified')
        throw createError.conflict('Account changed during recipient verification');
      current.providerRecipientId = recipient;
      await m.save(current);
      const { writeAudit } = await import('../audit-log/audit-log.writer');
      await writeAudit(m, {
        eventCode: 'PAYOUT_ACCOUNT_PROVIDER_LINKED', module: 'settlements', entityType: 'payout_account', entityId: id, actorType: 'admin', actorId: adminId, reason
      });
      return { success: true, data: publicAccount(current) };
    });
  }
  async reconcile(id: string) {
    const p = await AppDataSource.manager.findOneBy(Payout, { id });
    if (!p)
      throw createError.notFound('Payout not found');
    if (!p.provider)
      throw createError.conflict('Manual payouts require bank confirmation');
    const a = await AppDataSource.manager.findOneBy(Attempt, { payoutId: id, attemptNumber: p.attemptCount });
    if (!a)
      throw createError.conflict('No processing attempt exists');
    const receipt = await this.gateway(p.provider).receipt(a.reference);
    await this.acceptReceipt(a, receipt);
    return new SettlementService().statement(id);
  }
  private async acceptReceipt(attempt: Attempt, r: TransferReceipt) {
    if (r.reference !== attempt.reference || r.currency !== attempt.currency || r.amount !== attempt.amount || r.recipientId !== attempt.recipientId)
      throw createError.conflict('Provider financial details do not match the frozen payout');
    return this.locked(attempt.payoutId, async (m, s, p) => {
      const a = await m.findOneOrFail(Attempt, { where: { id: attempt.id } });
      if (a.status === 'successful' && r.status === 'failed') {
        // A provider reversal is an exception, never an invitation to send another payment.
        if (!await m.existsBy(SettlementEvent, {payoutId:p.id,eventCode:'PAYOUT_PROVIDER_REVERSAL_REVIEW_REQUIRED'}))
          await settlementEvent(m, s, 'PAYOUT_PROVIDER_REVERSAL_REVIEW_REQUIRED', null, p.id);
        return;
      }
      if (r.status === 'processing')
        return;
      await this.finish(m, s, p, a, r.status, r.providerReference, null, 'Financial status verified with payout provider');
    });
  }
  async webhook(raw: Buffer, headers: Record<string, unknown>) {
    const g = this.gateway(), event = g.verifyEvent(raw, headers);
    if (!['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(event.event ?? ''))
      return { success: true };
    const reference = event.data?.reference;
    if (typeof reference !== 'string' || !/^[a-z0-9_-]{16,50}$/.test(reference))
      throw createError.badRequest('Invalid transfer reference');
    const a = await AppDataSource.manager.findOneBy(Attempt, { reference, provider: 'paystack' });
    if (!a)
      return { success: true };
    await this.acceptReceipt(a, await g.receipt(reference));
    return { success: true };
  }
}
