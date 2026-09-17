import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../common/middleware/auth.middleware';
import {
  MarketRFQAcceptQuoteSchema,
  MarketRFQAvailableQuerySchema,
  MarketRFQCancelSchema,
  MarketRFQCounterOfferSchema,
  MarketRFQCreateSchema,
  MarketRFQMyResponsesQuerySchema,
  MarketRFQQuerySchema,
  MarketRFQQuoteQuerySchema,
  MarketRFQQuoteTermsSchema,
  MarketRFQRejectQuoteSchema,
} from '../../common/utils/validation.schemas';
import {
  AcceptMarketRFQQuoteSwaggerSchema,
  CancelMarketRFQSwaggerSchema,
  CreateMarketRFQQuoteSwaggerSchema,
  CreateMarketRFQSchema,
  GetAvailableMarketRFQsSchema,
  GetMarketRFQByIdSchema,
  GetMarketRFQQuoteSchema,
  GetMarketRFQQuotesSchema,
  GetMarketRFQsSchema,
  GetMyMarketRFQResponsesSchema,
  RejectMarketRFQQuoteSwaggerSchema,
  SubmitMarketRFQCounterOfferSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { I18nService } from '../i18n/i18n.service';
import { MarketRFQService } from './market-rfq.service';

const RfqParamSchema = z.object({
  rfqId: z.string().uuid(),
});

const RfqQuoteParamSchema = z.object({
  rfqId: z.string().uuid(),
  quoteId: z.string().uuid(),
});

export async function marketRfqRoutes(fastify: FastifyInstance): Promise<void> {
  const marketRfqService = new MarketRFQService(fastify);
  const i18nService = new I18nService();

  fastify.get(
    '/',
    { schema: GetMarketRFQsSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = MarketRFQQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await marketRfqService.listBuyerMarketRFQs(
        request.dbUser!.id,
        query,
        language,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/',
    { schema: CreateMarketRFQSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = MarketRFQCreateSchema.parse(request.body);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await marketRfqService.createMarketRFQ(
        request.dbUser!.id,
        body,
        language,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/available',
    { schema: GetAvailableMarketRFQsSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = MarketRFQAvailableQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await marketRfqService.listAvailableMarketRFQs(
        request.dbUser!.id,
        query,
        language,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/my-responses',
    { schema: GetMyMarketRFQResponsesSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = MarketRFQMyResponsesQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await marketRfqService.listMyResponses(
        request.dbUser!.id,
        query,
        language,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:rfqId/quotes',
    { schema: CreateMarketRFQQuoteSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId } = RfqParamSchema.parse(request.params);
      const body = MarketRFQQuoteTermsSchema.parse(request.body);
      const result = await marketRfqService.submitQuote(
        request.dbUser!.id,
        rfqId,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/:rfqId/quotes',
    { schema: GetMarketRFQQuotesSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId } = RfqParamSchema.parse(request.params);
      const query = MarketRFQQuoteQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await marketRfqService.listQuotesForBuyer(
        request.dbUser!.id,
        rfqId,
        query,
        language,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/:rfqId/quotes/:quoteId',
    { schema: GetMarketRFQQuoteSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId, quoteId } = RfqQuoteParamSchema.parse(request.params);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await marketRfqService.getQuoteDetails(
        request.dbUser!.id,
        rfqId,
        quoteId,
        language,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:rfqId/quotes/:quoteId/counter-offer',
    { schema: SubmitMarketRFQCounterOfferSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId, quoteId } = RfqQuoteParamSchema.parse(request.params);
      const body = MarketRFQCounterOfferSchema.parse(request.body);
      const result = await marketRfqService.submitCounterOffer(
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
    { schema: AcceptMarketRFQQuoteSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId, quoteId } = RfqQuoteParamSchema.parse(request.params);
      const body = MarketRFQAcceptQuoteSchema.parse(request.body);
      const result = await marketRfqService.acceptQuote(
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
    { schema: RejectMarketRFQQuoteSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId, quoteId } = RfqQuoteParamSchema.parse(request.params);
      const body = MarketRFQRejectQuoteSchema.parse(request.body);
      const result = await marketRfqService.rejectQuote(
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
    { schema: CancelMarketRFQSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId } = RfqParamSchema.parse(request.params);
      const body = MarketRFQCancelSchema.parse(request.body);
      const result = await marketRfqService.cancelRfq(request.dbUser!.id, rfqId, body);
      return reply.send(result);
    },
  );

  fastify.get(
    '/:rfqId',
    { schema: GetMarketRFQByIdSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rfqId } = RfqParamSchema.parse(request.params);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await marketRfqService.getMarketRFQById(
        request.dbUser!.id,
        rfqId,
        language,
      );
      return reply.send(result);
    },
  );
}
