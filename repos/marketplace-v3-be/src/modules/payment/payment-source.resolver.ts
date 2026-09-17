import { AppDataSource } from '../../database/data-source';
import {
  CheckoutSession,
  CheckoutStatus,
} from '../../database/entities/checkout-session.entity';
import { CheckoutSellerGroup } from '../../database/entities/checkout-seller-group.entity';
import {
  UserSubscription,
  UserSubscriptionAction,
  UserSubscriptionStatus,
} from '../../database/entities/user-subscription.entity';
import { User } from '../../database/entities/user.entity';
import { createError } from '../../common/utils/http-error.util';

export type PayableDetails = {
  sourceType: string;
  sourceId: string;
  purpose: string;
  payerId: string;
  amount: number;
  currency: string;
  description: string;
  expiresAt: Date | null;
  metadata: Record<string, unknown> | null;
};

export class PaymentSourceResolver {
  private checkoutRepo = AppDataSource.getRepository(CheckoutSession);
  private checkoutSellerGroupRepo = AppDataSource.getRepository(CheckoutSellerGroup);
  private subscriptionRepo = AppDataSource.getRepository(UserSubscription);
  private userRepo = AppDataSource.getRepository(User);

  async getPayableDetails(
    sourceType: string,
    sourceId: string,
    payerId: string,
  ): Promise<PayableDetails> {
    if (sourceType === 'checkout') {
      return this.getCheckoutPayableDetails(sourceId, payerId);
    }

    if (sourceType === 'subscription') {
      return this.getSubscriptionPayableDetails(sourceId, payerId);
    }

    throw createError.badRequest(
      `Payment source type "${sourceType}" is not supported by this deployment yet`,
    );
  }

  private async getCheckoutPayableDetails(
    checkoutId: string,
    payerId: string,
  ): Promise<PayableDetails> {
    const checkout = await this.checkoutRepo.findOne({
      where: { id: checkoutId },
      relations: ['user'],
    });

    if (!checkout) throw createError.notFound('Checkout source not found');
    if (checkout.userId !== payerId) {
      throw createError.forbidden('This payment source does not belong to the authenticated payer');
    }
    if (checkout.status !== CheckoutStatus.ACTIVE) {
      throw createError.conflict('Checkout source is not payable');
    }
    if (checkout.expiresAt && checkout.expiresAt.getTime() <= Date.now()) {
      await this.checkoutRepo.update(checkout.id, { status: CheckoutStatus.EXPIRED });
      throw createError.conflict('Checkout source has expired');
    }

    const sellerGroupsCount = await this.checkoutSellerGroupRepo.count({
      where: { checkoutId },
    });

    return {
      sourceType: 'checkout',
      sourceId: checkout.id,
      purpose: 'marketplace_purchase',
      payerId: checkout.userId,
      amount: Number(checkout.totalAmount),
      currency: checkout.currency,
      description: checkoutDescription(checkout.sourceType),
      expiresAt: checkout.expiresAt,
      metadata: {
        checkoutId: checkout.id,
        checkoutSourceType: checkout.sourceType,
        checkoutSourceId: checkout.sourceId,
        quoteId: checkout.quoteId,
        quoteVersionId: checkout.quoteVersionId,
        productsAmount: Number(checkout.productsTotal),
        logisticsAmount: Number(checkout.logisticsTotal),
        sellerGroupsCount,
        payerName: `${checkout.user.firstName} ${checkout.user.lastName}`.trim(),
      },
    };
  }

  private async getSubscriptionPayableDetails(
    subscriptionId: string,
    payerId: string,
  ): Promise<PayableDetails> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId },
      relations: ['user', 'plan'],
    });

    if (!subscription) throw createError.notFound('Subscription source not found');
    if (subscription.userId !== payerId) {
      throw createError.forbidden('This payment source does not belong to the authenticated payer');
    }
    if (subscription.status !== UserSubscriptionStatus.PENDING) {
      throw createError.conflict('Subscription source is not payable');
    }
    if (subscription.expiresAt && subscription.expiresAt.getTime() <= Date.now()) {
      await this.subscriptionRepo.update(subscription.id, {
        status: UserSubscriptionStatus.CANCELLED,
        metadata: {
          ...(subscription.metadata ?? {}),
          cancellationReason: 'payment_window_expired',
        },
      });
      throw createError.conflict('Subscription payment window has expired');
    }

    const amount = Number(subscription.pricePaid);
    if (amount <= 0) {
      throw createError.badRequest('Free subscriptions do not require payment');
    }

    const action =
      subscription.metadata?.action === UserSubscriptionAction.RENEWAL
        ? UserSubscriptionAction.RENEWAL
        : UserSubscriptionAction.PURCHASE;

    return {
      sourceType: 'subscription',
      sourceId: subscription.id,
      purpose:
        action === UserSubscriptionAction.RENEWAL
          ? 'subscription_renewal'
          : 'subscription_purchase',
      payerId: subscription.userId,
      amount,
      currency: subscription.currency,
      description: `${subscription.plan?.name ?? 'TOFA'} Subscription`,
      expiresAt: subscription.expiresAt,
      metadata: {
        subscriptionId: subscription.id,
        subscriptionPlanId: subscription.planId,
        subscriptionPlanName: subscription.plan?.name ?? null,
        billingPeriod: subscription.billingPeriod,
        action,
        payerName: `${subscription.user.firstName} ${subscription.user.lastName}`.trim(),
      },
    };
  }
}

function checkoutDescription(sourceType: string): string {
  if (sourceType === 'direct_rfq') return 'Direct RFQ Marketplace Purchase';
  if (sourceType === 'market_rfq') return 'Market RFQ Marketplace Purchase';
  return 'Marketplace Purchase';
}
