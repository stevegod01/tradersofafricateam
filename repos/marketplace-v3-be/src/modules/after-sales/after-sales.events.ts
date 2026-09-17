import { SettlementService } from '../settlement/settlement.service';
import { RewardService } from '../reward/reward.service';
import { getSetting } from '../system-settings/settings.reader';
import { EntityManager } from 'typeorm';
import { FastifyInstance } from 'fastify';
import { AppDataSource } from '../../database/data-source';
import { AfterSalesEvent } from '../../database/entities/after-sales-events.entity';
import { AdminAuditEvent } from '../../database/entities/admin-audit-event.entity';
import { AnalyticsEvent } from '../../database/entities/analytics-event.entity';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationCategory, NotificationActionType } from '../../database/entities/notification.entity';
import { NotificationService } from '../notification/notification.service';
import { sendSystemAnnouncementEmail } from '../../common/utils/email.service';
import { config } from '../../config';
export async function recordAfterSalesEvent(manager: EntityManager, order: Order, entityId: string, eventType: string, actorId: string, actorType: string, payload: Record<string, unknown> = {}): Promise<void> {
  if (!['FINANCIAL_ADJUSTMENT_CREATED'].includes(eventType)) await new SettlementService().syncOrder(manager, order);
  if (eventType === 'REFUND_SUCCESSFUL') await new RewardService().refundedTrade(manager, order);
  const event = await manager.save(AfterSalesEvent, manager.create(AfterSalesEvent, {
    orderId: order.id, entityId, eventType, actorId, actorType,
    payload: {
      ...payload, buyerId: order.buyerId, sellerId: order.sellerId, orderReference: order.orderReference
    }, deliveredAt: null,
  }));
  await manager.save(AnalyticsEvent, manager.create(AnalyticsEvent, {
    sourceModule: 'after_sales', eventName: eventType, sourceEventId: event.id,
    entityType: eventType.split('_')[0].toLowerCase(), entityId, actorId, payload: event.payload,
  }));
  if (actorType === 'admin')
    await manager.save(AdminAuditEvent, manager.create(AdminAuditEvent, {
      eventType, actorAdminId: actorId, targetUserId: order.buyerId,
      metadata: {
        orderId: order.id, entityId, ...payload
      },
    }));
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]!));
/** Durable notification outbox. Audit and analytics already committed with the business event. */
export function registerAfterSalesOutbox(app: FastifyInstance): void {
  let busy = false;
  const drain = async () => {
    if (busy || !AppDataSource.isInitialized)
      return;
    busy = true;
    try {
      // A database lock prevents multiple app replicas delivering the same event concurrently.
      for (let i = 0; i < 25; i++) {
        const found = await AppDataSource.transaction(async (manager) => {
          const event = await manager.getRepository(AfterSalesEvent).createQueryBuilder('e')
            .where('e.deliveredAt IS NULL').orderBy('e.createdAt', 'ASC')
            .setLock('pessimistic_write').setOnLocked('skip_locked').getOne();
          if (!event)
            return false;
          if (event.eventType === 'CANCELLATION_APPROVED') {
            const order = await manager.findOneOrFail(Order, { where: { id: event.orderId }, relations: ['items'] });
            const { emitOrderEvent } = await import('../order/order.events');
            emitOrderEvent('ORDER_CANCELLED', order);
          }
          const userEvents = ['CANCELLATION_REQUESTED', 'CANCELLATION_APPROVED', 'CANCELLATION_REJECTED', 'CANCELLATION_COMPLETED', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_SHIPPED', 'RETURN_RECEIVED', 'RETURN_COMPLETED', 'RETURN_CANCELLED', 'REFUND_CREATED', 'REFUND_PROCESSING', 'REFUND_SUCCESSFUL', 'REFUND_FAILED'];
          if (!userEvents.includes(event.eventType) || (event.eventType.startsWith('REFUND_') && !await getSetting<boolean>('refundNotificationEnabled',manager))) {
            await manager.update(AfterSalesEvent, event.id, { deliveredAt: new Date() });
            return true;
          }
          const title = event.eventType.toLowerCase().replace(/_/g, ' ');
          const p = event.payload;
          let message = `Order ${p.orderReference}: ${title}.`;
          if (event.eventType === 'REFUND_SUCCESSFUL')
            message = `Your refund of ${p.currency} ${p.amount} for Order ${p.orderReference} has been processed successfully. Your financial institution may take additional time to credit your account.`;
          if (event.eventType === 'REFUND_FAILED')
            message += ' The refund has not been marked as completed. Our team will review the transaction.';
          if (event.eventType === 'RETURN_REJECTED')
            message += ' You may raise a dispute if the issue remains unresolved.';
          if (typeof p.notes === 'string' && event.eventType.startsWith('RETURN_'))
            message += ` ${p.notes}`;
          const recipients = (event.eventType.startsWith('REFUND_') ? [p.buyerId] : [p.buyerId, p.sellerId]).filter((id): id is string => typeof id === 'string');
          for (const userId of new Set<string>(recipients)) {
            await new NotificationService(app).createNotification({
              userId, type: event.eventType,
              category: event.eventType.startsWith('REFUND_') ? NotificationCategory.PAYMENT : NotificationCategory.ORDER,
              title, message, actionType: NotificationActionType.ORDER, actionId: event.orderId,
              actionUrl: `/orders/${event.orderId}`, eventId: event.id, deduplicationKey: `${event.id}:${userId}`, mandatory: true
            });
            if (config.notifications.emailEnabled) {
              const user = await manager.findOneBy(User, { id: userId });
              if (user)
                await sendSystemAnnouncementEmail(user.email, escapeHtml(user.firstName), {
                  title: escapeHtml(title), message: escapeHtml(message),
                });
            }
          }
          await manager.update(AfterSalesEvent, event.id, { deliveredAt: new Date() });
          return true;
        });
        if (!found)
          break;
      }
    }
    catch (err) {
      app.log.error({ err }, 'After-sales notification delivery will be retried');
    }
    finally {
      busy = false;
    }
  };
  const timer = setInterval(() => { void drain(); }, 10000);
  timer.unref();
  app.addHook('onClose', async () => { clearInterval(timer); });
}
