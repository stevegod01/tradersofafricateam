import { rewardResponse } from './reward.swagger';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { FastifyInstance, FastifySchema } from 'fastify';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { Referral } from '../../database/entities/referral.entity';
import { RewardRule } from '../../database/entities/reward-rule.entity';
import { RewardSetting } from '../../database/entities/reward-setting.entity';
import { PointsTransaction } from '../../database/entities/points-transaction.entity';
import { User } from '../../database/entities/user.entity';
import { requireAuth, requirePermission } from '../../common/middleware/auth.middleware';
import { createError } from '../../common/utils/http-error.util';
import { config } from '../../config';
import { RewardService } from './reward.service';
import { auditedUpdate } from '../audit-log/audit-log.mutations';
const status = z.enum(['pending', 'qualified', 'rewarded', 'invalid']);
const event = z.enum(['REVIEW_SUBMITTED', 'SUCCESSFUL_TRADE', 'REFERRAL_QUALIFIED']);
const page = {
    page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20)
};
const dates = { dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional() };
export const referralQuery = z.object({
    ...page, ...dates, status: status.optional(), search: z.string().trim().max(100).optional(), referrerId: z.string().uuid().optional(), referredUserId: z.string().uuid().optional()
}).strict();
export const historyQuery = z.object({
    ...page, ...dates, transactionType: z.enum(['credit', 'debit']).optional(), eventCode: z.string().regex(/^[A-Z_]{1,80}$/).optional(), sourceType: z.enum(['product_review', 'seller_review', 'admin_adjustment', 'referral', 'order']).optional(), userId: z.string().uuid().optional()
}).strict();
const ruleFields = {
    eventCode: event, name: z.string().trim().min(1).max(150), description: z.string().trim().max(255).nullable().optional(), points: z.number().int().min(0).max(1000000), status: z.enum(['active', 'inactive']).optional(), maxPerUser: z.number().int().min(1).max(1000000).nullable().optional(), maxPerPeriod: z.number().int().min(1).max(1000000).nullable().optional(), periodType: z.enum(['day', 'week', 'month', 'lifetime']).nullable().optional()
};
export const ruleCreate = z.object(ruleFields).strict();
export const ruleUpdate = ruleCreate.omit({ eventCode: true }).partial().refine(v => Object.keys(v).length > 0, 'Provide at least one field');
export const adjustment = z.object({
    userId: z.string().uuid(), transactionType: z.enum(['credit', 'debit']), points: z.number().int().min(1).max(1000000), reason: z.string().trim().min(5).max(255)
}).strict();
export const policyInput = z.object({
    referralQualificationEvent: z.enum(['email_verified', 'company_verified', 'first_successful_trade']), tradeRewardBeneficiary: z.enum(['buyer', 'seller', 'both']), reverseTradeRewardsOnRefund: z.boolean()
}).strict();
const reasonInput = z.object({ reason: z.string().trim().min(5).max(255) }).strict();
const uuid = z.object({ id: z.string().uuid() });
const pagination = (q: {
    page: number;
    limit: number;
}, total: number) => ({ ...q, total, totalPages: Math.ceil(total / q.limit) });
function dateFilter<T extends ObjectLiteral>(q: { dateFrom?: Date; dateTo?: Date }, b: SelectQueryBuilder<T>) {
    if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo)
        throw createError.badRequest('dateFrom must precede dateTo');
    if (q.dateFrom)
        b.andWhere('t.createdAt >= :from', { from: q.dateFrom });
    if (q.dateTo)
        b.andWhere('t.createdAt <= :to', { to: q.dateTo });
}
// Schemas are explicit so Swagger describes inputs and serialization preserves response fields.
const string = { type: 'string' };
const queryProperties = {
    page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, status: { type: 'string', enum: ['pending', 'qualified', 'rewarded', 'invalid'] }, search: string, referrerId: { ...string, format: 'uuid' }, referredUserId: { ...string, format: 'uuid' }, userId: { ...string, format: 'uuid' }, transactionType: { type: 'string', enum: ['credit', 'debit'] }, eventCode: string, sourceType: string, dateFrom: { ...string, format: 'date-time' }, dateTo: { ...string, format: 'date-time' }
};
const ruleProperties = {
    eventCode: { type: 'string', enum: ['REVIEW_SUBMITTED', 'SUCCESSFUL_TRADE', 'REFERRAL_QUALIFIED'] }, name: { ...string, maxLength: 150 }, description: { ...string, nullable: true, maxLength: 255 }, points: { type: 'integer', minimum: 0, maximum: 1000000 }, status: { type: 'string', enum: ['active', 'inactive'] }, maxPerUser: { type: 'integer', minimum: 1, nullable: true }, maxPerPeriod: { type: 'integer', minimum: 1, nullable: true }, periodType: { type: 'string', enum: ['day', 'week', 'month', 'lifetime'], nullable: true }
};
function schema(summary: string, query?: string[], body?: FastifySchema['body'], params = false): FastifySchema {
    return {
        summary, tags: [summary.includes('referral') ? 'Referrals' : 'Rewards'], security: [{ bearerAuth: [] }], ...(query ? {
            querystring: {
                type: 'object', additionalProperties: false, properties: Object.fromEntries(query.map(k => [k, queryProperties[k as keyof typeof queryProperties]]))
            }
        } : {}), ...(body ? { body } : {}), ...(params ? {
            params: {
                type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } }
            }
        } : {}), response: {
            200: rewardResponse(summary), 201: rewardResponse(summary), 400: { type: 'object', additionalProperties: true }, 401: { type: 'object', additionalProperties: true }, 403: { type: 'object', additionalProperties: true }, 404: { type: 'object', additionalProperties: true }, 409: { type: 'object', additionalProperties: true }
        }
    };
}
const objectBody = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', additionalProperties: false, properties, required });
export async function rewardRoutes(app: FastifyInstance) {
    const service = new RewardService();
    app.get('/referrals/me', { schema: schema('Get my referral code and statistics'), preHandler: requireAuth }, async (req) => {
        const user = req.dbUser!;
        const rows = await AppDataSource.getRepository(Referral).createQueryBuilder('r').select('r.status', 'status').addSelect('COUNT(*)', 'count').where('r.referrerId = :id', { id: user.id }).groupBy('r.status').getRawMany();
        const statistics: Record<string, number> = { totalReferrals: 0, pending: 0, qualified: 0, rewarded: 0, invalid: 0 };
        for (const row of rows) {
            statistics[row.status] = Number(row.count);
            statistics.totalReferrals += Number(row.count);
        }
        const url = new URL('/signup', config.app.frontendUrl);
        url.searchParams.set('ref', user.referralCode!);
        return {
            success: true, data: { referralCode: user.referralCode, referralLink: url.toString(), statistics }
        };
    });
    const referrals = async (q: z.infer<typeof referralQuery>, owner?: string) => {
        const b = AppDataSource.getRepository(Referral).createQueryBuilder('t');
        if (owner)
            b.where('t.referrerId = :owner', { owner });
        for (const key of ['status', 'referrerId', 'referredUserId'] as const)
            if (q[key])
                b.andWhere(`t.${key} = :${key}`, { [key]: q[key] });
        if (q.search)
            b.andWhere('t.referralCode LIKE :search', { search: `%${q.search.replace(/[\\%_]/g, '\\$&')}%` });
        dateFilter(q, b);
        const [rows, total] = await b.orderBy('t.createdAt', 'DESC').addOrderBy('t.id', 'DESC').skip((q.page - 1) * q.limit).take(q.limit).getManyAndCount();
        const users = rows.length ? await AppDataSource.manager.findByIds(User, rows.map(r => r.referredUserId)) : [];
        const data = rows.map(r => {
            const u = users.find(u => u.id === r.referredUserId);
            return {
                id: r.id, ...(!owner ? { referrerId: r.referrerId, referralCode: r.referralCode } : {}), referredUser: {
                    id: r.referredUserId, displayName: u?.storeName || u?.companyName || u?.firstName || 'Marketplace user'
                }, status: r.status, qualifiedAt: r.qualifiedAt, rewardedAt: r.rewardedAt, createdAt: r.createdAt
            };
        });
        return { success: true, data, pagination: pagination({ page: q.page, limit: q.limit }, total) };
    };
    app.get('/referrals', {
        schema: schema('Get my referrals', ['status', 'page', 'limit']), preHandler: requireAuth
    }, req => referrals(referralQuery.pick({ status: true, page: true, limit: true }).parse(req.query), req.dbUser!.id));
    app.get('/admin/referrals', {
        schema: schema('List referrals', ['status', 'search', 'referrerId', 'referredUserId', 'dateFrom', 'dateTo', 'page', 'limit']), preHandler: requirePermission('referrals.view')
    }, req => referrals(referralQuery.parse(req.query)));
    app.get('/rewards/balance', { schema: schema('Get reward balance'), preHandler: requireAuth }, async (req) => ({ success: true, data: { totalPoints: req.dbUser!.totalPoints } }));
    const history = async (q: z.infer<typeof historyQuery>, owner?: string) => {
        const b = AppDataSource.getRepository(PointsTransaction).createQueryBuilder('t');
        if (owner)
            b.where('t.userId = :owner', { owner });
        for (const key of ['userId', 'eventCode', 'transactionType', 'sourceType'] as const)
            if (q[key])
                b.andWhere(`t.${key} = :${key}`, { [key]: q[key] });
        dateFilter(q, b);
        const [rows, total] = await b.orderBy('t.createdAt', 'DESC').addOrderBy('t.id', 'DESC').skip((q.page - 1) * q.limit).take(q.limit).getManyAndCount();
        return {
            success: true, data: rows.map(t => ({
                id: t.id, eventCode: t.eventCode, transactionType: t.transactionType, points: Math.abs(t.points), balanceBefore: t.balanceBefore, balanceAfter: t.balanceAfter, description: t.description, createdAt: t.createdAt, ...(!owner ? {
                    userId: t.userId, sourceType: t.sourceType, sourceId: t.sourceId, createdBy: t.createdBy
                } : {})
            })), pagination: pagination({ page: q.page, limit: q.limit }, total)
        };
    };
    app.get('/rewards/history', {
        schema: schema('Get reward history', ['transactionType', 'eventCode', 'dateFrom', 'dateTo', 'page', 'limit']), preHandler: requireAuth
    }, req => history(historyQuery.omit({ userId: true, sourceType: true }).parse(req.query), req.dbUser!.id));
    app.get('/admin/rewards/transactions', {
        schema: schema('List reward transactions', ['userId', 'eventCode', 'transactionType', 'sourceType', 'dateFrom', 'dateTo', 'page', 'limit']), preHandler: requirePermission('rewards.view')
    }, req => history(historyQuery.parse(req.query)));
    app.post('/admin/rewards/adjust', {
        schema: {
            ...schema('Adjust reward points', undefined, objectBody({
                userId: { ...string, format: 'uuid' }, transactionType: { type: 'string', enum: ['credit', 'debit'] }, points: { type: 'integer', minimum: 1, maximum: 1000000 }, reason: { ...string, minLength: 5, maxLength: 255 }
            }, ['userId', 'transactionType', 'points', 'reason'])), headers: {
                type: 'object', required: ['idempotency-key'], properties: {
                    'idempotency-key': { type: 'string', minLength: 8, maxLength: 100, pattern: '^[A-Za-z0-9_-]+$' }
                }
            }
        }, preHandler: requirePermission('rewards.adjust')
    }, req => service.adjust(req.dbAdmin!.id, adjustment.parse(req.body), z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).parse(req.headers['idempotency-key'])));
    app.get('/admin/reward-rules', {
        schema: schema('List reward rules'), preHandler: requirePermission('rewards.rules.view')
    }, async () => ({
        success: true, data: await AppDataSource.manager.find(RewardRule, { order: { eventCode: 'ASC' } })
    }));
    const validateCaps = (rule: Partial<RewardRule>) => {
        if (rule.maxPerPeriod && !rule.periodType)
            throw createError.badRequest('periodType is required with maxPerPeriod');
    };
    app.post('/admin/reward-rules', {
        schema: schema('Create reward rule', undefined, objectBody(ruleProperties, ['eventCode', 'name', 'points'])), preHandler: requirePermission('rewards.rules.manage')
    }, async (req, reply) => {
        const dto = ruleCreate.parse(req.body);
        validateCaps(dto);
        const data = await AppDataSource.transaction(async (manager) => {
            const safety = dto.eventCode === 'REFERRAL_QUALIFIED' ? await service.lockReferralSafetyState(manager) : null;
            if (await manager.existsBy(RewardRule, { eventCode: dto.eventCode }))
                throw createError.conflict('A rule already exists for this event');
            if (safety)
                service.assertReferralPolicySafe(safety.policy, { eventCode: dto.eventCode, status: dto.status ?? 'active', points: dto.points, maxPerUser: dto.maxPerUser ?? null });
            const rule = await manager.save(RewardRule, manager.create(RewardRule, { ...dto, createdBy: req.dbAdmin!.id }));
            await service.audit(manager, 'REWARD_RULE_CREATED', rule.id, dto, req.dbAdmin!.id);
            return rule;
        });
        return reply.code(201).send({ success: true, data });
    });
    app.patch('/admin/reward-rules/:id', {
        schema: schema('Update reward rule', undefined, objectBody(Object.fromEntries(Object.entries(ruleProperties).filter(([k]) => k !== 'eventCode')), []), true), preHandler: requirePermission('rewards.rules.manage')
    }, async (req) => {
        const { id } = uuid.parse(req.params), dto = ruleUpdate.parse(req.body);
        return AppDataSource.transaction(async (manager) => {
            const safety = await service.lockReferralSafetyState(manager);
            const rule = await manager.findOne(RewardRule, { where: { id }, lock: { mode: 'pessimistic_write' } });
            if (!rule)
                throw createError.notFound('Reward rule not found');
            validateCaps({ ...rule, ...dto });
            const previous = rule.status;
            Object.assign(rule, dto);
            if (rule.eventCode === 'REFERRAL_QUALIFIED')
                service.assertReferralPolicySafe(safety.policy, rule);
            await manager.save(rule);
            await service.audit(manager, 'REWARD_RULE_UPDATED', id, dto, req.dbAdmin!.id);
            if (previous !== rule.status)
                await service.audit(manager, rule.status === 'active' ? 'REWARD_RULE_ACTIVATED' : 'REWARD_RULE_DEACTIVATED', id, { status: rule.status }, req.dbAdmin!.id);
            return { success: true, data: rule };
        });
    });
    app.get('/admin/rewards/policy', {
        schema: schema('Get referral and trade reward policy'), preHandler: requirePermission('rewards.rules.view')
    }, async () => ({ success: true, data: await service.policy() }));
    app.patch('/admin/rewards/policy', {
        schema: schema('Update referral and trade reward policy', undefined, objectBody({
            referralQualificationEvent: { type: 'string', enum: ['email_verified', 'company_verified', 'first_successful_trade'] }, tradeRewardBeneficiary: { type: 'string', enum: ['buyer', 'seller', 'both'] }, reverseTradeRewardsOnRefund: { type: 'boolean' }
        }, ['referralQualificationEvent', 'tradeRewardBeneficiary', 'reverseTradeRewardsOnRefund'])), preHandler: requirePermission('rewards.rules.manage')
    }, async (req) => {
        const data = policyInput.parse(req.body);
        await AppDataSource.transaction(async (manager) => {
            const safety = await service.lockReferralSafetyState(manager);
            service.assertReferralPolicySafe(data, safety.rule);
            await manager.upsert(RewardSetting, { settingKey: 'referral_reward_policy', settingValue: data, updatedBy: req.dbAdmin!.id }, ['settingKey']);
            await service.audit(manager, 'REWARD_POLICY_UPDATED', req.dbAdmin!.id, data, req.dbAdmin!.id);
        });
        return { success: true, data };
    });
    app.post('/admin/referrals/:id/invalidate', {
        schema: schema('Invalidate referral and reverse its reward', undefined, objectBody({ reason: { ...string, minLength: 5, maxLength: 255 } }, ['reason']), true), preHandler: requirePermission('referrals.manage')
    }, req => service.invalidate(uuid.parse(req.params).id, reasonInput.parse(req.body).reason, req.dbAdmin!.id));
    app.patch('/admin/referrals/:id', {
        schema: schema('Correct pending referral attribution', undefined, objectBody({
            referrerId: { ...string, format: 'uuid' }, reason: { ...string, minLength: 5, maxLength: 255 }
        }, ['referrerId', 'reason']), true), preHandler: requirePermission('referrals.manage')
    }, async (req) => {
        const { id } = uuid.parse(req.params), dto = reasonInput.extend({ referrerId: z.string().uuid() }).parse(req.body);
        return AppDataSource.transaction(async (manager) => {
            const referral = await manager.findOne(Referral, { where: { id }, lock: { mode: 'pessimistic_write' } });
            if (!referral)
                throw createError.notFound('Referral not found');
            if (referral.status !== 'pending')
                throw createError.conflict('Only pending referrals can be corrected');
            const referrer = await manager.findOneBy(User, { id: dto.referrerId });
            if (!referrer?.referralCode || referrer.id === referral.referredUserId || ['disabled', 'deleted'].includes(referrer.status))
                throw createError.badRequest('Invalid referrer');
            const previous = referral.referrerId;
            referral.referrerId = referrer.id;
            referral.referralCode = referrer.referralCode;
            await manager.save(referral);
            await auditedUpdate(manager.getRepository(User), referral.referredUserId, { referral: referrer.referralCode });
            await service.audit(manager, 'REFERRAL_CORRECTED', id, { previousReferrerId: previous, referrerId: referrer.id, reason: dto.reason }, req.dbAdmin!.id);
            return { success: true, data: referral };
        });
    });
    app.post('/admin/referrals/:id/retry', {
        schema: schema('Retry referral qualification', undefined, objectBody({ reason: { ...string, minLength: 5, maxLength: 255 } }, ['reason']), true), preHandler: requirePermission('referrals.manage')
    }, async (req) => {
        const { id } = uuid.parse(req.params), { reason } = reasonInput.parse(req.body);
        return AppDataSource.transaction(async (manager) => {
            const referral = await manager.findOneBy(Referral, { id });
            if (!referral)
                throw createError.notFound('Referral not found');
            const user = await manager.findOneByOrFail(User, { id: referral.referredUserId });
            const policy = await service.policy(manager);
            const eligible = policy.referralQualificationEvent === 'email_verified' ? user.isEmailVerified : policy.referralQualificationEvent === 'company_verified' ? user.isCompanyVerified : await manager.exists(Order, {
                where: [{ buyerId: user.id, status: OrderStatus.COMPLETED }, { sellerId: user.id, status: OrderStatus.COMPLETED }]
            });
            if (!eligible)
                throw createError.conflict('The referred user has not met the qualification condition');
            await service.qualify(manager, user.id, policy.referralQualificationEvent);
            await service.audit(manager, 'REFERRAL_QUALIFICATION_RETRIED', id, { reason }, req.dbAdmin!.id);
            return { success: true, data: await manager.findOneByOrFail(Referral, { id }) };
        });
    });
    app.get('/admin/referrals/analytics', {
        schema: schema('Get referral analytics'), preHandler: requirePermission('referrals.analytics.view')
    }, async () => {
        const rows = await AppDataSource.getRepository(Referral).createQueryBuilder('r').select('r.status', 'status').addSelect('COUNT(*)', 'count').groupBy('r.status').getRawMany();
        const data: Record<string, number> = {
            totalReferrals: 0, pendingReferrals: 0, qualifiedReferrals: 0, rewardedReferrals: 0, invalidReferrals: 0, totalReferralPointsIssued: 0
        };
        for (const r of rows) {
            data[`${r.status}Referrals`] = Number(r.count);
            data.totalReferrals += Number(r.count);
        }
        data.qualifiedReferrals += data.rewardedReferrals;
        const points = await AppDataSource.getRepository(PointsTransaction).createQueryBuilder('t').select('COALESCE(SUM(t.points),0)', 'total').where("t.eventCode = 'REFERRAL_QUALIFIED' AND t.points > 0").getRawOne();
        data.totalReferralPointsIssued = Number(points.total);
        return { success: true, data };
    });
    app.get('/admin/rewards/reconciliation', {
        schema: schema('Reconcile reward balances', ['page', 'limit']), preHandler: requirePermission('rewards.view')
    }, async (req) => {
        const q = z.object(page).strict().parse(req.query);
        const data = await AppDataSource.manager.query('SELECT u.id AS userId, u.totalPoints, COALESCE(SUM(t.points),0) AS ledgerBalance FROM users u LEFT JOIN reward_transactions t ON t.userId = u.id GROUP BY u.id,u.totalPoints HAVING u.totalPoints <> COALESCE(SUM(t.points),0) ORDER BY u.id LIMIT ? OFFSET ?', [q.limit, (q.page - 1) * q.limit]);
        return { success: true, data, page: q.page, limit: q.limit };
    });
}
