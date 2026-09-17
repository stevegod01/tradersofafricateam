import { financialReportTypes, generateFinancialReport } from '../settlement/settlement.reports';
import { listSchema as financialReportFilters } from '../settlement/settlement.schemas';
import { SavedProduct } from '../../database/entities/saved-product.entity';
import { afterSalesAnalytics } from '../after-sales/after-sales.analytics';
import { In, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import { AdminAuditEvent } from '../../database/entities/admin-audit-event.entity';
import { AnalyticsEvent } from '../../database/entities/analytics-event.entity';
import {
  AnalyticsRebuildJob,
  AnalyticsRebuildJobStatus,
} from '../../database/entities/analytics-rebuild-job.entity';
import {
  AnalyticsReport,
  AnalyticsReportFormat,
  AnalyticsReportStatus,
} from '../../database/entities/analytics-report.entity';
import { Category, TranslationMap } from '../../database/entities/category.entity';
import { CheckoutSession } from '../../database/entities/checkout-session.entity';
import { DirectRFQ, DirectRFQStatus } from '../../database/entities/direct-rfq.entity';
import {
  DirectRFQQuote,
  DirectRFQQuoteStatus,
} from '../../database/entities/direct-rfq-quote.entity';
import { FeaturedProduct, FeaturedPromotionStatus } from '../../database/entities/featured-product.entity';
import { MarketRFQ, MarketRFQStatus } from '../../database/entities/market-rfq.entity';
import {
  MarketRFQQuote,
  MarketRFQQuoteStatus,
} from '../../database/entities/market-rfq-quote.entity';
import { Order, OrderSourceType, OrderStatus } from '../../database/entities/order.entity';
import { OrderItem, OrderProductNameSnapshot } from '../../database/entities/order-item.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { ProductReview, ReviewStatus } from '../../database/entities/product-review.entity';
import { ProductView } from '../../database/entities/product-view.entity';
import { Product, ProductStatus } from '../../database/entities/product.entity';
import { SearchEntityType, SearchEvent, SearchEventType } from '../../database/entities/search-event.entity';
import { SellerReview } from '../../database/entities/seller-review.entity';
import { SubscriptionPlan } from '../../database/entities/subscription-plan.entity';
import { UserSubscription, UserSubscriptionStatus } from '../../database/entities/user-subscription.entity';
import { User, UserStatus, UserType } from '../../database/entities/user.entity';
import { createError } from '../../common/utils/http-error.util';
import { resolveTranslation } from '../../common/utils/i18n.util';
import { roundMoney, toNumber } from '../../common/utils/pricing.util';
import { databaseErrorCode } from '../../common/utils/database-error.util';
import {
  AdminAnalyticsQueryDto,
  AdminOrderAnalyticsQueryDto,
  AdminPaymentAnalyticsQueryDto,
  AnalyticsDateRangeQueryDto,
  AnalyticsRebuildDto,
  BuyerSpendingAnalyticsQueryDto,
  ReportExportDto,
  SellerProductAnalyticsQueryDto,
  SellerSalesAnalyticsQueryDto,
} from '../../common/utils/validation.schemas';
import { onOrderEvent, OrderEventName } from '../order/order.events';
import { onPaymentEvent, PaymentEventName } from '../payment/payment.events';
import { onReviewEvent, ReviewEventName } from '../review/review.events';
import { DisputeEventName, onDisputeEvent } from '../dispute/dispute.events';
import { onSubscriptionEvent, SubscriptionEventName } from '../subscription/subscription.events';
import { SubscriptionService } from '../subscription/subscription.service';

type AnalyticsLevel = 'basic' | 'advanced' | 'enterprise';

type CurrencyAmount = {
  currency: string;
  amount: number;
};

type DateRange = {
  dateFrom?: string;
  dateTo?: string;
};

type CountryFilter = {
  country?: string;
};

type OrderAnalyticsFilter = DateRange &
  CountryFilter & {
    status?: string;
    source?: string;
  };

type PaymentBuckets = {
  total: number;
  successful: number;
  pendingVerification: number;
  failed: number;
};

type SellerRfqSummary = {
  direct: {
    received: number;
    responded: number;
    accepted: number;
  };
  market: {
    responded: number;
    accepted: number;
  };
  quotes: {
    submitted: number;
    accepted: number;
    expired: number;
    rejected: number;
    other: number;
  };
  quoteAcceptanceRate: number;
  ordersCreatedFromQuotes: number;
};

type SellerProductAnalyticsRow = {
  productId: string;
  productName: string | null;
  views: number;
  orders: number;
  unitsOrdered: number;
  sales: CurrencyAmount;
  salesAmount: number;
  rfqCount: number;
  averageRating: number;
  totalReviews: number;
  conversionRate: number;
  conversion: number;
  rating: number;
};

const SELLER_ADVANCED_LEVELS: AnalyticsLevel[] = ['advanced', 'enterprise'];
const SELLER_REPORT_TYPES = new Set([
  'seller_settlements','seller_payouts',
  'seller_overview',
  'seller_sales',
  'seller_products',
  'seller_orders',
  'seller_rfqs',
  'seller_customers',
  'seller_search',
  'seller_reviews',
  'seller_subscription_usage',
]);
const BUYER_REPORT_TYPES = new Set([
  'buyer_overview',
  'buyer_spending',
  'buyer_rfqs',
  'buyer_suppliers',
]);
const ADMIN_REPORT_TYPES = new Set([
  'admin_settlements','admin_payouts',
  'admin_overview',
  'admin_revenue',
  'admin_revenue_by_subscription',
  'admin_logistics',
  'admin_orders',
  'admin_payments',
  'admin_subscriptions',
  'admin_rfqs',
  'admin_products',
  'admin_sellers',
  'admin_buyers',
  'admin_countries',
  'admin_categories',
  'admin_funnel',
  'admin_payment_methods',
  'admin_disputes',
]);
const PAYMENT_SUCCESS_STATUSES = [PaymentStatus.CONFIRMED];
const PAYMENT_PENDING_VERIFICATION_STATUSES = [
  PaymentStatus.PROOF_UPLOADED,
  PaymentStatus.UNDER_REVIEW,
];
const PAYMENT_FAILED_STATUSES = [
  PaymentStatus.FAILED,
  PaymentStatus.REJECTED,
  PaymentStatus.EXPIRED,
  PaymentStatus.CANCELLED,
];

let analyticsEventHandlersRegistered = false;

export function registerAnalyticsEventHandlers(): void {
  if (analyticsEventHandlersRegistered) return;
  analyticsEventHandlersRegistered = true;

  const analyticsService = new AnalyticsService();

  const orderEvents: OrderEventName[] = [
    'ORDERS_CREATED',
    'ORDER_COMPLETED',
    'ORDER_CANCELLED',
    'ORDER_DELIVERED',
    'ORDER_SHIPPED',
  ];
  for (const eventName of orderEvents) {
    onOrderEvent(eventName, async (payload) => {
      await analyticsService.recordSourceEvent({
        sourceModule: 'orders',
        eventName,
        sourceEventId: payload.orderId,
        entityType: 'order',
        entityId: payload.orderId,
        actorId: payload.buyerId,
        payload: payload as unknown as Record<string, unknown>,
      });
    });
  }

  const paymentEvents: PaymentEventName[] = [
    'PAYMENT_CONFIRMED',
    'PAYMENT_FAILED',
    'PAYMENT_REJECTED',
    'PAYMENT_EXPIRED',
    'PAYMENT_CREATED',
  ];
  for (const eventName of paymentEvents) {
    onPaymentEvent(eventName, async (payload) => {
      await analyticsService.recordSourceEvent({
        sourceModule: 'payments',
        eventName,
        sourceEventId: payload.paymentId,
        entityType: 'payment',
        entityId: payload.paymentId,
        actorId: payload.payerId,
        payload: payload as unknown as Record<string, unknown>,
      });
    });
  }

  const reviewEvents: ReviewEventName[] = ['REVIEW_SUBMITTED', 'REVIEW_STATUS_CHANGED'];
  for (const eventName of reviewEvents) {
    onReviewEvent(eventName, async (payload) => {
      if (!payload.reviewId) return;
      await analyticsService.recordSourceEvent({
        sourceModule: 'reviews',
        eventName,
        sourceEventId: payload.reviewId,
        entityType: 'review',
        entityId: payload.reviewId,
        actorId: payload.buyerId ?? null,
        payload: payload as unknown as Record<string, unknown>,
      });
    });
  }

  const subscriptionEvents: SubscriptionEventName[] = [
    'SUBSCRIPTION_ACTIVATED',
    'SUBSCRIPTION_UPGRADED',
    'SUBSCRIPTION_RENEWED',
    'SUBSCRIPTION_EXPIRED',
  ];
  for (const eventName of subscriptionEvents) {
    onSubscriptionEvent(eventName, async (payload) => {
      if (!payload.subscriptionId) return;
      await analyticsService.recordSourceEvent({
        sourceModule: 'subscriptions',
        eventName,
        sourceEventId: payload.subscriptionId,
        entityType: 'subscription',
        entityId: payload.subscriptionId,
        actorId: payload.userId ?? null,
        payload: payload as unknown as Record<string, unknown>,
      });
    });
  }

  const disputeEvents: DisputeEventName[] = [
    'DISPUTE_CREATED',
    'DISPUTE_RESOLVED',
    'DISPUTE_REFUND_REQUESTED',
    'DISPUTE_CLOSED',
  ];
  for (const eventName of disputeEvents) {
    onDisputeEvent(eventName, async (payload) => {
      await analyticsService.recordSourceEvent({
        sourceModule: 'disputes',
        eventName,
        sourceEventId:
          eventName === 'DISPUTE_REFUND_REQUESTED'
            ? `${payload.disputeId}:refund_requested`
            : payload.disputeId,
        entityType: 'dispute',
        entityId: payload.disputeId,
        actorId: payload.actorId ?? payload.raisedBy ?? null,
        payload: payload as unknown as Record<string, unknown>,
      });
    });
  }
}

export class AnalyticsService {
  private analyticsEventRepo = AppDataSource.getRepository(AnalyticsEvent);
  private reportRepo = AppDataSource.getRepository(AnalyticsReport);
  private rebuildJobRepo = AppDataSource.getRepository(AnalyticsRebuildJob);
  private adminAuditRepo = AppDataSource.getRepository(AdminAuditEvent);
  private userRepo = AppDataSource.getRepository(User);
  private productRepo = AppDataSource.getRepository(Product);
  private productCategoryRepo = AppDataSource.getRepository(ProductCategory);
  private productViewRepo = AppDataSource.getRepository(ProductView);
  private orderRepo = AppDataSource.getRepository(Order);
  private orderItemRepo = AppDataSource.getRepository(OrderItem);
  private paymentRepo = AppDataSource.getRepository(Payment);
  private directRfqRepo = AppDataSource.getRepository(DirectRFQ);
  private directRfqQuoteRepo = AppDataSource.getRepository(DirectRFQQuote);
  private marketRfqRepo = AppDataSource.getRepository(MarketRFQ);
  private marketRfqQuoteRepo = AppDataSource.getRepository(MarketRFQQuote);
  private productReviewRepo = AppDataSource.getRepository(ProductReview);
  private sellerReviewRepo = AppDataSource.getRepository(SellerReview);
  private subscriptionRepo = AppDataSource.getRepository(UserSubscription);
  private subscriptionPlanRepo = AppDataSource.getRepository(SubscriptionPlan);
  private categoryRepo = AppDataSource.getRepository(Category);
  private featuredProductRepo = AppDataSource.getRepository(FeaturedProduct);
  private searchEventRepo = AppDataSource.getRepository(SearchEvent);
  private subscriptionService = new SubscriptionService();

  async getSellerOverview(
    sellerId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const entitlements = await this.assertSellerAnalyticsAccess(sellerId);
    const [
      products,
      currentProductViews,
      previousProductViews,
      orders,
      salesByCurrency,
      rfqs,
      reviews,
    ] = await Promise.all([
      this.getSellerProductStatusCounts(sellerId),
      this.countSellerProductViews(sellerId, this.comparisonRange(query).current),
      this.countSellerProductViews(sellerId, this.comparisonRange(query).previous),
      this.getSellerOrderSummary(sellerId, query),
      this.getSellerSalesByCurrency(sellerId, query),
      this.getSellerRfqSummary(sellerId, query),
      this.getSellerReviewSummary(sellerId, query),
    ]);

    return {
      success: true,
      data: {
        products,
        productViews: {
          total: currentProductViews,
          ...percentageChange(currentProductViews, previousProductViews),
        },
        orders,
        salesByCurrency,
        rfqs: {
          directReceived: rfqs.direct.received,
          marketResponded: rfqs.market.responded,
          quotesAccepted: rfqs.quotes.accepted,
        },
        reviews: {
          averageRating: reviews.averageRating,
          totalReviews: reviews.totalReviews,
        },
        subscription: {
          analyticsLevel: String(entitlements.analytics_level ?? 'basic'),
          transactionFeePercentage: nullableNumber(
            entitlements.transaction_fee_percentage,
          ),
        },
      },
    };
  }

  async getSellerSales(
    sellerId: string,
    query: SellerSalesAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    await this.assertSellerAnalyticsAccess(sellerId, SELLER_ADVANCED_LEVELS);
    const currency = query.currency || (await this.firstSellerCurrency(sellerId)) || config.analytics.reportingCurrency;
    const baseQb = this.orderRepo
      .createQueryBuilder('order')
      .where('order.sellerId = :sellerId', { sellerId })
      .andWhere('order.orderCurrency = :currency', { currency });
    this.applyDateRange(baseQb, 'order', 'createdAt', query);

    const afterSales = await afterSalesAnalytics(baseQb);
    const grossProductSales = await this.sumFromQuery(baseQb.clone(), 'order.productsSubtotal');
    const totalOrders = await baseQb.clone().getCount();

    const completedQb = baseQb
      .clone()
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED });
    const completedProductSales = await this.sumFromQuery(
      completedQb.clone(),
      'order.productsSubtotal',
    );
    const transactionFees = await this.sumFromQuery(
      completedQb.clone(),
      'order.transactionFeeAmount',
    );
    const completedOrders = await completedQb.clone().getCount();
    const completedAfterSales = await afterSalesAnalytics(completedQb);
    const refundedProductAmount = Number(completedAfterSales.orderCurrencyRefunds.find(r => r.currency === currency)?.productAmount ?? 0);
    const reversedFees = Number(completedAfterSales.feeReversals.find(r => r.currency === currency)?.amount ?? 0);
    const trend = await this.orderRepo
      .createQueryBuilder('order')
      .select(`${this.periodExpression('order.createdAt', query.groupBy)}`, 'period')
      .addSelect('COALESCE(SUM(order.productsSubtotal), 0)', 'productSales')
      .addSelect('COUNT(order.id)', 'orders')
      .where('order.sellerId = :sellerId', { sellerId })
      .andWhere('order.orderCurrency = :currency', { currency })
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED })
      .groupBy('period')
      .orderBy('period', 'ASC');
    this.applyDateRange(trend, 'order', 'createdAt', query);
    const trendRows = await trend.getRawMany<{ period: string; productSales: string; orders: string }>();

    return {
      success: true,
      data: {
        currency,
        summary: {
          grossProductSales,
          completedProductSales,
          transactionFees,
          // Gross historical sales remain unchanged; adjustments are reported separately.
          netProductAmount: roundMoney(completedProductSales - transactionFees - refundedProductAmount + reversedFees),
          refundedProductAmount,
          transactionFeeReversals: reversedFees,
          netGMV: roundMoney(grossProductSales - Number(afterSales.orderCurrencyRefunds.find(r => r.currency === currency)?.productAmount ?? 0)),
          totalOrders,
          completedOrders,
          averageOrderValue:
            completedOrders > 0
              ? roundMoney(completedProductSales / completedOrders)
              : 0,
        },
        afterSales,
        trend: trendRows.map((row) => ({
          period: row.period,
          productSales: roundMoney(toNumber(row.productSales)),
          orders: Number(row.orders),
        })),
      },
    };
  }

  async getSellerProducts(
    sellerId: string,
    query: SellerProductAnalyticsQueryDto,
    language: string,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    await this.assertSellerAnalyticsAccess(sellerId, SELLER_ADVANCED_LEVELS);
    const products = await this.productRepo.find({
      where: { sellerId },
      relations: ['productCategories', 'productCategories.category'],
      order: { createdAt: 'DESC' },
    });

    const rows = await Promise.all(
      products.map(async (product) => this.getSellerProductAnalyticsRow(product, query, language)),
    );
    const saveCounts = await AppDataSource.getRepository(SavedProduct).createQueryBuilder('saved')
      .innerJoin(Product,'savedProduct','savedProduct.id = saved.productId')
      .innerJoin(User,'saveOwner','saveOwner.id = saved.userId AND saveOwner.status <> :deletedOwner',{deletedOwner:UserStatus.DELETED})
      .select('saved.productId','productId').addSelect('COUNT(*)','count')
      .where('savedProduct.sellerId = :sellerId',{sellerId}).groupBy('saved.productId').getRawMany();
    const savedCountByProduct = new Map(saveCounts.map(row=>[row.productId,Number(row.count)]));
    const sorted = rows.sort((a, b) => {
      const sortKey = query.sortBy === 'sales' ? 'salesAmount' : query.sortBy;
      return b[sortKey] - a[sortKey];
    });
    const start = (query.page - 1) * query.limit;

    return {
      success: true,
      data: sorted.slice(start, start + query.limit).map(({ salesAmount: _salesAmount, ...row }) => ({...row,savedCount:savedCountByProduct.get(row.productId)??0})),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: sorted.length,
        totalPages: Math.ceil(sorted.length / query.limit),
      },
    };
  }

  async getSellerOrders(
    sellerId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    await this.assertSellerAnalyticsAccess(sellerId);
    const data = await this.getSellerOrderStatusBreakdown(sellerId, query);
    return { success: true, data };
  }

  async getSellerRfqs(
    sellerId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    await this.assertSellerAnalyticsAccess(sellerId);
    return { success: true, data: await this.getSellerRfqSummary(sellerId, query) };
  }

  async getSellerCustomers(
    sellerId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    await this.assertSellerAnalyticsAccess(sellerId, SELLER_ADVANCED_LEVELS);
    const completedQb = this.orderRepo
      .createQueryBuilder('order')
      .innerJoin('order.buyer', 'buyer')
      .where('order.sellerId = :sellerId', { sellerId })
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED });
    this.applyDateRange(completedQb, 'order', 'createdAt', query);

    const totalCustomers = await completedQb
      .clone()
      .select('COUNT(DISTINCT order.buyerId)', 'count')
      .getRawOne<{ count: string }>()
      .then((row) => Number(row?.count || 0));
    const returningCustomers = await this.orderRepo
      .createQueryBuilder('order')
      .select('order.buyerId', 'buyerId')
      .where('order.sellerId = :sellerId', { sellerId })
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED })
      .groupBy('order.buyerId')
      .having('COUNT(order.id) > 1')
      .getRawMany()
      .then((rows) => rows.length);
    const byCountryRows = await completedQb
      .clone()
      .select('COALESCE(buyer.country, :unknown)', 'country')
      .addSelect('COUNT(DISTINCT order.buyerId)', 'customers')
      .setParameter('unknown', 'Unknown')
      .groupBy('country')
      .orderBy('customers', 'DESC')
      .getRawMany<{ country: string; customers: string }>();

    return {
      success: true,
      data: {
        totalCustomers,
        newCustomers: Math.max(totalCustomers - returningCustomers, 0),
        returningCustomers: Math.min(returningCustomers, totalCustomers),
        byCountry: byCountryRows.map((row) => ({
          country: row.country,
          customers: Number(row.customers),
        })),
      },
    };
  }

  async getSellerSearch(
    sellerId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    await this.assertSellerAnalyticsAccess(sellerId, SELLER_ADVANCED_LEVELS);
    const productIds = await this.getSellerProductIds(sellerId);
    if (productIds.length === 0) {
      return {
        success: true,
        data: {
          searchImpressions: 0,
          searchClicks: 0,
          clickThroughRate: 0,
          topSearchTerms: [],
        },
      };
    }

    const impressions = await this.countSellerProductViews(sellerId, query);
    const clickQb = this.searchEventRepo
      .createQueryBuilder('event')
      .where('event.eventType = :eventType', { eventType: SearchEventType.RESULT_CLICK })
      .andWhere('event.entityType = :entityType', { entityType: SearchEntityType.PRODUCT })
      .andWhere('event.entityId IN (:...productIds)', { productIds });
    this.applyDateRange(clickQb, 'event', 'createdAt', query);
    const searchClicks = await clickQb.getCount();

    const termQb = clickQb
      .clone()
      .select('event.query', 'query')
      .addSelect('COUNT(event.id)', 'clicks')
      .where('event.eventType = :eventType', { eventType: SearchEventType.RESULT_CLICK })
      .andWhere('event.entityType = :entityType', { entityType: SearchEntityType.PRODUCT })
      .andWhere('event.entityId IN (:...productIds)', { productIds })
      .andWhere('event.query IS NOT NULL')
      .groupBy('event.query')
      .orderBy('clicks', 'DESC')
      .limit(10);
    this.applyDateRange(termQb, 'event', 'createdAt', query);
    const topSearchTerms = await termQb.getRawMany<{ query: string; clicks: string }>();

    return {
      success: true,
      data: {
        searchImpressions: impressions,
        searchClicks,
        clickThroughRate: ratio(searchClicks, impressions),
        topSearchTerms: topSearchTerms.map((row) => ({
          query: row.query,
          impressions: null,
          clicks: Number(row.clicks),
        })),
      },
    };
  }

  async getSellerReviews(
    sellerId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    await this.assertSellerAnalyticsAccess(sellerId);
    const summary = await this.getSellerReviewSummary(sellerId, query);
    return { success: true, data: summary };
  }

  async getSellerSubscriptionUsage(
    sellerId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    await this.assertSellerAnalyticsAccess(sellerId);
    const [entitlements, subscription, productCount, featuredCount] = await Promise.all([
      this.subscriptionService.getEffectiveEntitlements(sellerId),
      this.subscriptionRepo.findOne({
        where: { userId: sellerId, status: UserSubscriptionStatus.ACTIVE },
        relations: ['plan'],
        order: { createdAt: 'DESC' },
      }),
      this.productRepo
        .createQueryBuilder('product')
        .where('product.sellerId = :sellerId', { sellerId })
        .andWhere('product.status != :deleted', { deleted: ProductStatus.DELETED })
        .getCount(),
      this.featuredProductRepo.count({
        where: { sellerId, status: FeaturedPromotionStatus.ACTIVE },
      }),
    ]);

    const maxProducts = nullableNumber(entitlements.max_products);
    const maxFeatured = nullableNumber(entitlements.max_featured_products);

    return {
      success: true,
      data: {
        plan: subscription?.plan
          ? {
              id: subscription.plan.id,
              name: resolveTranslation(subscription.plan.name, 'en'),
            }
          : null,
        usage: {
          products: usageBucket(productCount, maxProducts),
          featuredProducts: usageBucket(featuredCount, maxFeatured),
        },
        features: {
          productPriority: entitlements.product_priority ?? null,
          marketRfqPriority: entitlements.market_rfq_priority ?? null,
          analyticsLevel: entitlements.analytics_level ?? 'basic',
          reportExport: Boolean(entitlements.report_export),
          transactionFeePercentage: nullableNumber(entitlements.transaction_fee_percentage),
        },
      },
    };
  }

  async getBuyerOverview(
    buyerId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const orders = await this.getBuyerOrderSummary(buyerId, query);
    const [spendByCurrency, rfqs, suppliers] = await Promise.all([
      this.getBuyerSpendByCurrency(buyerId, query),
      this.getBuyerRfqSummary(buyerId, query),
      this.orderRepo
        .createQueryBuilder('order')
        .select('COUNT(DISTINCT order.sellerId)', 'count')
        .where('order.buyerId = :buyerId', { buyerId })
        .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED })
        .getRawOne<{ count: string }>()
        .then((row) => Number(row?.count || 0)),
    ]);

    return {
      success: true,
      data: {
        orders,
        spendByCurrency,
        rfqs,
        suppliers: { uniqueSuppliersPurchasedFrom: suppliers },
      },
    };
  }

  async getBuyerSpending(
    buyerId: string,
    query: BuyerSpendingAnalyticsQueryDto,
    language: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const currency = query.currency || (await this.firstBuyerCurrency(buyerId)) || config.analytics.reportingCurrency;
    const baseQb = this.orderRepo
      .createQueryBuilder('order')
      .where('order.buyerId = :buyerId', { buyerId })
      .andWhere('order.paymentCurrency = :currency', { currency })
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED });
    this.applyDateRange(baseQb, 'order', 'createdAt', query);

    const totalSpend = await this.sumFromQuery(baseQb.clone(), 'order.paymentAmount');
    const trendQb = this.orderRepo
      .createQueryBuilder('order')
      .select(this.periodExpression('order.createdAt', query.groupBy), 'period')
      .addSelect('COALESCE(SUM(order.paymentAmount), 0)', 'amount')
      .where('order.buyerId = :buyerId', { buyerId })
      .andWhere('order.paymentCurrency = :currency', { currency })
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED })
      .groupBy('period')
      .orderBy('period', 'ASC');
    this.applyDateRange(trendQb, 'order', 'createdAt', query);
    const trend = await trendQb.getRawMany<{ period: string; amount: string }>();

    const byCategory = await this.orderItemRepo
      .createQueryBuilder('item')
      .innerJoin(Order, 'order', 'order.id = item.orderId')
      .innerJoin(ProductCategory, 'pc', 'pc.productId = item.productId')
      .innerJoin(Category, 'category', 'category.id = pc.categoryId')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('COALESCE(SUM(item.subtotal), 0)', 'amount')
      .where('order.buyerId = :buyerId', { buyerId })
      .andWhere('order.orderCurrency = :currency', { currency })
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED })
      .groupBy('category.id')
      .orderBy('amount', 'DESC')
      .limit(10);
    this.applyDateRange(byCategory, 'order', 'createdAt', query);
    const categoryRows = await byCategory.getRawMany<{
      categoryId: string;
      categoryName: Record<string, string>;
      amount: string;
    }>();

    return {
      success: true,
      data: {
        currency,
        totalSpend,
        trend: trend.map((row) => ({
          period: row.period,
          amount: roundMoney(toNumber(row.amount)),
        })),
        byCategory: categoryRows.map((row) => ({
          categoryId: row.categoryId,
          categoryName: resolveMaybeTranslation(row.categoryName, language),
          amount: roundMoney(toNumber(row.amount)),
        })),
      },
    };
  }

  async getBuyerRfqs(
    buyerId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    return { success: true, data: await this.getBuyerRfqSummary(buyerId, query) };
  }

  async getBuyerSuppliers(
    buyerId: string,
    query: AnalyticsDateRangeQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[] }> {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .innerJoin('order.seller', 'seller')
      .select('order.sellerId', 'sellerId')
      .addSelect('COALESCE(seller.storeName, seller.companyName)', 'storeName')
      .addSelect('order.orderCurrency', 'currency')
      .addSelect('COUNT(order.id)', 'orders')
      .addSelect(
        `SUM(CASE WHEN order.status = '${OrderStatus.COMPLETED}' THEN 1 ELSE 0 END)`,
        'completedOrders',
      )
      .addSelect('COALESCE(SUM(order.productsSubtotal), 0)', 'amount')
      .where('order.buyerId = :buyerId', { buyerId })
      .groupBy('order.sellerId')
      .addGroupBy('order.orderCurrency')
      .orderBy('amount', 'DESC');
    this.applyDateRange(qb, 'order', 'createdAt', query);
    const rows = await qb.getRawMany<{
      sellerId: string;
      storeName: string | null;
      currency: string;
      orders: string;
      completedOrders: string;
      amount: string;
    }>();

    return {
      success: true,
      data: rows.map((row) => ({
        sellerId: row.sellerId,
        storeName: row.storeName,
        orders: Number(row.orders),
        spend: { currency: row.currency, amount: roundMoney(toNumber(row.amount)) },
        completedOrders: Number(row.completedOrders),
      })),
    };
  }

  async getAdminOverview(
    query: AdminAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const currency = query.currency || config.analytics.reportingCurrency;
    const usersQb = this.userRepo.createQueryBuilder('user');
    this.applyDateRange(usersQb, 'user', 'createdAt', query);
    if (query.country) usersQb.andWhere('user.country = :country', { country: query.country });

    const [totalUsers, buyers, sellers, newUsers, products, orders, gmv, revenue, rfqs, subscriptions] =
      await Promise.all([
        usersQb.clone().getCount(),
        usersQb.clone().andWhere('user.userType = :type', { type: UserType.BUYER }).getCount(),
        usersQb.clone().andWhere('user.userType = :type', { type: UserType.SELLER }).getCount(),
        usersQb.clone().getCount(),
        this.getAdminProductSummary(query),
        this.getAdminOrderOverview(query),
        this.getAdminGmv(currency, query),
        this.getAdminRevenueSummary({ ...query, currency }),
        this.getAdminRfqSummary(query),
        this.subscriptionRepo
          .createQueryBuilder('subscription')
          .where('subscription.status = :active', { active: UserSubscriptionStatus.ACTIVE })
          .andWhere('subscription.pricePaid > 0')
          .getCount(),
      ]);

    return {
      success: true,
      data: {
        users: {
          total: totalUsers,
          buyers,
          sellers,
          newUsers,
        },
        products,
        orders,
        gmv: {
          reportingCurrency: currency,
          amount: gmv,
        },
        tofaRevenue: revenue,
        rfqs,
        subscriptions: {
          activePaidSubscriptions: subscriptions,
        },
      },
    };
  }

  async getAdminRevenue(
    query: AdminAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    return {
      success: true,
      data: await this.getAdminRevenueSummary({
        ...query,
        currency: query.currency || config.analytics.reportingCurrency,
      }),
    };
  }

  async getAdminRevenueBySubscription(
    query: AdminAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[] }> {
    const currency = query.currency || config.analytics.reportingCurrency;
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoin(SubscriptionPlan, 'plan', 'plan.id = order.subscriptionPlanId')
      .select('order.subscriptionPlanId', 'planId')
      .addSelect('plan.name', 'planName')
      .addSelect('order.transactionFeePercentage', 'transactionFeePercentageSnapshot')
      .addSelect('COUNT(order.id)', 'qualifyingTransactions')
      .addSelect('COALESCE(SUM(order.feeBaseAmount), 0)', 'transactionValue')
      .addSelect('COALESCE(SUM(order.transactionFeeAmount), 0)', 'transactionRevenue')
      .where('order.orderCurrency = :currency', { currency })
      .andWhere('order.transactionFeeAmount IS NOT NULL')
      .groupBy('order.subscriptionPlanId')
      .addGroupBy('order.transactionFeePercentage')
      .addGroupBy('plan.name')
      .orderBy('transactionRevenue', 'DESC');
    this.applyDateRange(qb, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(qb, query);
    const rows = await qb.getRawMany<{
      planId: string | null;
      planName: Record<string, string> | null;
      transactionFeePercentageSnapshot: string | null;
      qualifyingTransactions: string;
      transactionValue: string;
      transactionRevenue: string;
    }>();

    return {
      success: true,
      data: rows.map((row) => ({
        planId: row.planId,
        planName: resolveMaybeTranslation(row.planName, 'en') || 'Unassigned',
        transactionFeePercentageSnapshot:
          row.transactionFeePercentageSnapshot === null
            ? null
            : toNumber(row.transactionFeePercentageSnapshot),
        qualifyingTransactions: Number(row.qualifyingTransactions),
        transactionValue: {
          reportingCurrency: currency,
          amount: roundMoney(toNumber(row.transactionValue)),
        },
        transactionRevenue: {
          reportingCurrency: currency,
          amount: roundMoney(toNumber(row.transactionRevenue)),
        },
      })),
    };
  }

  async getAdminLogistics(
    query: AdminAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const currency = query.currency || config.analytics.reportingCurrency;
    const byType = await this.groupOrderCount('order.deliveryType', query);
    const logisticsQb = this.orderRepo
      .createQueryBuilder('order')
      .where('order.orderCurrency = :currency', { currency })
      .andWhere('order.deliveryType = :deliveryType', { deliveryType: 'integrated_logistics' });
    this.applyDateRange(logisticsQb, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(logisticsQb, query);

    return {
      success: true,
      data: {
        ordersByDeliveryType: byType,
        integratedLogisticsValue: {
          reportingCurrency: currency,
          amount: await this.sumFromQuery(logisticsQb, 'order.logisticsAmount'),
        },
      },
    };
  }

  async getAdminOrders(
    query: AdminOrderAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const currency = query.currency || config.analytics.reportingCurrency;
    const qb = this.orderRepo.createQueryBuilder('order');
    this.applyDateRange(qb, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(qb, query);
    if (query.source) qb.andWhere('order.sourceType = :source', { source: query.source });
    if (query.status) qb.andWhere('order.status = :status', { status: query.status });

    const totalOrders = await qb.clone().getCount();
    const bySource = await this.groupOrderCount('order.sourceType', query);
    const byStatusRaw = await this.groupOrderCount('order.status', query);
    const completed = byStatusRaw[OrderStatus.COMPLETED] || 0;
    const cancelled = byStatusRaw[OrderStatus.CANCELLED] || 0;
    const other = Math.max(totalOrders - completed - cancelled, 0);
    const aovQb = qb
      .clone()
      .andWhere('order.orderCurrency = :currency', { currency })
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED });
    const completedValue = await this.sumFromQuery(aovQb.clone(), 'order.productsSubtotal');
    const completedCount = await aovQb.getCount();

    return {
      success: true,
      data: {
        totalOrders,
        bySource,
        byStatus: { completed, cancelled, other },
        averageOrderValue: {
          reportingCurrency: currency,
          amount: completedCount > 0 ? roundMoney(completedValue / completedCount) : 0,
        },
      },
    };
  }

  async getAdminPayments(
    query: AdminPaymentAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const qb = this.paymentRepo.createQueryBuilder('payment');
    this.applyDateRange(qb, 'payment', 'createdAt', query);
    this.applyPaymentPayerCountryFilter(qb, query);
    if (query.paymentMethod) {
      qb.andWhere('payment.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }
    if (query.currency) qb.andWhere('payment.currency = :currency', { currency: query.currency });
    if (query.paymentFor) qb.andWhere('payment.purpose = :paymentFor', { paymentFor: query.paymentFor });
    if (query.status) qb.andWhere('payment.status = :status', { status: query.status });

    const [payments, byPaymentFor, byMethod] = await Promise.all([
      this.paymentBuckets(qb.clone()),
      qb
        .clone()
        .select('payment.purpose', 'paymentFor')
        .addSelect('COUNT(payment.id)', 'count')
        .groupBy('payment.purpose')
        .orderBy('count', 'DESC')
        .getRawMany<{ paymentFor: string; count: string }>(),
      qb
        .clone()
        .select('payment.paymentMethod', 'paymentMethod')
        .addSelect('COUNT(payment.id)', 'count')
        .groupBy('payment.paymentMethod')
        .orderBy('count', 'DESC')
        .getRawMany<{ paymentMethod: string; count: string }>(),
    ]);

    return {
      success: true,
      data: {
        payments,
        byPaymentFor: byPaymentFor.map((row) => ({
          paymentFor: row.paymentFor,
          count: Number(row.count),
        })),
        byMethod: byMethod.map((row) => ({
          paymentMethod: row.paymentMethod,
          count: Number(row.count),
        })),
      },
    };
  }

  async getAdminSubscriptions(
    query: AdminAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const baseQb = this.subscriptionRepo.createQueryBuilder('subscription');
    this.applyDateRange(baseQb, 'subscription', 'createdAt', query);
    this.applySubscriptionUserCountryFilter(baseQb, query);

    const activeQb = this.subscriptionRepo
      .createQueryBuilder('subscription')
      .where('subscription.status = :active', {
        active: UserSubscriptionStatus.ACTIVE,
      });
    this.applySubscriptionUserCountryFilter(activeQb, query);

    const activePaidQb = activeQb
      .clone()
      .andWhere('subscription.pricePaid > 0');

    const byPlanQb = this.subscriptionRepo
      .createQueryBuilder('subscription')
      .innerJoin('subscription.plan', 'plan')
      .select('plan.id', 'planId')
      .addSelect('plan.name', 'planName')
      .addSelect('COUNT(subscription.id)', 'activeSubscribers')
      .where('subscription.status = :active', {
        active: UserSubscriptionStatus.ACTIVE,
      })
      .groupBy('plan.id')
      .addGroupBy('plan.name')
      .orderBy('activeSubscribers', 'DESC');
    this.applySubscriptionUserCountryFilter(byPlanQb, query);

    const subscriptionRevenueQb = this.paymentRepo
      .createQueryBuilder('payment')
      .select('payment.currency', 'currency')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'amount')
      .where('payment.status = :confirmed', { confirmed: PaymentStatus.CONFIRMED })
      .andWhere('(payment.sourceType = :source OR payment.purpose IN (:...purposes))', {
        source: 'subscription',
        purposes: ['subscription_purchase', 'subscription_renewal'],
      })
      .groupBy('payment.currency')
      .orderBy('amount', 'DESC');
    this.applyDateRange(subscriptionRevenueQb, 'payment', 'createdAt', query);
    this.applyPaymentPayerCountryFilter(subscriptionRevenueQb, query);

    const [activeSubscriptions, activePaidSubscriptions, newSubscriptions, expiredSubscriptions, byPlan, revenueByCurrency] =
      await Promise.all([
        activeQb.getCount(),
        activePaidQb.getCount(),
        baseQb.clone().getCount(),
        baseQb
          .clone()
          .andWhere('subscription.status = :expired', {
            expired: UserSubscriptionStatus.EXPIRED,
          })
          .getCount(),
        byPlanQb.getRawMany<{
          planId: string;
          planName: Record<string, string>;
          activeSubscribers: string;
        }>(),
        subscriptionRevenueQb.getRawMany<{ currency: string; amount: string }>(),
      ]);

    return {
      success: true,
      data: {
        activeSubscriptions,
        activePaidSubscriptions,
        newSubscriptions,
        expiredSubscriptions,
        byPlan: byPlan.map((row) => ({
          planId: row.planId,
          planName: resolveMaybeTranslation(row.planName, 'en'),
          activeSubscribers: Number(row.activeSubscribers),
        })),
        revenueByCurrency: revenueByCurrency.map((row) => ({
          currency: row.currency,
          amount: roundMoney(toNumber(row.amount)),
        })),
      },
    };
  }

  async getAdminRfqs(
    query: AdminAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    return { success: true, data: await this.getAdminRfqSummary(query) };
  }

  async getAdminProducts(
    query: AdminAnalyticsQueryDto,
    language: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const [products, topCategories, topProducts] = await Promise.all([
      this.getAdminProductSummary(query),
      this.getTopCategories(query, language),
      this.getTopProducts(query, language),
    ]);

    return {
      success: true,
      data: {
        totalProducts: products.total,
        activeProducts: products.active,
        topCategories,
        topProducts,
      },
    };
  }

  async getAdminSellers(
    query: AdminAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const currency = query.currency || config.analytics.reportingCurrency;
    const sellersQb = this.userRepo
      .createQueryBuilder('user')
      .where('user.userType = :seller', { seller: UserType.SELLER });
    if (query.country) sellersQb.andWhere('user.country = :country', { country: query.country });

    const activeSellingQb = this.productRepo
      .createQueryBuilder('product')
      .innerJoin('product.seller', 'seller')
      .select('COUNT(DISTINCT product.sellerId)', 'count')
      .where('product.status = :active', { active: ProductStatus.ACTIVE });
    if (query.country) activeSellingQb.andWhere('seller.country = :country', { country: query.country });

    const topSellersQb = this.orderRepo
      .createQueryBuilder('order')
      .innerJoin('order.seller', 'seller')
      .select('order.sellerId', 'sellerId')
      .addSelect('COALESCE(seller.storeName, seller.companyName)', 'storeName')
      .addSelect('COUNT(order.id)', 'completedOrders')
      .addSelect('COALESCE(SUM(order.productsSubtotal), 0)', 'sales')
      .addSelect('seller.totalAverageReviews', 'averageRating')
      .where('order.status = :completed', { completed: OrderStatus.COMPLETED })
      .andWhere('order.orderCurrency = :currency', { currency })
      .groupBy('order.sellerId')
      .addGroupBy('seller.storeName')
      .addGroupBy('seller.companyName')
      .addGroupBy('seller.totalAverageReviews')
      .orderBy('sales', 'DESC')
      .limit(10);
    this.applyDateRange(topSellersQb, 'order', 'createdAt', query);
    if (query.country) topSellersQb.andWhere('seller.country = :country', { country: query.country });

    const [totalSellers, verifiedSellers, activeSellingSellers, topSellers] = await Promise.all([
      sellersQb.clone().getCount(),
      sellersQb.clone().andWhere('user.isCompanyVerified = :verified', { verified: true }).getCount(),
      activeSellingQb
        .getRawOne<{ count: string }>()
        .then((row) => Number(row?.count || 0)),
      topSellersQb.getRawMany<{
        sellerId: string;
        storeName: string | null;
        completedOrders: string;
        sales: string;
        averageRating: string;
      }>(),
    ]);

    return {
      success: true,
      data: {
        totalSellers,
        verifiedSellers,
        activeSellingSellers,
        topSellers: topSellers.map((row) => ({
          sellerId: row.sellerId,
          storeName: row.storeName,
          completedOrders: Number(row.completedOrders),
          sales: {
            reportingCurrency: currency,
            amount: roundMoney(toNumber(row.sales)),
          },
          averageRating: roundMoney(toNumber(row.averageRating)),
        })),
      },
    };
  }

  async getAdminBuyers(
    query: AdminAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const totalBuyersQb = this.userRepo
      .createQueryBuilder('user')
      .where('user.userType = :buyer', { buyer: UserType.BUYER });
    if (query.country) totalBuyersQb.andWhere('user.country = :country', { country: query.country });

    const buyersWithOrdersQb = this.orderRepo
      .createQueryBuilder('order')
      .select('COUNT(DISTINCT order.buyerId)', 'count');
    this.applyDateRange(buyersWithOrdersQb, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(buyersWithOrdersQb, query);

    const directRfqBuyersQb = this.directRfqRepo
      .createQueryBuilder('rfq')
      .select('COUNT(DISTINCT rfq.buyerId)', 'count');
    this.applyDateRange(directRfqBuyersQb, 'rfq', 'createdAt', query);
    this.applyRfqBuyerCountryFilter(directRfqBuyersQb, query);

    const marketRfqBuyersQb = this.marketRfqRepo
      .createQueryBuilder('rfq')
      .select('COUNT(DISTINCT rfq.buyerId)', 'count');
    this.applyDateRange(marketRfqBuyersQb, 'rfq', 'createdAt', query);
    this.applyRfqBuyerCountryFilter(marketRfqBuyersQb, query);

    const repeatBuyersQb = this.orderRepo
      .createQueryBuilder('order')
      .select('order.buyerId', 'buyerId')
      .groupBy('order.buyerId')
      .having('COUNT(order.id) > 1');
    this.applyDateRange(repeatBuyersQb, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(repeatBuyersQb, query);

    const [totalBuyers, activeBuyers, buyersWithOrders, buyersWithRfqs, repeatBuyers] = await Promise.all([
      totalBuyersQb.clone().getCount(),
      totalBuyersQb
        .clone()
        .andWhere('user.status = :active', { active: UserStatus.ACTIVE })
        .getCount(),
      buyersWithOrdersQb
        .getRawOne<{ count: string }>()
        .then((row) => Number(row?.count || 0)),
      directRfqBuyersQb
        .getRawOne<{ count: string }>()
        .then((direct) =>
          marketRfqBuyersQb
            .getRawOne<{ count: string }>()
            .then((market) => Number(direct?.count || 0) + Number(market?.count || 0)),
        ),
      repeatBuyersQb.getRawMany().then((rows) => rows.length),
    ]);

    return {
      success: true,
      data: {
        totalBuyers,
        activeBuyers,
        buyersWithOrders,
        buyersWithRfqs,
        repeatBuyers,
      },
    };
  }

  async getAdminCountries(
    query: AdminAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[] }> {
    const userRows = await this.userRepo
      .createQueryBuilder('user')
      .select('COALESCE(user.country, :unknown)', 'country')
      .addSelect(`SUM(CASE WHEN user.userType = '${UserType.BUYER}' THEN 1 ELSE 0 END)`, 'buyers')
      .addSelect(`SUM(CASE WHEN user.userType = '${UserType.SELLER}' THEN 1 ELSE 0 END)`, 'sellers')
      .setParameter('unknown', 'Unknown')
      .groupBy('country')
      .orderBy('buyers', 'DESC')
      .getRawMany<{ country: string; buyers: string; sellers: string }>();

    const data = await Promise.all(
      userRows.map(async (row) => {
        const orders = await this.orderRepo
          .createQueryBuilder('order')
          .innerJoin('order.buyer', 'buyer')
          .where('COALESCE(buyer.country, :unknown) = :country', {
            unknown: 'Unknown',
            country: row.country,
          });
        this.applyDateRange(orders, 'order', 'createdAt', query);
        const direct = await this.directRfqRepo
          .createQueryBuilder('rfq')
          .innerJoin('rfq.buyer', 'buyer')
          .where('COALESCE(buyer.country, :unknown) = :country', {
            unknown: 'Unknown',
            country: row.country,
          });
        this.applyDateRange(direct, 'rfq', 'createdAt', query);
        const market = await this.marketRfqRepo
          .createQueryBuilder('rfq')
          .innerJoin('rfq.buyer', 'buyer')
          .where('COALESCE(buyer.country, :unknown) = :country', {
            unknown: 'Unknown',
            country: row.country,
          });
        this.applyDateRange(market, 'rfq', 'createdAt', query);

        return {
          country: row.country,
          buyers: Number(row.buyers),
          sellers: Number(row.sellers),
          orders: await orders.getCount(),
          rfqs: (await direct.getCount()) + (await market.getCount()),
        };
      }),
    );

    return { success: true, data };
  }

  async getAdminCategories(
    query: AdminAnalyticsQueryDto,
    language: string,
  ): Promise<{ success: true; data: Record<string, unknown>[] }> {
    const currency = query.currency || config.analytics.reportingCurrency;
    const categories = await this.categoryRepo.find({ order: { sortOrder: 'ASC' } });
    const data = await Promise.all(
      categories.map(async (category) => {
        const productCountQb = this.productCategoryRepo
          .createQueryBuilder('pc')
          .innerJoin('pc.product', 'product')
          .where('pc.categoryId = :categoryId', { categoryId: category.id })
          .andWhere('product.status = :active', { active: ProductStatus.ACTIVE });
        this.applyDateRange(productCountQb, 'product', 'createdAt', query);
        if (query.country) {
          productCountQb
            .innerJoin('product.seller', 'categorySellerCountry')
            .andWhere('categorySellerCountry.country = :categorySellerCountry', {
              categorySellerCountry: query.country,
            });
        }

        const orderQb = this.orderItemRepo
          .createQueryBuilder('item')
          .innerJoin(Order, 'order', 'order.id = item.orderId')
          .innerJoin(ProductCategory, 'pc', 'pc.productId = item.productId')
          .where('pc.categoryId = :categoryId', { categoryId: category.id })
          .andWhere('order.orderCurrency = :currency', { currency });
        this.applyDateRange(orderQb, 'order', 'createdAt', query);
        this.applyOrderBuyerCountryFilter(orderQb, query);
        const directRfqQb = this.directRfqRepo
          .createQueryBuilder('rfq')
          .innerJoin(ProductCategory, 'pc', 'pc.productId = rfq.productId')
          .where('pc.categoryId = :categoryId', { categoryId: category.id });
        this.applyDateRange(directRfqQb, 'rfq', 'createdAt', query);
        this.applyRfqBuyerCountryFilter(directRfqQb, query);
        const marketRfqQb = this.marketRfqRepo
          .createQueryBuilder('rfq')
          .where('JSON_CONTAINS(rfq.categoryIds, JSON_QUOTE(:categoryId))', {
            categoryId: category.id,
          });
        this.applyDateRange(marketRfqQb, 'rfq', 'createdAt', query);
        this.applyRfqBuyerCountryFilter(marketRfqQb, query);
        const orderRows = await orderQb
          .select('COUNT(DISTINCT order.id)', 'orders')
          .addSelect('COALESCE(SUM(item.subtotal), 0)', 'gmv')
          .getRawOne<{ orders: string; gmv: string }>();

        return {
          categoryId: category.id,
          categoryName: resolveTranslation(category.name, language, category.sourceLanguage),
          products: await productCountQb.getCount(),
          orders: Number(orderRows?.orders || 0),
          rfqs: (await directRfqQb.getCount()) + (await marketRfqQb.getCount()),
          gmv: {
            reportingCurrency: currency,
            amount: roundMoney(toNumber(orderRows?.gmv || 0)),
          },
        };
      }),
    );

    return {
      success: true,
      data: data.sort((a, b) => Number(b.products) - Number(a.products)),
    };
  }

  async getAdminFunnel(
    query: AdminAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const productViewsQb = this.productViewRepo.createQueryBuilder('view');
    this.applyDateRange(productViewsQb, 'view', 'viewedAt', query);
    this.applyProductViewUserCountryFilter(productViewsQb, query);
    const checkoutQb = AppDataSource.getRepository(CheckoutSession).createQueryBuilder('checkout');
    this.applyDateRange(checkoutQb, 'checkout', 'createdAt', query);
    this.applyCheckoutUserCountryFilter(checkoutQb, query);
    const orderQb = this.orderRepo.createQueryBuilder('order');
    this.applyDateRange(orderQb, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(orderQb, query);
    const paymentQb = this.paymentRepo
      .createQueryBuilder('payment')
      .where('payment.status = :confirmed', { confirmed: PaymentStatus.CONFIRMED });
    this.applyDateRange(paymentQb, 'payment', 'createdAt', query);
    this.applyPaymentPayerCountryFilter(paymentQb, query);
    const completedQb = this.orderRepo
      .createQueryBuilder('order')
      .where('order.status = :completed', { completed: OrderStatus.COMPLETED });
    this.applyDateRange(completedQb, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(completedQb, query);

    const directCreated = this.directRfqRepo.createQueryBuilder('rfq');
    const marketCreated = this.marketRfqRepo.createQueryBuilder('rfq');
    const directQuotes = this.directRfqQuoteRepo.createQueryBuilder('quote');
    const marketQuotes = this.marketRfqQuoteRepo.createQueryBuilder('quote');
    this.applyDateRange(directCreated, 'rfq', 'createdAt', query);
    this.applyDateRange(marketCreated, 'rfq', 'createdAt', query);
    this.applyDateRange(directQuotes, 'quote', 'createdAt', query);
    this.applyDateRange(marketQuotes, 'quote', 'createdAt', query);
    this.applyRfqBuyerCountryFilter(directCreated, query);
    this.applyRfqBuyerCountryFilter(marketCreated, query);
    this.applyDirectQuoteBuyerCountryFilter(directQuotes, query);
    this.applyMarketQuoteBuyerCountryFilter(marketQuotes, query);

    const acceptedQuotes =
      (await directQuotes
        .clone()
        .andWhere('quote.status = :accepted', {
          accepted: DirectRFQQuoteStatus.ACCEPTED,
        })
        .getCount()) +
      (await marketQuotes
        .clone()
        .andWhere('quote.status = :accepted', {
          accepted: MarketRFQQuoteStatus.ACCEPTED,
        })
        .getCount());
    const rfqOrderQb = this.orderRepo
      .createQueryBuilder('order')
      .where('order.sourceType IN (:...sources)', {
        sources: [OrderSourceType.DIRECT_RFQ, OrderSourceType.MARKET_RFQ],
      });
    this.applyDateRange(rfqOrderQb, 'order', 'createdAt', query);
    const rfqCompletedQb = rfqOrderQb
      .clone()
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED });

    return {
      success: true,
      data: {
        productFlow: {
          productViews: await productViewsQb.getCount(),
          checkoutStarted: await checkoutQb.getCount(),
          ordersCreated: await orderQb.getCount(),
          paymentsSuccessful: await paymentQb.getCount(),
          ordersCompleted: await completedQb.getCount(),
        },
        rfqFlow: {
          rfqsCreated: (await directCreated.getCount()) + (await marketCreated.getCount()),
          quotesSubmitted: (await directQuotes.getCount()) + (await marketQuotes.getCount()),
          quotesAccepted: acceptedQuotes,
          ordersCreated: await rfqOrderQb.getCount(),
          ordersCompleted: await rfqCompletedQb.getCount(),
        },
      },
    };
  }

  async getAdminPaymentMethods(
    query: AdminAnalyticsQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[] }> {
    const qb = this.paymentRepo
      .createQueryBuilder('payment')
      .select('payment.paymentMethod', 'paymentMethod')
      .addSelect('COUNT(payment.id)', 'attempts')
      .addSelect(
        `SUM(CASE WHEN payment.status IN (:...successful) THEN 1 ELSE 0 END)`,
        'successful',
      )
      .addSelect(
        `SUM(CASE WHEN payment.status IN (:...failed) THEN 1 ELSE 0 END)`,
        'failed',
      )
      .setParameter('successful', PAYMENT_SUCCESS_STATUSES)
      .setParameter('failed', PAYMENT_FAILED_STATUSES)
      .groupBy('payment.paymentMethod')
      .orderBy('attempts', 'DESC');
    this.applyDateRange(qb, 'payment', 'createdAt', query);
    this.applyPaymentPayerCountryFilter(qb, query);
    if (query.currency) qb.andWhere('payment.currency = :currency', { currency: query.currency });
    const rows = await qb.getRawMany<{
      paymentMethod: string;
      attempts: string;
      successful: string;
      failed: string;
    }>();

    return {
      success: true,
      data: rows.map((row) => ({
        paymentMethod: row.paymentMethod,
        attempts: Number(row.attempts),
        successful: Number(row.successful || 0),
        failed: Number(row.failed || 0),
        successRate: ratio(Number(row.successful || 0), Number(row.attempts || 0)),
      })),
    };
  }

  async requestAnalyticsRebuild(
    adminId: string,
    dto: AnalyticsRebuildDto,
  ): Promise<{
    success: true;
    message: string;
    data: { jobId: string; status: AnalyticsRebuildJobStatus };
  }> {
    const job = await this.rebuildJobRepo.save(
      this.rebuildJobRepo.create({
        entityType: dto.entityType,
        entityId: dto.entityId ?? null,
        dateFrom: dto.dateFrom ?? null,
        dateTo: dto.dateTo ?? null,
        requestedByAdminId: adminId,
        status: AnalyticsRebuildJobStatus.PROCESSING,
        metadata: { queued: true },
      }),
    );

    await this.adminAuditRepo.save(
      this.adminAuditRepo.create({
        eventType: 'ANALYTICS_REBUILD_REQUESTED',
        actorAdminId: adminId,
        targetAdminId: null,
        targetUserId: null,
        targetRoleId: null,
        metadata: {
          jobId: job.id,
          entityType: dto.entityType,
          entityId: dto.entityId ?? null,
          dateFrom: dto.dateFrom ?? null,
          dateTo: dto.dateTo ?? null,
        },
      }),
    );

    return {
      success: true,
      message: 'Analytics rebuild has been queued.',
      data: { jobId: job.id, status: job.status },
    };
  }

  async requestUserReportExport(
    userId: string,
    dto: ReportExportDto,
  ): Promise<{
    success: true;
    message: string;
    data: { reportId: string; status: AnalyticsReportStatus };
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');

    if (user.userType === UserType.SELLER) {
      const entitlements = await this.subscriptionService.getEffectiveEntitlements(userId);
      if (!entitlements.report_export) {
        throw createError.forbidden(
          'Report export is not available on your current subscription.',
          'REPORT_EXPORT_NOT_AVAILABLE',
        );
      }
    }

    this.validateReportTypeForUser(user, dto.reportType);
    const report = await this.createReport('user', userId, dto);

    return {
      success: true,
      message: 'Your report is being generated.',
      data: { reportId: report.id, status: report.status },
    };
  }

  async requestAdminReportExport(
    adminId: string,
    dto: ReportExportDto,
  ): Promise<{
    success: true;
    message: string;
    data: { reportId: string; status: AnalyticsReportStatus };
  }> {
    this.validateReportTypeForAdmin(dto.reportType);
    const report = await this.createReport('admin', adminId, dto);
    await this.adminAuditRepo.save(
      this.adminAuditRepo.create({
        eventType: 'REPORT_EXPORT_REQUESTED',
        actorAdminId: adminId,
        targetAdminId: null,
        targetUserId: null,
        targetRoleId: null,
        metadata: {
          reportId: report.id,
          reportType: dto.reportType,
          format: dto.format,
        },
      }),
    );

    return {
      success: true,
      message: 'Your report is being generated.',
      data: { reportId: report.id, status: report.status },
    };
  }

  async getReportForRequester(
    requesterType: 'user' | 'admin',
    requesterId: string,
    reportId: string,
  ): Promise<{ success: true; data: AnalyticsReport }> {
    const report = await this.reportRepo.findOne({
      where: { id: reportId, requestedBy: requesterId, requestedByType: requesterType },
    });
    if (!report) throw createError.notFound('Report not found');
    return { success: true, data: report };
  }

  async recordSourceEvent(input: {
    sourceModule: string;
    eventName: string;
    sourceEventId: string;
    entityType: string | null;
    entityId: string | null;
    actorId: string | null;
    payload: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.analyticsEventRepo.save(this.analyticsEventRepo.create(input));
    } catch (err: unknown) {
      if (databaseErrorCode(err) === 'ER_DUP_ENTRY') return;
      throw err;
    }
  }

  private async assertSellerAnalyticsAccess(
    sellerId: string,
    allowedLevels?: AnalyticsLevel[],
  ): Promise<Record<string, unknown>> {
    const seller = await this.userRepo.findOne({ where: { id: sellerId } });
    if (!seller || seller.userType !== UserType.SELLER) {
      throw createError.forbidden('Seller analytics are only available to sellers');
    }

    const entitlements = await this.subscriptionService.getEffectiveEntitlements(sellerId);
    if (!entitlements.analytics_access) {
      throw createError.forbidden(
        'This analytics feature is not available on your current subscription.',
        'ANALYTICS_ACCESS_REQUIRED',
      );
    }

    const level = String(entitlements.analytics_level || 'basic') as AnalyticsLevel;
    if (allowedLevels && !allowedLevels.includes(level)) {
      throw createError.forbidden(
        'This analytics feature is not available on your current subscription.',
        'ANALYTICS_ACCESS_REQUIRED',
      );
    }

    return entitlements;
  }

  private async createReport(
    requesterType: 'user' | 'admin',
    requesterId: string,
    dto: ReportExportDto,
  ): Promise<AnalyticsReport> {
    if (financialReportTypes.includes(dto.reportType)) {
      if (dto.format !== 'csv') throw createError.badRequest('Financial exports currently support csv format');
      dto = {...dto, filters: financialReportFilters.parse({...dto.filters, ...(requesterType === 'user' ? {sellerId:requesterId} : {})})};
    }
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.analytics.reportRetentionDays);

    const report = await this.reportRepo.save(
      this.reportRepo.create({
        requestedBy: requesterId,
        requestedByType: requesterType,
        reportType: dto.reportType,
        format: dto.format as AnalyticsReportFormat,
        filters: dto.filters,
        status: AnalyticsReportStatus.PROCESSING,
        fileUrl: null,
        expiresAt,
        errorMessage: null,
        completedAt: null,
      }),
    );
    if (financialReportTypes.includes(dto.reportType)) {
      await generateFinancialReport(report);
      return this.reportRepo.findOneByOrFail({id:report.id});
    }
    return report;
  }

  private validateReportTypeForUser(user: User, reportType: string): void {
    if (user.userType === UserType.SELLER) {
      if (!SELLER_REPORT_TYPES.has(reportType)) {
        throw createError.forbidden('Seller reports are only available for seller analytics report types');
      }
      return;
    }

    if (user.userType === UserType.BUYER) {
      if (!BUYER_REPORT_TYPES.has(reportType)) {
        throw createError.forbidden('Buyer reports are only available for buyer analytics report types');
      }
      return;
    }

    throw createError.forbidden('Report export is not available for this user type');
  }

  private validateReportTypeForAdmin(reportType: string): void {
    if (!ADMIN_REPORT_TYPES.has(reportType)) {
      throw createError.badRequest('Unsupported admin report type');
    }
  }

  private async getSellerProductStatusCounts(sellerId: string): Promise<Record<string, number>> {
    const rows = await this.productRepo
      .createQueryBuilder('product')
      .select('product.status', 'status')
      .addSelect('COUNT(product.id)', 'count')
      .where('product.sellerId = :sellerId', { sellerId })
      .groupBy('product.status')
      .getRawMany<{ status: ProductStatus; count: string }>();
    const base = { total: 0, active: 0, inactive: 0, draft: 0, archived: 0 };
    for (const row of rows) {
      if (row.status !== ProductStatus.DELETED) {
        base.total += Number(row.count);
      }
      if (row.status in base) {
        base[row.status as keyof typeof base] = Number(row.count);
      }
    }
    return base;
  }

  private async countSellerProductViews(
    sellerId: string,
    query: DateRange,
  ): Promise<number> {
    const qb = this.productViewRepo
      .createQueryBuilder('view')
      .innerJoin(Product, 'product', 'product.id = view.productId')
      .where('product.sellerId = :sellerId', { sellerId });
    this.applyDateRange(qb, 'view', 'viewedAt', query);
    return qb.getCount();
  }

  private async getSellerOrderSummary(
    sellerId: string,
    query: DateRange,
  ): Promise<Record<string, number>> {
    const rows = await this.orderRepo
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(order.id)', 'count')
      .where('order.sellerId = :sellerId', { sellerId })
      .groupBy('order.status');
    this.applyDateRange(rows, 'order', 'createdAt', query);
    const grouped = await rows.getRawMany<{ status: OrderStatus; count: string }>();
    const total = grouped.reduce((sum, row) => sum + Number(row.count), 0);
    const completed = grouped.find((row) => row.status === OrderStatus.COMPLETED)?.count || 0;
    const cancelled = grouped.find((row) => row.status === OrderStatus.CANCELLED)?.count || 0;
    return {
      total,
      completed: Number(completed),
      cancelled: Number(cancelled),
      other: Math.max(total - Number(completed) - Number(cancelled), 0),
    };
  }

  private async getSellerOrderStatusBreakdown(
    sellerId: string,
    query: DateRange,
  ): Promise<Record<string, unknown>> {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(order.id)', 'count')
      .where('order.sellerId = :sellerId', { sellerId })
      .groupBy('order.status');
    this.applyDateRange(qb, 'order', 'createdAt', query);
    const rows = await qb.getRawMany<{ status: OrderStatus; count: string }>();
    const byStatus = Object.fromEntries(Object.values(OrderStatus).map((status) => [status, 0]));
    for (const row of rows) byStatus[row.status] = Number(row.count);
    const total = Object.values(byStatus).reduce((sum, count) => sum + Number(count), 0);

    return {
      total,
      byStatus,
      completionRate: ratio(byStatus[OrderStatus.COMPLETED], total),
      cancellationRate: ratio(byStatus[OrderStatus.CANCELLED], total),
    };
  }

  private async getSellerSalesByCurrency(
    sellerId: string,
    query: DateRange,
  ): Promise<CurrencyAmount[]> {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .select('order.orderCurrency', 'currency')
      .addSelect('COALESCE(SUM(order.productsSubtotal), 0)', 'amount')
      .where('order.sellerId = :sellerId', { sellerId })
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED })
      .groupBy('order.orderCurrency')
      .orderBy('amount', 'DESC');
    this.applyDateRange(qb, 'order', 'createdAt', query);
    const rows = await qb.getRawMany<{ currency: string; amount: string }>();
    return rows.map((row) => ({
      currency: row.currency,
      amount: roundMoney(toNumber(row.amount)),
    }));
  }

  private async getSellerRfqSummary(
    sellerId: string,
    query: DateRange,
  ): Promise<SellerRfqSummary> {
    const directReceived = this.directRfqRepo
      .createQueryBuilder('rfq')
      .where('rfq.sellerId = :sellerId', { sellerId });
    this.applyDateRange(directReceived, 'rfq', 'createdAt', query);

    const directQuotes = this.directRfqQuoteRepo
      .createQueryBuilder('quote')
      .where('quote.sellerId = :sellerId', { sellerId });
    this.applyDateRange(directQuotes, 'quote', 'createdAt', query);

    const marketQuotes = this.marketRfqQuoteRepo
      .createQueryBuilder('quote')
      .where('quote.sellerId = :sellerId', { sellerId });
    this.applyDateRange(marketQuotes, 'quote', 'createdAt', query);

    const [directReceivedCount, directResponded, directAccepted, marketResponded, marketAccepted, directExpired, marketExpired, directRejected, marketRejected, ordersCreated] =
      await Promise.all([
        directReceived.getCount(),
        directQuotes.clone().getCount(),
        directQuotes.clone().andWhere('quote.status = :accepted', { accepted: DirectRFQQuoteStatus.ACCEPTED }).getCount(),
        marketQuotes.clone().getCount(),
        marketQuotes.clone().andWhere('quote.status = :accepted', { accepted: MarketRFQQuoteStatus.ACCEPTED }).getCount(),
        directQuotes.clone().andWhere('quote.status = :expired', { expired: DirectRFQQuoteStatus.EXPIRED }).getCount(),
        marketQuotes.clone().andWhere('quote.status = :expired', { expired: MarketRFQQuoteStatus.EXPIRED }).getCount(),
        directQuotes.clone().andWhere('quote.status = :rejected', { rejected: DirectRFQQuoteStatus.REJECTED }).getCount(),
        marketQuotes.clone().andWhere('quote.status = :rejected', { rejected: MarketRFQQuoteStatus.REJECTED }).getCount(),
        this.orderRepo
          .createQueryBuilder('order')
          .where('order.sellerId = :sellerId', { sellerId })
          .andWhere('order.sourceType IN (:...sources)', {
            sources: [OrderSourceType.DIRECT_RFQ, OrderSourceType.MARKET_RFQ],
          })
          .getCount(),
      ]);

    const submitted = directResponded + marketResponded;
    const accepted = directAccepted + marketAccepted;
    const expired = directExpired + marketExpired;
    const rejected = directRejected + marketRejected;

    return {
      direct: {
        received: directReceivedCount,
        responded: directResponded,
        accepted: directAccepted,
      },
      market: {
        responded: marketResponded,
        accepted: marketAccepted,
      },
      quotes: {
        submitted,
        accepted,
        expired,
        rejected,
        other: Math.max(submitted - accepted - expired - rejected, 0),
      },
      quoteAcceptanceRate: ratio(accepted, submitted),
      ordersCreatedFromQuotes: ordersCreated,
    };
  }

  private async getSellerReviewSummary(
    sellerId: string,
    query: DateRange,
  ): Promise<Record<string, unknown> & { averageRating: number; totalReviews: number }> {
    const productQb = this.productReviewRepo
      .createQueryBuilder('review')
      .where('review.sellerId = :sellerId', { sellerId })
      .andWhere('review.status = :status', { status: ReviewStatus.PUBLISHED });
    this.applyDateRange(productQb, 'review', 'createdAt', query);

    const sellerQb = this.sellerReviewRepo
      .createQueryBuilder('review')
      .where('review.sellerId = :sellerId', { sellerId })
      .andWhere('review.status = :status', { status: ReviewStatus.PUBLISHED });
    this.applyDateRange(sellerQb, 'review', 'createdAt', query);

    const [product, seller, ratingRows] = await Promise.all([
      productQb
        .clone()
        .select('COUNT(review.id)', 'count')
        .addSelect('COALESCE(AVG(review.rating), 0)', 'avg')
        .getRawOne<{ count: string; avg: string }>(),
      sellerQb
        .clone()
        .select('COUNT(review.id)', 'count')
        .addSelect('COALESCE(AVG(review.overallRating), 0)', 'avg')
        .getRawOne<{ count: string; avg: string }>(),
      productQb
        .clone()
        .select('review.rating', 'rating')
        .addSelect('COUNT(review.id)', 'count')
        .groupBy('review.rating')
        .getRawMany<{ rating: string; count: string }>(),
    ]);

    const productReviews = Number(product?.count || 0);
    const sellerReviews = Number(seller?.count || 0);
    const totalReviews = productReviews + sellerReviews;
    const weighted =
      totalReviews > 0
        ? (toNumber(product?.avg) * productReviews + toNumber(seller?.avg) * sellerReviews) /
          totalReviews
        : 0;
    const ratingDistribution = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    for (const row of ratingRows) {
      const key = String(row.rating) as keyof typeof ratingDistribution;
      if (key in ratingDistribution) ratingDistribution[key] = Number(row.count);
    }

    return {
      averageRating: roundMoney(weighted),
      totalReviews,
      ratingDistribution,
      productReviews,
      sellerReviews,
    };
  }

  private async getSellerProductAnalyticsRow(
    product: Product,
    query: DateRange,
    language: string,
  ): Promise<SellerProductAnalyticsRow> {
    const viewQb = this.productViewRepo
      .createQueryBuilder('view')
      .where('view.productId = :productId', { productId: product.id });
    this.applyDateRange(viewQb, 'view', 'viewedAt', query);
    const views = await viewQb.getCount();

    const orderQb = this.orderItemRepo
      .createQueryBuilder('item')
      .innerJoin(Order, 'order', 'order.id = item.orderId')
      .where('item.productId = :productId', { productId: product.id })
      .andWhere('order.sellerId = :sellerId', { sellerId: product.sellerId });
    this.applyDateRange(orderQb, 'order', 'createdAt', query);
    const orderRows = await orderQb
      .clone()
      .select('COUNT(DISTINCT order.id)', 'orders')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'unitsOrdered')
      .addSelect('COALESCE(SUM(item.subtotal), 0)', 'sales')
      .getRawOne<{ orders: string; unitsOrdered: string; sales: string }>();
    const uniqueBuyers = await orderQb
      .clone()
      .select('COUNT(DISTINCT order.buyerId)', 'count')
      .getRawOne<{ count: string }>();
    const rfqQb = this.directRfqRepo
      .createQueryBuilder('rfq')
      .where('rfq.productId = :productId', { productId: product.id });
    this.applyDateRange(rfqQb, 'rfq', 'createdAt', query);

    const salesAmount = roundMoney(toNumber(orderRows?.sales || 0));

    return {
      productId: product.id,
      productName: resolveTranslation(product.productName, language, product.sourceLanguage),
      views,
      orders: Number(orderRows?.orders || 0),
      unitsOrdered: toNumber(orderRows?.unitsOrdered || 0),
      sales: {
        currency: product.currency,
        amount: salesAmount,
      },
      salesAmount,
      rfqCount: await rfqQb.getCount(),
      averageRating: roundMoney(toNumber(product.averageRating)),
      totalReviews: product.totalReviews,
      conversionRate: ratio(Number(uniqueBuyers?.count || 0), views),
      conversion: ratio(Number(uniqueBuyers?.count || 0), views),
      rating: roundMoney(toNumber(product.averageRating)),
    };
  }

  private async getBuyerOrderSummary(
    buyerId: string,
    query: DateRange,
  ): Promise<Record<string, number>> {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(order.id)', 'count')
      .where('order.buyerId = :buyerId', { buyerId })
      .groupBy('order.status');
    this.applyDateRange(qb, 'order', 'createdAt', query);
    const rows = await qb.getRawMany<{ status: OrderStatus; count: string }>();
    const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
    const completed = Number(rows.find((row) => row.status === OrderStatus.COMPLETED)?.count || 0);
    const cancelled = Number(rows.find((row) => row.status === OrderStatus.CANCELLED)?.count || 0);
    return {
      total,
      completed,
      active: Math.max(total - completed - cancelled, 0),
      cancelled,
    };
  }

  private async getBuyerSpendByCurrency(
    buyerId: string,
    query: DateRange,
  ): Promise<CurrencyAmount[]> {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .select('order.paymentCurrency', 'currency')
      .addSelect('COALESCE(SUM(order.paymentAmount), 0)', 'amount')
      .where('order.buyerId = :buyerId', { buyerId })
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED })
      .groupBy('order.paymentCurrency')
      .orderBy('amount', 'DESC');
    this.applyDateRange(qb, 'order', 'createdAt', query);
    const rows = await qb.getRawMany<{ currency: string; amount: string }>();
    return rows.map((row) => ({
      currency: row.currency,
      amount: roundMoney(toNumber(row.amount)),
    }));
  }

  private async getBuyerRfqSummary(
    buyerId: string,
    query: DateRange,
  ): Promise<Record<string, unknown>> {
    const direct = this.directRfqRepo
      .createQueryBuilder('rfq')
      .where('rfq.buyerId = :buyerId', { buyerId });
    this.applyDateRange(direct, 'rfq', 'createdAt', query);
    const market = this.marketRfqRepo
      .createQueryBuilder('rfq')
      .where('rfq.buyerId = :buyerId', { buyerId });
    this.applyDateRange(market, 'rfq', 'createdAt', query);
    const marketIds = await market.clone().select('rfq.id', 'id').getRawMany<{ id: string }>();
    const directIds = await direct.clone().select('rfq.id', 'id').getRawMany<{ id: string }>();

    const directQuotesReceived = directIds.length
      ? await this.directRfqQuoteRepo.count({
          where: { rfqId: In(directIds.map((row) => row.id)) },
        })
      : 0;
    const marketQuotesReceived = marketIds.length
      ? await this.marketRfqQuoteRepo.count({
          where: { rfqId: In(marketIds.map((row) => row.id)) },
        })
      : 0;
    const ordersCreatedFromQuotes = await this.orderRepo
      .createQueryBuilder('order')
      .where('order.buyerId = :buyerId', { buyerId })
      .andWhere('order.sourceType IN (:...sources)', {
        sources: [OrderSourceType.DIRECT_RFQ, OrderSourceType.MARKET_RFQ],
      });
    this.applyDateRange(ordersCreatedFromQuotes, 'order', 'createdAt', query);

    return {
      direct: {
        created: await direct.getCount(),
        quotesReceived: directQuotesReceived,
        accepted: await direct
          .clone()
          .andWhere('rfq.status = :accepted', {
            accepted: DirectRFQStatus.ACCEPTED,
          })
          .getCount(),
      },
      market: {
        created: await market.getCount(),
        quotesReceived: marketQuotesReceived,
        awarded: await market
          .clone()
          .andWhere('rfq.status = :awarded', {
            awarded: MarketRFQStatus.AWARDED,
          })
          .getCount(),
      },
      ordersCreatedFromQuotes: await ordersCreatedFromQuotes.getCount(),
    };
  }

  private async getAdminProductSummary(
    query: AdminAnalyticsQueryDto,
  ): Promise<Record<string, number>> {
    const totalQb = this.productRepo.createQueryBuilder('product');
    this.applyDateRange(totalQb, 'product', 'createdAt', query);
    this.applyProductSellerCountryFilter(totalQb, query);
    const activeQb = totalQb
      .clone()
      .andWhere('product.status = :active', { active: ProductStatus.ACTIVE });
    return {
      total: await totalQb.getCount(),
      active: await activeQb.getCount(),
    };
  }

  private async getAdminOrderOverview(
    query: AdminAnalyticsQueryDto,
  ): Promise<Record<string, number>> {
    const rowsQb = this.orderRepo
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(order.id)', 'count')
      .groupBy('order.status');
    this.applyDateRange(rowsQb, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(rowsQb, query);
    const rows = await rowsQb.getRawMany<{ status: OrderStatus; count: string }>();
    const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
    const completed = Number(rows.find((row) => row.status === OrderStatus.COMPLETED)?.count || 0);
    const cancelled = Number(rows.find((row) => row.status === OrderStatus.CANCELLED)?.count || 0);
    return { total, completed, cancelled };
  }

  private async getAdminGmv(
    currency: string,
    query: AdminAnalyticsQueryDto,
  ): Promise<number> {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .where('order.status = :completed', { completed: OrderStatus.COMPLETED })
      .andWhere('order.orderCurrency = :currency', { currency });
    this.applyDateRange(qb, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(qb, query);
    return this.sumFromQuery(qb, 'order.productsSubtotal');
  }

  private async getAdminRevenueSummary(
    query: AdminAnalyticsQueryDto & { currency: string },
  ): Promise<Record<string, unknown>> {
    const currency = query.currency;
    const transactionQb = this.orderRepo
      .createQueryBuilder('order')
      .where('order.orderCurrency = :currency', { currency })
      .andWhere('order.status = :completed', { completed: OrderStatus.COMPLETED });
    this.applyDateRange(transactionQb, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(transactionQb, query);
    const subscriptionQb = this.paymentRepo
      .createQueryBuilder('payment')
      .where('payment.currency = :currency', { currency })
      .andWhere('payment.status = :confirmed', { confirmed: PaymentStatus.CONFIRMED })
      .andWhere('(payment.sourceType = :source OR payment.purpose IN (:...purposes))', {
        source: 'subscription',
        purposes: ['subscription_purchase', 'subscription_renewal'],
          });
    this.applyDateRange(subscriptionQb, 'payment', 'createdAt', query);
    this.applyPaymentPayerCountryFilter(subscriptionQb, query);

    const transactionRevenue = await this.sumFromQuery(
      transactionQb,
      'order.transactionFeeAmount',
    );
    const subscriptionRevenue = await this.sumFromQuery(subscriptionQb, 'payment.amount');
    const afterSales = await afterSalesAnalytics(transactionQb);
    const transactionFeeReversals = Number(afterSales.feeReversals.find(r => r.currency === currency)?.amount ?? 0);

    return {
      reportingCurrency: currency,
      transactionRevenue,
      transactionFees: transactionRevenue,
      subscriptionRevenue,
      otherRevenue: 0,
      transactionFeeReversals,
      netTransactionRevenue: roundMoney(transactionRevenue - transactionFeeReversals),
      afterSales,
      totalRevenue: roundMoney(transactionRevenue + subscriptionRevenue - transactionFeeReversals),
    };
  }

  private async getAdminRfqSummary(
    query: AdminAnalyticsQueryDto,
  ): Promise<Record<string, unknown>> {
    const directQb = this.directRfqRepo.createQueryBuilder('rfq');
    const marketQb = this.marketRfqRepo.createQueryBuilder('rfq');
    const directQuoteQb = this.directRfqQuoteRepo.createQueryBuilder('quote');
    const marketQuoteQb = this.marketRfqQuoteRepo.createQueryBuilder('quote');
    this.applyDateRange(directQb, 'rfq', 'createdAt', query);
    this.applyDateRange(marketQb, 'rfq', 'createdAt', query);
    this.applyDateRange(directQuoteQb, 'quote', 'createdAt', query);
    this.applyDateRange(marketQuoteQb, 'quote', 'createdAt', query);
    this.applyRfqBuyerCountryFilter(directQb, query);
    this.applyRfqBuyerCountryFilter(marketQb, query);
    this.applyDirectQuoteBuyerCountryFilter(directQuoteQb, query);
    this.applyMarketQuoteBuyerCountryFilter(marketQuoteQb, query);

    const directOrders = this.orderRepo
      .createQueryBuilder('order')
      .where('order.sourceType = :source', { source: OrderSourceType.DIRECT_RFQ });
    this.applyDateRange(directOrders, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(directOrders, query);
    const marketOrders = this.orderRepo
      .createQueryBuilder('order')
      .where('order.sourceType = :source', { source: OrderSourceType.MARKET_RFQ });
    this.applyDateRange(marketOrders, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(marketOrders, query);

    return {
      direct: {
        created: await directQb.getCount(),
        responded: await directQuoteQb.getCount(),
        convertedToOrder: await directOrders.getCount(),
      },
      market: {
        created: await marketQb.getCount(),
        quotesReceived: await marketQuoteQb.getCount(),
        awarded: await marketQb
          .clone()
          .andWhere('rfq.status = :awarded', { awarded: MarketRFQStatus.AWARDED })
          .getCount(),
        convertedToOrder: await marketOrders.getCount(),
      },
      totalOrdersCreatedFromQuotes: (await directOrders.getCount()) + (await marketOrders.getCount()),
    };
  }

  private async getTopCategories(
    query: AdminAnalyticsQueryDto,
    language: string,
  ): Promise<Record<string, unknown>[]> {
    const categoryQb = this.productCategoryRepo
      .createQueryBuilder('pc')
      .innerJoin('pc.category', 'category')
      .innerJoin('pc.product', 'product')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('COUNT(DISTINCT product.id)', 'products')
      .where('product.status = :active', { active: ProductStatus.ACTIVE })
      .groupBy('category.id')
      .addGroupBy('category.name')
      .orderBy('products', 'DESC')
      .limit(10);
    if (query.country) {
      categoryQb
        .innerJoin('product.seller', 'categoryProductSellerCountry')
        .andWhere('categoryProductSellerCountry.country = :categoryCountry', {
          categoryCountry: query.country,
        });
    }
    const rows = await categoryQb.getRawMany<{
      categoryId: string;
      categoryName: Record<string, string>;
      products: string;
    }>();

    return Promise.all(
      rows.map(async (row) => {
        const orderQb = this.orderItemRepo
          .createQueryBuilder('item')
          .innerJoin(Order, 'order', 'order.id = item.orderId')
          .innerJoin(ProductCategory, 'pc', 'pc.productId = item.productId')
          .where('pc.categoryId = :categoryId', { categoryId: row.categoryId });
        this.applyDateRange(orderQb, 'order', 'createdAt', query);
        this.applyOrderBuyerCountryFilter(orderQb, query);
        if (query.currency) {
          orderQb.andWhere('order.orderCurrency = :currency', {
            currency: query.currency,
          });
        }
        return {
          categoryId: row.categoryId,
          categoryName: resolveMaybeTranslation(row.categoryName, language),
          products: Number(row.products),
          orders: await orderQb.select('COUNT(DISTINCT order.id)', 'count').getRawOne<{ count: string }>().then((r) => Number(r?.count || 0)),
        };
      }),
    );
  }

  private async getTopProducts(
    query: AdminAnalyticsQueryDto,
    language: string,
  ): Promise<Record<string, unknown>[]> {
    const productQb = this.productRepo
      .createQueryBuilder('product')
      .orderBy('product.totalReviews', 'DESC')
      .addOrderBy('product.createdAt', 'DESC')
      .limit(20);
    this.applyProductSellerCountryFilter(productQb, query);
    const products = await productQb.getMany();
    const rows = await Promise.all(
      products.map(async (product) => {
        const orderQb = this.orderItemRepo
          .createQueryBuilder('item')
          .innerJoin(Order, 'order', 'order.id = item.orderId')
          .where('item.productId = :productId', { productId: product.id });
        this.applyDateRange(orderQb, 'order', 'createdAt', query);
        this.applyOrderBuyerCountryFilter(orderQb, query);
        if (query.currency) {
          orderQb.andWhere('order.orderCurrency = :currency', {
            currency: query.currency,
          });
        }
        const viewsQb = this.productViewRepo
          .createQueryBuilder('view')
          .where('view.productId = :productId', { productId: product.id });
        this.applyDateRange(viewsQb, 'view', 'viewedAt', query);
        this.applyProductViewUserCountryFilter(viewsQb, query);
        return {
          productId: product.id,
          productName: resolveTranslation(product.productName, language, product.sourceLanguage),
          orders: await orderQb.select('COUNT(DISTINCT order.id)', 'count').getRawOne<{ count: string }>().then((row) => Number(row?.count || 0)),
          views: await viewsQb.getCount(),
        };
      }),
    );
    return rows.sort((a, b) => Number(b.orders) - Number(a.orders)).slice(0, 10);
  }

  private async groupOrderCount(
    column: string,
    query: OrderAnalyticsFilter,
  ): Promise<Record<string, number>> {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .select(column, 'key')
      .addSelect('COUNT(order.id)', 'count')
      .groupBy('key');
    this.applyDateRange(qb, 'order', 'createdAt', query);
    this.applyOrderBuyerCountryFilter(qb, query);
    if (query.source) qb.andWhere('order.sourceType = :source', { source: query.source });
    if (query.status) qb.andWhere('order.status = :status', { status: query.status });
    const rows = await qb.getRawMany<{ key: string; count: string }>();
    return Object.fromEntries(rows.map((row) => [row.key, Number(row.count)]));
  }

  private async paymentBuckets(qb: SelectQueryBuilder<Payment>): Promise<PaymentBuckets> {
    const row = await qb
      .select('COUNT(payment.id)', 'total')
      .addSelect(
        `SUM(CASE WHEN payment.status IN (:...successStatuses) THEN 1 ELSE 0 END)`,
        'successful',
      )
      .addSelect(
        `SUM(CASE WHEN payment.status IN (:...pendingStatuses) THEN 1 ELSE 0 END)`,
        'pendingVerification',
      )
      .addSelect(
        `SUM(CASE WHEN payment.status IN (:...failedStatuses) THEN 1 ELSE 0 END)`,
        'failed',
      )
      .setParameter('successStatuses', PAYMENT_SUCCESS_STATUSES)
      .setParameter('pendingStatuses', PAYMENT_PENDING_VERIFICATION_STATUSES)
      .setParameter('failedStatuses', PAYMENT_FAILED_STATUSES)
      .getRawOne<PaymentBuckets>();

    return {
      total: Number(row?.total || 0),
      successful: Number(row?.successful || 0),
      pendingVerification: Number(row?.pendingVerification || 0),
      failed: Number(row?.failed || 0),
    };
  }

  private async sumFromQuery<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    expression: string,
  ): Promise<number> {
    const row = await qb
      .select(`COALESCE(SUM(${expression}), 0)`, 'total')
      .getRawOne<{ total: string }>();
    return roundMoney(toNumber(row?.total || 0));
  }

  private applyDateRange<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    alias: string,
    column: string,
    query: DateRange,
  ): void {
    if (query.dateFrom) {
      qb.andWhere(`${alias}.${column} >= :${alias}_${column}_dateFrom`, {
        [`${alias}_${column}_dateFrom`]: `${query.dateFrom} 00:00:00`,
      });
    }
    if (query.dateTo) {
      qb.andWhere(`${alias}.${column} <= :${alias}_${column}_dateTo`, {
        [`${alias}_${column}_dateTo`]: `${query.dateTo} 23:59:59`,
      });
    }
  }

  private applyOrderBuyerCountryFilter<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    query: CountryFilter,
  ): void {
    if (!query.country) return;
    qb.innerJoin('order.buyer', 'orderBuyerCountry').andWhere(
      'orderBuyerCountry.country = :orderBuyerCountry',
      { orderBuyerCountry: query.country },
    );
  }

  private applyPaymentPayerCountryFilter<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    query: CountryFilter,
  ): void {
    if (!query.country) return;
    qb.innerJoin('payment.payer', 'paymentPayerCountry').andWhere(
      'paymentPayerCountry.country = :paymentPayerCountry',
      { paymentPayerCountry: query.country },
    );
  }

  private applyProductSellerCountryFilter<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    query: CountryFilter,
  ): void {
    if (!query.country) return;
    qb.innerJoin('product.seller', 'productSellerCountry').andWhere(
      'productSellerCountry.country = :productSellerCountry',
      { productSellerCountry: query.country },
    );
  }

  private applyProductViewUserCountryFilter<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    query: CountryFilter,
  ): void {
    if (!query.country) return;
    qb.innerJoin('view.user', 'viewUserCountry').andWhere(
      'viewUserCountry.country = :viewUserCountry',
      { viewUserCountry: query.country },
    );
  }

  private applyCheckoutUserCountryFilter<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    query: CountryFilter,
  ): void {
    if (!query.country) return;
    qb.innerJoin('checkout.user', 'checkoutUserCountry').andWhere(
      'checkoutUserCountry.country = :checkoutUserCountry',
      { checkoutUserCountry: query.country },
    );
  }

  private applyRfqBuyerCountryFilter<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    query: CountryFilter,
  ): void {
    if (!query.country) return;
    qb.innerJoin('rfq.buyer', 'rfqBuyerCountry').andWhere(
      'rfqBuyerCountry.country = :rfqBuyerCountry',
      { rfqBuyerCountry: query.country },
    );
  }

  private applyDirectQuoteBuyerCountryFilter<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    query: CountryFilter,
  ): void {
    if (!query.country) return;
    qb.innerJoin('quote.rfq', 'directQuoteRfqCountry')
      .innerJoin('directQuoteRfqCountry.buyer', 'directQuoteBuyerCountry')
      .andWhere('directQuoteBuyerCountry.country = :directQuoteBuyerCountry', {
        directQuoteBuyerCountry: query.country,
      });
  }

  private applyMarketQuoteBuyerCountryFilter<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    query: CountryFilter,
  ): void {
    if (!query.country) return;
    qb.innerJoin('quote.rfq', 'marketQuoteRfqCountry')
      .innerJoin('marketQuoteRfqCountry.buyer', 'marketQuoteBuyerCountry')
      .andWhere('marketQuoteBuyerCountry.country = :marketQuoteBuyerCountry', {
        marketQuoteBuyerCountry: query.country,
      });
  }

  private applySubscriptionUserCountryFilter<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    query: CountryFilter,
  ): void {
    if (!query.country) return;
    qb.innerJoin('subscription.user', 'subscriptionUserCountry').andWhere(
      'subscriptionUserCountry.country = :subscriptionUserCountry',
      { subscriptionUserCountry: query.country },
    );
  }

  private periodExpression(column: string, groupBy: 'day' | 'week' | 'month'): string {
    if (groupBy === 'day') return `DATE_FORMAT(${column}, '%Y-%m-%d')`;
    if (groupBy === 'week') return `DATE_FORMAT(${column}, '%x-W%v')`;
    return `DATE_FORMAT(${column}, '%Y-%m')`;
  }

  private comparisonRange(query: DateRange): { current: DateRange; previous: DateRange } {
    const to = query.dateTo ? new Date(`${query.dateTo}T23:59:59.000Z`) : new Date();
    const from = query.dateFrom
      ? new Date(`${query.dateFrom}T00:00:00.000Z`)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const diff = to.getTime() - from.getTime();
    const previousTo = new Date(from.getTime() - 1000);
    const previousFrom = new Date(previousTo.getTime() - diff);

    return {
      current: {
        dateFrom: toDateOnly(from),
        dateTo: toDateOnly(to),
      },
      previous: {
        dateFrom: toDateOnly(previousFrom),
        dateTo: toDateOnly(previousTo),
      },
    };
  }

  private async getSellerProductIds(sellerId: string): Promise<string[]> {
    return this.productRepo
      .createQueryBuilder('product')
      .select('product.id', 'id')
      .where('product.sellerId = :sellerId', { sellerId })
      .getRawMany<{ id: string }>()
      .then((rows) => rows.map((row) => row.id));
  }

  private async firstSellerCurrency(sellerId: string): Promise<string | null> {
    const row = await this.orderRepo
      .createQueryBuilder('order')
      .select('order.orderCurrency', 'currency')
      .where('order.sellerId = :sellerId', { sellerId })
      .orderBy('order.createdAt', 'DESC')
      .getRawOne<{ currency: string }>();
    return row?.currency ?? null;
  }

  private async firstBuyerCurrency(buyerId: string): Promise<string | null> {
    const row = await this.orderRepo
      .createQueryBuilder('order')
      .select('order.paymentCurrency', 'currency')
      .where('order.buyerId = :buyerId', { buyerId })
      .orderBy('order.createdAt', 'DESC')
      .getRawOne<{ currency: string }>();
    return row?.currency ?? null;
  }
}

function percentageChange(
  current: number,
  previous: number,
): { percentageChange: number | null; comparisonAvailable: boolean } {
  if (previous === 0) {
    return { percentageChange: null, comparisonAvailable: false };
  }
  return {
    percentageChange: roundMoney(((current - previous) / previous) * 100),
    comparisonAvailable: true,
  };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return roundMoney((numerator / denominator) * 100);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function usageBucket(used: number, limit: number | null): Record<string, number | null> {
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(limit - used, 0),
  };
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function resolveMaybeTranslation(
  value: unknown,
  language: string,
  sourceLanguage?: string | null,
): string | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as TranslationMap;
      return resolveTranslation(parsed, language, sourceLanguage);
    } catch {
      return value;
    }
  }

  if (!value || typeof value !== 'object') return null;
  return resolveTranslation(value as TranslationMap, language, sourceLanguage);
}

export function productNameSnapshotToString(
  snapshot: OrderProductNameSnapshot,
): string | null {
  if (typeof snapshot === 'string') return snapshot;
  return snapshot.displayName;
}
