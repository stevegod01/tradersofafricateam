import { FastifyInstance } from 'fastify';
import { Brackets, IsNull, LessThanOrEqual } from 'typeorm';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import { B2BLogisticsRequest } from '../../database/entities/b2b-logistics-request.entity';
import { MarketRFQQuote } from '../../database/entities/market-rfq-quote.entity';
import {
  Notification,
  NotificationActionType,
  NotificationCategory,
} from '../../database/entities/notification.entity';
import { NotificationPreference } from '../../database/entities/notification-preference.entity';
import { Order } from '../../database/entities/order.entity';
import {
  SystemAnnouncement,
  SystemAnnouncementAudience,
  SystemAnnouncementStatus,
} from '../../database/entities/system-announcement.entity';
import { TranslatableEntityType } from '../../database/entities/translation-metadata.entity';
import { User, UserStatus, UserType } from '../../database/entities/user.entity';
import { TranslationMap } from '../../database/entities/category.entity';
import { createError } from '../../common/utils/http-error.util';
import { resolveTranslation, toTranslationMap } from '../../common/utils/i18n.util';
import { sendSystemAnnouncementEmail } from '../../common/utils/email.service';
import {
  AdminSystemAnnouncementQueryDto,
  NotificationPreferenceUpdateDto,
  NotificationQueryDto,
  SystemAnnouncementCreateDto,
} from '../../common/utils/validation.schemas';
import {
  DirectRFQEventName,
  DirectRFQEventPayload,
  onDirectRFQEvent,
} from '../direct-rfq/direct-rfq.events';
import {
  LogisticsEventName,
  LogisticsEventPayload,
  onLogisticsEvent,
} from '../logistics/logistics.events';
import {
  MarketRFQEventName,
  MarketRFQEventPayload,
  onMarketRFQEvent,
} from '../market-rfq/market-rfq.events';
import {
  MessageEventPayload,
  onMessageEvent,
} from '../message/message.events';
import {
  onOrderEvent,
  OrderEventName,
  OrderEventPayload,
} from '../order/order.events';
import {
  DisputeEventName,
  DisputeEventPayload,
  onDisputeEvent,
} from '../dispute/dispute.events';
import {
  onPaymentEvent,
  PaymentEventName,
  PaymentEventPayload,
} from '../payment/payment.events';
import {
  onReviewEvent,
  ReviewEventName,
  ReviewEventPayload,
} from '../review/review.events';
import {
  onSubscriptionEvent,
  SubscriptionEventName,
  SubscriptionEventPayload,
} from '../subscription/subscription.events';
import { I18nService } from '../i18n/i18n.service';
import { emitNotificationEvent } from './notification.events';

type NotificationText = string | TranslationMap;

type CreateNotificationInput = {
  userId: string;
  type: string;
  category: NotificationCategory;
  title: NotificationText;
  message: NotificationText;
  actionType?: NotificationActionType;
  actionId?: string | null;
  actionUrl?: string | null;
  imageUrl?: string | null;
  eventId?: string | null;
  deduplicationKey?: string | null;
  mandatory?: boolean;
  sendInApp?: boolean;
  allowInactiveRecipient?: boolean;
};

type PreferenceDefault = {
  category: NotificationCategory;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  isMandatory: boolean;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const DEFAULT_NOTIFICATION_PREFERENCES: PreferenceDefault[] = [
  {
    category: NotificationCategory.ACCOUNT,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: true,
  },
  {
    category: NotificationCategory.SELLER,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: true,
  },
  {
    category: NotificationCategory.PRODUCT,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: false,
  },
  {
    category: NotificationCategory.RFQ,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: false,
  },
  {
    category: NotificationCategory.PAYMENT,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: true,
  },
  {
    category: NotificationCategory.ORDER,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: false,
  },
  {
    category: NotificationCategory.LOGISTICS,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: false,
  },
  {
    category: NotificationCategory.SUBSCRIPTION,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: false,
  },
  {
    category: NotificationCategory.REVIEW,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: false,
  },
  {
    category: NotificationCategory.REWARD,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: false,
  },
  {
    category: NotificationCategory.MESSAGE,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: false,
  },
  {
    category: NotificationCategory.DISPUTE,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: true,
  },
  {
    category: NotificationCategory.SYSTEM,
    inAppEnabled: true,
    emailEnabled: true,
    isMandatory: true,
  },
  {
    category: NotificationCategory.MARKETING,
    inAppEnabled: false,
    emailEnabled: false,
    isMandatory: false,
  },
];

let notificationEventHandlersRegistered = false;

export function registerNotificationEventHandlers(
  fastify?: FastifyInstance,
): void {
  if (notificationEventHandlersRegistered) return;
  notificationEventHandlersRegistered = true;

  const service = new NotificationService(fastify);

  const paymentEvents: PaymentEventName[] = [
    'PAYMENT_CREATED',
    'PAYMENT_PROOF_UPLOADED',
    'PAYMENT_CONFIRMED',
    'PAYMENT_REJECTED',
    'PAYMENT_EXPIRED',
    'PAYMENT_CANCELLED',
    'PAYMENT_FAILED',
  ];
  paymentEvents.forEach((eventName) => {
    onPaymentEvent(eventName, (payload) => service.handlePaymentEvent(eventName, payload));
  });

  const orderEvents: OrderEventName[] = [
    'ORDERS_CREATED',
    'ORDER_PROCESSING',
    'ORDER_READY_FOR_SHIPMENT',
    'BUYER_LOGISTICS_DETAILS_SUBMITTED',
    'BUYER_LOGISTICS_DETAILS_UPDATED',
    'ORDER_SHIPPED',
    'ORDER_DELIVERED',
    'ORDER_RECEIVED',
    'ORDER_COMPLETED',
    'ORDER_CANCELLATION_REQUESTED',
    'ORDER_CANCELLATION_APPROVED',
    'ORDER_CANCELLATION_REJECTED',
    'ORDER_CANCELLED',
  ];
  orderEvents.forEach((eventName) => {
    onOrderEvent(eventName, (payload) => service.handleOrderEvent(eventName, payload));
  });

  const directRfqEvents: DirectRFQEventName[] = [
    'DIRECT_RFQ_CREATED',
    'DIRECT_RFQ_QUOTE_CREATED',
    'DIRECT_RFQ_COUNTER_OFFER_CREATED',
    'DIRECT_RFQ_QUOTE_ACCEPTED',
    'DIRECT_RFQ_QUOTE_REJECTED',
    'DIRECT_RFQ_CANCELLED',
  ];
  directRfqEvents.forEach((eventName) => {
    onDirectRFQEvent(eventName, (payload) =>
      service.handleDirectRfqEvent(eventName, payload),
    );
  });

  const marketRfqEvents: MarketRFQEventName[] = [
    'MARKET_RFQ_QUOTE_CREATED',
    'MARKET_RFQ_COUNTER_OFFER_CREATED',
    'MARKET_RFQ_AWARDED',
    'MARKET_RFQ_QUOTE_CLOSED',
    'MARKET_RFQ_CANCELLED',
    'MARKET_RFQ_EXPIRED',
  ];
  marketRfqEvents.forEach((eventName) => {
    onMarketRFQEvent(eventName, (payload) =>
      service.handleMarketRfqEvent(eventName, payload),
    );
  });

  const logisticsEvents: LogisticsEventName[] = [
    'SHIPMENT_CREATED',
    'SHIPMENT_PICKED_UP',
    'SHIPMENT_IN_TRANSIT',
    'SHIPMENT_OUT_FOR_DELIVERY',
    'SHIPMENT_DELIVERED',
    'SHIPMENT_DELIVERY_FAILED',
    'B2B_LOGISTICS_REQUEST_CREATED',
    'B2B_LOGISTICS_QUOTE_CREATED',
    'B2B_LOGISTICS_QUOTE_ACCEPTED',
  ];
  logisticsEvents.forEach((eventName) => {
    onLogisticsEvent(eventName, (payload) =>
      service.handleLogisticsEvent(eventName, payload),
    );
  });

  const subscriptionEvents: SubscriptionEventName[] = [
    'SUBSCRIPTION_ACTIVATED',
    'SUBSCRIPTION_UPGRADED',
    'SUBSCRIPTION_RENEWED',
    'SUBSCRIPTION_EXPIRED',
    'SUBSCRIPTION_CANCELLED',
    'SUBSCRIPTION_AUTO_RENEW_UPDATED',
  ];
  subscriptionEvents.forEach((eventName) => {
    onSubscriptionEvent(eventName, (payload) =>
      service.handleSubscriptionEvent(eventName, payload),
    );
  });

  const reviewEvents: ReviewEventName[] = [
    'REVIEW_SUBMITTED',
    'REVIEW_RESPONSE_CREATED',
    'POINTS_TRANSACTION_CREATED',
  ];
  reviewEvents.forEach((eventName) => {
    onReviewEvent(eventName, (payload) => service.handleReviewEvent(eventName, payload));
  });

  onMessageEvent('MESSAGE_SENT', (payload) => service.handleMessageEvent(payload));

  const disputeEvents: DisputeEventName[] = [
    'DISPUTE_CREATED',
    'DISPUTE_MESSAGE_SENT',
    'DISPUTE_BUYER_INFORMATION_REQUESTED',
    'DISPUTE_SELLER_INFORMATION_REQUESTED',
    'DISPUTE_RESOLVED',
    'DISPUTE_CLOSED',
  ];
  disputeEvents.forEach((eventName) => {
    onDisputeEvent(eventName, (payload) =>
      service.handleDisputeEvent(eventName, payload),
    );
  });
}

export class NotificationService {
  private notificationRepo = AppDataSource.getRepository(Notification);
  private preferenceRepo = AppDataSource.getRepository(NotificationPreference);
  private announcementRepo = AppDataSource.getRepository(SystemAnnouncement);
  private userRepo = AppDataSource.getRepository(User);
  private orderRepo = AppDataSource.getRepository(Order);
  private b2bRequestRepo = AppDataSource.getRepository(B2BLogisticsRequest);
  private marketRfqQuoteRepo = AppDataSource.getRepository(MarketRFQQuote);
  private i18nService = new I18nService();

  constructor(private readonly fastify?: FastifyInstance) {}

  async createNotification(
    input: CreateNotificationInput,
  ): Promise<Notification | null> {
    if (input.sendInApp === false) return null;

    const user = await this.userRepo.findOne({ where: { id: input.userId } });
    if (
      !user ||
      user.status === UserStatus.DELETED ||
      (!input.allowInactiveRecipient && user.status !== UserStatus.ACTIVE)
    ) {
      return null;
    }

    const preference = await this.ensurePreference(user.id, input.category);
    if (!preference.inAppEnabled && !preference.isMandatory && !input.mandatory) {
      return null;
    }

    const deduplicationKey =
      input.deduplicationKey ??
      (input.eventId ? `${input.type}:${user.id}:${input.eventId}` : null);

    if (deduplicationKey) {
      const existing = await this.notificationRepo.findOne({
        where: { userId: user.id, deduplicationKey },
      });
      if (existing) return existing;
    }

    const notification = this.notificationRepo.create({
      userId: user.id,
      type: input.type,
      category: input.category,
      title: clampText(resolveNotificationText(input.title, user.selectedLanguage), 255),
      message: resolveNotificationText(input.message, user.selectedLanguage),
      actionType: input.actionType ?? NotificationActionType.NONE,
      actionId: input.actionId ?? null,
      actionUrl: input.actionUrl ?? null,
      imageUrl: input.imageUrl ?? null,
      eventId: input.eventId ?? null,
      deduplicationKey,
      isRead: false,
      readAt: null,
      deletedAt: null,
    });

    try {
      const saved = await this.notificationRepo.save(notification);
      if (config.notifications.realtimeEnabled) {
        emitNotificationEvent('NOTIFICATION_CREATED', {
          notificationId: saved.id,
          userId: saved.userId,
          category: saved.category,
          type: saved.type,
        });
      }
      return saved;
    } catch (err) {
      if (isDuplicateKeyError(err) && deduplicationKey) {
        return this.notificationRepo.findOne({
          where: { userId: user.id, deduplicationKey },
        });
      }
      throw err;
    }
  }

  async listNotifications(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<Record<string, unknown>> {
    const qb = this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.deletedAt IS NULL')
      .orderBy('notification.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.category) {
      qb.andWhere('notification.category = :category', { category: query.category });
    }
    if (query.isRead !== undefined) {
      qb.andWhere('notification.isRead = :isRead', { isRead: query.isRead });
    }

    const [notifications, total] = await qb.getManyAndCount();
    return {
      success: true,
      data: notifications.map(serializeNotification),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async getUnreadCount(userId: string): Promise<Record<string, unknown>> {
    const unreadCount = await this.notificationRepo.count({
      where: { userId, isRead: false, deletedAt: IsNull() },
    });
    return {
      success: true,
      data: { unreadCount },
    };
  }

  async markRead(
    userId: string,
    notificationId: string,
  ): Promise<Record<string, unknown>> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId, deletedAt: IsNull() },
    });
    if (!notification) throw createError.notFound('Notification not found.');

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.notificationRepo.save(notification);
    }

    emitNotificationEvent('NOTIFICATION_READ', {
      notificationId: notification.id,
      userId,
      category: notification.category,
      type: notification.type,
    });

    return {
      success: true,
      message: 'Notification marked as read.',
      data: {
        notificationId: notification.id,
        isRead: notification.isRead,
        readAt: notification.readAt,
      },
    };
  }

  async markAllRead(userId: string): Promise<Record<string, unknown>> {
    const now = new Date();
    const result = await this.notificationRepo.update(
      { userId, isRead: false, deletedAt: IsNull() },
      { isRead: true, readAt: now },
    );
    const updatedCount = result.affected ?? 0;

    emitNotificationEvent('NOTIFICATIONS_READ_ALL', {
      userId,
      updatedCount,
    });

    return {
      success: true,
      message: 'All notifications marked as read.',
      data: { updatedCount },
    };
  }

  async deleteNotification(
    userId: string,
    notificationId: string,
  ): Promise<Record<string, unknown>> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId, deletedAt: IsNull() },
    });
    if (!notification) throw createError.notFound('Notification not found.');

    notification.deletedAt = new Date();
    await this.notificationRepo.save(notification);
    emitNotificationEvent('NOTIFICATION_DELETED', {
      notificationId: notification.id,
      userId,
      category: notification.category,
      type: notification.type,
    });

    return {
      success: true,
      message: 'Notification removed successfully.',
    };
  }

  async getPreferences(userId: string): Promise<Record<string, unknown>> {
    const preferences = await this.ensureDefaultPreferences(userId);
    return {
      success: true,
      data: preferences.map(serializePreference),
    };
  }

  async updatePreferences(
    userId: string,
    dto: NotificationPreferenceUpdateDto,
  ): Promise<Record<string, unknown>> {
    const defaults = new Map(
      DEFAULT_NOTIFICATION_PREFERENCES.map((item) => [item.category, item]),
    );

    await AppDataSource.transaction(async (manager) => {
      for (const item of dto.preferences) {
        const category = item.category as NotificationCategory;
        const defaultPreference = defaults.get(category);
        if (!defaultPreference) continue;
        if (
          defaultPreference.isMandatory &&
          (item.inAppEnabled === false || item.emailEnabled === false)
        ) {
          throw createError.forbidden(
            `Notifications for ${category} activity cannot be disabled.`,
            'MANDATORY_NOTIFICATION_CHANNEL',
          );
        }

        const existing = await manager.findOne(NotificationPreference, {
          where: { userId, category },
        });
        await manager.save(
          NotificationPreference,
          manager.create(NotificationPreference, {
            id: existing?.id,
            userId,
            category,
            inAppEnabled: item.inAppEnabled ?? existing?.inAppEnabled ?? defaultPreference.inAppEnabled,
            emailEnabled: item.emailEnabled ?? existing?.emailEnabled ?? defaultPreference.emailEnabled,
            isMandatory: defaultPreference.isMandatory,
          }),
        );
      }
    });

    emitNotificationEvent('NOTIFICATION_PREFERENCES_UPDATED', { userId });

    return {
      success: true,
      message: 'Notification preferences updated successfully.',
      data: (await this.getPreferences(userId)).data,
    };
  }

  async createAnnouncement(
    adminId: string,
    dto: SystemAnnouncementCreateDto,
  ): Promise<Record<string, unknown>> {
    const scheduledAt = dto.scheduledAt ?? null;
    const shouldSendNow = !scheduledAt || scheduledAt.getTime() <= Date.now();
    const status = shouldSendNow
      ? SystemAnnouncementStatus.SENT
      : SystemAnnouncementStatus.SCHEDULED;

    const title = toTranslationMap(dto.title);
    const message = toTranslationMap(dto.message);
    let announcement: SystemAnnouncement | null = null;
    await AppDataSource.transaction(async (manager) => {
      announcement = await manager.save(
        SystemAnnouncement,
        manager.create(SystemAnnouncement, {
          title,
          message,
          audience: dto.audience as SystemAnnouncementAudience,
          recipientUserIds: dto.audience === 'specific_users' ? dto.userIds ?? [] : null,
          actionUrl: dto.actionUrl ?? null,
          sendInApp: dto.sendInApp,
          sendEmail: dto.sendEmail,
          status,
          scheduledAt,
          sentAt: shouldSendNow ? new Date() : null,
          createdBy: adminId,
        }),
      );
      await this.i18nService.trackEntityTranslations(
        {
          entityType: TranslatableEntityType.SYSTEM_ANNOUNCEMENT,
          entityId: announcement.id,
          sourceLanguage: 'en',
          fields: {
            title,
            message,
          },
        },
        manager,
      );
    });

    emitNotificationEvent('ANNOUNCEMENT_CREATED', {
      announcementId: announcement!.id,
      adminId,
      metadata: { status: announcement!.status },
    });

    if (shouldSendNow) {
      await this.dispatchAnnouncement(announcement!);
    } else {
      emitNotificationEvent('ANNOUNCEMENT_SCHEDULED', {
        announcementId: announcement!.id,
        adminId,
      });
    }

    return {
      success: true,
      message: 'Announcement created successfully.',
      data: {
        announcementId: announcement!.id,
        status: announcement!.status,
        scheduledAt: announcement!.scheduledAt,
        sentAt: announcement!.sentAt,
      },
    };
  }

  async listAdminAnnouncements(
    query: AdminSystemAnnouncementQueryDto,
  ): Promise<Record<string, unknown>> {
    const qb = this.announcementRepo
      .createQueryBuilder('announcement')
      .orderBy('announcement.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.status) qb.andWhere('announcement.status = :status', { status: query.status });
    if (query.audience) qb.andWhere('announcement.audience = :audience', { audience: query.audience });
    if (query.dateFrom) {
      qb.andWhere('announcement.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('announcement.createdAt <= :dateTo', { dateTo: query.dateTo });
    }
    if (query.search) {
      qb.andWhere(
        new Brackets((searchQb) => {
          searchQb
            .where('CAST(announcement.title AS CHAR) LIKE :search')
            .orWhere('CAST(announcement.message AS CHAR) LIKE :search');
        }),
      ).setParameter('search', `%${query.search}%`);
    }

    const [announcements, total] = await qb.getManyAndCount();
    return {
      success: true,
      data: announcements.map(serializeAnnouncement),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async cancelAnnouncement(
    adminId: string,
    announcementId: string,
  ): Promise<Record<string, unknown>> {
    const announcement = await this.announcementRepo.findOne({
      where: { id: announcementId },
    });
    if (!announcement) throw createError.notFound('Announcement not found.');
    if (announcement.status === SystemAnnouncementStatus.SENT) {
      throw createError.conflict('A sent announcement cannot be cancelled.');
    }
    if (announcement.status === SystemAnnouncementStatus.CANCELLED) {
      return {
        success: true,
        message: 'Scheduled announcement cancelled successfully.',
      };
    }

    announcement.status = SystemAnnouncementStatus.CANCELLED;
    await this.announcementRepo.save(announcement);
    emitNotificationEvent('ANNOUNCEMENT_CANCELLED', {
      announcementId: announcement.id,
      adminId,
    });

    return {
      success: true,
      message: 'Scheduled announcement cancelled successfully.',
    };
  }

  async sendDueAnnouncements(): Promise<Record<string, unknown>> {
    const due = await this.announcementRepo.find({
      where: {
        status: SystemAnnouncementStatus.SCHEDULED,
        scheduledAt: LessThanOrEqual(new Date()),
      },
      take: config.notifications.announcementBatchSize,
      order: { scheduledAt: 'ASC', createdAt: 'ASC' },
    });

    let sent = 0;
    for (const announcement of due) {
      await this.dispatchAnnouncement(announcement);
      sent += 1;
    }

    return {
      success: true,
      data: { sent },
    };
  }

  async getStats(): Promise<Record<string, unknown>> {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [
      totalNotifications,
      unreadNotifications,
      todayCreated,
      todayRead,
      byCategoryRows,
    ] = await Promise.all([
      this.notificationRepo.count({ where: { deletedAt: IsNull() } }),
      this.notificationRepo.count({
        where: { isRead: false, deletedAt: IsNull() },
      }),
      this.notificationRepo
        .createQueryBuilder('notification')
        .where('notification.createdAt >= :startToday', { startToday })
        .andWhere('notification.createdAt <= :now', { now })
        .andWhere('notification.deletedAt IS NULL')
        .getCount(),
      this.notificationRepo
        .createQueryBuilder('notification')
        .where('notification.readAt >= :startToday', { startToday })
        .andWhere('notification.readAt <= :now', { now })
        .getCount(),
      this.notificationRepo
        .createQueryBuilder('notification')
        .select('notification.category', 'category')
        .addSelect('COUNT(*)', 'total')
        .where('notification.deletedAt IS NULL')
        .groupBy('notification.category')
        .getRawMany<{ category: NotificationCategory; total: string }>(),
    ]);

    const byCategory = Object.fromEntries(
      byCategoryRows.map((row) => [row.category, Number(row.total)]),
    );

    return {
      success: true,
      data: {
        totalNotifications,
        unreadNotifications,
        today: {
          created: todayCreated,
          read: todayRead,
        },
        byCategory,
      },
    };
  }

  async handlePaymentEvent(
    eventName: PaymentEventName,
    payload: PaymentEventPayload,
  ): Promise<void> {
    const templates: Record<PaymentEventName, { title: string; message: string } | undefined> = {
      PAYMENT_CREATED: {
        title: 'Payment created',
        message: `Your payment ${payload.paymentReference} has been created.`,
      },
      PAYMENT_INITIALIZED: undefined,
      PAYMENT_RETRY_STARTED: undefined,
      PAYMENT_METHOD_CHANGED: undefined,
      PAYMENT_PROOF_UPLOADED: {
        title: 'Payment proof uploaded',
        message: `Your payment proof for ${payload.paymentReference} has been uploaded.`,
      },
      PAYMENT_REVIEW_STARTED: undefined,
      PAYMENT_CONFIRMED: {
        title: 'Payment confirmed',
        message: `Your payment of ${payload.currency} ${payload.amount} has been confirmed.`,
      },
      PAYMENT_REJECTED: {
        title: 'Payment proof rejected',
        message: `Your payment ${payload.paymentReference} was rejected. Please review the payment details.`,
      },
      PAYMENT_EXPIRED: {
        title: 'Payment expired',
        message: `Payment ${payload.paymentReference} has expired.`,
      },
      PAYMENT_CANCELLED: {
        title: 'Payment cancelled',
        message: `Payment ${payload.paymentReference} has been cancelled.`,
      },
      PAYMENT_READY_FOR_ORDER: undefined,
      PAYMENT_FAILED: {
        title: 'Payment failed',
        message: `Payment ${payload.paymentReference} could not be completed.`,
      },
    };
    const template = templates[eventName];
    if (!template) return;

    await this.createNotification({
      userId: payload.payerId,
      type: eventName,
      category: NotificationCategory.PAYMENT,
      title: template.title,
      message: template.message,
      actionType: NotificationActionType.PAYMENT,
      actionId: payload.paymentId,
      actionUrl: `/payments/${payload.paymentId}`,
      eventId: payload.paymentId,
      deduplicationKey: dedup(eventName, payload.payerId, payload.paymentId),
      mandatory: true,
    });
  }

  async handleOrderEvent(
    eventName: OrderEventName,
    payload: OrderEventPayload,
  ): Promise<void> {
    const notifications = orderNotifications(eventName, payload);
    for (const notification of notifications) {
      await this.createNotification({
        ...notification,
        type: eventName,
        category: NotificationCategory.ORDER,
        actionType: NotificationActionType.ORDER,
        actionId: payload.orderId,
        actionUrl: `/orders/${payload.orderId}`,
        eventId: payload.orderId,
        deduplicationKey: dedup(eventName, notification.userId, payload.orderId),
      });
    }
  }

  async handleDirectRfqEvent(
    eventName: DirectRFQEventName,
    payload: DirectRFQEventPayload,
  ): Promise<void> {
    const recipientId = directRfqRecipient(eventName, payload);
    if (!recipientId) return;

    const titles: Record<string, string> = {
      DIRECT_RFQ_CREATED: 'New quotation request',
      DIRECT_RFQ_QUOTE_CREATED: 'Quotation received',
      DIRECT_RFQ_COUNTER_OFFER_CREATED: 'Counter-offer received',
      DIRECT_RFQ_QUOTE_ACCEPTED: 'Quotation accepted',
      DIRECT_RFQ_QUOTE_REJECTED: 'Quotation rejected',
      DIRECT_RFQ_CANCELLED: 'RFQ cancelled',
    };

    await this.createNotification({
      userId: recipientId,
      type: eventName,
      category: NotificationCategory.RFQ,
      title: titles[eventName] ?? 'Direct RFQ update',
      message: `Direct RFQ ${payload.rfqReference} has an update.`,
      actionType: NotificationActionType.DIRECT_RFQ,
      actionId: payload.rfqId,
      actionUrl: `/rfqs/direct/${payload.rfqId}`,
      eventId: payload.quoteVersionId ?? payload.rfqId,
      deduplicationKey: dedup(
        eventName,
        recipientId,
        payload.quoteVersionId ?? payload.rfqId,
      ),
    });
  }

  async handleMarketRfqEvent(
    eventName: MarketRFQEventName,
    payload: MarketRFQEventPayload,
  ): Promise<void> {
    const recipients = await this.marketRfqRecipients(eventName, payload);
    for (const recipientId of recipients) {
      const titles: Record<string, string> = {
        MARKET_RFQ_QUOTE_CREATED: 'New quotation received',
        MARKET_RFQ_COUNTER_OFFER_CREATED: 'Counter-offer received',
        MARKET_RFQ_AWARDED: 'Market RFQ awarded',
        MARKET_RFQ_QUOTE_CLOSED: 'Market RFQ quote closed',
        MARKET_RFQ_CANCELLED: 'Market RFQ cancelled',
        MARKET_RFQ_EXPIRED: 'Market RFQ expired',
      };

      await this.createNotification({
        userId: recipientId,
        type: eventName,
        category: NotificationCategory.RFQ,
        title: titles[eventName] ?? 'Market RFQ update',
        message: `Market RFQ ${payload.rfqReference} has an update.`,
        actionType: NotificationActionType.MARKET_RFQ,
        actionId: payload.rfqId,
        actionUrl: `/rfqs/market/${payload.rfqId}`,
        eventId: payload.quoteVersionId ?? payload.rfqId,
        deduplicationKey: dedup(
          eventName,
          recipientId,
          payload.quoteVersionId ?? payload.rfqId,
        ),
      });
    }
  }

  async handleLogisticsEvent(
    eventName: LogisticsEventName,
    payload: LogisticsEventPayload,
  ): Promise<void> {
    if (payload.orderId) {
      const order = await this.orderRepo.findOne({ where: { id: payload.orderId } });
      if (!order) return;
      await this.createNotification({
        userId: order.buyerId,
        type: eventName,
        category: NotificationCategory.LOGISTICS,
        title: logisticsTitle(eventName),
        message: logisticsMessage(eventName, payload, order.orderReference),
        actionType: NotificationActionType.ORDER,
        actionId: order.id,
        actionUrl: `/orders/${order.id}`,
        eventId: payload.shipmentId ?? payload.orderId,
        deduplicationKey: dedup(eventName, order.buyerId, payload.shipmentId ?? order.id),
      });
      return;
    }

    if (payload.b2bRequestId) {
      const request = await this.b2bRequestRepo.findOne({
        where: { id: payload.b2bRequestId },
      });
      if (!request) return;
      await this.createNotification({
        userId: request.requesterId,
        type: eventName,
        category: NotificationCategory.LOGISTICS,
        title: logisticsTitle(eventName),
        message: `Your B2B logistics request has an update.`,
        actionType: NotificationActionType.EXTERNAL,
        actionId: request.id,
        actionUrl: `/logistics/b2b/requests/${request.id}`,
        eventId: payload.b2bQuoteId ?? request.id,
        deduplicationKey: dedup(
          eventName,
          request.requesterId,
          payload.b2bQuoteId ?? request.id,
        ),
      });
    }
  }

  async handleSubscriptionEvent(
    eventName: SubscriptionEventName,
    payload: SubscriptionEventPayload,
  ): Promise<void> {
    if (!payload.userId || !payload.subscriptionId) return;
    const titles: Record<string, string> = {
      SUBSCRIPTION_ACTIVATED: 'Subscription activated',
      SUBSCRIPTION_UPGRADED: 'Subscription upgraded',
      SUBSCRIPTION_RENEWED: 'Subscription renewed',
      SUBSCRIPTION_EXPIRED: 'Subscription expired',
      SUBSCRIPTION_CANCELLED: 'Subscription cancelled',
      SUBSCRIPTION_AUTO_RENEW_UPDATED: 'Subscription auto-renew updated',
    };

    await this.createNotification({
      userId: payload.userId,
      type: eventName,
      category: NotificationCategory.SUBSCRIPTION,
      title: titles[eventName] ?? 'Subscription update',
      message: 'Your subscription has been updated.',
      actionType: NotificationActionType.SUBSCRIPTION,
      actionId: payload.subscriptionId,
      actionUrl: `/subscriptions/${payload.subscriptionId}`,
      eventId: payload.subscriptionId,
      deduplicationKey: dedup(eventName, payload.userId, payload.subscriptionId),
    });
  }

  async handleReviewEvent(
    eventName: ReviewEventName,
    payload: ReviewEventPayload,
  ): Promise<void> {
    if (eventName === 'REVIEW_SUBMITTED' && payload.sellerId && payload.reviewId) {
      await this.createNotification({
        userId: payload.sellerId,
        type:
          payload.reviewType === 'seller'
            ? 'SELLER_REVIEW_PUBLISHED'
            : 'PRODUCT_REVIEW_PUBLISHED',
        category: NotificationCategory.REVIEW,
        title: 'New review received',
        message: 'A buyer left a new review.',
        actionType: NotificationActionType.REVIEW,
        actionId: payload.reviewId,
        actionUrl: `/reviews/${payload.reviewId}`,
        eventId: payload.reviewId,
        deduplicationKey: dedup('REVIEW_SUBMITTED', payload.sellerId, payload.reviewId),
      });
      return;
    }

    if (eventName === 'REVIEW_RESPONSE_CREATED' && payload.buyerId && payload.reviewId) {
      await this.createNotification({
        userId: payload.buyerId,
        type: 'REVIEW_RESPONSE_CREATED',
        category: NotificationCategory.REVIEW,
        title: 'Seller responded to your review',
        message: 'A seller responded to one of your reviews.',
        actionType: NotificationActionType.REVIEW,
        actionId: payload.reviewId,
        actionUrl: `/reviews/${payload.reviewId}`,
        eventId: payload.reviewId,
        deduplicationKey: dedup('REVIEW_RESPONSE_CREATED', payload.buyerId, payload.reviewId),
      });
      return;
    }

    if (
      eventName === 'POINTS_TRANSACTION_CREATED' &&
      payload.buyerId &&
      payload.pointsTransactionId
    ) {
      const points = Number(payload.metadata?.points ?? 0);
      await this.createNotification({
        userId: payload.buyerId,
        type: 'REVIEW_POINTS_AWARDED',
        category: NotificationCategory.REWARD,
        title: `You earned ${points} TOFA Points`,
        message: 'Thanks for sharing your review.',
        actionType: NotificationActionType.REVIEW,
        actionId: payload.reviewId ?? payload.pointsTransactionId,
        actionUrl: '/rewards/points',
        eventId: payload.pointsTransactionId,
        deduplicationKey: dedup(
          'REVIEW_POINTS_AWARDED',
          payload.buyerId,
          payload.pointsTransactionId,
        ),
      });
    }
  }

  async handleMessageEvent(payload: MessageEventPayload): Promise<void> {
    if (!payload.recipientUserId || !payload.messageId || !payload.conversationId) {
      return;
    }
    await this.createNotification({
      userId: payload.recipientUserId,
      type: 'NEW_MESSAGE',
      category: NotificationCategory.MESSAGE,
      title: 'New message',
      message: 'You have a new marketplace message.',
      actionType: NotificationActionType.MESSAGE,
      actionId: payload.conversationId,
      actionUrl: `/messages/conversations/${payload.conversationId}`,
      eventId: payload.messageId,
      deduplicationKey: dedup('NEW_MESSAGE', payload.recipientUserId, payload.messageId),
      sendInApp: true,
    });
  }

  async handleDisputeEvent(
    eventName: DisputeEventName,
    payload: DisputeEventPayload,
  ): Promise<void> {
    const notifications = disputeNotifications(eventName, payload);
    for (const notification of notifications) {
      await this.createNotification({
        ...notification,
        category: NotificationCategory.DISPUTE,
        actionType: NotificationActionType.DISPUTE,
        actionId: payload.disputeId,
        actionUrl: `/disputes/${payload.disputeId}`,
        eventId: String(notification.eventId ?? payload.disputeId),
        deduplicationKey: dedup(
          notification.type,
          notification.userId,
          String(notification.eventId ?? payload.disputeId),
        ),
        mandatory: true,
      });
    }
  }

  private async dispatchAnnouncement(
    announcement: SystemAnnouncement,
  ): Promise<void> {
    const recipients = await this.resolveAnnouncementRecipients(announcement);
    for (const user of recipients) {
      const title = resolveNotificationText(announcement.title, user.selectedLanguage);
      const message = resolveNotificationText(announcement.message, user.selectedLanguage);

      if (announcement.sendInApp) {
        await this.createNotification({
          userId: user.id,
          type: 'SYSTEM_ANNOUNCEMENT',
          category: NotificationCategory.SYSTEM,
          title,
          message,
          actionType: notificationActionTypeForUrl(announcement.actionUrl),
          actionId: announcement.id,
          actionUrl: announcement.actionUrl,
          eventId: announcement.id,
          deduplicationKey: dedup('SYSTEM_ANNOUNCEMENT', user.id, announcement.id),
          mandatory: true,
        });
      }

      if (announcement.sendEmail && config.notifications.emailEnabled) {
        const preference = await this.ensurePreference(user.id, NotificationCategory.SYSTEM);
        if (preference.emailEnabled || preference.isMandatory) {
          await sendSystemAnnouncementEmail(user.email, user.firstName, {
            title,
            message,
            actionUrl: announcement.actionUrl,
          });
        }
      }
    }

    announcement.status = SystemAnnouncementStatus.SENT;
    announcement.sentAt = announcement.sentAt ?? new Date();
    await this.announcementRepo.save(announcement);
    emitNotificationEvent('ANNOUNCEMENT_SENT', {
      announcementId: announcement.id,
      metadata: { recipientCount: recipients.length },
    });
  }

  private async resolveAnnouncementRecipients(
    announcement: SystemAnnouncement,
  ): Promise<User[]> {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .where('user.status = :status', { status: UserStatus.ACTIVE })
      .orderBy('user.createdAt', 'ASC');

    if (announcement.audience === SystemAnnouncementAudience.BUYERS) {
      qb.andWhere('user.userType = :userType', { userType: UserType.BUYER });
    }
    if (announcement.audience === SystemAnnouncementAudience.SELLERS) {
      qb.andWhere('user.userType = :userType', { userType: UserType.SELLER });
    }
    if (announcement.audience === SystemAnnouncementAudience.ADMINS) {
      qb.andWhere('user.userType = :userType', { userType: UserType.ADMIN });
    }
    if (announcement.audience === SystemAnnouncementAudience.SPECIFIC_USERS) {
      const ids = announcement.recipientUserIds ?? [];
      if (ids.length === 0) return [];
      qb.andWhere('user.id IN (:...ids)', { ids });
    }

    return qb.getMany();
  }

  private async ensureDefaultPreferences(
    userId: string,
  ): Promise<NotificationPreference[]> {
    const existing = await this.preferenceRepo.find({ where: { userId } });
    const existingByCategory = new Map(existing.map((item) => [item.category, item]));
    const missing = DEFAULT_NOTIFICATION_PREFERENCES.filter(
      (item) => !existingByCategory.has(item.category),
    );

    if (missing.length > 0) {
      const created = await this.preferenceRepo.save(
        missing.map((item) =>
          this.preferenceRepo.create({
            userId,
            category: item.category,
            inAppEnabled: item.inAppEnabled,
            emailEnabled: item.emailEnabled,
            isMandatory: item.isMandatory,
          }),
        ),
      );
      created.forEach((item) => existingByCategory.set(item.category, item));
    }

    return DEFAULT_NOTIFICATION_PREFERENCES.map(
      (item) => existingByCategory.get(item.category)!,
    );
  }

  private async ensurePreference(
    userId: string,
    category: NotificationCategory,
  ): Promise<NotificationPreference> {
    const existing = await this.preferenceRepo.findOne({ where: { userId, category } });
    if (existing) return existing;

    const defaults =
      DEFAULT_NOTIFICATION_PREFERENCES.find((item) => item.category === category) ??
      DEFAULT_NOTIFICATION_PREFERENCES[0];
    return this.preferenceRepo.save(
      this.preferenceRepo.create({
        userId,
        category,
        inAppEnabled: defaults.inAppEnabled,
        emailEnabled: defaults.emailEnabled,
        isMandatory: defaults.isMandatory,
      }),
    );
  }

  private async marketRfqRecipients(
    eventName: MarketRFQEventName,
    payload: MarketRFQEventPayload,
  ): Promise<string[]> {
    if (eventName === 'MARKET_RFQ_QUOTE_CREATED') {
      return [payload.buyerId];
    }
    if (eventName === 'MARKET_RFQ_AWARDED') {
      return unique([payload.buyerId, payload.awardedSellerId].filter(Boolean) as string[]);
    }
    if (eventName === 'MARKET_RFQ_CANCELLED' || eventName === 'MARKET_RFQ_EXPIRED') {
      return [payload.buyerId];
    }

    const actorId = payload.quoteVersion?.createdById;
    if (!actorId) return [payload.buyerId];
    if (actorId === payload.buyerId && payload.quoteVersion?.quoteId) {
      const quote = await this.marketRfqQuoteRepo.findOne({
        where: { id: payload.quoteVersion.quoteId },
      });
      return quote?.sellerId ? [quote.sellerId] : [];
    }
    return [payload.buyerId].filter((id) => id !== actorId);
  }
}

function serializeNotification(notification: Notification): Record<string, unknown> {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    category: notification.category,
    title: notification.title,
    message: notification.message,
    actionType: notification.actionType,
    actionId: notification.actionId,
    actionUrl: notification.actionUrl,
    imageUrl: notification.imageUrl,
    eventId: notification.eventId,
    deduplicationKey: notification.deduplicationKey,
    isRead: notification.isRead,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

function serializePreference(preference: NotificationPreference): Record<string, unknown> {
  return {
    category: preference.category,
    inAppEnabled: preference.inAppEnabled,
    emailEnabled: preference.emailEnabled,
    isMandatory: preference.isMandatory,
  };
}

function serializeAnnouncement(
  announcement: SystemAnnouncement,
): Record<string, unknown> {
  return {
    announcementId: announcement.id,
    title: announcement.title,
    message: announcement.message,
    audience: announcement.audience,
    userIds: announcement.recipientUserIds,
    actionUrl: announcement.actionUrl,
    sendInApp: announcement.sendInApp,
    sendEmail: announcement.sendEmail,
    status: announcement.status,
    scheduledAt: announcement.scheduledAt,
    sentAt: announcement.sentAt,
    createdBy: announcement.createdBy,
    createdAt: announcement.createdAt,
    updatedAt: announcement.updatedAt,
  };
}

function resolveNotificationText(value: NotificationText, language?: string | null): string {
  if (typeof value === 'string') return value;
  return resolveTranslation(value, language) ?? value.en;
}

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength - 1);
}

function dedup(eventName: string, userId: string, entityId: string): string {
  return `${eventName}:${userId}:${entityId}`.slice(0, 220);
}

function directRfqRecipient(
  eventName: DirectRFQEventName,
  payload: DirectRFQEventPayload,
): string | null {
  if (eventName === 'DIRECT_RFQ_CREATED') return payload.sellerId;
  if (eventName === 'DIRECT_RFQ_QUOTE_CREATED') return payload.buyerId;
  if (
    eventName === 'DIRECT_RFQ_QUOTE_ACCEPTED' ||
    eventName === 'DIRECT_RFQ_QUOTE_REJECTED' ||
    eventName === 'DIRECT_RFQ_CANCELLED'
  ) {
    return payload.sellerId;
  }
  if (eventName === 'DIRECT_RFQ_COUNTER_OFFER_CREATED') {
    if (payload.actorId === payload.buyerId) return payload.sellerId;
    if (payload.actorId === payload.sellerId) return payload.buyerId;
    return payload.buyerId;
  }
  return null;
}

function orderNotifications(
  eventName: OrderEventName,
  payload: OrderEventPayload,
): Array<{ userId: string; title: string; message: string }> {
  const orderRef = payload.orderReference;
  const buyer = payload.buyerId;
  const seller = payload.sellerId;
  const templates: Record<OrderEventName, Array<{ userId: string; title: string; message: string }>> = {
    ORDERS_CREATED: [
      {
        userId: buyer,
        title: 'Order created',
        message: `Your order ${orderRef} has been created.`,
      },
      {
        userId: seller,
        title: 'New order received',
        message: `You received a new order ${orderRef}.`,
      },
    ],
    ORDER_PROCESSING: [
      {
        userId: buyer,
        title: 'Order processing',
        message: `Order ${orderRef} is now being processed.`,
      },
    ],
    ORDER_READY_FOR_SHIPMENT: [
      {
        userId: buyer,
        title: 'Order ready for shipment',
        message: `Order ${orderRef} is ready for shipment.`,
      },
    ],
    BUYER_LOGISTICS_DETAILS_SUBMITTED: [
      {
        userId: seller,
        title: 'Buyer logistics details received',
        message: `The buyer has provided pickup details for Order ${orderRef}.`,
      },
    ],
    BUYER_LOGISTICS_DETAILS_UPDATED: [
      {
        userId: seller,
        title: 'Buyer logistics details updated',
        message: `The buyer updated logistics details for Order ${orderRef}.`,
      },
    ],
    ORDER_SHIPPED: [
      {
        userId: buyer,
        title: 'Your order has been shipped',
        message: `Order ${orderRef} has been shipped.`,
      },
    ],
    ORDER_DELIVERED: [
      {
        userId: buyer,
        title: 'Order delivered',
        message: `Order ${orderRef} has been delivered.`,
      },
    ],
    ORDER_RECEIVED: [
      {
        userId: seller,
        title: 'Order received by buyer',
        message: `The buyer confirmed receipt of Order ${orderRef}.`,
      },
    ],
    ORDER_COMPLETED: [
      {
        userId: buyer,
        title: 'Order completed',
        message: `Order ${orderRef} has been completed.`,
      },
      {
        userId: seller,
        title: 'Order completed',
        message: `Order ${orderRef} has been completed.`,
      },
    ],
    ORDER_CANCELLATION_REQUESTED: [
      {
        userId: seller,
        title: 'Order cancellation requested',
        message: `The buyer requested cancellation for Order ${orderRef}.`,
      },
    ],
    ORDER_CANCELLATION_APPROVED: [
      {
        userId: buyer,
        title: 'Order cancellation approved',
        message: `Cancellation for Order ${orderRef} has been approved.`,
      },
    ],
    ORDER_CANCELLATION_REJECTED: [
      {
        userId: buyer,
        title: 'Order cancellation rejected',
        message: `Cancellation for Order ${orderRef} has been rejected.`,
      },
    ],
    ORDER_CANCELLED: [
      {
        userId: buyer,
        title: 'Order cancelled',
        message: `Order ${orderRef} has been cancelled.`,
      },
      {
        userId: seller,
        title: 'Order cancelled',
        message: `Order ${orderRef} has been cancelled.`,
      },
    ],
  };

  return templates[eventName] ?? [];
}

function disputeNotifications(
  eventName: DisputeEventName,
  payload: DisputeEventPayload,
): Array<{
  userId: string;
  type: string;
  title: string;
  message: string;
  eventId?: string;
}> {
  const orderRef = payload.orderReference ?? payload.orderId;
  const disputeRef = payload.disputeNumber;
  const actorId = payload.actorId ?? payload.raisedBy;
  const otherParty =
    actorId === payload.buyerId
      ? payload.sellerId
      : actorId === payload.sellerId
        ? payload.buyerId
        : null;

  if (eventName === 'DISPUTE_CREATED') {
    const recipient =
      payload.raisedByType === 'buyer' ? payload.sellerId : payload.buyerId;
    return [
      {
        userId: recipient,
        type: 'DISPUTE_CREATED',
        title: 'Dispute raised',
        message: `A dispute has been raised on Order ${orderRef}.`,
      },
    ];
  }

  if (eventName === 'DISPUTE_BUYER_INFORMATION_REQUESTED') {
    return [
      {
        userId: payload.buyerId,
        type: 'DISPUTE_BUYER_INFORMATION_REQUESTED',
        title: 'Additional information required',
        message: `Additional information is required for Dispute ${disputeRef}.`,
      },
    ];
  }

  if (eventName === 'DISPUTE_SELLER_INFORMATION_REQUESTED') {
    return [
      {
        userId: payload.sellerId,
        type: 'DISPUTE_SELLER_INFORMATION_REQUESTED',
        title: 'Additional information required',
        message: `Additional information is required for Dispute ${disputeRef}.`,
      },
    ];
  }

  if (eventName === 'DISPUTE_RESOLVED') {
    return [
      {
        userId: payload.buyerId,
        type: 'DISPUTE_RESOLVED',
        title: 'Dispute resolved',
        message: `Dispute ${disputeRef} for Order ${orderRef} has been resolved.`,
        eventId: `${payload.disputeId}:buyer:resolved`,
      },
      {
        userId: payload.sellerId,
        type: 'DISPUTE_RESOLVED',
        title: 'Dispute resolved',
        message: `Dispute ${disputeRef} for Order ${orderRef} has been resolved.`,
        eventId: `${payload.disputeId}:seller:resolved`,
      },
    ];
  }

  if (eventName === 'DISPUTE_CLOSED') {
    return [
      {
        userId: payload.buyerId,
        type: 'DISPUTE_CLOSED',
        title: 'Dispute closed',
        message: `Dispute ${disputeRef} has been closed.`,
        eventId: `${payload.disputeId}:buyer:closed`,
      },
      {
        userId: payload.sellerId,
        type: 'DISPUTE_CLOSED',
        title: 'Dispute closed',
        message: `Dispute ${disputeRef} has been closed.`,
        eventId: `${payload.disputeId}:seller:closed`,
      },
    ];
  }

  if (eventName === 'DISPUTE_MESSAGE_SENT' && otherParty) {
    return [
      {
        userId: otherParty,
        type: 'DISPUTE_MESSAGE_SENT',
        title: 'New dispute response',
        message: `Dispute ${disputeRef} has a new response.`,
        eventId:
          typeof payload.metadata?.messageId === 'string'
            ? payload.metadata.messageId
            : payload.disputeId,
      },
    ];
  }

  return [];
}

function logisticsTitle(eventName: LogisticsEventName): string {
  const titles: Partial<Record<LogisticsEventName, string>> = {
    SHIPMENT_CREATED: 'Shipment created',
    SHIPMENT_PICKED_UP: 'Shipment picked up',
    SHIPMENT_IN_TRANSIT: 'Shipment in transit',
    SHIPMENT_OUT_FOR_DELIVERY: 'Shipment out for delivery',
    SHIPMENT_DELIVERED: 'Shipment delivered',
    SHIPMENT_DELIVERY_FAILED: 'Shipment delivery failed',
    B2B_LOGISTICS_REQUEST_CREATED: 'B2B logistics request created',
    B2B_LOGISTICS_QUOTE_CREATED: 'B2B logistics quote available',
    B2B_LOGISTICS_QUOTE_ACCEPTED: 'B2B logistics quote accepted',
  };
  return titles[eventName] ?? 'Logistics update';
}

function logisticsMessage(
  eventName: LogisticsEventName,
  payload: LogisticsEventPayload,
  orderReference: string,
): string {
  const provider = payload.providerName ? ` with ${payload.providerName}` : '';
  if (eventName === 'SHIPMENT_OUT_FOR_DELIVERY') {
    return `Your shipment for Order ${orderReference} is out for delivery${provider}.`;
  }
  if (eventName === 'SHIPMENT_DELIVERY_FAILED') {
    return `Delivery failed for Order ${orderReference}. Please review the shipment details.`;
  }
  return `Shipment ${payload.shipmentReference ?? ''} for Order ${orderReference} has an update${provider}.`;
}

function notificationActionTypeForUrl(url?: string | null): NotificationActionType {
  if (!url) return NotificationActionType.NONE;
  return /^https?:\/\//i.test(url)
    ? NotificationActionType.EXTERNAL
    : NotificationActionType.NONE;
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function pagination(page: number, limit: number, total: number): Pagination {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
