import { documentedSchema, registerStreamingBodySchemas } from './common/utils/swagger-contracts';
import { settlementRoutes } from './modules/settlement/settlement.routes';
import { registerConfiguredPayoutGateway } from './modules/settlement/payout.paystack';
import { registerSettlementWorker } from './modules/settlement/settlement.worker';
import { savedProductRoutes } from './modules/saved-product/saved-product.routes';
import { rewardRoutes } from './modules/reward/reward.routes';
import { registerRewardOutbox } from './modules/reward/reward.outbox';
import { systemSettingsRoutes } from './modules/system-settings/settings.routes';
import { auditLogRoutes, registerAuditContext } from './modules/audit-log/audit-log.routes';
import { registerConfiguredRefundGateways } from './modules/payment/paystack.refunds';
import { afterSalesRoutes } from './modules/after-sales/after-sales.routes';
import { registerAfterSalesOutbox } from './modules/after-sales/after-sales.events';
import 'reflect-metadata';
import Fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifySensible from '@fastify/sensible';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import proxyAddr from '@fastify/proxy-addr';

import { config } from './config';
import { AppDataSource } from './database/data-source';
import { errorHandler } from './common/filters/error.handler';
import { authRoutes } from './modules/auth/auth.routes';
import { sellerRoutes } from './modules/seller/seller.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { categoryRoutes } from './modules/category/category.routes';
import { productRoutes } from './modules/product/product.routes';
import { cartRoutes } from './modules/cart/cart.routes';
import { checkoutRoutes } from './modules/checkout/checkout.routes';
import { orderRoutes } from './modules/order/order.routes';
import {
  registerOrderLogisticsEventHandlers,
  registerOrderPaymentEventHandlers,
} from './modules/order/order.service';
import { paymentRoutes } from './modules/payment/payment.routes';
import { logisticsRoutes } from './modules/logistics/logistics.routes';
import { directRfqRoutes } from './modules/direct-rfq/direct-rfq.routes';
import { marketRfqRoutes } from './modules/market-rfq/market-rfq.routes';
import { subscriptionRoutes } from './modules/subscription/subscription.routes';
import { registerSubscriptionPaymentEventHandlers } from './modules/subscription/subscription.service';
import { reviewRoutes } from './modules/review/review.routes';
import { registerReviewOrderEventHandlers } from './modules/review/review.service';
import { uploadRoutes } from './modules/upload/upload.routes';
import { messageRoutes } from './modules/message/message.routes';
import { notificationRoutes } from './modules/notification/notification.routes';
import { registerNotificationEventHandlers } from './modules/notification/notification.service';
import {
  adminDisputeRoutes,
  disputeRoutes,
} from './modules/dispute/dispute.routes';
import { i18nRoutes } from './modules/i18n/i18n.routes';
import { searchRoutes } from './modules/search/search.routes';
import { registerSearchEventHandlers } from './modules/search/search.service';
import {
  adminAnalyticsRoutes,
  buyerAnalyticsRoutes,
  reportsRoutes,
  sellerAnalyticsRoutes,
} from './modules/analytics/analytics.routes';
import { registerAnalyticsEventHandlers } from './modules/analytics/analytics.service';
import { HealthCheckSchema } from './common/utils/swagger.schemas';
import { secureStringEqual } from './common/utils/secure-compare.util';

function swaggerTagForUrl(url: string): string {
  const routeUrl = url.startsWith('/api/') ? url.slice(4) : url;
  if (routeUrl.startsWith('/auth')) return 'Auth';
  if (
    routeUrl.startsWith('/seller/analytics') ||
    routeUrl.startsWith('/buyer/analytics') ||
    routeUrl.startsWith('/admin/analytics')
  ) {
    return 'Analytics';
  }
  if (routeUrl.startsWith('/reports')) return 'Reports';
  if (
    routeUrl.startsWith('/users/upgrade-to-seller') ||
    routeUrl.startsWith('/users/me/verification-status')
  ) {
    return 'Seller';
  }
  if (routeUrl.startsWith('/users')) return 'Users';
  if (
    routeUrl.startsWith('/languages') ||
    routeUrl.startsWith('/admin/languages') ||
    routeUrl.startsWith('/admin/translations')
  ) {
    return 'Internationalization';
  }
  if (
    routeUrl.startsWith('/search') ||
    routeUrl.startsWith('/sellers') ||
    routeUrl.startsWith('/seller/products') ||
    routeUrl.startsWith('/seller/store') ||
    routeUrl.startsWith('/admin/search') ||
    routeUrl.startsWith('/products/recently-viewed') ||
    routeUrl.startsWith('/products/popular') ||
    routeUrl.includes('/related') ||
    routeUrl.includes('/view')
  ) {
    return 'Search';
  }
  if (
    routeUrl.startsWith('/disputes') ||
    routeUrl.startsWith('/admin/disputes')
  ) {
    return 'Disputes';
  }
  if (routeUrl.startsWith('/admin')) return 'Admin';
  if (routeUrl.startsWith('/categories')) return 'Categories';
  if (routeUrl.startsWith('/products')) return 'Products';
  if (routeUrl.startsWith('/cart')) return 'Cart';
  if (routeUrl.startsWith('/checkout')) return 'Checkout';
  if (routeUrl.startsWith('/payments')) return 'Payments';
  if (routeUrl.startsWith('/logistics')) return 'Logistics';
  if (routeUrl.startsWith('/orders')) return 'Orders';
  if (routeUrl.startsWith('/rfqs')) return 'RFQs';
  if (
    routeUrl.startsWith('/subscription-plans')
    || routeUrl.startsWith('/subscriptions')
  ) {
    return 'Subscriptions';
  }
  if (routeUrl.startsWith('/reviews')) return 'Reviews';
  if (routeUrl.startsWith('/rewards')) return 'Rewards';
  if (routeUrl.startsWith('/messages')) return 'Messages';
  if (routeUrl.startsWith('/notifications')) return 'Notifications';
  if (routeUrl.startsWith('/uploads')) return 'Uploads';
  return 'System';
}

function ensureSwaggerTag(
  schema: FastifySchema | undefined,
  url: string,
): FastifySchema {
  const routeSchema = schema ?? {};
  if (routeSchema.tags && routeSchema.tags.length > 0) return routeSchema;
  return {
    ...routeSchema,
    tags: [swaggerTagForUrl(url)],
  };
}

async function requireSwaggerAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authorization = request.headers.authorization;
  const encoded = authorization?.startsWith('Basic ') ? authorization.slice(6) : '';
  const decoded = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
  const separator = decoded.indexOf(':');
  const username = separator >= 0 ? decoded.slice(0, separator) : '';
  const password = separator >= 0 ? decoded.slice(separator + 1) : '';

  if (
    !config.swagger.username
    || !config.swagger.password
    || !secureStringEqual(username, config.swagger.username)
    || !secureStringEqual(password, config.swagger.password)
  ) {
    await reply
      .header('WWW-Authenticate', 'Basic realm="TOFA API Documentation", charset="UTF-8"')
      .header('Cache-Control', 'no-store')
      .status(401)
      .send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Swagger documentation credentials are required',
      });
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const defaultDevCorsOrigins = [
    config.app.frontendUrl,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
  ];
  const allowedCorsOrigins =
    config.cors.origins.length > 0
      ? config.cors.origins
      : config.isProd
        ? [config.app.frontendUrl]
        : Array.from(new Set(defaultDevCorsOrigins));
  const trustCloudflareProxy = config.app.isAppService
    ? proxyAddr.compile(config.app.trustedProxyCidrs)
    : undefined;

  const app = Fastify({
    logger: {
      level: config.isDev ? 'debug' : 'warn',
      transport: config.isDev
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    trustProxy: config.app.isAppService
      ? (address, hop) => hop === 0 || Boolean(trustCloudflareProxy?.(address, hop))
      : ['127.0.0.1', '::1'],

  ajv: {
      customOptions: {
        strictSchema: false,     // Allows unknown keywords like "example", "description", etc.
        // strict: false,        // Alternative: fully disable strict mode (less recommended)
        // strictTypes: false,   // If you also get issues with types
      },
    },
  });

  registerAuditContext(app);
  registerStreamingBodySchemas(app);

  // ── Security headers ──────────────────────────────────────────────────────
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: config.isProd,
  });

  // ── Sensible (httpErrors, assert, etc.) ───────────────────────────────────
  // Must be registered early — services receive the fastify instance and call
  // fastify.httpErrors.notFound() / .conflict() / .unauthorized() etc.
  await app.register(fastifySensible);

  // ── CORS ──────────────────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: allowedCorsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── Rate limiting (global) ─────────────────────────────────────────────────
  await app.register(fastifyRateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Retry after ${context.after}`,
    }),
  });

  // ── JWT ───────────────────────────────────────────────────────────────────
  await app.register(fastifyJwt, {
    secret: config.jwt.accessSecret,
    sign: { expiresIn: config.jwt.accessExpiresIn },
  });

  // ── Multipart (file uploads) ───────────────────────────────────────────────
  await app.register(fastifyMultipart, {
    limits: {
      fileSize:
        Math.max(
          config.upload.maxFileSizeMb,
          config.reviews.imageMaxFileSizeMb,
          config.messageCenter.maxAttachmentSizeMb,
          config.disputes.maxEvidenceFileSizeMb,
          10,
        ) *
        1024 *
        1024,
      files: 1,
      fields: 20,
    },
  });

  // ── Swagger ───────────────────────────────────────────────────────────────
  if (config.swagger.enabled) {
    await app.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'Traders of Africa API',
          description: 'Marketplace API Documentation',
          version: '1.0.0',
        },
        servers: [{ url: config.app.url }],
        tags: [
          { name: 'Auth', description: 'Registration, login, tokens, password management' },
          { name: 'Users', description: 'User profile and delivery addresses' },
          { name: 'Seller', description: 'Seller upgrade and verification submission' },
          { name: 'Categories', description: 'Public marketplace categories' },
          { name: 'Products', description: 'Product catalogue and seller inventory' },
          { name: 'Cart', description: 'Buyer cart grouped by seller' },
          { name: 'Checkout', description: 'Checkout address, delivery, payment and session creation' },
          { name: 'Payments', description: 'Reusable payment creation, proof upload and gateway webhooks' },
          { name: 'Logistics', description: 'Provider quotes, shipments, tracking, B2B logistics and webhooks' },
          { name: 'Orders', description: 'Order fulfillment lifecycle and delivery coordination' },
          { name: 'Cancellation, Returns & Refunds', description: 'Seller-order cancellation, return evidence and tracking, refund approvals, processing and immutable financial adjustments' },
          { name: 'Disputes', description: 'Buyer and seller transaction dispute cases, evidence, responses and admin resolution' },
          { name: 'RFQs', description: 'Direct and Market RFQ creation, quotation, negotiation and checkout handoff' },
          { name: 'Subscriptions', description: 'Plan discovery, subscription purchase, renewal and entitlement state' },
          { name: 'Reviews', description: 'Verified product and seller reviews, voting and seller responses' },
          { name: 'Saved Products', description: 'Private saved products for buyers and sellers' },
          { name: 'Referrals', description: 'Referral attribution, lifecycle and analytics' },
          { name: 'Rewards', description: 'Buyer points balance and rewards ledger history' },
          { name: 'Messages', description: 'User-to-user marketplace conversations and attachments' },
          { name: 'Notifications', description: 'In-app alerts, read state and notification preferences' },
          { name: 'Internationalization', description: 'Language preferences, localization fallback and translation status management' },
          { name: 'Search', description: 'Search, discovery, ranking, suggestions, history and featured placement' },
          { name: 'Analytics', description: 'Seller, buyer and admin marketplace analytics' },
          { name: 'Reports', description: 'Analytics report export requests and status tracking' },
          { name: 'Uploads', description: 'Authenticated media upload helpers backed by configured storage' },
          { name: 'Admin', description: 'Admin — seller review and user management' },
          { name: 'System', description: 'Service health and platform metadata' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
      transform: ({ schema, url }) => ({
        schema: ensureSwaggerTag(documentedSchema(schema), url),
        url,
      }),
    });

    await app.register(fastifySwaggerUi, {
      routePrefix: '/api/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
      staticCSP: true,
      uiHooks: config.swagger.requireAuth
        ? { onRequest: requireSwaggerAuth }
        : undefined,
    });
  }

  // ── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler(errorHandler);

  // ── Event handlers ────────────────────────────────────────────────────────
  registerConfiguredRefundGateways();
  registerOrderPaymentEventHandlers(app);
  registerOrderLogisticsEventHandlers(app);
  registerSubscriptionPaymentEventHandlers(app);
  registerReviewOrderEventHandlers(app);
  registerNotificationEventHandlers(app);
  registerSearchEventHandlers();
  registerAnalyticsEventHandlers();
  registerAfterSalesOutbox(app);
  registerRewardOutbox(app);
  registerConfiguredPayoutGateway();
  registerSettlementWorker(app);

  // ── API routes ────────────────────────────────────────────────────────────
  await app.register(async (api) => {
    api.get('/', { schema: { summary: 'Marketplace API metadata', tags: ['System'], response: { 200: { type: 'object', properties: { name: { type: 'string' }, service: { type: 'string' }, version: { type: 'string' }, status: { type: 'string' }, health: { type: 'string' } } } } } }, async (_request, reply) => reply.status(200).send({
      name: config.app.name,
      service: 'Marketplace API',
      version: '1.0.0',
      status: 'online',
      health: '/api/health',
    }));

    api.get('/health', { schema: HealthCheckSchema }, async (_req, reply) => {
      try {
        if (!AppDataSource.isInitialized) throw new Error('Database is not initialized');
        await AppDataSource.query('SELECT 1 AS ok');
        return reply.status(200).send({
          status: 'ok',
          timestamp: new Date().toISOString(),
        });
      } catch {
        return reply.status(503).send({
          status: 'degraded',
          timestamp: new Date().toISOString(),
        });
      }
    });

    await api.register(rewardRoutes);
    await api.register(savedProductRoutes);
    await api.register(settlementRoutes);
    await api.register(authRoutes, { prefix: '/auth' });
    await api.register(sellerRoutes, { prefix: '/users' });
    await api.register(categoryRoutes, { prefix: '/categories' });
    await api.register(searchRoutes);
    await api.register(sellerAnalyticsRoutes, { prefix: '/seller/analytics' });
    await api.register(buyerAnalyticsRoutes, { prefix: '/buyer/analytics' });
    await api.register(adminAnalyticsRoutes, { prefix: '/admin/analytics' });
    await api.register(reportsRoutes, { prefix: '/reports' });
    await api.register(productRoutes, { prefix: '/products' });
    await api.register(cartRoutes, { prefix: '/cart' });
    await api.register(checkoutRoutes, { prefix: '/checkout' });
    await api.register(paymentRoutes, { prefix: '/payments' });
    await api.register(logisticsRoutes, { prefix: '/logistics' });
    await api.register(afterSalesRoutes);
    await api.register(orderRoutes, { prefix: '/orders' });
    await api.register(disputeRoutes, { prefix: '/disputes' });
    await api.register(adminDisputeRoutes, { prefix: '/admin/disputes' });
    await api.register(directRfqRoutes, { prefix: '/rfqs/direct' });
    await api.register(marketRfqRoutes, { prefix: '/rfqs/market' });
    await api.register(subscriptionRoutes);
    await api.register(reviewRoutes);
    await api.register(messageRoutes, { prefix: '/messages' });
    await api.register(notificationRoutes, { prefix: '/notifications' });
    await api.register(i18nRoutes);
    await api.register(uploadRoutes, { prefix: '/uploads' });
    await api.register(systemSettingsRoutes);
    await api.register(auditLogRoutes);
    await api.register(adminRoutes, { prefix: '/admin' });
  }, { prefix: '/api' });

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Route not found',
    });
  });

  return app;
}
