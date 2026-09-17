import { getSetting } from '../system-settings/settings.reader';
import { FastifyInstance } from 'fastify';
import { Brackets, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import { TranslationMap } from '../../database/entities/category.entity';
import {
  EntitlementDefinition,
  EntitlementStatus,
  EntitlementValueType,
} from '../../database/entities/entitlement-definition.entity';
import { MarketRFQQuote } from '../../database/entities/market-rfq-quote.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import { Product, ProductStatus } from '../../database/entities/product.entity';
import {
  SubscriptionAuditActorType,
  SubscriptionAuditEvent,
} from '../../database/entities/subscription-audit-event.entity';
import { SubscriptionPlanEntitlement } from '../../database/entities/subscription-plan-entitlement.entity';
import {
  SubscriptionBillingPeriod,
  SubscriptionPlanPrice,
  SubscriptionPriceStatus,
} from '../../database/entities/subscription-plan-price.entity';
import {
  SubscriptionPlan,
  SubscriptionPlanAudience,
  SubscriptionPlanStatus,
} from '../../database/entities/subscription-plan.entity';
import {
  UserSubscription,
  UserSubscriptionAction,
  UserSubscriptionStatus,
} from '../../database/entities/user-subscription.entity';
import { User, UserType } from '../../database/entities/user.entity';
import { createError } from '../../common/utils/http-error.util';
import {
  mergeTranslationInput,
  normalizeLanguageCode,
  resolveTranslation,
  toTranslationMap,
} from '../../common/utils/i18n.util';
import { roundMoney, toNumber } from '../../common/utils/pricing.util';
import {
  AdminSubscriptionQueryDto,
  PublicSubscriptionPlanQueryDto,
  RenewSubscriptionDto,
  SubscribeDto,
  SubscriptionAutoRenewDto,
  SubscriptionHistoryQueryDto,
  SubscriptionPlanCreateDto,
  SubscriptionPlanQueryDto,
  SubscriptionPlanStatusUpdateDto,
  SubscriptionPlanUpdateDto,
} from '../../common/utils/validation.schemas';
import {
  sendFreeSubscriptionActivatedEmail,
  sendSubscriptionActivatedEmail,
  sendSubscriptionExpiredEmail,
  sendSubscriptionExpiryReminderEmail,
  sendSubscriptionUpgradeEmail,
} from '../../common/utils/email.service';
import { PaymentService } from '../payment/payment.service';
import { I18nService } from '../i18n/i18n.service';
import { onPaymentEvent } from '../payment/payment.events';
import {
  emitSubscriptionEvent,
  SubscriptionEventName,
} from './subscription.events';
import { TranslatableEntityType } from '../../database/entities/translation-metadata.entity';

type EntitlementPrimitive = boolean | number | string | null;
type SubscriptionPaymentMethod = NonNullable<SubscribeDto['paymentMethod']>;

type EntitlementDefinitionSeed = {
  code: string;
  name: string;
  description: string;
  valueType: EntitlementValueType;
  defaultValue: EntitlementPrimitive;
  category: string;
};

export type SubscriptionFeeSnapshot = {
  subscriptionId: string | null;
  subscriptionPlanId: string | null;
  transactionFeePercentage: number;
  feeBaseAmount: number;
  transactionFeeAmount: number;
  sellerNetProductAmount: number;
};

const DEFAULT_ENTITLEMENT_DEFINITIONS: EntitlementDefinitionSeed[] = [
  {
    code: 'max_products',
    name: 'Maximum products',
    description: 'Maximum number of non-deleted products a seller may create.',
    valueType: EntitlementValueType.INTEGER,
    defaultValue: 10,
    category: 'catalog',
  },
  {
    code: 'max_images_per_product',
    name: 'Maximum images per product',
    description: 'Maximum number of images allowed on a single product.',
    valueType: EntitlementValueType.INTEGER,
    defaultValue: 5,
    category: 'catalog',
  },
  {
    code: 'max_variants_per_product',
    name: 'Maximum variants per product',
    description: 'Maximum number of variants allowed on a single product.',
    valueType: EntitlementValueType.INTEGER,
    defaultValue: 20,
    category: 'catalog',
  },
  {
    code: 'view_buyer_info',
    name: 'View buyer information',
    description: 'Allows sellers to view buyer details exposed by eligible flows.',
    valueType: EntitlementValueType.BOOLEAN,
    defaultValue: false,
    category: 'visibility',
  },
  {
    code: 'view_seller_info',
    name: 'View seller information',
    description: 'Allows buyers to view enhanced seller details.',
    valueType: EntitlementValueType.BOOLEAN,
    defaultValue: false,
    category: 'visibility',
  },
  {
    code: 'product_priority',
    name: 'Product priority',
    description: 'Search/display priority hint for product listings.',
    valueType: EntitlementValueType.ENUM,
    defaultValue: 'standard',
    category: 'catalog',
  },
  {
    code: 'can_view_market_rfqs',
    name: 'Can view Market RFQs',
    description: 'Allows eligible verified sellers to view Market RFQs.',
    valueType: EntitlementValueType.BOOLEAN,
    defaultValue: true,
    category: 'rfq',
  },
  {
    code: 'max_market_rfq_responses',
    name: 'Maximum Market RFQ responses',
    description: 'Maximum Market RFQ quote responses per subscription period.',
    valueType: EntitlementValueType.INTEGER,
    defaultValue: 5,
    category: 'rfq',
  },
  {
    code: 'market_rfq_priority',
    name: 'Market RFQ priority',
    description: 'Priority hint for Market RFQ exposure and ordering.',
    valueType: EntitlementValueType.ENUM,
    defaultValue: 'standard',
    category: 'rfq',
  },
  {
    code: 'featured_product_eligibility',
    name: 'Featured product eligibility',
    description: 'Allows sellers to mark products as eligible for featured placement.',
    valueType: EntitlementValueType.BOOLEAN,
    defaultValue: false,
    category: 'promotion',
  },
  {
    code: 'max_featured_products',
    name: 'Maximum featured products',
    description: 'Maximum number of products eligible for featured placement.',
    valueType: EntitlementValueType.INTEGER,
    defaultValue: 0,
    category: 'promotion',
  },
  {
    code: 'featured_store_eligibility',
    name: 'Featured store eligibility',
    description: 'Allows seller storefronts to be eligible for featured placement.',
    valueType: EntitlementValueType.BOOLEAN,
    defaultValue: false,
    category: 'promotion',
  },
  {
    code: 'store_priority',
    name: 'Store priority',
    description: 'Search/display priority hint for seller storefronts.',
    valueType: EntitlementValueType.ENUM,
    defaultValue: 'standard',
    category: 'promotion',
  },
  {
    code: 'analytics_access',
    name: 'Analytics access',
    description: 'Allows access to subscription-gated analytics surfaces.',
    valueType: EntitlementValueType.BOOLEAN,
    defaultValue: false,
    category: 'analytics',
  },
  {
    code: 'analytics_level',
    name: 'Analytics level',
    description: 'Analytics depth available to the subscriber.',
    valueType: EntitlementValueType.ENUM,
    defaultValue: 'basic',
    category: 'analytics',
  },
  {
    code: 'report_export',
    name: 'Report export',
    description: 'Allows export of eligible reports.',
    valueType: EntitlementValueType.BOOLEAN,
    defaultValue: false,
    category: 'analytics',
  },
  {
    code: 'support_level',
    name: 'Support level',
    description: 'Support tier available to the subscriber.',
    valueType: EntitlementValueType.ENUM,
    defaultValue: 'standard',
    category: 'support',
  },
  {
    code: 'message_center_access',
    name: 'Message Center access',
    description: 'Allows access to create and use Message Center conversations.',
    valueType: EntitlementValueType.BOOLEAN,
    defaultValue: true,
    category: 'messages',
  },
  {
    code: 'max_new_conversations_per_month',
    name: 'Maximum new conversations per month',
    description: 'Maximum new Message Center conversations a user may initiate in a subscription period.',
    valueType: EntitlementValueType.INTEGER,
    defaultValue: null,
    category: 'messages',
  },
  {
    code: 'attachment_access',
    name: 'Message attachment access',
    description: 'Allows sending files and images through Message Center.',
    valueType: EntitlementValueType.BOOLEAN,
    defaultValue: true,
    category: 'messages',
  },
  {
    code: 'transaction_fee_percentage',
    name: 'Transaction fee percentage',
    description: 'Seller transaction fee percentage applied to product subtotal only.',
    valueType: EntitlementValueType.DECIMAL,
    defaultValue: 0,
    category: 'payments',
  },
];

let paymentEventHandlersRegistered = false;

export function registerSubscriptionPaymentEventHandlers(
  fastify?: FastifyInstance,
): void {
  if (paymentEventHandlersRegistered) return;
  paymentEventHandlersRegistered = true;

  const subscriptionService = new SubscriptionService(fastify);
  onPaymentEvent('PAYMENT_CONFIRMED', async (payload) => {
    if (payload.sourceType !== 'subscription') return;
    await subscriptionService.activateSubscriptionFromPaymentId(payload.paymentId);
  });

  onPaymentEvent('PAYMENT_EXPIRED', async (payload) => {
    if (payload.sourceType !== 'subscription') return;
    await subscriptionService.cancelPendingSubscriptionFromPaymentId(payload.paymentId);
  });
}

export class SubscriptionService {
  private planRepo = AppDataSource.getRepository(SubscriptionPlan);
  private entitlementDefinitionRepo = AppDataSource.getRepository(EntitlementDefinition);
  private subscriptionRepo = AppDataSource.getRepository(UserSubscription);
  private auditRepo = AppDataSource.getRepository(SubscriptionAuditEvent);
  private userRepo = AppDataSource.getRepository(User);
  private paymentRepo = AppDataSource.getRepository(Payment);
  private productRepo = AppDataSource.getRepository(Product);
  private marketRfqQuoteRepo = AppDataSource.getRepository(MarketRFQQuote);
  private i18nService = new I18nService();

  constructor(private readonly fastify?: FastifyInstance) {}

  async createPlan(
    adminId: string,
    dto: SubscriptionPlanCreateDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const definitions = await this.ensureDefaultEntitlementDefinitions();
    this.validatePlanPayload(dto, definitions);
    const sourceLanguage = normalizeLanguageCode(dto.sourceLanguage);
    await this.i18nService.ensureSelectableLanguage(sourceLanguage);
    const name = toTranslationMap(dto.name as string | TranslationMap, sourceLanguage);
    const description = dto.description
      ? toTranslationMap(dto.description as string | TranslationMap, sourceLanguage)
      : null;

    let planId = '';
    await AppDataSource.transaction(async (manager) => {
      if (dto.isDefault) {
        await this.clearDefaultPlans(manager, dto.audience as SubscriptionPlanAudience);
      }

      const plan = await manager.save(
        SubscriptionPlan,
        manager.create(SubscriptionPlan, {
          name,
          description,
          sourceLanguage,
          audience: dto.audience as SubscriptionPlanAudience,
          status: dto.status as SubscriptionPlanStatus,
          isFree: dto.isFree,
          isDefault: dto.isDefault,
          displayOrder: dto.displayOrder,
          createdBy: adminId,
        }),
      );
      planId = plan.id;

      await manager.save(
        SubscriptionPlanPrice,
        dto.prices.map((price) =>
          manager.create(SubscriptionPlanPrice, {
            planId: plan.id,
            currency: price.currency,
            amount: roundMoney(price.amount),
            billingPeriod: price.billingPeriod as SubscriptionBillingPeriod,
            status: price.status as SubscriptionPriceStatus,
          }),
        ),
      );

      await this.savePlanEntitlements(manager, plan.id, dto.entitlements);
      await this.i18nService.trackEntityTranslations(
        {
          entityType: TranslatableEntityType.SUBSCRIPTION_PLAN,
          entityId: plan.id,
          sourceLanguage,
          fields: {
            name,
            description,
          },
        },
        manager,
      );
      await this.recordAudit(manager, {
        eventType: 'SUBSCRIPTION_PLAN_CREATED',
        actorType: SubscriptionAuditActorType.ADMIN,
        actorId: adminId,
        planId: plan.id,
        metadata: {
          status: dto.status,
          audience: dto.audience,
          isFree: dto.isFree,
          isDefault: dto.isDefault,
        },
      });
    });

    const plan = await this.requirePlan(planId);
    this.emit('SUBSCRIPTION_PLAN_CREATED', null, { planId: plan.id });

    return {
      success: true,
      message: 'Subscription plan created successfully.',
      data: serializePlan(plan, 'en', true),
    };
  }

  async updatePlan(
    adminId: string,
    planId: string,
    dto: SubscriptionPlanUpdateDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const definitions = await this.ensureDefaultEntitlementDefinitions();
    const existing = await this.requirePlan(planId);
    const plannedState = {
      isFree: dto.isFree ?? existing.isFree,
      prices: dto.prices ?? (existing.prices ?? []).map((price) => ({
        currency: price.currency,
        amount: toNumber(price.amount),
        billingPeriod: price.billingPeriod,
        status: price.status,
      })),
      entitlements: dto.entitlements ?? entitlementRecord(existing.entitlements ?? []),
    };
    this.validatePlanPayload(plannedState, definitions);
    const sourceLanguage = normalizeLanguageCode(
      dto.sourceLanguage ?? existing.sourceLanguage,
    );
    await this.i18nService.ensureSelectableLanguage(sourceLanguage);
    const name =
      dto.name !== undefined
        ? mergeTranslationInput(existing.name, dto.name as string | TranslationMap, sourceLanguage)
        : existing.name;
    const description =
      dto.description !== undefined
        ? dto.description
          ? mergeTranslationInput(
              existing.description,
              dto.description as string | TranslationMap,
              sourceLanguage,
            )
          : null
        : existing.description;

    const previousFee = this.resolvePlanEntitlement(
      existing,
      definitions,
      'transaction_fee_percentage',
    );

    await AppDataSource.transaction(async (manager) => {
      if (dto.isDefault === true) {
        await this.clearDefaultPlans(
          manager,
          (dto.audience ?? existing.audience) as SubscriptionPlanAudience,
          planId,
        );
      }

      await manager.update(SubscriptionPlan, planId, {
        ...(dto.name !== undefined ? { name } : {}),
        ...(dto.description !== undefined ? { description } : {}),
        ...(dto.sourceLanguage !== undefined ? { sourceLanguage } : {}),
        ...(dto.audience !== undefined
          ? { audience: dto.audience as SubscriptionPlanAudience }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status as SubscriptionPlanStatus } : {}),
        ...(dto.isFree !== undefined ? { isFree: dto.isFree } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
      });

      if (dto.prices) {
        await manager.delete(SubscriptionPlanPrice, { planId });
        await manager.save(
          SubscriptionPlanPrice,
          dto.prices.map((price) =>
            manager.create(SubscriptionPlanPrice, {
              planId,
              currency: price.currency,
              amount: roundMoney(price.amount),
              billingPeriod: price.billingPeriod as SubscriptionBillingPeriod,
              status: price.status as SubscriptionPriceStatus,
            }),
          ),
        );
      }

      if (dto.entitlements) {
        await this.savePlanEntitlements(manager, planId, dto.entitlements, true);
      }

      if (
        dto.name !== undefined ||
        dto.description !== undefined ||
        dto.sourceLanguage !== undefined
      ) {
        await this.i18nService.trackEntityTranslations(
          {
            entityType: TranslatableEntityType.SUBSCRIPTION_PLAN,
            entityId: planId,
            sourceLanguage,
            markNonSourceStale: true,
            fields: {
              name,
              description,
            },
          },
          manager,
        );
      }

      const metadata: Record<string, unknown> = {
        updatedFields: Object.keys(dto),
      };
      if (
        dto.entitlements &&
        Object.prototype.hasOwnProperty.call(dto.entitlements, 'transaction_fee_percentage')
      ) {
        metadata.transactionFeePercentage = {
          previous: previousFee,
          current: dto.entitlements.transaction_fee_percentage,
        };
      }

      await this.recordAudit(manager, {
        eventType: 'SUBSCRIPTION_PLAN_UPDATED',
        actorType: SubscriptionAuditActorType.ADMIN,
        actorId: adminId,
        planId,
        metadata,
      });
    });

    const updated = await this.requirePlan(planId);
    this.emit('SUBSCRIPTION_PLAN_UPDATED', null, { planId });

    return {
      success: true,
      message: 'Subscription plan updated successfully.',
      data: serializePlan(updated, 'en', true),
    };
  }

  async updatePlanStatus(
    adminId: string,
    planId: string,
    dto: SubscriptionPlanStatusUpdateDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const plan = await this.requirePlan(planId);
    const nextStatus = dto.status as SubscriptionPlanStatus;
    if (plan.status === nextStatus) {
      return {
        success: true,
        message: 'Subscription plan status updated successfully.',
        data: serializePlan(plan, 'en', true),
      };
    }

    if (nextStatus === SubscriptionPlanStatus.ACTIVE) {
      const definitions = await this.ensureDefaultEntitlementDefinitions();
      this.validatePlanPayload(
        {
          isFree: plan.isFree,
          prices: (plan.prices ?? []).map((price) => ({
            currency: price.currency,
            amount: toNumber(price.amount),
            billingPeriod: price.billingPeriod,
            status: price.status,
          })),
          entitlements: entitlementRecord(plan.entitlements ?? []),
        },
        definitions,
      );
    }

    await this.planRepo.update(plan.id, { status: nextStatus });
    await this.recordAudit(null, {
      eventType:
        nextStatus === SubscriptionPlanStatus.ACTIVE
          ? 'SUBSCRIPTION_PLAN_ACTIVATED'
          : 'SUBSCRIPTION_PLAN_DEACTIVATED',
      actorType: SubscriptionAuditActorType.ADMIN,
      actorId: adminId,
      planId: plan.id,
      metadata: { previousStatus: plan.status, currentStatus: nextStatus },
    });

    const updated = await this.requirePlan(plan.id);
    this.emit(
      nextStatus === SubscriptionPlanStatus.ACTIVE
        ? 'SUBSCRIPTION_PLAN_ACTIVATED'
        : 'SUBSCRIPTION_PLAN_DEACTIVATED',
      null,
      { planId: plan.id },
    );

    return {
      success: true,
      message: 'Subscription plan status updated successfully.',
      data: serializePlan(updated, 'en', true),
    };
  }

  async listAdminPlans(
    query: SubscriptionPlanQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[]; pagination: Record<string, number> }> {
    await this.ensureDefaultEntitlementDefinitions();
    const qb = this.planListQuery();
    this.applyPlanFilters(qb, query, false);
    const [plans, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      success: true,
      data: plans.map((plan) => serializePlan(plan, 'en', true)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async listPublicPlans(
    query: PublicSubscriptionPlanQueryDto,
    language = 'en',
  ): Promise<{ success: true; data: Record<string, unknown>[]; pagination: Record<string, number> }> {
    await this.ensureDefaultEntitlementDefinitions();
    const qb = this.planListQuery()
      .where('plan.status = :status', { status: SubscriptionPlanStatus.ACTIVE });
    this.applyPlanFilters(qb, query, true);
    const [plans, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      success: true,
      data: plans.map((plan) => serializePlan(plan, language, false)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async getAdminPlanById(
    planId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    await this.ensureDefaultEntitlementDefinitions();
    return { success: true, data: serializePlan(await this.requirePlan(planId), 'en', true) };
  }

  async getPublicPlanById(
    planId: string,
    language = 'en',
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    await this.ensureDefaultEntitlementDefinitions();
    const plan = await this.requirePlan(planId);
    if (plan.status !== SubscriptionPlanStatus.ACTIVE) {
      throw createError.notFound('Subscription plan not found');
    }
    return { success: true, data: serializePlan(plan, language, false) };
  }

  async subscribe(
    userId: string,
    dto: SubscribeDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const user = await this.requireUser(userId);
    const plan = await this.requireActivePlan(dto.planId);
    this.assertPlanAudience(plan, user);
    const price = this.selectPrice(plan, dto.priceId);

    if (isZeroPrice(price)) {
      const subscription = await this.activateImmediateSubscription(
        user,
        plan,
        price,
        UserSubscriptionAction.FREE_ASSIGNMENT,
        SubscriptionAuditActorType.USER,
        user.id,
      );
      this.sendFreeActivationEmail(subscription);
      return {
        success: true,
        message: 'Subscription activated successfully.',
        data: {
          subscription: serializeSubscription(subscription, user.selectedLanguage),
          payment: null,
        },
      };
    }

    if (!dto.paymentMethod) {
      throw createError.badRequest('paymentMethod is required for paid subscription plans');
    }

    const current = await this.getCurrentSubscriptionEntity(user.id, false);
    const pending = await this.createPendingSubscription(
      user,
      plan,
      price,
      current ? UserSubscriptionAction.PURCHASE : UserSubscriptionAction.PURCHASE,
      current?.id ?? null,
      dto.paymentMethod,
    );

    return {
      success: true,
      message: 'Subscription payment initialized successfully.',
      data: pending,
    };
  }

  async getCurrentSubscription(
    userId: string,
    language = 'en',
  ): Promise<{ success: true; data: Record<string, unknown> | null }> {
    const subscription = await this.getCurrentSubscriptionEntity(userId, true);
    return {
      success: true,
      data: subscription ? serializeSubscription(subscription, language) : null,
    };
  }

  async renewSubscription(
    userId: string,
    subscriptionId: string,
    dto: RenewSubscriptionDto,
    language = 'en',
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const subscription = await this.requireUserSubscription(subscriptionId, userId);
    if (
      subscription.status !== UserSubscriptionStatus.ACTIVE &&
      subscription.status !== UserSubscriptionStatus.EXPIRED
    ) {
      throw createError.conflict('Only active or expired subscriptions can be renewed');
    }
    if (!subscription.plan || subscription.plan.status !== SubscriptionPlanStatus.ACTIVE) {
      throw createError.conflict('This subscription plan is not available for renewal');
    }

    const price = this.selectPrice(subscription.plan, dto.priceId, subscription.billingPeriod);
    if (isZeroPrice(price)) {
      const updated = await this.activateImmediateSubscription(
        subscription.user,
        subscription.plan,
        price,
        UserSubscriptionAction.FREE_ASSIGNMENT,
        SubscriptionAuditActorType.USER,
        userId,
      );
      return {
        success: true,
        message: 'Subscription renewed successfully.',
        data: {
          subscription: serializeSubscription(updated, language),
          payment: null,
        },
      };
    }

    if (!dto.paymentMethod) {
      throw createError.badRequest('paymentMethod is required to renew a paid subscription');
    }

    const pending = await this.createPendingSubscription(
      subscription.user,
      subscription.plan,
      price,
      UserSubscriptionAction.RENEWAL,
      subscription.id,
      dto.paymentMethod,
    );

    return {
      success: true,
      message: 'Subscription renewal payment initialized successfully.',
      data: pending,
    };
  }

  async updateAutoRenew(
    userId: string,
    subscriptionId: string,
    dto: SubscriptionAutoRenewDto,
    language = 'en',
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const subscription = await this.requireUserSubscription(subscriptionId, userId);
    if (subscription.status !== UserSubscriptionStatus.ACTIVE) {
      throw createError.conflict('Only active subscriptions can update auto-renew');
    }

    await this.subscriptionRepo.update(subscription.id, {
      autoRenew: dto.autoRenew,
    });
    await this.recordAudit(null, {
      eventType: 'SUBSCRIPTION_AUTO_RENEW_UPDATED',
      actorType: SubscriptionAuditActorType.USER,
      actorId: userId,
      targetUserId: userId,
      planId: subscription.planId,
      subscriptionId: subscription.id,
      metadata: { autoRenew: dto.autoRenew },
    });

    const updated = await this.requireUserSubscription(subscription.id, userId);
    this.emit('SUBSCRIPTION_AUTO_RENEW_UPDATED', updated, { autoRenew: dto.autoRenew });

    return {
      success: true,
      message: 'Auto-renew setting updated successfully.',
      data: serializeSubscription(updated, language),
    };
  }

  async listSubscriptionHistory(
    userId: string,
    query: SubscriptionHistoryQueryDto,
    language = 'en',
  ): Promise<{ success: true; data: Record<string, unknown>[]; pagination: Record<string, number> }> {
    await this.expireElapsedSubscriptions(userId);
    const qb = this.subscriptionListQuery()
      .where('subscription.userId = :userId', { userId });
    if (query.status) {
      qb.andWhere('subscription.status = :status', { status: query.status });
    }
    const [subscriptions, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      success: true,
      data: subscriptions.map((subscription) =>
        serializeSubscription(subscription, language),
      ),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async listAdminSubscriptions(
    query: AdminSubscriptionQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[]; pagination: Record<string, number> }> {
    await this.expireElapsedSubscriptions();
    const qb = this.subscriptionListQuery();
    if (query.status) qb.andWhere('subscription.status = :status', { status: query.status });
    if (query.userId) qb.andWhere('subscription.userId = :userId', { userId: query.userId });
    if (query.planId) qb.andWhere('subscription.planId = :planId', { planId: query.planId });

    const [subscriptions, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      success: true,
      data: subscriptions.map((subscription) =>
        serializeSubscription(subscription, 'en', true),
      ),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async getAdminSubscriptionById(
    subscriptionId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const subscription = await this.subscriptionListQuery()
      .where('subscription.id = :subscriptionId', { subscriptionId })
      .getOne();
    if (!subscription) throw createError.notFound('Subscription not found');
    return { success: true, data: serializeSubscription(subscription, 'en', true) };
  }

  async assignDefaultSubscription(
    userId: string,
    actorAdminId: string | null = null,
  ): Promise<UserSubscription | null> {
    const user = await this.requireUser(userId);
    const existing = await this.getCurrentSubscriptionEntity(user.id, false);
    if (existing) return existing;

    const plan = await this.findDefaultFreePlanForUser(user);
    if (!plan) return null;
    const price = this.selectPrice(plan);
    const subscription = await this.activateImmediateSubscription(
      user,
      plan,
      price,
      UserSubscriptionAction.FREE_ASSIGNMENT,
      actorAdminId ? SubscriptionAuditActorType.ADMIN : SubscriptionAuditActorType.SYSTEM,
      actorAdminId,
    );
    this.sendFreeActivationEmail(subscription);
    return subscription;
  }

  async activateSubscriptionFromPaymentId(paymentId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['payer'],
    });
    if (!payment || payment.sourceType !== 'subscription') return;
    if (payment.status !== PaymentStatus.CONFIRMED) return;

    const subscription = await this.subscriptionListQuery()
      .where('subscription.id = :subscriptionId', { subscriptionId: payment.sourceId })
      .getOne();
    if (!subscription) throw createError.notFound('Subscription source not found');
    if (subscription.status === UserSubscriptionStatus.ACTIVE) return;
    if (subscription.status !== UserSubscriptionStatus.PENDING) {
      throw createError.conflict('Subscription source is not pending activation');
    }
    if (subscription.userId !== payment.payerId) {
      throw createError.conflict('Payment payer does not match subscription owner');
    }

    const previous = await this.getCurrentSubscriptionEntity(subscription.userId, false);
    const startedAt = payment.paidAt ?? new Date();
    const expiresAt = this.calculateExpiry(startedAt, subscription.billingPeriod);
    const action = this.subscriptionAction(subscription);
    let activated: UserSubscription | null = null;

    await AppDataSource.transaction(async (manager) => {
      await manager.update(
        UserSubscription,
        {
          userId: subscription.userId,
          status: UserSubscriptionStatus.ACTIVE,
        },
        {
          status: UserSubscriptionStatus.CANCELLED,
          metadata: {
            supersededBySubscriptionId: subscription.id,
            supersededAt: startedAt.toISOString(),
          },
        },
      );

      await manager.update(UserSubscription, subscription.id, {
        status: UserSubscriptionStatus.ACTIVE,
        startedAt,
        expiresAt,
        paymentId: payment.id,
      });

      activated = await manager.findOne(UserSubscription, {
        where: { id: subscription.id },
        relations: ['user', 'plan', 'plan.prices', 'plan.entitlements', 'payment'],
      });

      await this.recordAudit(manager, {
        eventType: eventForSubscriptionActivation(action, Boolean(previous)),
        actorType: SubscriptionAuditActorType.SYSTEM,
        actorId: null,
        targetUserId: subscription.userId,
        planId: subscription.planId,
        subscriptionId: subscription.id,
        metadata: {
          paymentId: payment.id,
          previousSubscriptionId: previous?.id ?? null,
          previousPlanId: previous?.planId ?? null,
        },
      });
    });

    const activatedSubscription = activated as UserSubscription | null;
    if (!activatedSubscription) return;
    this.emit(eventForSubscriptionActivation(action, Boolean(previous)), activatedSubscription, {
      paymentId: payment.id,
      previousSubscriptionId: previous?.id ?? null,
    });

    if (action === UserSubscriptionAction.RENEWAL) {
      this.sendActivationEmail(activatedSubscription);
    } else if (previous) {
      this.sendUpgradeEmail(
        activatedSubscription,
        previous.plan
          ? planNameForEmail(previous.plan, activatedSubscription.user?.selectedLanguage)
          : null,
      );
    } else {
      this.sendActivationEmail(activatedSubscription);
    }
  }

  async cancelPendingSubscriptionFromPaymentId(paymentId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment || payment.sourceType !== 'subscription') return;

    const subscription = await this.subscriptionRepo.findOne({
      where: { id: payment.sourceId },
      relations: ['user', 'plan'],
    });
    if (!subscription || subscription.status !== UserSubscriptionStatus.PENDING) return;

    await this.subscriptionRepo.update(subscription.id, {
      status: UserSubscriptionStatus.CANCELLED,
      metadata: {
        ...(subscription.metadata ?? {}),
        cancellationReason: 'payment_expired',
        paymentId,
      },
    });
    await this.recordAudit(null, {
      eventType: 'SUBSCRIPTION_CANCELLED',
      actorType: SubscriptionAuditActorType.SYSTEM,
      actorId: null,
      targetUserId: subscription.userId,
      planId: subscription.planId,
      subscriptionId: subscription.id,
      metadata: { reason: 'payment_expired', paymentId },
    });
    this.emit('SUBSCRIPTION_CANCELLED', subscription, { reason: 'payment_expired' });
  }

  async getEffectiveEntitlements(
    userId: string,
  ): Promise<Record<string, EntitlementPrimitive>> {
    const definitions = await this.ensureDefaultEntitlementDefinitions();
    const subscription = await this.getCurrentSubscriptionEntity(userId, true);
    const entitlements = new Map<string, EntitlementPrimitive>(
      definitions.map((definition) => [
        definition.code,
        normalizeEntitlementPrimitive(definition.defaultValue),
      ]),
    );

    for (const entitlement of subscription?.plan?.entitlements ?? []) {
      entitlements.set(
        entitlement.entitlementCode,
        normalizeEntitlementPrimitive(entitlement.value),
      );
    }

    return Object.fromEntries(entitlements.entries());
  }

  async getEffectiveEntitlement(
    userId: string,
    code: string,
  ): Promise<EntitlementPrimitive> {
    const entitlements = await this.getEffectiveEntitlements(userId);
    return Object.prototype.hasOwnProperty.call(entitlements, code)
      ? entitlements[code]
      : null;
  }

  async assertProductCreationAllowed(sellerId: string): Promise<void> {
    const maxProducts = limitFromEntitlement(
      await this.getEffectiveEntitlement(sellerId, 'max_products'),
    );
    if (maxProducts === null) return;

    const productCount = await this.productRepo
      .createQueryBuilder('product')
      .where('product.sellerId = :sellerId', { sellerId })
      .andWhere('product.status != :deleted', { deleted: ProductStatus.DELETED })
      .andWhere('product.deletedAt IS NULL')
      .getCount();

    if (productCount >= maxProducts) {
      throw createError.forbidden(
        `Your subscription allows up to ${maxProducts} products.`,
        'PRODUCT_LIMIT_REACHED',
      );
    }
  }

  async assertProductConfigurationAllowed(
    sellerId: string,
    imageCount: number,
    variantCount: number,
  ): Promise<void> {
    const maxImages = limitFromEntitlement(
      await this.getEffectiveEntitlement(sellerId, 'max_images_per_product'),
    );
    if (maxImages !== null && imageCount > maxImages) {
      throw createError.forbidden(
        `Your subscription allows up to ${maxImages} images per product.`,
        'PRODUCT_IMAGE_LIMIT_REACHED',
      );
    }

    const maxVariants = limitFromEntitlement(
      await this.getEffectiveEntitlement(sellerId, 'max_variants_per_product'),
    );
    if (maxVariants !== null && variantCount > maxVariants) {
      throw createError.forbidden(
        `Your subscription allows up to ${maxVariants} variants per product.`,
        'PRODUCT_VARIANT_LIMIT_REACHED',
      );
    }
  }

  async assertMarketRfqAccess(sellerId: string): Promise<void> {
    const canView = booleanFromEntitlement(
      await this.getEffectiveEntitlement(sellerId, 'can_view_market_rfqs'),
    );
    if (!canView) {
      throw createError.forbidden(
        'Your subscription does not include Market RFQ access.',
        'MARKET_RFQ_ACCESS_DENIED',
      );
    }
  }

  async assertMarketRfqResponseAllowed(sellerId: string): Promise<void> {
    const maxResponses = limitFromEntitlement(
      await this.getEffectiveEntitlement(sellerId, 'max_market_rfq_responses'),
    );
    if (maxResponses === null) return;

    const subscription = await this.getCurrentSubscriptionEntity(sellerId, true);
    const qb = this.marketRfqQuoteRepo
      .createQueryBuilder('quote')
      .where('quote.sellerId = :sellerId', { sellerId });

    if (subscription?.startedAt) {
      qb.andWhere('quote.createdAt >= :startedAt', { startedAt: subscription.startedAt });
    }
    if (subscription?.expiresAt) {
      qb.andWhere('quote.createdAt < :expiresAt', { expiresAt: subscription.expiresAt });
    }

    const responseCount = await qb.getCount();
    if (responseCount >= maxResponses) {
      throw createError.forbidden(
        `Your subscription allows up to ${maxResponses} Market RFQ responses for this period.`,
        'MARKET_RFQ_RESPONSE_LIMIT_REACHED',
      );
    }
  }

  async calculateTransactionFeeSnapshot(
    sellerId: string,
    feeBaseAmount: number,
  ): Promise<SubscriptionFeeSnapshot> {
    const subscription = await this.getCurrentSubscriptionEntity(sellerId, false);
    const definitions = await this.ensureDefaultEntitlementDefinitions();
    const rawFee = subscription
      ? this.resolvePlanEntitlementFromDefinitions(
          subscription.plan,
          definitions,
          'transaction_fee_percentage',
        )
      : normalizeEntitlementPrimitive(
          definitions.find((definition) => definition.code === 'transaction_fee_percentage')
            ?.defaultValue ?? 0,
        );
    const percentage = clampPercentage(numberFromEntitlement(rawFee));
    const base = roundMoney(feeBaseAmount);
    const fee = roundMoney((base * percentage) / 100);

    return {
      subscriptionId: subscription?.id ?? null,
      subscriptionPlanId: subscription?.planId ?? null,
      transactionFeePercentage: percentage,
      feeBaseAmount: base,
      transactionFeeAmount: fee,
      sellerNetProductAmount: roundMoney(base - fee),
    };
  }

  async sendExpiryReminders(): Promise<void> {
    const reminderDays = config.subscription.expiryReminderDays;
    if (reminderDays.length === 0) return;

    const now = new Date();
    for (const days of reminderDays) {
      const from = new Date(now);
      from.setDate(from.getDate() + days);
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);

      const subscriptions = await this.subscriptionRepo
        .createQueryBuilder('subscription')
        .leftJoinAndSelect('subscription.user', 'user')
        .leftJoinAndSelect('subscription.plan', 'plan')
        .where('subscription.status = :status', { status: UserSubscriptionStatus.ACTIVE })
        .andWhere('subscription.expiresAt >= :from', { from })
        .andWhere('subscription.expiresAt < :to', { to })
        .getMany();

      for (const subscription of subscriptions) {
        sendSubscriptionExpiryReminderEmail(
          subscription.user.email,
          subscription.user.firstName,
          {
            planName: planNameForEmail(subscription.plan, subscription.user.selectedLanguage),
            billingPeriod: subscription.billingPeriod,
            amount: toNumber(subscription.pricePaid),
            currency: subscription.currency,
            startedAt: subscription.startedAt,
            expiresAt: subscription.expiresAt,
            daysRemaining: days,
          },
        ).catch((err) =>
          console.error('[SubscriptionService] Expiry reminder email failed:', err),
        );
      }
    }
  }

  private async createPendingSubscription(
    user: User,
    plan: SubscriptionPlan,
    price: SubscriptionPlanPrice,
    action: UserSubscriptionAction,
    previousSubscriptionId: string | null,
    paymentMethod: string,
  ): Promise<Record<string, unknown>> {
    const pending = await this.subscriptionRepo.save(
      this.subscriptionRepo.create({
        userId: user.id,
        planId: plan.id,
        status: UserSubscriptionStatus.PENDING,
        billingPeriod: price.billingPeriod,
        currency: price.currency,
        pricePaid: roundMoney(price.amount),
        startedAt: null,
        expiresAt: addHours(config.subscription.paymentExpiryHours),
        autoRenew: true,
        metadata: {
          action,
          priceId: price.id,
          previousSubscriptionId,
        },
      }),
    );

    try {
      const paymentResult = await new PaymentService(this.fastify).createPayment(user.id, {
        sourceType: 'subscription',
        sourceId: pending.id,
        paymentMethod: paymentMethod as SubscriptionPaymentMethod,
      });

      const paymentId = String(paymentResult.data.paymentId);
      await this.subscriptionRepo.update(pending.id, { paymentId });
      await this.recordAudit(null, {
        eventType: 'SUBSCRIPTION_PAYMENT_CREATED',
        actorType: SubscriptionAuditActorType.USER,
        actorId: user.id,
        targetUserId: user.id,
        planId: plan.id,
        subscriptionId: pending.id,
        metadata: { paymentId, action },
      });

      const updated = await this.requireUserSubscription(pending.id, user.id);
      return {
        subscription: serializeSubscription(updated, user.selectedLanguage),
        payment: paymentResult.data,
      };
    } catch (err) {
      await this.subscriptionRepo.update(pending.id, {
        status: UserSubscriptionStatus.CANCELLED,
        metadata: {
          ...(pending.metadata ?? {}),
          cancellationReason: 'payment_initialization_failed',
        },
      });
      throw err;
    }
  }

  private async activateImmediateSubscription(
    user: User,
    plan: SubscriptionPlan,
    price: SubscriptionPlanPrice,
    action: UserSubscriptionAction,
    actorType: SubscriptionAuditActorType,
    actorId: string | null,
  ): Promise<UserSubscription> {
    let subscriptionId = '';
    await AppDataSource.transaction(async (manager) => {
      await manager.update(
        UserSubscription,
        { userId: user.id, status: UserSubscriptionStatus.ACTIVE },
        {
          status: UserSubscriptionStatus.CANCELLED,
          metadata: {
            supersededByPlanId: plan.id,
            supersededAt: new Date().toISOString(),
          },
        },
      );

      const now = new Date();
      const subscription = await manager.save(
        UserSubscription,
        manager.create(UserSubscription, {
          userId: user.id,
          planId: plan.id,
          status: UserSubscriptionStatus.ACTIVE,
          billingPeriod: price.billingPeriod,
          currency: price.currency,
          pricePaid: roundMoney(price.amount),
          startedAt: now,
          expiresAt: this.calculateExpiry(now, price.billingPeriod),
          autoRenew: false,
          paymentId: null,
          metadata: { action, priceId: price.id },
        }),
      );
      subscriptionId = subscription.id;

      await this.recordAudit(manager, {
        eventType:
          action === UserSubscriptionAction.FREE_ASSIGNMENT
            ? 'SUBSCRIPTION_ACTIVATED'
            : eventForSubscriptionActivation(action, false),
        actorType,
        actorId,
        targetUserId: user.id,
        planId: plan.id,
        subscriptionId: subscription.id,
        metadata: { free: isZeroPrice(price), action },
      });
    });

    const subscription = await this.requireUserSubscription(subscriptionId, user.id);
    this.emit('SUBSCRIPTION_ACTIVATED', subscription, { free: isZeroPrice(price), action });
    return subscription;
  }

  private async getCurrentSubscriptionEntity(
    userId: string,
    assignDefault: boolean,
  ): Promise<UserSubscription | null> {
    await this.expireElapsedSubscriptions(userId);
    const now = new Date();
    const current = await this.subscriptionListQuery()
      .where('subscription.userId = :userId', { userId })
      .andWhere('subscription.status = :status', { status: UserSubscriptionStatus.ACTIVE })
      .andWhere('(subscription.startedAt IS NULL OR subscription.startedAt <= :now)', { now })
      .andWhere('(subscription.expiresAt IS NULL OR subscription.expiresAt > :now)', { now })
      .orderBy('subscription.startedAt', 'DESC')
      .addOrderBy('subscription.createdAt', 'DESC')
      .getOne();

    if (current || !assignDefault) return current;
    return this.assignDefaultSubscription(userId, null);
  }

  private async expireElapsedSubscriptions(userId?: string): Promise<void> {
    const qb = this.subscriptionRepo
      .createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.user', 'user')
      .leftJoinAndSelect('subscription.plan', 'plan')
      .where('subscription.status = :status', { status: UserSubscriptionStatus.ACTIVE })
      .andWhere('subscription.expiresAt IS NOT NULL')
      .andWhere('subscription.expiresAt <= :now', { now: new Date() });

    if (userId) qb.andWhere('subscription.userId = :userId', { userId });
    const expired = await qb.getMany();
    for (const subscription of expired) {
      await this.subscriptionRepo.update(subscription.id, {
        status: UserSubscriptionStatus.EXPIRED,
      });
      await this.recordAudit(null, {
        eventType: 'SUBSCRIPTION_EXPIRED',
        actorType: SubscriptionAuditActorType.SYSTEM,
        actorId: null,
        targetUserId: subscription.userId,
        planId: subscription.planId,
        subscriptionId: subscription.id,
      });
      this.emit('SUBSCRIPTION_EXPIRED', subscription);
      sendSubscriptionExpiredEmail(
        subscription.user.email,
        subscription.user.firstName,
        {
          planName: planNameForEmail(subscription.plan, subscription.user.selectedLanguage),
          billingPeriod: subscription.billingPeriod,
          amount: toNumber(subscription.pricePaid),
          currency: subscription.currency,
          startedAt: subscription.startedAt,
          expiresAt: subscription.expiresAt,
        },
      ).catch((err) =>
        console.error('[SubscriptionService] Expiry email failed:', err),
      );
    }
  }

  private async ensureDefaultEntitlementDefinitions(): Promise<EntitlementDefinition[]> {
    const codes = DEFAULT_ENTITLEMENT_DEFINITIONS.map((definition) => definition.code);
    const existing = await this.entitlementDefinitionRepo.find({
      where: { code: In(codes) },
    });
    const existingCodes = new Set(existing.map((definition) => definition.code));
    const missing = DEFAULT_ENTITLEMENT_DEFINITIONS.filter(
      (definition) => !existingCodes.has(definition.code),
    );

    if (missing.length > 0) {
      await this.entitlementDefinitionRepo.save(
        missing.map((definition) =>
          this.entitlementDefinitionRepo.create({
            code: definition.code,
            name: definition.name,
            description: definition.description,
            valueType: definition.valueType,
            defaultValue: definition.defaultValue,
            category: definition.category,
            status: EntitlementStatus.ACTIVE,
          }),
        ),
      );
    }

    return this.entitlementDefinitionRepo.find({
      where: { code: In(codes), status: EntitlementStatus.ACTIVE },
    });
  }

  private validatePlanPayload(
    dto: {
      isFree: boolean;
      prices: Array<{
        currency: string;
        amount: number;
        billingPeriod: string;
        status: string;
      }>;
      entitlements: Record<string, EntitlementPrimitive>;
    },
    definitions: EntitlementDefinition[],
  ): void {
    const activePrices = dto.prices.filter((price) => price.status === SubscriptionPriceStatus.ACTIVE);
    if (activePrices.length === 0) {
      throw createError.badRequest('Subscription plans require at least one active price');
    }

    const priceKeys = new Set<string>();
    for (const price of dto.prices) {
      const key = `${price.currency}:${price.billingPeriod}`;
      if (priceKeys.has(key)) {
        throw createError.badRequest('Duplicate plan prices are not allowed for the same currency and billing period');
      }
      priceKeys.add(key);
      if (price.billingPeriod === SubscriptionBillingPeriod.FREE && price.amount !== 0) {
        throw createError.badRequest('Free billing period prices must have amount 0');
      }
    }

    if (dto.isFree) {
      const hasFreePrice = activePrices.some(
        (price) =>
          price.billingPeriod === SubscriptionBillingPeriod.FREE &&
          price.amount === 0,
      );
      if (!hasFreePrice) {
        throw createError.badRequest('Free subscription plans require an active free price');
      }
    } else {
      const hasPaidPrice = activePrices.some(
        (price) =>
          price.billingPeriod !== SubscriptionBillingPeriod.FREE &&
          price.amount > 0,
      );
      if (!hasPaidPrice) {
        throw createError.badRequest('Paid subscription plans require an active paid price');
      }
    }

    const definitionsByCode = new Map(definitions.map((definition) => [definition.code, definition]));
    for (const [code, value] of Object.entries(dto.entitlements)) {
      const definition = definitionsByCode.get(code);
      if (!definition) {
        throw createError.badRequest(`Unknown subscription entitlement code: ${code}`);
      }
      this.validateEntitlementValue(definition, value);
    }
  }

  private validateEntitlementValue(
    definition: EntitlementDefinition,
    value: EntitlementPrimitive,
  ): void {
    if (value === null) return;

    if (definition.valueType === EntitlementValueType.BOOLEAN && typeof value !== 'boolean') {
      throw createError.badRequest(`${definition.code} must be a boolean`);
    }
    if (
      definition.valueType === EntitlementValueType.INTEGER &&
      (!Number.isInteger(value) || typeof value !== 'number')
    ) {
      throw createError.badRequest(`${definition.code} must be an integer`);
    }
    if (
      definition.valueType === EntitlementValueType.DECIMAL &&
      typeof value !== 'number'
    ) {
      throw createError.badRequest(`${definition.code} must be a decimal number`);
    }
    if (
      (definition.valueType === EntitlementValueType.STRING ||
        definition.valueType === EntitlementValueType.ENUM) &&
      typeof value !== 'string'
    ) {
      throw createError.badRequest(`${definition.code} must be a string`);
    }

    if (definition.code === 'transaction_fee_percentage') {
      const fee = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
        throw createError.badRequest('transaction_fee_percentage must be between 0 and 100');
      }
    }
  }

  private async savePlanEntitlements(
    manager: EntityManager,
    planId: string,
    entitlements: Record<string, EntitlementPrimitive>,
    replaceProvidedOnly = false,
  ): Promise<void> {
    const entries = Object.entries(entitlements);
    if (entries.length === 0) return;

    if (replaceProvidedOnly) {
      await manager.delete(SubscriptionPlanEntitlement, {
        planId,
        entitlementCode: In(entries.map(([code]) => code)),
      });
    }

    await manager.save(
      SubscriptionPlanEntitlement,
      entries.map(([code, value]) =>
        manager.create(SubscriptionPlanEntitlement, {
          planId,
          entitlementCode: code,
          value,
        }),
      ),
    );
  }

  private async clearDefaultPlans(
    manager: EntityManager,
    audience: SubscriptionPlanAudience,
    exceptPlanId?: string,
  ): Promise<void> {
    const qb = manager
      .createQueryBuilder()
      .update(SubscriptionPlan)
      .set({ isDefault: false })
      .where('audience IN (:...audiences)', {
        audiences:
          audience === SubscriptionPlanAudience.ALL
            ? [
                SubscriptionPlanAudience.ALL,
                SubscriptionPlanAudience.SELLER,
                SubscriptionPlanAudience.BUYER,
              ]
            : [audience, SubscriptionPlanAudience.ALL],
      })
      .andWhere('isDefault = :isDefault', { isDefault: true });

    if (exceptPlanId) qb.andWhere('id != :exceptPlanId', { exceptPlanId });
    await qb.execute();
  }

  private async findDefaultFreePlanForUser(user: User): Promise<SubscriptionPlan | null> {
    await this.ensureDefaultEntitlementDefinitions();
    const audience = audienceForUser(user);
    const configured=await getSetting<string|null>('defaultFreePlanId');
    if(configured) {
      const selected=await this.planListQuery().where('plan.id=:id AND plan.status=:status AND plan.isFree=true',{id:configured,status:SubscriptionPlanStatus.ACTIVE}).andWhere('plan.audience IN (:...audiences)',{audiences:[audience,SubscriptionPlanAudience.ALL]}).getOne();
      if(selected)return selected;
    }
    return this.planListQuery()
      .where('plan.status = :status', { status: SubscriptionPlanStatus.ACTIVE })
      .andWhere('plan.isFree = :isFree', { isFree: true })
      .andWhere('plan.isDefault = :isDefault', { isDefault: true })
      .andWhere('plan.audience IN (:...audiences)', {
        audiences: [audience, SubscriptionPlanAudience.ALL],
      })
      .orderBy('plan.audience = :exactAudience', 'DESC')
      .addOrderBy('plan.displayOrder', 'ASC')
      .setParameter('exactAudience', audience)
      .getOne();
  }

  private selectPrice(
    plan: SubscriptionPlan,
    priceId?: string,
    preferredPeriod?: SubscriptionBillingPeriod,
  ): SubscriptionPlanPrice {
    const prices = (plan.prices ?? []).filter(
      (price) => price.status === SubscriptionPriceStatus.ACTIVE,
    );
    if (prices.length === 0) {
      throw createError.conflict('Subscription plan has no active prices');
    }

    if (priceId) {
      const selected = prices.find((price) => price.id === priceId);
      if (!selected) throw createError.badRequest('Selected subscription price is not active for this plan');
      return selected;
    }

    if (plan.isFree) {
      const selected = prices.find(isZeroPrice);
      if (!selected) throw createError.conflict('Free subscription plan has no active free price');
      return selected;
    }

    if (preferredPeriod) {
      const selected = prices.find(
        (price) =>
          price.billingPeriod === preferredPeriod &&
          price.billingPeriod !== SubscriptionBillingPeriod.FREE,
      );
      if (selected) return selected;
    }

    const paidPrices = prices.filter((price) => !isZeroPrice(price));
    if (paidPrices.length === 1) return paidPrices[0];
    throw createError.badRequest('priceId is required when a plan has multiple active paid prices');
  }

  private calculateExpiry(
    startedAt: Date,
    billingPeriod: SubscriptionBillingPeriod,
  ): Date | null {
    if (billingPeriod === SubscriptionBillingPeriod.FREE) return null;

    const expiresAt = new Date(startedAt);
    if (billingPeriod === SubscriptionBillingPeriod.MONTHLY) {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else if (billingPeriod === SubscriptionBillingPeriod.QUARTERLY) {
      expiresAt.setMonth(expiresAt.getMonth() + 3);
    } else if (billingPeriod === SubscriptionBillingPeriod.YEARLY) {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }
    return expiresAt;
  }

  private planListQuery(): SelectQueryBuilder<SubscriptionPlan> {
    return this.planRepo
      .createQueryBuilder('plan')
      .distinct(true)
      .leftJoinAndSelect('plan.prices', 'prices')
      .leftJoinAndSelect('plan.entitlements', 'entitlements')
      .orderBy('plan.displayOrder', 'ASC')
      .addOrderBy("JSON_UNQUOTE(JSON_EXTRACT(plan.name, '$.en'))", 'ASC')
      .addOrderBy('prices.amount', 'ASC');
  }

  private subscriptionListQuery(): SelectQueryBuilder<UserSubscription> {
    return this.subscriptionRepo
      .createQueryBuilder('subscription')
      .distinct(true)
      .leftJoinAndSelect('subscription.user', 'user')
      .leftJoinAndSelect('subscription.plan', 'plan')
      .leftJoinAndSelect('plan.prices', 'prices')
      .leftJoinAndSelect('plan.entitlements', 'entitlements')
      .leftJoinAndSelect('subscription.payment', 'payment')
      .orderBy('subscription.createdAt', 'DESC')
      .addOrderBy('prices.amount', 'ASC');
  }

  private applyPlanFilters(
    qb: SelectQueryBuilder<SubscriptionPlan>,
    query: Partial<SubscriptionPlanQueryDto & PublicSubscriptionPlanQueryDto>,
    publicOnly: boolean,
  ): void {
    if (!publicOnly && query.status) qb.andWhere('plan.status = :status', { status: query.status });
    if (query.audience) qb.andWhere('plan.audience = :audience', { audience: query.audience });
    if (query.isFree !== undefined) qb.andWhere('plan.isFree = :isFree', { isFree: query.isFree });
    if (!publicOnly && 'search' in query && query.search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('CAST(plan.name AS CHAR) LIKE :search', { search: `%${query.search}%` })
            .orWhere('CAST(plan.description AS CHAR) LIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }
  }

  private async requirePlan(planId: string): Promise<SubscriptionPlan> {
    const plan = await this.planListQuery()
      .where('plan.id = :planId', { planId })
      .getOne();
    if (!plan) throw createError.notFound('Subscription plan not found');
    return plan;
  }

  private async requireActivePlan(planId: string): Promise<SubscriptionPlan> {
    const plan = await this.requirePlan(planId);
    if (plan.status !== SubscriptionPlanStatus.ACTIVE) {
      throw createError.notFound('Subscription plan not found');
    }
    return plan;
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');
    return user;
  }

  private async requireUserSubscription(
    subscriptionId: string,
    userId: string,
  ): Promise<UserSubscription> {
    const subscription = await this.subscriptionListQuery()
      .where('subscription.id = :subscriptionId', { subscriptionId })
      .andWhere('subscription.userId = :userId', { userId })
      .getOne();
    if (!subscription) throw createError.notFound('Subscription not found');
    return subscription;
  }

  private assertPlanAudience(plan: SubscriptionPlan, user: User): void {
    const audience = audienceForUser(user);
    if (
      plan.audience !== SubscriptionPlanAudience.ALL &&
      plan.audience !== audience
    ) {
      throw createError.badRequest('Subscription plan is not available for this account type');
    }
  }

  private resolvePlanEntitlement(
    plan: SubscriptionPlan,
    definitions: EntitlementDefinition[],
    code: string,
  ): EntitlementPrimitive {
    return this.resolvePlanEntitlementFromDefinitions(plan, definitions, code);
  }

  private resolvePlanEntitlementFromDefinitions(
    plan: SubscriptionPlan,
    definitions: EntitlementDefinition[],
    code: string,
  ): EntitlementPrimitive {
    const configured = (plan.entitlements ?? []).find(
      (entitlement) => entitlement.entitlementCode === code,
    );
    if (configured) return normalizeEntitlementPrimitive(configured.value);
    const definition = definitions.find((item) => item.code === code);
    return definition ? normalizeEntitlementPrimitive(definition.defaultValue) : null;
  }

  private subscriptionAction(subscription: UserSubscription): UserSubscriptionAction {
    const action = subscription.metadata?.action;
    if (action === UserSubscriptionAction.RENEWAL) return UserSubscriptionAction.RENEWAL;
    if (action === UserSubscriptionAction.FREE_ASSIGNMENT) {
      return UserSubscriptionAction.FREE_ASSIGNMENT;
    }
    return UserSubscriptionAction.PURCHASE;
  }

  private async recordAudit(
    manager: EntityManager | null,
    input: {
      eventType: string;
      actorType: SubscriptionAuditActorType;
      actorId: string | null;
      targetUserId?: string | null;
      planId?: string | null;
      subscriptionId?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(SubscriptionAuditEvent)
      : this.auditRepo;
    await repo.save(
      repo.create({
        eventType: input.eventType,
        actorType: input.actorType,
        actorId: input.actorId,
        targetUserId: input.targetUserId ?? null,
        planId: input.planId ?? null,
        subscriptionId: input.subscriptionId ?? null,
        metadata: input.metadata ?? null,
      }),
    );
  }

  private emit(
    event: SubscriptionEventName,
    subscription: UserSubscription | null,
    metadata: Record<string, unknown> | null = null,
  ): void {
    emitSubscriptionEvent(event, subscription, metadata);
    this.fastify?.log.info(
      {
        event,
        subscriptionId: subscription?.id ?? null,
        userId: subscription?.userId ?? null,
        planId: subscription?.planId ?? metadata?.planId ?? null,
      },
      `[SubscriptionService] ${event}`,
    );
  }

  private sendFreeActivationEmail(subscription: UserSubscription): void {
    if (!subscription.user || !subscription.plan) return;
    sendFreeSubscriptionActivatedEmail(
      subscription.user.email,
      subscription.user.firstName,
      {
        planName: planNameForEmail(subscription.plan, subscription.user.selectedLanguage),
        billingPeriod: subscription.billingPeriod,
        amount: toNumber(subscription.pricePaid),
        currency: subscription.currency,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
      },
    ).catch((err) =>
      console.error('[SubscriptionService] Free activation email failed:', err),
    );
  }

  private sendActivationEmail(subscription: UserSubscription): void {
    if (!subscription.user || !subscription.plan) return;
    sendSubscriptionActivatedEmail(
      subscription.user.email,
      subscription.user.firstName,
      {
        planName: planNameForEmail(subscription.plan, subscription.user.selectedLanguage),
        billingPeriod: subscription.billingPeriod,
        amount: toNumber(subscription.pricePaid),
        currency: subscription.currency,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
      },
    ).catch((err) =>
      console.error('[SubscriptionService] Activation email failed:', err),
    );
  }

  private sendUpgradeEmail(
    subscription: UserSubscription,
    previousPlanName: string | null,
  ): void {
    if (!subscription.user || !subscription.plan) return;
    sendSubscriptionUpgradeEmail(
      subscription.user.email,
      subscription.user.firstName,
      {
        planName: planNameForEmail(subscription.plan, subscription.user.selectedLanguage),
        previousPlanName,
        billingPeriod: subscription.billingPeriod,
        amount: toNumber(subscription.pricePaid),
        currency: subscription.currency,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
      },
    ).catch((err) =>
      console.error('[SubscriptionService] Upgrade email failed:', err),
    );
  }
}

function eventForSubscriptionActivation(
  action: UserSubscriptionAction,
  hasPreviousSubscription: boolean,
): SubscriptionEventName {
  if (action === UserSubscriptionAction.RENEWAL) return 'SUBSCRIPTION_RENEWED';
  if (hasPreviousSubscription) return 'SUBSCRIPTION_UPGRADED';
  return 'SUBSCRIPTION_ACTIVATED';
}

function planNameForEmail(
  plan: SubscriptionPlan,
  language?: string | null,
): string {
  return (
    resolveTranslation(plan.name, language ?? 'en', plan.sourceLanguage) ??
    'Subscription plan'
  );
}

function serializePlan(
  plan: SubscriptionPlan,
  language = 'en',
  includeTranslations = true,
): Record<string, unknown> {
  return {
    planId: plan.id,
    name: includeTranslations
      ? plan.name
      : resolveTranslation(plan.name, language, plan.sourceLanguage),
    description: includeTranslations
      ? plan.description
      : resolveTranslation(plan.description, language, plan.sourceLanguage),
    nameTranslations: includeTranslations ? plan.name : undefined,
    descriptionTranslations: includeTranslations ? plan.description : undefined,
    sourceLanguage: plan.sourceLanguage,
    audience: plan.audience,
    status: plan.status,
    isFree: plan.isFree,
    isDefault: plan.isDefault,
    displayOrder: plan.displayOrder,
    prices: (plan.prices ?? []).map((price) => ({
      priceId: price.id,
      currency: price.currency,
      amount: toNumber(price.amount),
      billingPeriod: price.billingPeriod,
      status: price.status,
    })),
    entitlements: entitlementRecord(plan.entitlements ?? []),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function serializeSubscription(
  subscription: UserSubscription,
  language = 'en',
  includePlanTranslations = false,
): Record<string, unknown> {
  return {
    subscriptionId: subscription.id,
    userId: subscription.userId,
    planId: subscription.planId,
    status: subscription.status,
    billingPeriod: subscription.billingPeriod,
    currency: subscription.currency,
    pricePaid: toNumber(subscription.pricePaid),
    startedAt: subscription.startedAt,
    expiresAt: subscription.expiresAt,
    autoRenew: subscription.autoRenew,
    plan: subscription.plan
      ? serializePlan(subscription.plan, language, includePlanTranslations)
      : null,
    payment: subscription.payment
      ? {
          paymentId: subscription.payment.id,
          paymentReference: subscription.payment.paymentReference,
          status: subscription.payment.status,
          amount: toNumber(subscription.payment.amount),
          currency: subscription.payment.currency,
          paymentMethod: subscription.payment.paymentMethod,
        }
      : null,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}

function entitlementRecord(
  entitlements: SubscriptionPlanEntitlement[],
): Record<string, EntitlementPrimitive> {
  return Object.fromEntries(
    entitlements.map((entitlement) => [
      entitlement.entitlementCode,
      normalizeEntitlementPrimitive(entitlement.value),
    ]),
  );
}

function normalizeEntitlementPrimitive(value: unknown): EntitlementPrimitive {
  if (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    value === null
  ) {
    return value;
  }
  return null;
}

function isZeroPrice(price: SubscriptionPlanPrice | { amount: number; billingPeriod: string }): boolean {
  return toNumber(price.amount) === 0 || price.billingPeriod === SubscriptionBillingPeriod.FREE;
}

function limitFromEntitlement(value: EntitlementPrimitive): number | null {
  if (value === null) return null;
  if (typeof value === 'string' && value.toLowerCase() === 'unlimited') return null;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, numeric);
}

function booleanFromEntitlement(value: EntitlementPrimitive): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
}

function numberFromEntitlement(value: EntitlementPrimitive): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clampPercentage(value: number): number {
  return roundMoney(Math.min(100, Math.max(0, value)));
}

function audienceForUser(user: User): SubscriptionPlanAudience {
  if (user.userType === UserType.BUYER) return SubscriptionPlanAudience.BUYER;
  return SubscriptionPlanAudience.SELLER;
}

function addHours(hours: number): Date {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date;
}

function pagination(page: number, limit: number, total: number): Record<string, number> {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
