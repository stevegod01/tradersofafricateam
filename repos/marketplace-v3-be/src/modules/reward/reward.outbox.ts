import { FastifyInstance } from 'fastify';
import { AppDataSource } from '../../database/data-source';
import { PointsTransaction } from '../../database/entities/points-transaction.entity';
import { NotificationPreference } from '../../database/entities/notification-preference.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationService } from '../notification/notification.service';
import { NotificationCategory } from '../../database/entities/notification.entity';
import { sendSystemAnnouncementEmail } from '../../common/utils/email.service';
import { config } from '../../config';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** Committed credits only. Persistent retry state; notifications have stable deduplication keys. */
export function registerRewardOutbox(app: FastifyInstance) {
    let busy = false;
    const drain = async () => {
        if (busy || !AppDataSource.isInitialized)
            return;
        busy = true;
        try {
            for (let i = 0; i < 25; i++) {
                const found = await AppDataSource.transaction(async (manager) => {
                    const rows = await manager.query('SELECT * FROM reward_notification_outbox WHERE deliveredAt IS NULL ORDER BY createdAt LIMIT 1 FOR UPDATE SKIP LOCKED');
                    const row = rows[0];
                    if (!row)
                        return false;
                    const tx = await manager.findOneByOrFail(PointsTransaction, { id: row.transactionId });
                    await new NotificationService(app).createNotification({
                        userId: tx.userId, type: 'REWARD_POINTS_EARNED', category: NotificationCategory.REWARD, title: "You've earned reward points", message: `You earned ${tx.points} TOFA points for ${tx.description}. Your new balance is ${tx.balanceAfter} points.`, actionUrl: '/rewards/history', eventId: tx.id, deduplicationKey: `reward:${tx.id}`
                    });
                    if (tx.eventCode === 'REFERRAL_QUALIFIED' && config.notifications.emailEnabled) {
                        const user = await manager.findOneBy(User, { id: tx.userId });
                        const preference = await manager.findOneBy(NotificationPreference, { userId: tx.userId, category: NotificationCategory.REWARD });
                        if (user && user.status === 'active' && preference?.emailEnabled !== false)
                            await sendSystemAnnouncementEmail(user.email, escape(user.firstName), {
                                title: "You've Earned TOFA Reward Points", message: `You have earned ${tx.points} TOFA reward points for a qualified referral. Your current reward balance is ${tx.balanceAfter} points. You can view your referral and reward activity from your TOFA Marketplace account.`
                            });
                    }
                    await manager.query('UPDATE reward_notification_outbox SET deliveredAt = CURRENT_TIMESTAMP WHERE transactionId = ?', [tx.id]);
                    return true;
                });
                if (!found)
                    break;
            }
        }
        catch (err) {
            app.log.error({ err }, 'Reward notification delivery will be retried');
        }
        finally {
            busy = false;
        }
    };
    const timer = setInterval(() => { void drain(); }, 10000);
    timer.unref();
    app.addHook('onClose', async () => { clearInterval(timer); });
    return drain;
}
