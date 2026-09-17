import { databaseConfig } from './database';
import { environment, parseBoolean, requireEnv } from './environment';

const isProd = environment === 'production';
const isAppService = Boolean(process.env.WEBSITE_SITE_NAME?.trim());
const host = process.env.HOST || (isAppService ? '0.0.0.0' : '127.0.0.1');
const emailDeliveryEnabled = parseBoolean(process.env.EMAIL_DELIVERY_ENABLED, false);
const swaggerEnabled = parseBoolean(process.env.SWAGGER_ENABLED, !isProd);
const swaggerRequireAuth = parseBoolean(
  process.env.SWAGGER_REQUIRE_AUTH,
  swaggerEnabled && isProd,
);
const paymentWebhooksEnabled = parseBoolean(
  process.env.PAYMENT_WEBHOOKS_ENABLED,
  false,
);
const logisticsWebhooksEnabled = parseBoolean(
  process.env.LOGISTICS_WEBHOOKS_ENABLED,
  false,
);

if (swaggerRequireAuth && !swaggerEnabled) {
  throw new Error('SWAGGER_REQUIRE_AUTH cannot be enabled when Swagger is disabled');
}

if (isProd && swaggerEnabled && !swaggerRequireAuth) {
  throw new Error('Production Swagger must require authentication');
}

if (isProd && isAppService && host !== '0.0.0.0' && host !== '::') {
  throw new Error('Azure App Service must listen on all worker interfaces');
}

if (isProd && !isAppService && host !== '127.0.0.1' && host !== '::1') {
  throw new Error('Non-App-Service production hosts must remain loopback-only');
}

const trustedProxyCidrs = (process.env.TRUSTED_PROXY_CIDRS || '')
  .split(',')
  .map((cidr) => cidr.trim())
  .filter(Boolean);

if (isAppService && trustedProxyCidrs.length === 0) {
  throw new Error('TRUSTED_PROXY_CIDRS is required on Azure App Service');
}

function parseCsvEnv(key: string): string[] {
  return (process.env[key] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const buyerDisputeReasons = parseCsvEnv('DISPUTE_BUYER_REASONS');
const sellerDisputeReasons = parseCsvEnv('DISPUTE_SELLER_REASONS');

export const config = {
  env: environment,
  isDev: environment === 'development',
  isProd,

  app: {
    host,
    port: Number.parseInt(process.env.PORT || '3000', 10),
    isAppService,
    trustedProxyCidrs,
    name: process.env.APP_NAME || 'Traders of Africa',
    url: requireEnv('APP_URL'),
    frontendUrl: requireEnv('FRONTEND_URL'),
  },

  cors: {
    origins: parseCsvEnv('CORS_ORIGINS'),
  },

  db: databaseConfig,

  jwt: {
    accessSecret: requireEnv('JWT_ACCESS_SECRET'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  postmark: {
    enabled: emailDeliveryEnabled,
    apiToken: emailDeliveryEnabled ? requireEnv('POSTMARK_API_TOKEN') : null,
    fromEmail: emailDeliveryEnabled ? requireEnv('POSTMARK_FROM_EMAIL') : null,
    fromName: process.env.POSTMARK_FROM_NAME || 'Traders of Africa',
  },

  swagger: {
    enabled: swaggerEnabled,
    requireAuth: swaggerRequireAuth,
    username: swaggerRequireAuth ? requireEnv('SWAGGER_USERNAME') : null,
    password: swaggerRequireAuth ? requireEnv('SWAGGER_PASSWORD') : null,
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
  },

  upload: {
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10),
    allowedMimeTypes: (
      process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/webp'
    ).split(','),
  },

  storage: {
    accountName: requireEnv('AZURE_STORAGE_ACCOUNT_NAME'),
    containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || 'backend',
  },

  payment: {
    webhooksEnabled: paymentWebhooksEnabled,
    webhookSharedSecret: paymentWebhooksEnabled
      ? requireEnv('PAYMENT_WEBHOOK_SHARED_SECRET')
      : null,
  },

  logistics: {
    quoteTtlMinutes: parseInt(process.env.LOGISTICS_QUOTE_TTL_MINUTES || '30', 10),
    trackingBaseUrl:
      process.env.LOGISTICS_TRACKING_BASE_URL ||
      `${process.env.APP_URL || 'http://localhost:3000'}/logistics/tracking`,
    webhooksEnabled: logisticsWebhooksEnabled,
    webhookSharedSecret: logisticsWebhooksEnabled
      ? requireEnv('LOGISTICS_WEBHOOK_SHARED_SECRET')
      : null,
  },

  directRfq: {
    defaultExpiryDays: parseInt(process.env.DIRECT_RFQ_DEFAULT_EXPIRY_DAYS || '14', 10),
    checkoutExpiryHours: parseInt(process.env.DIRECT_RFQ_CHECKOUT_EXPIRY_HOURS || '24', 10),
  },

  marketRfq: {
    checkoutExpiryHours: parseInt(process.env.MARKET_RFQ_CHECKOUT_EXPIRY_HOURS || '24', 10),
    sellerNotificationLimit: parseInt(process.env.MARKET_RFQ_SELLER_NOTIFICATION_LIMIT || '50', 10),
  },

  subscription: {
    defaultCurrency: (process.env.SUBSCRIPTION_DEFAULT_CURRENCY || 'NGN').toUpperCase(),
    paymentExpiryHours: parseInt(process.env.SUBSCRIPTION_PAYMENT_EXPIRY_HOURS || '24', 10),
    expiryReminderDays: (process.env.SUBSCRIPTION_EXPIRY_REMINDER_DAYS || '7,1')
      .split(',')
      .map((value) => parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0),
  },

  analytics: {
    reportingCurrency: (
      process.env.ANALYTICS_REPORTING_CURRENCY || 'USD'
    ).toUpperCase(),
    reportRetentionDays: parseInt(
      process.env.ANALYTICS_REPORT_RETENTION_DAYS || '7',
      10,
    ),
  },

  refunds: {
    paystackEnabled: process.env.PAYSTACK_REFUNDS_ENABLED === 'true',
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || '',
  },

  reviews: {
    submissionWindowDays: parseInt(process.env.REVIEW_SUBMISSION_WINDOW_DAYS || '60', 10),
    reminderDays: parseInt(process.env.REVIEW_REMINDER_DAYS || '5', 10),
    maxImages: parseInt(process.env.REVIEW_MAX_IMAGES || '5', 10),
    imageMaxFileSizeMb: parseInt(process.env.REVIEW_IMAGE_MAX_FILE_SIZE_MB || '5', 10),
    imageAllowedMimeTypes: (
      process.env.REVIEW_IMAGE_ALLOWED_MIME_TYPES ||
      'image/jpeg,image/jpg,image/png,image/webp'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  },

  rewards: {
    productReviewPoints: parseInt(process.env.REWARD_PRODUCT_REVIEW_POINTS || '10', 10),
    sellerReviewPoints: parseInt(process.env.REWARD_SELLER_REVIEW_POINTS || '10', 10),
    reviewWithImageBonus: parseInt(process.env.REWARD_REVIEW_WITH_IMAGE_BONUS || '5', 10),
    minimumReviewCharacters: parseInt(process.env.REWARD_MINIMUM_REVIEW_CHARACTERS || '25', 10),
    maxReviewRewardPerOrder: parseInt(process.env.REWARD_MAX_REVIEW_REWARD_PER_ORDER || '30', 10),
  },

  messageCenter: {
    maxMessageCharacters: parseInt(process.env.MESSAGE_MAX_CHARACTERS || '5000', 10),
    maxAttachmentsPerMessage: parseInt(
      process.env.MESSAGE_MAX_ATTACHMENTS_PER_MESSAGE || '5',
      10,
    ),
    maxAttachmentSizeMb: parseInt(process.env.MESSAGE_MAX_ATTACHMENT_SIZE_MB || '20', 10),
    allowedAttachmentTypes: (
      process.env.MESSAGE_ALLOWED_ATTACHMENT_TYPES ||
      'jpg,jpeg,png,webp,pdf,doc,docx,xls,xlsx,csv,txt'
    )
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    messageEditWindowMinutes: parseInt(process.env.MESSAGE_EDIT_WINDOW_MINUTES || '15', 10),
    unreadEmailDelayMinutes: parseInt(process.env.MESSAGE_UNREAD_EMAIL_DELAY_MINUTES || '30', 10),
    reportingEnabled: process.env.MESSAGE_REPORTING_ENABLED !== 'false',
  },

  disputes: {
    windowDays: parseInt(process.env.DISPUTE_WINDOW_DAYS || '7', 10),
    buyerReasons:
      buyerDisputeReasons.length > 0
        ? buyerDisputeReasons
        : [
            'Product not received',
            'Wrong product received',
            'Product significantly different from description',
            'Damaged product',
            'Incorrect quantity',
            'Missing items',
            'Delivery issue',
            'Payment issue',
            'Other',
          ],
    sellerReasons:
      sellerDisputeReasons.length > 0
        ? sellerDisputeReasons
        : [
            'Payment issue',
            'Buyer failed to fulfil agreed obligation',
            'Buyer-arranged logistics issue',
            'Delivery acceptance issue',
            'Other',
          ],
    maxMessageCharacters: parseInt(process.env.DISPUTE_MAX_MESSAGE_CHARACTERS || '5000', 10),
    maxMessageAttachments: parseInt(process.env.DISPUTE_MAX_MESSAGE_ATTACHMENTS || '5', 10),
    maxEvidenceFiles: parseInt(process.env.DISPUTE_MAX_EVIDENCE_FILES || '10', 10),
    maxEvidenceFileSizeMb: parseInt(process.env.DISPUTE_MAX_EVIDENCE_FILE_SIZE_MB || '20', 10),
    evidenceUploadExpiryHours: parseInt(process.env.DISPUTE_EVIDENCE_UPLOAD_EXPIRY_HOURS || '24', 10),
    allowedEvidenceMimeTypes: (
      process.env.DISPUTE_ALLOWED_EVIDENCE_MIME_TYPES ||
      'image/jpeg,image/png,image/webp'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  },

  notifications: {
    realtimeEnabled: process.env.NOTIFICATION_REALTIME_ENABLED !== 'false',
    emailEnabled: process.env.NOTIFICATION_EMAIL_ENABLED !== 'false',
    announcementBatchSize: parseInt(
      process.env.NOTIFICATION_ANNOUNCEMENT_BATCH_SIZE || '100',
      10,
    ),
    defaultPageLimit: parseInt(process.env.NOTIFICATION_DEFAULT_PAGE_LIMIT || '20', 10),
  },

  i18n: {
    defaultLanguage: (process.env.DEFAULT_LANGUAGE || 'en').toLowerCase(),
    fallbackLanguage: (process.env.FALLBACK_LANGUAGE || 'en').toLowerCase(),
    supportedLanguages: parseCsvEnv('SUPPORTED_LANGUAGES'),
    translationProvider: process.env.TRANSLATION_PROVIDER || 'manual',
    autoQueueEnabled: process.env.TRANSLATION_AUTO_QUEUE_ENABLED !== 'false',
    providerEndpoint: process.env.TRANSLATION_PROVIDER_ENDPOINT || '',
  },

  search: {
    outOfStockProductsVisible: process.env.SEARCH_OUT_OF_STOCK_VISIBLE !== 'false',
    searchHistoryLimit: parseInt(process.env.SEARCH_HISTORY_LIMIT || '30', 10),
    popularSearchWindowDays: parseInt(
      process.env.SEARCH_POPULAR_WINDOW_DAYS || '30',
      10,
    ),
    defaultFeatureDurationDays: parseInt(
      process.env.SEARCH_DEFAULT_FEATURE_DURATION_DAYS || '7',
      10,
    ),
    featuredBoostEnabled: process.env.SEARCH_FEATURED_BOOST_ENABLED !== 'false',
    subscriptionPriorityEnabled:
      process.env.SEARCH_SUBSCRIPTION_PRIORITY_ENABLED !== 'false',
    ratingEnabled: process.env.SEARCH_RATING_ENABLED !== 'false',
    freshnessEnabled: process.env.SEARCH_FRESHNESS_ENABLED !== 'false',
    availabilityEnabled: process.env.SEARCH_AVAILABILITY_ENABLED !== 'false',
    featuredBoost: parseInt(process.env.SEARCH_FEATURED_BOOST || '25', 10),
    subscriptionPriorityMaxWeight: parseInt(
      process.env.SEARCH_SUBSCRIPTION_PRIORITY_MAX_WEIGHT || '50',
      10,
    ),
    ratingWeight: parseInt(process.env.SEARCH_RATING_WEIGHT || '10', 10),
    freshnessWeight: parseInt(process.env.SEARCH_FRESHNESS_WEIGHT || '8', 10),
    availabilityWeight: parseInt(process.env.SEARCH_AVAILABILITY_WEIGHT || '10', 10),
    outOfStockPenalty: parseInt(process.env.SEARCH_OUT_OF_STOCK_PENALTY || '20', 10),
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  },
} as const;
