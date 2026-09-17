import { AnalyticsEvent } from '../../database/entities/analytics-event.entity';
import { EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent, RemoveEvent, SoftRemoveEvent } from 'typeorm';
import { PointsTransaction } from '../../database/entities/points-transaction.entity';
import { writeAudit } from '../audit-log/audit-log.writer';
/** Enrich legacy review/admin ledger writes while keeping their signed-points contract. */
@EventSubscriber()
export class RewardLedgerSubscriber implements EntitySubscriberInterface<PointsTransaction> {
    listenTo() { return PointsTransaction; }
    beforeInsert(event: InsertEvent<PointsTransaction>) {
        const row = event.entity;
        if (!row || !Number.isInteger(row.points) || row.points === 0)
            throw new Error('Reward transaction must contain nonzero integer points');
        row.eventCode ||= row.rewardType === 'review_submission' ? 'REVIEW_SUBMITTED' : row.rewardType === 'review_reversal' ? 'REVIEW_REWARD_REVERSED' : 'ADMIN_REWARD_ADJUSTMENT';
        row.transactionType = row.points > 0 ? 'credit' : 'debit';
        row.balanceBefore = row.balanceAfter - row.points;
        row.idempotencyKey ||= `${row.eventCode}:${row.sourceId}:${row.userId}`;
        if (row.balanceBefore < 0 || row.balanceAfter < 0 || row.balanceAfter > 2147483647)
            throw new Error('Invalid reward balance');
    }
    async afterInsert(event: InsertEvent<PointsTransaction>) {
        const row = event.entity;
        await event.manager.save(AnalyticsEvent, event.manager.create(AnalyticsEvent, {
            sourceModule: 'rewards', eventName: row.eventCode, sourceEventId: row.id, entityType: 'reward_transaction', entityId: row.id, actorId: row.createdBy ?? null, payload: {
                userId: row.userId, points: row.points, balanceAfter: row.balanceAfter, sourceType: row.sourceType, sourceId: row.sourceId
            }
        }));
        if (row.points > 0)
            await event.manager.query('INSERT INTO reward_notification_outbox (transactionId) VALUES (?)', [row.id]);
        await writeAudit(event.manager, {
            eventCode: row.transactionType === 'credit' ? 'REWARD_POINTS_CREDITED' : 'REWARD_POINTS_DEBITED', module: 'rewards', entityType: 'reward_transaction', entityId: row.id, eventId: `reward:${row.id}`, actorId: row.createdBy ?? undefined, actorType: row.createdBy ? 'admin' : 'system', metadata: {
                userId: row.userId, eventCode: row.eventCode, points: row.points, balanceBefore: row.balanceBefore, balanceAfter: row.balanceAfter
            }
        });
    }
    beforeUpdate(_event: UpdateEvent<PointsTransaction>) { throw new Error('Reward transactions are append-only'); }
    beforeRemove(_event: RemoveEvent<PointsTransaction>) { throw new Error('Reward transactions are append-only'); }
    beforeSoftRemove(_event: SoftRemoveEvent<PointsTransaction>) { throw new Error('Reward transactions are append-only'); }
}
