import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../common/middleware/auth.middleware';
import {
  DirectRFQAcceptQuoteSchema,
  DirectRFQCancelSchema,
  DirectRFQCounterOfferSchema,
  DirectRFQCreateSchema,
  DirectRFQQuerySchema,
  DirectRFQQuoteTermsSchema,
  DirectRFQRejectQuoteSchema,
} from '../../common/utils/validation.schemas';
import {
  AcceptDirectRFQQuoteSwaggerSchema,
  CancelDirectRFQSwaggerSchema,
  CreateDirectRFQSchema,
  CreateDirectRFQQuoteSwaggerSchema,
  GetDirectRFQByIdSchema,
  GetDirectRFQQuoteSchema,
  GetDirectRFQsSchema,
  RejectDirectRFQQuoteSwaggerSchema,
  SubmitDirectRFQCounterOfferSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { I18nService } from '../i18n/i18n.service';
import { DirectRFQService } from './direct-rfq.service';

const RfqParamSchema = z.object({
  rfqId: z.string().uuid(),
});

const RfqQuoteParamSchema = z.object({
  rfqId: z.string().uuid(),
  quoteId: z.string().uuid(),
});

export async function directRfqRoutes(fastify: FastifyInstance): Promise<void> {
  const directRfqService = new DirectRFQService(fastify);
  const i18nService = new I18nService();

  fastify.get(
    '/',
    { schema: GetDirectRFQsSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = DirectRFQQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await directRfqService.listDirectRFQs(
        request.dbUser!.id,
        query,
        language,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/',
    { schema: CreateDirectRFQSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = DirectRFQCreateSchema.parse(request.body);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await directRfqService.createDirectRFQ(
        request.dbUser!.id,
        body,
        language,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/:rfqId/quotes',
    { schema: CreateDirectRFQQuoteSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId } = RfqParamSchema.parse(request.params);
      const body = DirectRFQQuoteTermsSchema.parse(request.body);
      const result = await directRfqService.submitQuote(
        request.dbUser!.id,
        rfqId,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/:rfqId/quotes/:quoteId',
    { schema: GetDirectRFQQuoteSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId, quoteId } = RfqQuoteParamSchema.parse(request.params);
      const result = await directRfqService.getQuoteDetails(
        request.dbUser!.id,
        rfqId,
        quoteId,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:rfqId/quotes/:quoteId/counter-offer',
    { schema: SubmitDirectRFQCounterOfferSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId, quoteId } = RfqQuoteParamSchema.parse(request.params);
      const body = DirectRFQCounterOfferSchema.parse(request.body);
      const result = await directRfqService.submitCounterOffer(
        request.dbUser!.id,
        rfqId,
        quoteId,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/:rfqId/quotes/:quoteId/accept',
    { schema: AcceptDirectRFQQuoteSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId, quoteId } = RfqQuoteParamSchema.parse(request.params);
      const body = DirectRFQAcceptQuoteSchema.parse(request.body);
      const result = await directRfqService.acceptQuote(
        request.dbUser!.id,
        rfqId,
        quoteId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:rfqId/quotes/:quoteId/reject',
    { schema: RejectDirectRFQQuoteSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId, quoteId } = RfqQuoteParamSchema.parse(request.params);
      const body = DirectRFQRejectQuoteSchema.parse(request.body);
      const result = await directRfqService.rejectQuote(
        request.dbUser!.id,
        rfqId,
        quoteId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:rfqId/cancel',
    { schema: CancelDirectRFQSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId } = RfqParamSchema.parse(request.params);
      const body = DirectRFQCancelSchema.parse(request.body);
      const result = await directRfqService.cancelRfq(request.dbUser!.id, rfqId, body);
      return reply.send(result);
    },
  );

  fastify.get(
    '/:rfqId',
    { schema: GetDirectRFQByIdSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId } = RfqParamSchema.parse(request.params);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await directRfqService.getDirectRFQById(
        request.dbUser!.id,
        rfqId,
        language,
      );
      return reply.send(result);
    },
  );
}
