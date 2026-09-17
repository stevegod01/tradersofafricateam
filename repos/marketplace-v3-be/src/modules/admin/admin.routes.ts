import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminService } from './admin.service';
import { CategoryService } from '../category/category.service';
import { OrderService } from '../order/order.service';
import { PaymentService } from '../payment/payment.service';
import { LogisticsService } from '../logistics/logistics.service';
import { DirectRFQService } from '../direct-rfq/direct-rfq.service';
import { MarketRFQService } from '../market-rfq/market-rfq.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { ReviewService } from '../review/review.service';
import { MessageService } from '../message/message.service';
import { NotificationService } from '../notification/notification.service';
import {
  AdminChangePasswordSchema as AdminChangePasswordZod,
  AdminSystemAnnouncementQuerySchema,
  AdminDirectRFQQuerySchema,
  AdminMarketRFQQuerySchema,
  AdminMessageConversationQuerySchema,
  AdminMessageConversationStatusSchema,
  AdminMessageReportQuerySchema,
  AdminMessageReportReviewSchema,
  AdminReviewQuerySchema,
  AdminSubscriptionQuerySchema,
  AdminOrderCancellationReviewSchema,
  AdminPaymentConfirmSchema,
  AdminPaymentRejectSchema,
  AdminDisableUserSchema,
  AdminForgotPasswordSchema as AdminForgotPasswordZod,
  AdminLoginSchema as AdminLoginZod,
  AdminProfileUpdateSchema,
  AdminResetPasswordSchema as AdminResetPasswordZod,
  AdminRoleCreateSchema,
  AdminRoleStatusUpdateSchema,
  AdminRoleUpdateSchema,
  AdminUserStatusUpdateSchema,
  ApproveSellerSchema,
  CategoryCreateSchema,
  CategoryQuerySchema,
  CategoryStatusUpdateSchema,
  CategoryUpdateSchema,
  CompleteAdminSetupSchema,
  CreateAdminSchema as CreateAdminZod,
  DeactivateAdminSchema as DeactivateAdminZod,
  LogisticsProviderStatusUpdateSchema,
  LogisticsShipmentQuerySchema,
  MessageSettingsUpdateSchema,
  PaginationSchema,
  OrderQuerySchema,
  OrderStatusUpdateSchema,
  PaymentQuerySchema,
  RejectSellerSchema,
  PointsAdjustmentSchema,
  RewardSettingsUpdateSchema,
  ReviewModerationStatusSchema,
  RolePermissionAssignmentSchema,
  SubscriptionPlanCreateSchema,
  SubscriptionPlanQuerySchema,
  SubscriptionPlanStatusUpdateSchema,
  SubscriptionPlanUpdateSchema,
  SystemAnnouncementCreateSchema,
  UpdateAdminSchema,
} from '../../common/utils/validation.schemas';
import {
  enforceAdminPermission,
  requireAdmin,
  requirePermission,
  requireSuperAdmin,
} from '../../common/middleware/auth.middleware';
import { AdminStatus } from '../../database/entities/admin.entity';
import { AdminRoleStatus } from '../../database/entities/admin-role.entity';
import { VerificationStatus } from '../../database/entities/company-verification.entity';
import { CategoryStatus } from '../../database/entities/category.entity';
import { UserStatus } from '../../database/entities/user.entity';
import {
  ActivateAdminSchema,
  ActivateUserSchema,
  AdminChangePasswordSchema,
  AdminForgotPasswordSchema,
  AdminUpdateOrderStatusSchema,
  ApproveOrderCancellationSchema,
  AdminLoginSchema,
  AdminResetPasswordSchema,
  AssignRolePermissionsSchema,
  CancelSystemAnnouncementSwaggerSchema,
  CompleteAdminSetupSwaggerSchema,
  CreateSystemAnnouncementSwaggerSchema,
  CreateAdminRoleSchema,
  CreateAdminSchema as CreateAdminSwaggerSchema,
  CreateCategorySchema,
  DeactivateAdminSchema,
  DisableUserSchema,
  GetAdminCategoriesSchema,
  GetAdminDetailsSchema,
  GetAdminDirectRFQByIdSchema,
  GetAdminDirectRFQsSchema,
  GetAdminMarketRFQByIdSchema,
  GetAdminMarketRFQsSchema,
  GetAdminMessageConversationByIdSwaggerSchema,
  GetAdminMessageConversationsSwaggerSchema,
  GetAdminMessageReportsSwaggerSchema,
  GetAdminMessageSettingsSwaggerSchema,
  GetAdminNotificationStatsSwaggerSchema,
  GetAdminOrderByIdSchema,
  GetAdminOrdersSchema,
  GetAdminLogisticsProvidersSchema,
  GetAdminLogisticsShipmentsSchema,
  GetAdminRoleDetailsSchema,
  GetAdminRolesSchema,
  GetAdminReviewByIdSwaggerSchema,
  GetAdminReviewsSwaggerSchema,
  GetAdminUsersSchema,
  GetCurrentAdminSchema,
  GetPermissionsSchema,
  GetRewardSettingsSwaggerSchema,
  GetAdminPaymentByIdSchema,
  GetAdminPaymentsSchema,
  GetSellerVerificationByIdSchema,
  GetSellerVerificationsSchema,
  GetSellerVerificationsSummarySchema,
  GetUserByIdSchema,
  GetUsersSchema,
  RejectSellerSchema as RejectSellerSwaggerSchema,
  RejectOrderCancellationSchema,
  ReviewPaymentSchema,
  ConfirmPaymentSchema,
  CreateSubscriptionPlanSwaggerSchema,
  RejectPaymentSchema,
  ResendAdminInvitationSchema,
  ReviewAdminMessageReportSwaggerSchema,
  AdjustUserPointsSwaggerSchema,
  GetAdminSubscriptionByIdSwaggerSchema,
  GetAdminSubscriptionPlanByIdSwaggerSchema,
  GetAdminSubscriptionPlansSwaggerSchema,
  GetAdminSubscriptionsSwaggerSchema,
  GetAdminSystemAnnouncementsSwaggerSchema,
  ModerateReviewSwaggerSchema,
  UpdateLogisticsProviderStatusSchema,
  UpdateAdminProfileSchema,
  UpdateAdminRoleSchema,
  UpdateAdminRoleStatusSchema,
  UpdateAdminSchema as UpdateAdminSwaggerSchema,
  UpdateAdminConversationStatusSwaggerSchema,
  UpdateAdminMessageSettingsSwaggerSchema,
  UpdateCategorySchema as UpdateCategorySwaggerSchema,
  UpdateCategoryStatusSchema as UpdateCategoryStatusSwaggerSchema,
  UpdateSubscriptionPlanStatusSwaggerSchema,
  UpdateSubscriptionPlanSwaggerSchema,
  UpdateRewardSettingsSwaggerSchema,
  UpdateUserStatusSchema,
  ApproveSellerSchema as ApproveSellerSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { ReviewType } from '../../database/entities/review-eligibility.entity';

const AdminUserQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().min(1).max(120).trim().optional(),
  status: z.nativeEnum(AdminStatus).optional(),
  roleId: z.string().uuid().optional(),
});

const AdminRoleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().min(1).max(120).trim().optional(),
  status: z.nativeEnum(AdminRoleStatus).optional(),
});

const AdminReviewParamSchema = z.object({
  reviewType: z.nativeEnum(ReviewType),
  reviewId: z.string().uuid(),
});

const AdminMessageConversationParamSchema = z.object({
  conversationId: z.string().uuid(),
});

const AdminMessageReportParamSchema = z.object({
  reportId: z.string().uuid(),
});

const AdminAnnouncementParamSchema = z.object({
  announcementId: z.string().uuid(),
});

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  const adminService = new AdminService(fastify);
  const categoryService = new CategoryService();
  const orderService = new OrderService(fastify);
  const paymentService = new PaymentService(fastify);
  const logisticsService = new LogisticsService(fastify);
  const directRfqService = new DirectRFQService(fastify);
  const marketRfqService = new MarketRFQService(fastify);
  const subscriptionService = new SubscriptionService(fastify);
  const reviewService = new ReviewService(fastify);
  const messageService = new MessageService(fastify);
  const notificationService = new NotificationService(fastify);

  const loginHandler = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const body = AdminLoginZod.parse(request.body);
    const result = await adminService.loginAdmin(body);
    return reply.send(result);
  };

  fastify.post('/auth/login', {
    schema: AdminLoginSchema,
    config: {
      publicAdminAuth: true,
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
  }, loginHandler);

  // Compatibility alias for the pre-upgrade route.
  fastify.post('/login', {
    schema: AdminLoginSchema,
    config: {
      publicAdminAuth: true,
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
  }, loginHandler);

  fastify.post(
    '/auth/complete-setup',
    {
      schema: CompleteAdminSetupSwaggerSchema,
      config: { publicAdminAuth: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = CompleteAdminSetupSchema.parse(request.body);
      const result = await adminService.completeAdminSetup(body);
      return reply.send(result);
    },
  );

  fastify.post(
    '/auth/forgot-password',
    {
      schema: AdminForgotPasswordSchema,
      config: {
        publicAdminAuth: true,
        rateLimit: { max: 5, timeWindow: '15 minutes' },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { email } = AdminForgotPasswordZod.parse(request.body);
      const result = await adminService.forgotAdminPassword(email);
      return reply.send(result);
    },
  );

  fastify.post(
    '/auth/reset-password',
    {
      schema: AdminResetPasswordSchema,
      config: { publicAdminAuth: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { otp, password } = AdminResetPasswordZod.parse(request.body);
      const result = await adminService.resetAdminPassword(otp, password);
      return reply.send(result);
    },
  );

  fastify.addHook('preHandler', async (request, reply) => {
    if (request.routeOptions.config.publicAdminAuth === true) return;
    await requireAdmin(request, reply);
  });

  fastify.get(
    '/auth/me',
    { schema: GetCurrentAdminSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await adminService.getCurrentAdmin(request.dbAdmin!.id);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/auth/change-password',
    { schema: AdminChangePasswordSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = AdminChangePasswordZod.parse(request.body);
      const result = await adminService.changeAdminPassword(
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/profile',
    { schema: UpdateAdminProfileSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = AdminProfileUpdateSchema.parse(request.body);
      const result = await adminService.updateAdminProfile(
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  // ── Admin User Management ────────────────────────────────────────────────

  fastify.post(
    '/admin-users',
    { schema: CreateAdminSwaggerSchema, preHandler: requireSuperAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = CreateAdminZod.parse(request.body);
      const result = await adminService.createAdmin(body, request.dbAdmin!.id);
      return reply.status(201).send(result);
    },
  );

  // Compatibility alias for the pre-upgrade route.
  fastify.post(
    '/create-admin',
    { schema: CreateAdminSwaggerSchema, preHandler: requireSuperAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = CreateAdminZod.parse(request.body);
      const result = await adminService.createAdmin(body, request.dbAdmin!.id);
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/admin-users',
    { schema: GetAdminUsersSchema, preHandler: requirePermission('admins.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminUserQuerySchema.parse(request.query);
      const result = await adminService.getAdminUsers(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/admin-users/:adminId',
    { schema: GetAdminDetailsSchema, preHandler: requirePermission('admins.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { adminId } = request.params as { adminId: string };
      const result = await adminService.getAdminDetails(adminId);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/admin-users/:adminId',
    { schema: UpdateAdminSwaggerSchema, preHandler: requirePermission('admins.update') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { adminId } = request.params as { adminId: string };
      const body = UpdateAdminSchema.parse(request.body);
      const result = await adminService.updateAdmin(
        adminId,
        body,
        request.dbAdmin!,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/admin-users/:adminId/deactivate',
    { schema: DeactivateAdminSchema, preHandler: requireSuperAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { adminId } = request.params as { adminId: string };
      const { reason } = DeactivateAdminZod.parse(request.body);
      const result = await adminService.deactivateAdmin(
        adminId,
        reason,
        request.dbAdmin!.id,
      );
      return reply.send(result);
    },
  );

  // Compatibility alias for the pre-upgrade route.
  fastify.patch(
    '/deactivate-admin/:adminId',
    { schema: DeactivateAdminSchema, preHandler: requireSuperAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { adminId } = request.params as { adminId: string };
      const { reason } = DeactivateAdminZod.parse(request.body);
      const result = await adminService.deactivateAdmin(
        adminId,
        reason,
        request.dbAdmin!.id,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/admin-users/:adminId/activate',
    { schema: ActivateAdminSchema, preHandler: requirePermission('admins.activate') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { adminId } = request.params as { adminId: string };
      const result = await adminService.reactivateAdmin(
        adminId,
        request.dbAdmin!.id,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/admin-users/:adminId/resend-invitation',
    { schema: ResendAdminInvitationSchema, preHandler: requireSuperAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { adminId } = request.params as { adminId: string };
      const result = await adminService.resendAdminInvitation(
        adminId,
        request.dbAdmin!.id,
      );
      return reply.send(result);
    },
  );

  // ── Roles and Permissions ────────────────────────────────────────────────

  fastify.post(
    '/roles',
    { schema: CreateAdminRoleSchema, preHandler: requirePermission('roles.create') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = AdminRoleCreateSchema.parse(request.body);
      const result = await adminService.createRole(body, request.dbAdmin!.id);
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/roles',
    { schema: GetAdminRolesSchema, preHandler: requirePermission('roles.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminRoleQuerySchema.parse(request.query);
      const result = await adminService.getRoles(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/roles/:roleId',
    { schema: GetAdminRoleDetailsSchema, preHandler: requirePermission('roles.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roleId } = request.params as { roleId: string };
      const result = await adminService.getRoleDetails(roleId);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/roles/:roleId',
    { schema: UpdateAdminRoleSchema, preHandler: requirePermission('roles.update') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roleId } = request.params as { roleId: string };
      const body = AdminRoleUpdateSchema.parse(request.body);
      const result = await adminService.updateRole(
        roleId,
        body,
        request.dbAdmin!.id,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/roles/:roleId/status',
    { schema: UpdateAdminRoleStatusSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roleId } = request.params as { roleId: string };
      const { status } = AdminRoleStatusUpdateSchema.parse(request.body);
      const permission =
        status === AdminRoleStatus.INACTIVE ? 'roles.deactivate' : 'roles.update';
      if (!(await enforceAdminPermission(request, reply, permission))) return;

      const result = await adminService.updateRoleStatus(
        roleId,
        status as AdminRoleStatus,
        request.dbAdmin!.id,
      );
      return reply.send(result);
    },
  );

  fastify.put(
    '/roles/:roleId/permissions',
    { schema: AssignRolePermissionsSchema, preHandler: requirePermission('permissions.assign') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roleId } = request.params as { roleId: string };
      const { permissionIds } = RolePermissionAssignmentSchema.parse(request.body);
      const result = await adminService.assignPermissionsToRole(
        roleId,
        permissionIds,
        request.dbAdmin!.id,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/permissions',
    { schema: GetPermissionsSchema, preHandler: requirePermission('permissions.view') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await adminService.getPermissions();
      return reply.send(result);
    },
  );

  // ── Reviews, Ratings & Rewards Management ──────────────────────────────

  fastify.get(
    '/reviews',
    { schema: GetAdminReviewsSwaggerSchema, preHandler: requirePermission('reviews.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminReviewQuerySchema.parse(request.query);
      const result = await reviewService.listAdminReviews(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/reviews/:reviewType/:reviewId',
    { schema: GetAdminReviewByIdSwaggerSchema, preHandler: requirePermission('reviews.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewType, reviewId } = AdminReviewParamSchema.parse(request.params);
      const result = await reviewService.getAdminReviewById(reviewType, reviewId);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/reviews/:reviewType/:reviewId/status',
    { schema: ModerateReviewSwaggerSchema, preHandler: requirePermission('reviews.moderate') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewType, reviewId } = AdminReviewParamSchema.parse(request.params);
      const body = ReviewModerationStatusSchema.parse(request.body);
      const result = await reviewService.moderateReviewStatus(
        request.dbAdmin!.id,
        reviewType,
        reviewId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/rewards/settings',
    { schema: GetRewardSettingsSwaggerSchema, preHandler: requirePermission('reviews.view') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await reviewService.getRewardSettings();
      return reply.send(result);
    },
  );

  fastify.patch(
    '/rewards/settings',
    { schema: UpdateRewardSettingsSwaggerSchema, preHandler: requirePermission('rewards.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = RewardSettingsUpdateSchema.parse(request.body);
      const result = await reviewService.updateRewardSettings(
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/rewards/points/adjust',
    { schema: AdjustUserPointsSwaggerSchema, preHandler: requirePermission('rewards.adjust') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = PointsAdjustmentSchema.parse(request.body);
      const result = await reviewService.adjustUserPoints(
        request.dbAdmin!.id,
        body,
        String(request.headers['idempotency-key']),
      );
      return reply.send(result);
    },
  );

  // ── Message Center Management ──────────────────────────────────────────

  fastify.get(
    '/messages/conversations',
    { schema: GetAdminMessageConversationsSwaggerSchema, preHandler: requirePermission('messages.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminMessageConversationQuerySchema.parse(request.query);
      const result = await messageService.listAdminConversations(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/messages/conversations/:conversationId',
    { schema: GetAdminMessageConversationByIdSwaggerSchema, preHandler: requirePermission('messages.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conversationId } = AdminMessageConversationParamSchema.parse(
        request.params,
      );
      const result = await messageService.getAdminConversationById(conversationId);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/messages/conversations/:conversationId/status',
    { schema: UpdateAdminConversationStatusSwaggerSchema, preHandler: requirePermission('messages.block_conversation') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conversationId } = AdminMessageConversationParamSchema.parse(
        request.params,
      );
      const body = AdminMessageConversationStatusSchema.parse(request.body);
      const result = await messageService.updateAdminConversationStatus(
        request.dbAdmin!.id,
        conversationId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/messages/reports',
    { schema: GetAdminMessageReportsSwaggerSchema, preHandler: requirePermission('messages.view_reports') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminMessageReportQuerySchema.parse(request.query);
      const result = await messageService.listAdminReports(query);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/messages/reports/:reportId',
    { schema: ReviewAdminMessageReportSwaggerSchema, preHandler: requirePermission('messages.moderate') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reportId } = AdminMessageReportParamSchema.parse(request.params);
      const body = AdminMessageReportReviewSchema.parse(request.body);
      const result = await messageService.reviewAdminReport(
        request.dbAdmin!.id,
        reportId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/messages/settings',
    { schema: GetAdminMessageSettingsSwaggerSchema, preHandler: requirePermission('messages.manage_settings') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await messageService.getSettings();
      return reply.send(result);
    },
  );

  fastify.patch(
    '/messages/settings',
    { schema: UpdateAdminMessageSettingsSwaggerSchema, preHandler: requirePermission('messages.manage_settings') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = MessageSettingsUpdateSchema.parse(request.body);
      const result = await messageService.updateSettings(request.dbAdmin!.id, body);
      return reply.send(result);
    },
  );

  // ── Notifications Management ───────────────────────────────────────────

  fastify.post(
    '/notifications/announcements',
    { schema: CreateSystemAnnouncementSwaggerSchema, preHandler: requirePermission('notifications.manage_announcements') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = SystemAnnouncementCreateSchema.parse(request.body);
      const result = await notificationService.createAnnouncement(
        request.dbAdmin!.id,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/notifications/announcements',
    { schema: GetAdminSystemAnnouncementsSwaggerSchema, preHandler: requirePermission('notifications.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminSystemAnnouncementQuerySchema.parse(request.query);
      const result = await notificationService.listAdminAnnouncements(query);
      return reply.send(result);
    },
  );

  fastify.post(
    '/notifications/announcements/:announcementId/cancel',
    { schema: CancelSystemAnnouncementSwaggerSchema, preHandler: requirePermission('notifications.manage_announcements') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { announcementId } = AdminAnnouncementParamSchema.parse(request.params);
      const result = await notificationService.cancelAnnouncement(
        request.dbAdmin!.id,
        announcementId,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/notifications/stats',
    { schema: GetAdminNotificationStatsSwaggerSchema, preHandler: requirePermission('notifications.view_stats') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await notificationService.getStats();
      return reply.send(result);
    },
  );

  // ── Subscription Management ─────────────────────────────────────────────

  fastify.post(
    '/subscription-plans',
    { schema: CreateSubscriptionPlanSwaggerSchema, preHandler: requirePermission('subscription_plans.create') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = SubscriptionPlanCreateSchema.parse(request.body);
      const result = await subscriptionService.createPlan(request.dbAdmin!.id, body);
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/subscription-plans',
    { schema: GetAdminSubscriptionPlansSwaggerSchema, preHandler: requirePermission('subscription_plans.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = SubscriptionPlanQuerySchema.parse(request.query);
      const result = await subscriptionService.listAdminPlans(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/subscription-plans/:planId',
    { schema: GetAdminSubscriptionPlanByIdSwaggerSchema, preHandler: requirePermission('subscription_plans.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { planId } = request.params as { planId: string };
      const result = await subscriptionService.getAdminPlanById(planId);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/subscription-plans/:planId',
    { schema: UpdateSubscriptionPlanSwaggerSchema, preHandler: requirePermission('subscription_plans.update') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { planId } = request.params as { planId: string };
      const body = SubscriptionPlanUpdateSchema.parse(request.body);
      const result = await subscriptionService.updatePlan(
        request.dbAdmin!.id,
        planId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/subscription-plans/:planId/status',
    { schema: UpdateSubscriptionPlanStatusSwaggerSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { planId } = request.params as { planId: string };
      const body = SubscriptionPlanStatusUpdateSchema.parse(request.body);
      const permission = permissionForSubscriptionPlanStatus(body.status);
      if (!(await enforceAdminPermission(request, reply, permission))) return;

      const result = await subscriptionService.updatePlanStatus(
        request.dbAdmin!.id,
        planId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/subscriptions',
    { schema: GetAdminSubscriptionsSwaggerSchema, preHandler: requirePermission('subscriptions.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminSubscriptionQuerySchema.parse(request.query);
      const result = await subscriptionService.listAdminSubscriptions(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/subscriptions/:subscriptionId',
    { schema: GetAdminSubscriptionByIdSwaggerSchema, preHandler: requirePermission('subscriptions.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subscriptionId } = request.params as { subscriptionId: string };
      const result = await subscriptionService.getAdminSubscriptionById(subscriptionId);
      return reply.send(result);
    },
  );

  // ── Order Management ────────────────────────────────────────────────────

  fastify.get(
    '/orders',
    { schema: GetAdminOrdersSchema, preHandler: requirePermission('orders.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = OrderQuerySchema.parse(request.query);
      const result = await orderService.listAdminOrders(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/orders/:orderId',
    { schema: GetAdminOrderByIdSchema, preHandler: requirePermission('orders.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = request.params as { orderId: string };
      const result = await orderService.getAdminOrderById(orderId);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/orders/:orderId/status',
    { schema: AdminUpdateOrderStatusSchema, preHandler: requirePermission('orders.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = request.params as { orderId: string };
      const body = OrderStatusUpdateSchema.parse(request.body);
      if (body.status === 'cancelled' && !(await enforceAdminPermission(request, reply, 'orders.cancel'))) return;
      const result = await orderService.adminUpdateStatus(
        orderId,
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/orders/:orderId/cancellation-requests/:cancellationRequestId/approve',
    { schema: ApproveOrderCancellationSchema, preHandler: requirePermission('orders.cancel') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId, cancellationRequestId } = request.params as {
        orderId: string;
        cancellationRequestId: string;
      };
      const body = AdminOrderCancellationReviewSchema.parse(request.body ?? {});
      const result = await orderService.approveCancellationRequest(
        orderId,
        cancellationRequestId,
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/orders/:orderId/cancellation-requests/:cancellationRequestId/reject',
    { schema: RejectOrderCancellationSchema, preHandler: requirePermission('orders.cancel') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId, cancellationRequestId } = request.params as {
        orderId: string;
        cancellationRequestId: string;
      };
      const body = AdminOrderCancellationReviewSchema.parse(request.body ?? {});
      const result = await orderService.rejectCancellationRequest(
        orderId,
        cancellationRequestId,
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  // ── Payment Management ──────────────────────────────────────────────────

  fastify.get(
    '/payments',
    { schema: GetAdminPaymentsSchema, preHandler: requirePermission('payments.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = PaymentQuerySchema.parse(request.query);
      const result = await paymentService.listAdminPayments(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/payments/:paymentId',
    { schema: GetAdminPaymentByIdSchema, preHandler: requirePermission('payments.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { paymentId } = request.params as { paymentId: string };
      const result = await paymentService.getAdminPaymentById(paymentId);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/payments/:paymentId/review',
    { schema: ReviewPaymentSchema, preHandler: requirePermission('payments.verify') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { paymentId } = request.params as { paymentId: string };
      const result = await paymentService.startReview(
        paymentId,
        request.dbAdmin!.id,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/payments/:paymentId/confirm',
    { schema: ConfirmPaymentSchema, preHandler: requirePermission('payments.verify') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { paymentId } = request.params as { paymentId: string };
      const body = AdminPaymentConfirmSchema.parse(request.body ?? {});
      const result = await paymentService.confirmPayment(
        paymentId,
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/payments/:paymentId/reject',
    { schema: RejectPaymentSchema, preHandler: requirePermission('payments.reject') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { paymentId } = request.params as { paymentId: string };
      const body = AdminPaymentRejectSchema.parse(request.body);
      const result = await paymentService.rejectPayment(
        paymentId,
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  // ── Logistics Management ────────────────────────────────────────────────

  fastify.get(
    '/logistics/providers',
    { schema: GetAdminLogisticsProvidersSchema, preHandler: requirePermission('logistics.view') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await logisticsService.listAdminProviders();
      return reply.send(result);
    },
  );

  fastify.patch(
    '/logistics/providers/:providerId/status',
    { schema: UpdateLogisticsProviderStatusSchema, preHandler: requirePermission('logistics.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { providerId } = request.params as { providerId: string };
      const body = LogisticsProviderStatusUpdateSchema.parse(request.body);
      const result = await logisticsService.updateProviderStatus(providerId, body);
      return reply.send(result);
    },
  );

  fastify.get(
    '/logistics/shipments',
    { schema: GetAdminLogisticsShipmentsSchema, preHandler: requirePermission('logistics.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = LogisticsShipmentQuerySchema.parse(request.query);
      const result = await logisticsService.listAdminShipments(query);
      return reply.send(result);
    },
  );

  // ── Direct RFQ Management ───────────────────────────────────────────────

  fastify.get(
    '/rfqs/direct',
    { schema: GetAdminDirectRFQsSchema, preHandler: requirePermission('rfqs.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminDirectRFQQuerySchema.parse(request.query);
      const result = await directRfqService.listAdminDirectRFQs(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/rfqs/direct/:rfqId',
    { schema: GetAdminDirectRFQByIdSchema, preHandler: requirePermission('rfqs.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId } = request.params as { rfqId: string };
      const result = await directRfqService.getAdminDirectRFQById(rfqId);
      return reply.send(result);
    },
  );

  fastify.get(
    '/rfqs/market',
    { schema: GetAdminMarketRFQsSchema, preHandler: requirePermission('rfqs.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminMarketRFQQuerySchema.parse(request.query);
      const result = await marketRfqService.listAdminMarketRFQs(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/rfqs/market/:rfqId',
    { schema: GetAdminMarketRFQByIdSchema, preHandler: requirePermission('rfqs.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId } = request.params as { rfqId: string };
      const result = await marketRfqService.getAdminMarketRFQById(rfqId);
      return reply.send(result);
    },
  );

  // ── Seller Verifications ─────────────────────────────────────────────────

  fastify.get(
    '/seller-verifications',
    { schema: GetSellerVerificationsSchema, preHandler: requirePermission('sellers.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = PaginationSchema.parse(request.query);
      const result = await adminService.getSellerVerifications({
        page: query.page,
        limit: query.limit,
        status: query.status as VerificationStatus | undefined,
        search: query.search,
      });
      return reply.send(result);
    },
  );

  fastify.get(
    '/seller-verifications/summary',
    { schema: GetSellerVerificationsSummarySchema, preHandler: requirePermission('sellers.view') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await adminService.getSellerVerificationSummary();
      return reply.send(result);
    },
  );

  fastify.get(
    '/seller-verifications/:verificationId',
    { schema: GetSellerVerificationByIdSchema, preHandler: requirePermission('sellers.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { verificationId } = request.params as { verificationId: string };
      const result = await adminService.getSellerVerificationById(verificationId);
      return reply.send({ data: result });
    },
  );

  fastify.patch(
    '/approve-seller/:verificationId',
    { schema: ApproveSellerSwaggerSchema, preHandler: requirePermission('sellers.verify') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { verificationId } = request.params as { verificationId: string };
      const body = ApproveSellerSchema.parse(request.body);
      const result = await adminService.approveSeller(
        verificationId,
        request.dbAdmin!.id,
        body.notes,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/reject-seller/:verificationId',
    { schema: RejectSellerSwaggerSchema, preHandler: requirePermission('sellers.reject') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { verificationId } = request.params as { verificationId: string };
      const body = RejectSellerSchema.parse(request.body);
      const result = await adminService.rejectSeller(
        verificationId,
        request.dbAdmin!.id,
        body.reason,
      );
      return reply.send(result);
    },
  );

  // ── User Management ──────────────────────────────────────────────────────

  fastify.get(
    '/users',
    { schema: GetUsersSchema, preHandler: requirePermission('users.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminUserQuerySchema.pick({
        page: true,
        limit: true,
        search: true,
      }).parse(request.query);
      const result = await adminService.getUsers(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/users/:userId',
    { schema: GetUserByIdSchema, preHandler: requirePermission('users.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      const result = await adminService.getUserById(userId);
      return reply.send({ data: result });
    },
  );

  fastify.patch(
    '/users/:userId/status',
    { schema: UpdateUserStatusSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      const { status, reason } = AdminUserStatusUpdateSchema.parse(request.body);
      const permission = permissionForUserStatus(status as UserStatus);
      if (!(await enforceAdminPermission(request, reply, permission))) return;

      const result = await adminService.updateUserStatus(
        userId,
        status as UserStatus,
        reason,
        request.dbAdmin!.id,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/users/:userId/disable',
    { schema: DisableUserSchema, preHandler: requirePermission('users.disable') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      const { reason } = AdminDisableUserSchema.parse(request.body);
      const result = await adminService.disableUser(
        userId,
        request.dbAdmin!.id,
        reason,
      );
      return reply.send(result);
    },
  );

  // Compatibility alias for the pre-upgrade route.
  fastify.patch(
    '/disable-user/:userId',
    { schema: DisableUserSchema, preHandler: requirePermission('users.disable') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      const { reason } = AdminDisableUserSchema.parse(request.body);
      const result = await adminService.disableUser(
        userId,
        request.dbAdmin!.id,
        reason,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/users/:userId/activate',
    { schema: ActivateUserSchema, preHandler: requirePermission('users.activate') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      const result = await adminService.activateUser(
        userId,
        request.dbAdmin!.id,
      );
      return reply.send(result);
    },
  );

  // ── Category Management ──────────────────────────────────────────────────

  fastify.post(
    '/categories',
    { schema: CreateCategorySchema, preHandler: requirePermission('categories.create') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = CategoryCreateSchema.parse(request.body);
      const result = await categoryService.createCategory(
        request.dbAdmin!.id,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/categories',
    { schema: GetAdminCategoriesSchema, preHandler: requirePermission('categories.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = CategoryQuerySchema.parse(request.query);
      const result = await categoryService.getAdminCategories({
        page: query.page,
        limit: query.limit,
        status: query.status as CategoryStatus | undefined,
        parentId: query.parentId,
        search: query.search,
      });
      return reply.send(result);
    },
  );

  fastify.patch(
    '/categories/:categoryId',
    { schema: UpdateCategorySwaggerSchema, preHandler: requirePermission('categories.update') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { categoryId } = request.params as { categoryId: string };
      const body = CategoryUpdateSchema.parse(request.body);
      const result = await categoryService.updateCategory(
        categoryId,
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/categories/:categoryId/status',
    { schema: UpdateCategoryStatusSwaggerSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { categoryId } = request.params as { categoryId: string };
      const { status } = CategoryStatusUpdateSchema.parse(request.body);
      const permission = permissionForCategoryStatus(status as CategoryStatus);
      if (!(await enforceAdminPermission(request, reply, permission))) return;

      const result = await categoryService.updateCategoryStatus(
        categoryId,
        request.dbAdmin!.id,
        status as CategoryStatus,
      );
      return reply.send(result);
    },
  );
}

function permissionForUserStatus(status: UserStatus): string {
  if (status === UserStatus.DISABLED) return 'users.disable';
  if (status === UserStatus.ACTIVE) return 'users.activate';
  return 'users.update';
}

function permissionForCategoryStatus(status: CategoryStatus): string {
  if (status === CategoryStatus.ACTIVE) return 'categories.activate';
  if (status === CategoryStatus.INACTIVE) return 'categories.deactivate';
  if (status === CategoryStatus.ARCHIVED || status === CategoryStatus.DELETED) {
    return 'categories.archive';
  }
  return 'categories.update';
}

function permissionForSubscriptionPlanStatus(status: string): string {
  if (status === 'active') return 'subscription_plans.activate';
  if (status === 'inactive') return 'subscription_plans.deactivate';
  return 'subscription_plans.update';
}
