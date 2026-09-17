import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../common/middleware/auth.middleware';
import {
  B2BLogisticsRequestSchema,
  LogisticsQuoteRequestSchema,
  LogisticsWebhookSchema,
} from '../../common/utils/validation.schemas';
import {
  CreateB2BLogisticsRequestSwaggerSchema,
  CreateLogisticsQuoteSwaggerSchema,
  GetPublicLogisticsTrackingSwaggerSchema,
  LogisticsWebhookSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { LogisticsService } from './logistics.service';

const ProviderCodeParamSchema = z.object({
  providerCode: z.string().min(1).max(80).trim(),
});

const TrackingParamSchema = z.object({
  trackingId: z.string().min(1).max(160).trim(),
});

export async function logisticsRoutes(fastify: FastifyInstance): Promise<void> {
  const logisticsService = new LogisticsService(fastify);

  fastify.get(
    '/tracking/:trackingId',
    { schema: GetPublicLogisticsTrackingSwaggerSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { trackingId } = TrackingParamSchema.parse(request.params);
      const result = await logisticsService.getPublicTracking(trackingId);
      return reply.send(result);
    },
  );

  fastify.post(
    '/quotes',
    { schema: CreateLogisticsQuoteSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = LogisticsQuoteRequestSchema.parse(request.body);
      const result = await logisticsService.getQuotes(request.dbUser!.id, body);
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/b2b/requests',
    { schema: CreateB2BLogisticsRequestSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = B2BLogisticsRequestSchema.parse(request.body);
      const result = await logisticsService.createB2BRequest(request.dbUser!.id, body);
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/webhooks/:providerCode',
    { schema: LogisticsWebhookSwaggerSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { providerCode } = ProviderCodeParamSchema.parse(request.params);
      const body = LogisticsWebhookSchema.parse(request.body);
      const result = await logisticsService.handleWebhook(
        providerCode,
        body,
        request.headers,
      );
      return reply.send(result);
    },
  );
}
