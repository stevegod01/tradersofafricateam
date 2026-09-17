import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  optionalAuthenticate,
  requireAuth,
} from '../../common/middleware/auth.middleware';
import {
  PublicSubscriptionPlanQuerySchema,
  RenewSubscriptionSchema,
  SubscribeSchema,
  SubscriptionAutoRenewSchema,
  SubscriptionHistoryQuerySchema,
} from '../../common/utils/validation.schemas';
import {
  CreateSubscriptionSwaggerSchema,
  GetCurrentSubscriptionSwaggerSchema,
  GetPublicSubscriptionPlanByIdSwaggerSchema,
  GetPublicSubscriptionPlansSwaggerSchema,
  GetSubscriptionHistorySwaggerSchema,
  RenewSubscriptionSwaggerSchema,
  UpdateSubscriptionAutoRenewSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { SubscriptionService } from './subscription.service';
import { I18nService } from '../i18n/i18n.service';

const PlanParamSchema = z.object({
  planId: z.string().uuid(),
});

const SubscriptionParamSchema = z.object({
  subscriptionId: z.string().uuid(),
});

export async function subscriptionRoutes(fastify: FastifyInstance): Promise<void> {
  const subscriptionService = new SubscriptionService(fastify);
  const i18nService = new I18nService();

  fastify.get(
    '/subscription-plans',
    { schema: GetPublicSubscriptionPlansSwaggerSchema, preHandler: optionalAuthenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = PublicSubscriptionPlanQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await subscriptionService.listPublicPlans(query, language);
      return reply.send(result);
    },
  );

  fastify.get(
    '/subscription-plans/:planId',
    { schema: GetPublicSubscriptionPlanByIdSwaggerSchema, preHandler: optionalAuthenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { planId } = PlanParamSchema.parse(request.params);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await subscriptionService.getPublicPlanById(planId, language);
      return reply.send(result);
    },
  );

  fastify.post(
    '/subscriptions',
    { schema: CreateSubscriptionSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = SubscribeSchema.parse(request.body);
      const result = await subscriptionService.subscribe(request.dbUser!.id, body);
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/subscriptions/current',
    { schema: GetCurrentSubscriptionSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await subscriptionService.getCurrentSubscription(
        request.dbUser!.id,
        language,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/subscriptions/:subscriptionId/renew',
    { schema: RenewSubscriptionSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subscriptionId } = SubscriptionParamSchema.parse(request.params);
      const body = RenewSubscriptionSchema.parse(request.body ?? {});
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await subscriptionService.renewSubscription(
        request.dbUser!.id,
        subscriptionId,
        body,
        language,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/subscriptions/:subscriptionId/auto-renew',
    { schema: UpdateSubscriptionAutoRenewSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subscriptionId } = SubscriptionParamSchema.parse(request.params);
      const body = SubscriptionAutoRenewSchema.parse(request.body);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await subscriptionService.updateAutoRenew(
        request.dbUser!.id,
        subscriptionId,
        body,
        language,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/subscriptions/history',
    { schema: GetSubscriptionHistorySwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = SubscriptionHistoryQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await subscriptionService.listSubscriptionHistory(
        request.dbUser!.id,
        query,
        language,
      );
      return reply.send(result);
    },
  );
}
