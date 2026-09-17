import { SellerPayoutAccount, SellerSettlement, SettlementHold, SellerSettlementAdjustment, SellerPayout, PayoutAttempt, SettlementAdjustmentAllocation, SettlementEvent } from './entities/settlement.entities';
import { SavedProduct } from './entities/saved-product.entity';
import { Referral } from './entities/referral.entity';
import { RewardRule } from './entities/reward-rule.entity';
import { RewardLedgerSubscriber } from '../modules/reward/reward.subscriber';
import { SystemSetting } from './entities/system-setting.entity';
import { MarketplaceCountry } from './entities/marketplace-country.entity';
import { MarketplaceCurrency } from './entities/marketplace-currency.entity';
import { PaymentMethodConfig } from './entities/payment-method-config.entity';
import { AuditExport } from './entities/audit-export.entity';
import { AuditLog } from './entities/audit-log.entity';
import { AuditLogSubscriber } from '../modules/audit-log/audit-log.subscriber';
import { ReturnRequest } from './entities/returns.entity';
import { ReturnItem } from './entities/return-items.entity';
import { ReturnEvidence } from './entities/return-evidence.entity';
import { Refund } from './entities/refunds.entity';
import { FinancialAdjustment } from './entities/financial-adjustments.entity';
import { AfterSalesSetting } from './entities/after-sales-settings.entity';
import { AfterSalesEvent } from './entities/after-sales-events.entity';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseConfig } from '../config/database';
import { User } from './entities/user.entity';
import { Admin } from './entities/admin.entity';
import { AdminAuditEvent } from './entities/admin-audit-event.entity';
import { AdminRoleEntity } from './entities/admin-role.entity';
import { AdminRolePermission } from './entities/admin-role-permission.entity';
import { Permission } from './entities/permission.entity';
import { CompanyVerification } from './entities/company-verification.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { ProductCategory } from './entities/product-category.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductVariantOption } from './entities/product-variant-option.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { UserAddress } from './entities/user-address.entity';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { CheckoutDraft } from './entities/checkout-draft.entity';
import { CheckoutSession } from './entities/checkout-session.entity';
import { CheckoutSellerGroup } from './entities/checkout-seller-group.entity';
import { Payment } from './entities/payment.entity';
import { PaymentProvider } from './entities/payment-provider.entity';
import { PaymentAccount } from './entities/payment-account.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentAuditLog } from './entities/payment-audit-log.entity';
import { LetterOfCreditDetail } from './entities/letter-of-credit-detail.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderDelivery } from './entities/order-delivery.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { OrderCancellationRequest } from './entities/order-cancellation-request.entity';
import { LogisticsProvider } from './entities/logistics-provider.entity';
import { LogisticsQuote } from './entities/logistics-quote.entity';
import { Shipment } from './entities/shipment.entity';
import { ShipmentStatusHistory } from './entities/shipment-status-history.entity';
import { B2BLogisticsRequest } from './entities/b2b-logistics-request.entity';
import { B2BLogisticsQuote } from './entities/b2b-logistics-quote.entity';
import { DirectRFQ } from './entities/direct-rfq.entity';
import { DirectRFQQuote } from './entities/direct-rfq-quote.entity';
import { DirectRFQQuoteVersion } from './entities/direct-rfq-quote-version.entity';
import { DirectRFQAuditEvent } from './entities/direct-rfq-audit-event.entity';
import { MarketRFQ } from './entities/market-rfq.entity';
import { MarketRFQQuote } from './entities/market-rfq-quote.entity';
import { MarketRFQQuoteVersion } from './entities/market-rfq-quote-version.entity';
import { MarketRFQSellerVisibility } from './entities/market-rfq-seller-visibility.entity';
import { MarketRFQSellerView } from './entities/market-rfq-seller-view.entity';
import { MarketRFQAuditEvent } from './entities/market-rfq-audit-event.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { SubscriptionPlanPrice } from './entities/subscription-plan-price.entity';
import { EntitlementDefinition } from './entities/entitlement-definition.entity';
import { SubscriptionPlanEntitlement } from './entities/subscription-plan-entitlement.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { SubscriptionAuditEvent } from './entities/subscription-audit-event.entity';
import { ReviewEligibility } from './entities/review-eligibility.entity';
import { ProductReview } from './entities/product-review.entity';
import { SellerReview } from './entities/seller-review.entity';
import { ReviewVote } from './entities/review-vote.entity';
import { ReviewResponse } from './entities/review-response.entity';
import { RewardSetting } from './entities/reward-setting.entity';
import { PointsTransaction } from './entities/points-transaction.entity';
import { ReviewAuditEvent } from './entities/review-audit-event.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message } from './entities/message.entity';
import { MessageAttachment } from './entities/message-attachment.entity';
import { MessageUpload } from './entities/message-upload.entity';
import { MessageReport } from './entities/message-report.entity';
import { MessageSetting } from './entities/message-setting.entity';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { SystemAnnouncement } from './entities/system-announcement.entity';
import { Language } from './entities/language.entity';
import { TranslationMetadata } from './entities/translation-metadata.entity';
import { FeaturedProduct } from './entities/featured-product.entity';
import { FeaturedStore } from './entities/featured-store.entity';
import { ProductView } from './entities/product-view.entity';
import { SearchEvent } from './entities/search-event.entity';
import { SearchHistory } from './entities/search-history.entity';
import { SearchIndexJob } from './entities/search-index-job.entity';
import { SearchSetting } from './entities/search-setting.entity';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsReport } from './entities/analytics-report.entity';
import { AnalyticsRebuildJob } from './entities/analytics-rebuild-job.entity';
import { Dispute } from './entities/dispute.entity';
import { DisputeAuditEvent } from './entities/dispute-audit-event.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeEvidenceUpload } from './entities/dispute-evidence-upload.entity';
import { DisputeItem } from './entities/dispute-item.entity';
import { DisputeMessage } from './entities/dispute-message.entity';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: databaseConfig.host,
  port: databaseConfig.port,
  username: databaseConfig.username,
  password: databaseConfig.password,
  database: databaseConfig.name,

  // Production SSL always verifies the Azure MySQL certificate chain.
  ssl: databaseConfig.ssl,

  synchronize: false, // NEVER true in production — use migrations
  logging: databaseConfig.isDev ? ['query', 'error'] : ['error'],
  logger: 'advanced-console',

  subscribers: [RewardLedgerSubscriber,AuditLogSubscriber],
  entities: [SellerPayoutAccount, SellerSettlement, SettlementHold, SellerSettlementAdjustment, SellerPayout, PayoutAttempt, SettlementAdjustmentAllocation, SettlementEvent,SavedProduct,Referral, RewardRule,SystemSetting, MarketplaceCountry, MarketplaceCurrency, PaymentMethodConfig,AuditLog, AuditExport,
    ReturnRequest, ReturnItem, ReturnEvidence, Refund, FinancialAdjustment, AfterSalesSetting, AfterSalesEvent,
    User,
    Admin,
    AdminAuditEvent,
    AdminRoleEntity,
    AdminRolePermission,
    Permission,
    CompanyVerification,
    RefreshToken,
    Category,
    Product,
    ProductCategory,
    ProductImage,
    ProductVariantOption,
    ProductVariant,
    UserAddress,
    Cart,
    CartItem,
    CheckoutDraft,
    CheckoutSession,
    CheckoutSellerGroup,
    Payment,
    PaymentProvider,
    PaymentAccount,
    PaymentAttempt,
    PaymentAuditLog,
    LetterOfCreditDetail,
    Order,
    OrderItem,
    OrderDelivery,
    OrderStatusHistory,
    OrderCancellationRequest,
    LogisticsProvider,
    LogisticsQuote,
    Shipment,
    ShipmentStatusHistory,
    B2BLogisticsRequest,
    B2BLogisticsQuote,
    DirectRFQ,
    DirectRFQQuote,
    DirectRFQQuoteVersion,
    DirectRFQAuditEvent,
    MarketRFQ,
    MarketRFQQuote,
    MarketRFQQuoteVersion,
    MarketRFQSellerVisibility,
    MarketRFQSellerView,
    MarketRFQAuditEvent,
    SubscriptionPlan,
    SubscriptionPlanPrice,
    EntitlementDefinition,
    SubscriptionPlanEntitlement,
    UserSubscription,
    SubscriptionAuditEvent,
    ReviewEligibility,
    ProductReview,
    SellerReview,
    ReviewVote,
    ReviewResponse,
    RewardSetting,
    PointsTransaction,
    ReviewAuditEvent,
    Conversation,
    ConversationParticipant,
    Message,
    MessageAttachment,
    MessageUpload,
    MessageReport,
    MessageSetting,
    Notification,
    NotificationPreference,
    SystemAnnouncement,
    Language,
    TranslationMetadata,
    FeaturedProduct,
    FeaturedStore,
    ProductView,
    SearchEvent,
    SearchHistory,
    SearchIndexJob,
    SearchSetting,
    AnalyticsEvent,
    AnalyticsReport,
    AnalyticsRebuildJob,
    Dispute,
    DisputeItem,
    DisputeEvidence,
    DisputeEvidenceUpload,
    DisputeMessage,
    DisputeAuditEvent,
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],

  // Connection pool tuning for Azure MySQL
  extra: {
    connectionLimit: databaseConfig.isProd ? 20 : 5,
    waitForConnections: true,
    queueLimit: 0,
    connectTimeout: 30000,
  },
});
