import { CsvDownloadResponse } from '../../common/utils/swagger-contracts';
import { financialReportTypes, financialReportPermission, downloadFinancialReport } from '../settlement/settlement.reports';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { Admin, AdminStatus } from '../../database/entities/admin.entity';
import { User, UserStatus, UserType } from '../../database/entities/user.entity';
import {
  adminHasPermission,
  requirePermission,
  requireRole,
  requireSeller,
} from '../../common/middleware/auth.middleware';
import {
  AdminAnalyticsQuerySchema,
  AdminOrderAnalyticsQuerySchema,
  AdminPaymentAnalyticsQuerySchema,
  AnalyticsDateRangeQuerySchema,
  AnalyticsRebuildSchema,
  BuyerSpendingAnalyticsQuerySchema,
  ReportExportSchema,
  SellerProductAnalyticsQuerySchema,
  SellerSalesAnalyticsQuerySchema,
} from '../../common/utils/validation.schemas';
import {
  AdminAnalyticsBuyersSwaggerSchema,
  AdminAnalyticsCategoriesSwaggerSchema,
  AdminAnalyticsCountriesSwaggerSchema,
  AdminAnalyticsFunnelSwaggerSchema,
  AdminAnalyticsLogisticsSwaggerSchema,
  AdminAnalyticsOrdersSwaggerSchema,
  AdminAnalyticsOverviewSwaggerSchema,
  AdminAnalyticsPaymentMethodsSwaggerSchema,
  AdminAnalyticsPaymentsSwaggerSchema,
  AdminAnalyticsProductsSwaggerSchema,
  AdminAnalyticsRebuildSwaggerSchema,
  AdminAnalyticsRevenueBySubscriptionSwaggerSchema,
  AdminAnalyticsRevenueSwaggerSchema,
  AdminAnalyticsRfqsSwaggerSchema,
  AdminAnalyticsSellersSwaggerSchema,
  AdminAnalyticsSubscriptionsSwaggerSchema,
  BuyerAnalyticsOverviewSwaggerSchema,
  BuyerAnalyticsRfqsSwaggerSchema,
  BuyerAnalyticsSpendingSwaggerSchema,
  BuyerAnalyticsSuppliersSwaggerSchema,
  GetAnalyticsReportSwaggerSchema,
  ReportExportSwaggerSchema,
  SellerAnalyticsCustomersSwaggerSchema,
  SellerAnalyticsOrdersSwaggerSchema,
  SellerAnalyticsOverviewSwaggerSchema,
  SellerAnalyticsProductsSwaggerSchema,
  SellerAnalyticsReviewsSwaggerSchema,
  SellerAnalyticsRfqsSwaggerSchema,
  SellerAnalyticsSalesSwaggerSchema,
  SellerAnalyticsSearchSwaggerSchema,
  SellerAnalyticsSubscriptionUsageSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { I18nService } from '../i18n/i18n.service';
import { AnalyticsService } from './analytics.service';

const ReportParamSchema = z.object({
  reportId: z.string().uuid(),
});

export async function sellerAnalyticsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const analyticsService = new AnalyticsService();
  const i18nService = new I18nService();

  fastify.get(
    '/overview',
    { schema: SellerAnalyticsOverviewSwaggerSchema, preHandler: requireSeller },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AnalyticsDateRangeQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getSellerOverview(
        request.dbUser!.id,
        query,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/sales',
    { schema: SellerAnalyticsSalesSwaggerSchema, preHandler: requireSeller },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = SellerSalesAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getSellerSales(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/products',
    { schema: SellerAnalyticsProductsSwaggerSchema, preHandler: requireSeller },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = SellerProductAnalyticsQuerySchema.parse(request.query ?? {});
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await analyticsService.getSellerProducts(
        request.dbUser!.id,
        query,
        language,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/orders',
    { schema: SellerAnalyticsOrdersSwaggerSchema, preHandler: requireSeller },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AnalyticsDateRangeQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getSellerOrders(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/rfqs',
    { schema: SellerAnalyticsRfqsSwaggerSchema, preHandler: requireSeller },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AnalyticsDateRangeQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getSellerRfqs(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/customers',
    { schema: SellerAnalyticsCustomersSwaggerSchema, preHandler: requireSeller },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AnalyticsDateRangeQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getSellerCustomers(
        request.dbUser!.id,
        query,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/search',
    { schema: SellerAnalyticsSearchSwaggerSchema, preHandler: requireSeller },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AnalyticsDateRangeQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getSellerSearch(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/reviews',
    { schema: SellerAnalyticsReviewsSwaggerSchema, preHandler: requireSeller },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AnalyticsDateRangeQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getSellerReviews(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/subscription-usage',
    {
      schema: SellerAnalyticsSubscriptionUsageSwaggerSchema,
      preHandler: requireSeller,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await analyticsService.getSellerSubscriptionUsage(
        request.dbUser!.id,
      );
      return reply.send(result);
    },
  );
}

export async function buyerAnalyticsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const analyticsService = new AnalyticsService();
  const i18nService = new I18nService();
  const requireBuyer = requireRole(UserType.BUYER);

  fastify.get(
    '/overview',
    { schema: BuyerAnalyticsOverviewSwaggerSchema, preHandler: requireBuyer },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AnalyticsDateRangeQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getBuyerOverview(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/spending',
    { schema: BuyerAnalyticsSpendingSwaggerSchema, preHandler: requireBuyer },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = BuyerSpendingAnalyticsQuerySchema.parse(request.query ?? {});
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await analyticsService.getBuyerSpending(
        request.dbUser!.id,
        query,
        language,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/rfqs',
    { schema: BuyerAnalyticsRfqsSwaggerSchema, preHandler: requireBuyer },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AnalyticsDateRangeQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getBuyerRfqs(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/suppliers',
    { schema: BuyerAnalyticsSuppliersSwaggerSchema, preHandler: requireBuyer },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AnalyticsDateRangeQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getBuyerSuppliers(
        request.dbUser!.id,
        query,
      );
      return reply.send(result);
    },
  );
}

export async function adminAnalyticsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const analyticsService = new AnalyticsService();
  const i18nService = new I18nService();

  fastify.get(
    '/overview',
    {
      schema: AdminAnalyticsOverviewSwaggerSchema,
      preHandler: requirePermission('analytics.view_overview'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminOverview(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/revenue',
    {
      schema: AdminAnalyticsRevenueSwaggerSchema,
      preHandler: requirePermission('analytics.view_revenue'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminRevenue(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/revenue/by-subscription',
    {
      schema: AdminAnalyticsRevenueBySubscriptionSwaggerSchema,
      preHandler: requirePermission('analytics.view_revenue'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminRevenueBySubscription(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/logistics',
    {
      schema: AdminAnalyticsLogisticsSwaggerSchema,
      preHandler: requirePermission('analytics.view_logistics'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminLogistics(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/orders',
    {
      schema: AdminAnalyticsOrdersSwaggerSchema,
      preHandler: requirePermission('analytics.view_orders'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminOrderAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminOrders(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/payments',
    {
      schema: AdminAnalyticsPaymentsSwaggerSchema,
      preHandler: requirePermission('analytics.view_payments'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminPaymentAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminPayments(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/subscriptions',
    {
      schema: AdminAnalyticsSubscriptionsSwaggerSchema,
      preHandler: requirePermission('analytics.view_subscriptions'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminSubscriptions(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/rfqs',
    {
      schema: AdminAnalyticsRfqsSwaggerSchema,
      preHandler: requirePermission('analytics.view_rfqs'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminRfqs(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/products',
    {
      schema: AdminAnalyticsProductsSwaggerSchema,
      preHandler: requirePermission('analytics.view_products'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const language = await i18nService.resolveRequestLanguage(request, null);
      const result = await analyticsService.getAdminProducts(query, language);
      return reply.send(result);
    },
  );

  fastify.get(
    '/sellers',
    {
      schema: AdminAnalyticsSellersSwaggerSchema,
      preHandler: requirePermission('analytics.view_sellers'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminSellers(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/buyers',
    {
      schema: AdminAnalyticsBuyersSwaggerSchema,
      preHandler: requirePermission('analytics.view_buyers'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminBuyers(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/countries',
    {
      schema: AdminAnalyticsCountriesSwaggerSchema,
      preHandler: requirePermission('analytics.view_overview'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminCountries(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/categories',
    {
      schema: AdminAnalyticsCategoriesSwaggerSchema,
      preHandler: requirePermission('analytics.view_products'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const language = await i18nService.resolveRequestLanguage(request, null);
      const result = await analyticsService.getAdminCategories(query, language);
      return reply.send(result);
    },
  );

  fastify.get(
    '/funnel',
    {
      schema: AdminAnalyticsFunnelSwaggerSchema,
      preHandler: requirePermission('analytics.view_overview'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminFunnel(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/payment-methods',
    {
      schema: AdminAnalyticsPaymentMethodsSwaggerSchema,
      preHandler: requirePermission('analytics.view_payments'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminAnalyticsQuerySchema.parse(request.query ?? {});
      const result = await analyticsService.getAdminPaymentMethods(query);
      return reply.send(result);
    },
  );

  fastify.post(
    '/rebuild',
    {
      schema: AdminAnalyticsRebuildSwaggerSchema,
      preHandler: requirePermission('analytics.rebuild'),
      config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = AnalyticsRebuildSchema.parse(request.body);
      const result = await analyticsService.requestAnalyticsRebuild(
        request.dbAdmin!.id,
        body,
      );
      return reply.status(202).send(result);
    },
  );
}

export async function reportsRoutes(fastify: FastifyInstance): Promise<void> {
  const analyticsService = new AnalyticsService();
  fastify.get('/:reportId/download', {preHandler:authenticateReportRequester, schema:{tags:['Reports'],summary:'Download financial CSV snapshot',response:CsvDownloadResponse,security:[{bearerAuth:[]}],params:{type:'object',required:['reportId'],properties:{reportId:{type:'string',format:'uuid'}}}}}, async (request,reply)=>{
    const {reportId}=ReportParamSchema.parse(request.params);
    const result=await downloadFinancialReport(request.dbAdmin?'admin':'user',request.dbAdmin?.id??request.dbUser!.id,reportId);
    if(request.dbAdmin && (!adminHasPermission(request.dbAdmin,'analytics.export_reports') || !adminHasPermission(request.dbAdmin,financialReportPermission(result.report.reportType)))) return sendPermissionDenied(reply);
    return reply.header('Cache-Control','private, no-store').header('Content-Disposition',`attachment; filename="${reportId}.csv"`).type('text/csv; charset=utf-8').send(result.content);
  });

  fastify.post(
    '/export',
    {
      schema: ReportExportSwaggerSchema,
      preHandler: authenticateReportRequester,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = ReportExportSchema.parse(request.body);

      if (request.dbAdmin) {
        if (financialReportTypes.includes(body.reportType) && !adminHasPermission(request.dbAdmin, financialReportPermission(body.reportType))) return sendPermissionDenied(reply);
        if (!adminHasPermission(request.dbAdmin, 'analytics.export_reports')) {
          return sendPermissionDenied(reply);
        }

        const result = await analyticsService.requestAdminReportExport(
          request.dbAdmin.id,
          body,
        );
        return reply.status(202).send(result);
      }

      const result = await analyticsService.requestUserReportExport(
        request.dbUser!.id,
        body,
      );
      return reply.status(202).send(result);
    },
  );

  fastify.get(
    '/:reportId',
    {
      schema: GetAnalyticsReportSwaggerSchema,
      preHandler: authenticateReportRequester,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reportId } = ReportParamSchema.parse(request.params);

      if (request.dbAdmin) {
        if (!adminHasPermission(request.dbAdmin, 'analytics.export_reports')) {
          return sendPermissionDenied(reply);
        }

        const result = await analyticsService.getReportForRequester(
          'admin',
          request.dbAdmin.id,
          reportId,
        );
        return reply.send(result);
      }

      const result = await analyticsService.getReportForRequester(
        'user',
        request.dbUser!.id,
        reportId,
      );
      return reply.send(result);
    },
  );
}

async function authenticateReportRequester(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
    const { sub, tokenType, authVersion } = request.user;

    if (tokenType === 'admin') {
      const admin = await AppDataSource.getRepository(Admin)
        .createQueryBuilder('admin')
        .addSelect('admin.authVersion')
        .leftJoinAndSelect('admin.role', 'role')
        .leftJoinAndSelect('role.rolePermissions', 'rolePermission')
        .leftJoinAndSelect('rolePermission.permission', 'permission')
        .where('admin.id = :sub', { sub })
        .getOne();

      if (!admin) {
        reply.status(401).send({
          success: false,
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Admin not found',
        });
        return;
      }

      if (admin.status !== AdminStatus.ACTIVE) {
        reply.status(403).send({
          success: false,
          statusCode: 403,
          error: 'Forbidden',
          message: 'Admin account cannot perform actions',
        });
        return;
      }

      if (typeof authVersion !== 'number' || authVersion !== admin.authVersion) {
        reply.status(401).send({
          success: false,
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Admin session has expired',
        });
        return;
      }

      request.dbAdmin = admin;
      return;
    }

    if (tokenType && tokenType !== 'user') {
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid token type',
      });
      return;
    }

    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: sub },
    });
    if (!user) {
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'User not found',
      });
      return;
    }

    if (user.status !== UserStatus.ACTIVE) {
      reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Account cannot perform actions',
      });
      return;
    }

    request.dbUser = user;
  } catch {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

function sendPermissionDenied(reply: FastifyReply): FastifyReply {
  return reply.status(403).send({
    success: false,
    statusCode: 403,
    error: 'Forbidden',
    code: 'ADMIN_PERMISSION_DENIED',
    message: 'You do not have permission to perform this action.',
  });
}
