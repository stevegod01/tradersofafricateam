import { FastifyInstance } from 'fastify';
import { AppDataSource } from '../../database/data-source';
import { SettlementEvent } from '../../database/entities/settlement.entities';
import { User } from '../../database/entities/user.entity';
import { NotificationCategory, NotificationActionType } from '../../database/entities/notification.entity';
import { NotificationService } from '../notification/notification.service';
import { sendSystemAnnouncementEmail } from '../../common/utils/email.service';
import { config } from '../../config';
import { PayoutService } from './payout.service';
import { SettlementService } from './settlement.service';
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export async function refreshSettlementPage(cursor = '', limit = 50): Promise<string> {
  const rows = await AppDataSource.manager.query('SELECT o.id FROM orders o JOIN payments p ON p.id=o.paymentId WHERE p.status=? AND o.id>? ORDER BY o.id LIMIT ?', ['confirmed', cursor, limit]);
  for (const row of rows) {
    try {
      await new SettlementService().refreshOrder(row.id);
    }
    catch {
      console.error('Settlement refresh requires review', { orderId: row.id });
    }
  }
  return rows.length === limit ? rows[rows.length - 1].id : '';
}
export async function drainSettlementEvents(app: FastifyInstance) {
  for (let i = 0; i < 25; i++) {
    const found = await AppDataSource.transaction(async (m) => {
      const e = await m.createQueryBuilder(SettlementEvent, 'e').where('e.deliveredAt IS NULL').orderBy('e.createdAt', 'ASC').setLock('pessimistic_write').setOnLocked('skip_locked').getOne();
      if (!e)
        return false;
      if (['PAYOUT_PROCESSING', 'PAYOUT_SUCCESSFUL', 'PAYOUT_FAILED', 'SETTLEMENT_ON_HOLD'].includes(e.eventCode)) {
        const title = e.eventCode.toLowerCase().replace(/_/g, ' '), message = e.eventCode === 'SETTLEMENT_ON_HOLD' ? 'Your settlement is awaiting resolution of its approval requirements.' : `Your payout of ${e.payload.currency} ${e.payload.amount} is ${e.eventCode.replace('PAYOUT_', '').toLowerCase()}.`;
        await new NotificationService(app).createNotification({
          userId: e.sellerId, type: e.eventCode, category: NotificationCategory.PAYMENT, title, message, actionType: NotificationActionType.ORDER, actionId: e.payload.orderId, actionUrl: `/seller/settlements/${e.settlementId}`, eventId: e.id, deduplicationKey: e.id, mandatory: true, allowInactiveRecipient: true
        });
        if (config.notifications.emailEnabled && ['PAYOUT_SUCCESSFUL', 'PAYOUT_FAILED'].includes(e.eventCode)) {
          const u = await m.findOneBy(User, { id: e.sellerId });
          if (u)
            await sendSystemAnnouncementEmail(u.email, escapeHtml(u.firstName), { title: escapeHtml(title), message: escapeHtml(message) });
        }
      }
      await m.update(SettlementEvent, e.id, { deliveredAt: new Date() });
      return true;
    });
    if (!found)
      break;
  }
}
export function registerSettlementWorker(app: FastifyInstance) {
  if (process.env.SETTLEMENT_WORKER_ENABLED === 'false' || config.env === 'test')
    return;
  let busy = false, cursor = '', processingCursor = '', automaticCursor = '';
  const tick = async () => {
    if (busy || !AppDataSource.isInitialized)
      return;
    busy = true;
    try {
      cursor = await refreshSettlementPage(cursor);
      await drainSettlementEvents(app);
      const pending = await AppDataSource.manager.query("SELECT id FROM seller_payouts WHERE status='processing' AND provider='paystack' AND id>? ORDER BY id LIMIT 10", [processingCursor]);
      for (const row of pending) {
        try {
          await new PayoutService().reconcile(row.id);
        }
        catch {
          app.log.warn({ payoutId: row.id }, 'Transfer outcome remains unconfirmed');
        }
      }
      processingCursor = pending.length === 10 ? pending[pending.length - 1].id : '';
      if (process.env.PAYOUT_AUTOMATIC_PROCESSING_ENABLED === 'true') {
        const rows = await AppDataSource.manager.query("SELECT id FROM seller_payouts WHERE status='approved' AND provider='paystack' AND id>? ORDER BY id LIMIT 10", [automaticCursor]);
        for (const row of rows) {
          try {
            await new PayoutService().process(row.id, null);
          }
          catch {
            app.log.warn({ payoutId: row.id }, 'Automatic payout deferred; review policy or reconcile provider status');
          }
        }
        automaticCursor = rows.length === 10 ? rows[rows.length - 1].id : '';
      }
    }
    catch {
      app.log.error('Settlement refresh or notification delivery failed; will retry');
    }
    finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 15000);
  timer.unref();
  app.addHook('onClose', async () => { clearInterval(timer); });
}
