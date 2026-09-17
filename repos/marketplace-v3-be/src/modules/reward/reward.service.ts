import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { User, UserStatus } from '../../database/entities/user.entity';
import { Referral } from '../../database/entities/referral.entity';
import { RewardRule } from '../../database/entities/reward-rule.entity';
import { RewardSetting } from '../../database/entities/reward-setting.entity';
import { PointsTransaction, PointsSourceType, PointsTransactionType } from '../../database/entities/points-transaction.entity';
import { AnalyticsEvent } from '../../database/entities/analytics-event.entity';
import { Order } from '../../database/entities/order.entity';
import { createError } from '../../common/utils/http-error.util';
import { writeAudit } from '../audit-log/audit-log.writer';
import { checkedBalance, normalizeReferralCode, periodStart } from './reward.policy';
export type ReferralPolicy = {
    referralQualificationEvent: 'email_verified' | 'company_verified' | 'first_successful_trade';
    tradeRewardBeneficiary: 'buyer' | 'seller' | 'both';
    reverseTradeRewardsOnRefund: boolean;
};
export const defaultReferralPolicy: ReferralPolicy = {
    referralQualificationEvent: 'company_verified', tradeRewardBeneficiary: 'buyer', reverseTradeRewardsOnRefund: false
};
export function isUnsafeEmailReferralPolicy(policy: ReferralPolicy, rule: Pick<RewardRule, 'eventCode' | 'status' | 'points' | 'maxPerUser'> | null): boolean {
    return policy.referralQualificationEvent === 'email_verified'
        && rule?.eventCode === 'REFERRAL_QUALIFIED'
        && rule.status === 'active'
        && rule.points > 0
        && rule.maxPerUser === null;
}
export class RewardService {
    async policy(manager = AppDataSource.manager): Promise<typeof defaultReferralPolicy> {
        const row = await manager.findOneBy(RewardSetting, { settingKey: 'referral_reward_policy' });
        return {
            ...defaultReferralPolicy, ...(row ? row.settingValue as Partial<typeof defaultReferralPolicy> : {})
        };
    }
    async lockReferralSafetyState(manager: EntityManager) {
        const setting = await manager.findOne(RewardSetting, { where: { settingKey: 'referral_reward_policy' }, lock: { mode: 'pessimistic_write' } });
        const policy: ReferralPolicy = { ...defaultReferralPolicy, ...(setting ? setting.settingValue as Partial<ReferralPolicy> : {}) };
        const rule = await manager.findOne(RewardRule, { where: { eventCode: 'REFERRAL_QUALIFIED' }, lock: { mode: 'pessimistic_write' } });
        return { setting, policy, rule };
    }
    assertReferralPolicySafe(policy: ReferralPolicy, rule: Pick<RewardRule, 'eventCode' | 'status' | 'points' | 'maxPerUser'> | null): void {
        if (isUnsafeEmailReferralPolicy(policy, rule))
            throw createError.conflict('Email-verified referral rewards require a lifetime maxPerUser cap');
    }
    async audit(manager: EntityManager, code: string, id: string, metadata: Record<string, unknown>, adminId?: string) {
        await writeAudit(manager, {
            eventCode: code, module: 'rewards', entityType: code.startsWith('REFERRAL_') ? 'referral' : 'reward', entityId: id, actorType: adminId ? 'admin' : 'system', actorId: adminId, reason: typeof metadata.reason === 'string' ? metadata.reason : undefined, metadata
        });
        await manager.save(AnalyticsEvent, manager.create(AnalyticsEvent, {
            sourceModule: 'rewards', eventName: code, sourceEventId: randomUUID(), entityType: code.startsWith('REFERRAL_') ? 'referral' : 'reward', entityId: id, actorId: adminId ?? null, payload: metadata
        }));
    }
    async attribute(manager: EntityManager, user: User) {
        if (!user.referral)
            return;
        const referrer = await manager.getRepository(User).createQueryBuilder('u').where('UPPER(u.referralCode) = :code', { code: normalizeReferralCode(user.referral) }).getOne();
        if (!referrer || referrer.id === user.id || referrer.email.toLowerCase() === user.email.toLowerCase() || [UserStatus.DISABLED, UserStatus.DELETED].includes(referrer.status))
            throw createError.badRequest('Invalid referral code');
        const existing = await manager.findOneBy(Referral, { referredUserId: user.id });
        if (existing)
            return;
        const referral = await manager.save(Referral, manager.create(Referral, {
            referrerId: referrer.id, referredUserId: user.id, referralCode: referrer.referralCode!, status: 'pending'
        }));
        await this.audit(manager, 'REFERRAL_CREATED', referral.id, { referrerId: referrer.id, referredUserId: user.id });
    }
    async qualify(manager: EntityManager, userId: string, event: string) {
        const policy = await this.policy(manager);
        if (policy.referralQualificationEvent !== event)
            return;
        const candidate = await manager.findOneBy(Referral, { referredUserId: userId });
        if (!candidate || candidate.status === 'invalid' || candidate.status === 'rewarded')
            return;
        // Lock the beneficiary before changing the FK-bearing referral row. Otherwise
        // simultaneous qualifications can both hold shared FK locks and deadlock on upgrade.
        await manager.findOne(User, { where: { id: candidate.referrerId }, lock: { mode: 'pessimistic_write' } });
        const referral = await manager.findOne(Referral, { where: { referredUserId: userId }, lock: { mode: 'pessimistic_write' } });
        if (referral && referral.referrerId !== candidate.referrerId)
            throw createError.conflict('Referral attribution changed; retry qualification');
        if (!referral || referral.status === 'invalid' || referral.status === 'rewarded')
            return;
        const users = await manager.findByIds(User, [referral.referrerId, userId]);
        const referred = users.find(u => u.id === userId), referrer = users.find(u => u.id === referral.referrerId);
        if (!referred || !referrer || users.some(u => [UserStatus.DISABLED, UserStatus.DELETED].includes(u.status)))
            return;
        if (referral.referrerId === userId || (referred.registrationNumber && referrer.registrationNumber && referred.registrationNumber.trim().toLowerCase() === referrer.registrationNumber.trim().toLowerCase())) {
            referral.status = 'invalid';
            await manager.save(referral);
            await this.audit(manager, 'REFERRAL_INVALIDATED', referral.id, { reason: 'Duplicate business or self-referral' });
            return;
        }
        if (referral.status === 'pending') {
            referral.status = 'qualified';
            referral.qualifiedAt = new Date();
            await manager.save(referral);
            await this.audit(manager, 'REFERRAL_QUALIFIED', referral.id, { event });
        }
        const transaction = await this.award(manager, referral.referrerId, 'REFERRAL_QUALIFIED', PointsSourceType.REFERRAL, referral.id);
        if (transaction) {
            referral.status = 'rewarded';
            referral.rewardedAt = new Date();
            await manager.save(referral);
            await this.audit(manager, 'REFERRAL_REWARDED', referral.id, { transactionId: transaction.id });
        }
    }
    async award(manager: EntityManager, userId: string, eventCode: string, sourceType: PointsSourceType, sourceId: string, ceiling?: number, bonus = 0, orderId?: string): Promise<PointsTransaction | null> {
        // Serialize all rewards for this owner before reading caps or idempotency state.
        const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
        if (!user || [UserStatus.DISABLED, UserStatus.DELETED].includes(user.status))
            return null;
        const key = `${eventCode}:${sourceId}:${userId}`;
        const previous = await manager.findOne(PointsTransaction, { where: { idempotencyKey: key }, lock: { mode: 'pessimistic_write' } });
        if (previous)
            return previous;
        let rule: RewardRule | null;
        if (eventCode === 'REFERRAL_QUALIFIED') {
            const safety = await this.lockReferralSafetyState(manager);
            rule = safety.rule?.status === 'active' ? safety.rule : null;
            // Do not throw from an email-verification transaction. Leave the referral
            // qualified so an administrator can configure a cap and retry it safely.
            if (isUnsafeEmailReferralPolicy(safety.policy, rule))
                return null;
        }
        else
            rule = await manager.findOneBy(RewardRule, { eventCode, status: 'active' });
        if (!rule || rule.points <= 0)
            return null;
        const count = manager.getRepository(PointsTransaction).createQueryBuilder('t').where('t.userId = :userId AND t.eventCode = :eventCode AND t.points > 0', { userId, eventCode }).setLock('pessimistic_write');
        if (rule.maxPerUser !== null && await count.clone().getCount() >= rule.maxPerUser)
            return null;
        if (rule.maxPerPeriod !== null) {
            const start = periodStart(rule.periodType);
            if (start)
                count.andWhere('t.createdAt >= :start', { start });
            if (await count.getCount() >= rule.maxPerPeriod)
                return null;
        }
        const points = Math.min(rule.points + bonus, ceiling ?? (rule.points + bonus));
        if (points <= 0)
            return null;
        return this.move(manager, user, points, eventCode, sourceType, sourceId, key, rule.description || rule.name, undefined, orderId);
    }
    async move(manager: EntityManager, user: User, points: number, eventCode: string, sourceType: PointsSourceType, sourceId: string, idempotencyKey: string, description: string, createdBy?: string, orderId?: string) {
        let balanceAfter: number;
        try {
            balanceAfter = checkedBalance(user.totalPoints, points);
        }
        catch {
            throw createError.conflict('Reward adjustment would put the balance out of range');
        }
        const transaction = await manager.save(PointsTransaction, manager.create(PointsTransaction, {
            userId: user.id, orderId: orderId ?? (sourceType === PointsSourceType.ORDER ? sourceId : null), points, eventCode, sourceType, sourceId, idempotencyKey, description: description.slice(0, 255), createdBy: createdBy ?? null, balanceAfter, balanceBefore: user.totalPoints, transactionType: points > 0 ? 'credit' : 'debit', type: eventCode === 'ADMIN_REWARD_ADJUSTMENT' ? PointsTransactionType.ADJUSTED : points > 0 ? PointsTransactionType.EARNED : PointsTransactionType.REVERSED, rewardType: eventCode === 'REVIEW_SUBMITTED' ? 'review_submission' : `${eventCode}:${user.id}`.slice(0, 80)
        }));
        await manager.update(User, user.id, { totalPoints: balanceAfter });
        return transaction;
    }
    async completedTrade(manager: EntityManager, order: Order) {
        const policy = await this.policy(manager);
        const beneficiaries = policy.tradeRewardBeneficiary === 'both' ? [order.buyerId, order.sellerId] : [policy.tradeRewardBeneficiary === 'seller' ? order.sellerId : order.buyerId];
        for (const userId of [...new Set(beneficiaries)].sort())
            await this.award(manager, userId, 'SUCCESSFUL_TRADE', PointsSourceType.ORDER, order.id);
        for (const userId of [...new Set([order.buyerId, order.sellerId])].sort())
            await this.qualify(manager, userId, 'first_successful_trade');
    }
    async refundedTrade(manager: EntityManager, order: Order) {
        if (!(await this.policy(manager)).reverseTradeRewardsOnRefund)
            return;
        const credits = await manager.find(PointsTransaction, {
            where: { sourceType: PointsSourceType.ORDER, sourceId: order.id, eventCode: 'SUCCESSFUL_TRADE' }, order: { userId: 'ASC' }, lock: { mode: 'pessimistic_write' }
        });
        for (const credit of credits)
            await this.reverse(manager, credit, 'Successful trade reward reversed after refund.');
    }
    async reverse(manager: EntityManager, original: PointsTransaction, reason: string, adminId?: string) {
        const user = await manager.findOneOrFail(User, { where: { id: original.userId }, lock: { mode: 'pessimistic_write' } });
        const key = `REVERSAL:${original.id}`;
        const existing = await manager.findOne(PointsTransaction, { where: { idempotencyKey: key }, lock: { mode: 'pessimistic_write' } });
        if (existing)
            return existing;
        if (original.points <= 0)
            throw createError.badRequest('Only credits can be reversed');
        const transaction = await this.move(manager, user, -original.points, original.sourceType === PointsSourceType.REFERRAL ? 'REFERRAL_REWARD_REVERSED' : 'TRADE_REWARD_REVERSED', original.sourceType, original.sourceId, key, reason, adminId);
        await this.audit(manager, 'REWARD_POINTS_REVERSED', transaction.id, { originalTransactionId: original.id, reason }, adminId);
        return transaction;
    }
    async invalidate(id: string, reason: string, adminId: string) {
        return AppDataSource.transaction(async (manager) => {
            const candidate = await manager.findOneBy(Referral, { id });
            if (!candidate)
                throw createError.notFound('Referral not found');
            await manager.findOne(User, { where: { id: candidate.referrerId }, lock: { mode: 'pessimistic_write' } });
            const referral = await manager.findOne(Referral, { where: { id }, lock: { mode: 'pessimistic_write' } });
            if (!referral)
                throw createError.notFound('Referral not found');
            const credits = await manager.find(PointsTransaction, {
                where: { sourceType: PointsSourceType.REFERRAL, sourceId: id, eventCode: 'REFERRAL_QUALIFIED' }, lock: { mode: 'pessimistic_write' }
            });
            for (const credit of credits)
                await this.reverse(manager, credit, reason, adminId);
            referral.status = 'invalid';
            await manager.save(referral);
            await this.audit(manager, 'REFERRAL_INVALIDATED', id, { reason }, adminId);
            return { success: true, data: referral };
        });
    }
    async adjust(adminId: string, input: {
        userId: string;
        transactionType: 'credit' | 'debit';
        points: number;
        reason: string;
    }, requestKey: string) {
        if (!Number.isInteger(input.points) || input.points < 1 || input.points > 1000000 || !['credit', 'debit'].includes(input.transactionType) || !input.reason.trim() || input.reason.length > 255 || !/^[A-Za-z0-9_-]{8,100}$/.test(requestKey))
            throw createError.badRequest('Invalid reward adjustment');
        return AppDataSource.transaction(async (manager) => {
            const user = await manager.findOne(User, { where: { id: input.userId }, lock: { mode: 'pessimistic_write' } });
            if (!user)
                throw createError.notFound('User not found');
            const key = `ADMIN:${adminId}:${requestKey}`;
            const points = input.transactionType === 'credit' ? input.points : -input.points;
            let transaction = await manager.findOne(PointsTransaction, { where: { idempotencyKey: key }, lock: { mode: 'pessimistic_write' } });
            if (transaction && (transaction.userId !== user.id || transaction.points !== points || transaction.description !== input.reason))
                throw createError.conflict('Idempotency key was used for a different adjustment');
            if (!transaction) {
                transaction = await this.move(manager, user, points, 'ADMIN_REWARD_ADJUSTMENT', PointsSourceType.ADMIN_ADJUSTMENT, randomUUID(), key, input.reason, adminId);
                await this.audit(manager, 'ADMIN_REWARD_ADJUSTMENT', transaction.id, { reason: input.reason, userId: user.id, points }, adminId);
            }
            return {
                success: true, message: 'Reward points adjusted successfully.', data: {
                    userId: user.id, points: Math.abs(transaction.points), transactionType: transaction.transactionType, newBalance: transaction.balanceAfter
                }
            };
        });
    }
}
