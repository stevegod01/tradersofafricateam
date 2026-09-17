import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  optionalAuthenticate,
  requireAuth,
  requirePermission,
} from '../../common/middleware/auth.middleware';
import {
  FeaturePromotionSchema,
  ProductDiscoveryLimitQuerySchema,
  SearchEventCreateSchema,
  SearchHistoryQuerySchema,
  SearchReindexSchema,
  SearchSettingsUpdateSchema,
  SearchSuggestionQuerySchema,
  SellerDiscoveryQuerySchema,
} from '../../common/utils/validation.schemas';
import {
  ClearSearchHistorySwaggerSchema,
  DeleteSearchHistoryItemSwaggerSchema,
  FeatureProductSwaggerSchema,
  FeatureStoreSwaggerSchema,
  GetPopularProductsSwaggerSchema,
  GetPopularSearchesSwaggerSchema,
  GetRecentlyViewedProductsSwaggerSchema,
  GetRelatedProductsSwaggerSchema,
  GetSearchHistorySwaggerSchema,
  GetSearchIndexStatusSwaggerSchema,
  GetSearchSettingsSwaggerSchema,
  GetSearchSuggestionsSwaggerSchema,
  GetSellerDiscoverySwaggerSchema,
  RecordProductViewSwaggerSchema,
  RecordSearchEventSwaggerSchema,
  ReindexSearchSwaggerSchema,
  UpdateSearchSettingsSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { I18nService } from '../i18n/i18n.service';
import { SearchService } from './search.service';

const ProductParamSchema = z.object({
  productId: z.string().uuid(),
});

const SearchHistoryParamSchema = z.object({
  searchHistoryId: z.string().uuid(),
});

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  const searchService = new SearchService();
  const i18nService = new I18nService();

  fastify.get(
    '/sellers',
    { schema: GetSellerDiscoverySwaggerSchema, preHandler: optionalAuthenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = SellerDiscoveryQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await searchService.listSellers(query, language);
      return reply.send(result);
    },
  );

  fastify.get(
    '/search/suggestions',
    { schema: GetSearchSuggestionsSwaggerSchema, preHandler: optionalAuthenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = SearchSuggestionQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await searchService.getSuggestions(query, language);
      return reply.send(result);
    },
  );

  fastify.get(
    '/search/history',
    { schema: GetSearchHistorySwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = SearchHistoryQuerySchema.parse(request.query);
      const result = await searchService.getSearchHistory(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.delete(
    '/search/history/:searchHistoryId',
    { schema: DeleteSearchHistoryItemSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { searchHistoryId } = SearchHistoryParamSchema.parse(request.params);
      const result = await searchService.deleteSearchHistoryItem(
        request.dbUser!.id,
        searchHistoryId,
      );
      return reply.send(result);
    },
  );

  fastify.delete(
    '/search/history',
    { schema: ClearSearchHistorySwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await searchService.clearSearchHistory(request.dbUser!.id);
      return reply.send(result);
    },
  );

  fastify.get(
    '/search/popular',
    { schema: GetPopularSearchesSwaggerSchema },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await searchService.getPopularSearches();
      return reply.send(result);
    },
  );

  fastify.post(
    '/search/events',
    {
      schema: RecordSearchEventSwaggerSchema,
      preHandler: requireAuth,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = SearchEventCreateSchema.parse(request.body);
      const result = await searchService.recordSearchEvent(request.dbUser!.id, body);
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/seller/products/:productId/feature',
    { schema: FeatureProductSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = ProductParamSchema.parse(request.params);
      const body = FeaturePromotionSchema.parse(request.body ?? {});
      const result = await searchService.featureProduct(
        request.dbUser!.id,
        productId,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/seller/store/feature',
    { schema: FeatureStoreSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = FeaturePromotionSchema.parse(request.body ?? {});
      const result = await searchService.featureStore(request.dbUser!.id, body);
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/products/:productId/view',
    { schema: RecordProductViewSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = ProductParamSchema.parse(request.params);
      const result = await searchService.recordProductView(
        request.dbUser!.id,
        productId,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/products/recently-viewed',
    { schema: GetRecentlyViewedProductsSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = ProductDiscoveryLimitQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await searchService.getRecentlyViewedProducts(
        request.dbUser!.id,
        language,
        query,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/products/popular',
    { schema: GetPopularProductsSwaggerSchema, preHandler: optionalAuthenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = ProductDiscoveryLimitQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await searchService.getPopularProducts(language, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/products/:productId/related',
    { schema: GetRelatedProductsSwaggerSchema, preHandler: optionalAuthenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = ProductParamSchema.parse(request.params);
      const query = ProductDiscoveryLimitQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await searchService.getRelatedProducts(productId, language, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/admin/search/settings',
    { schema: GetSearchSettingsSwaggerSchema, preHandler: requirePermission('search.view_settings') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await searchService.getAdminSearchSettings();
      return reply.send(result);
    },
  );

  fastify.patch(
    '/admin/search/settings',
    { schema: UpdateSearchSettingsSwaggerSchema, preHandler: requirePermission('search.manage_settings') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = SearchSettingsUpdateSchema.parse(request.body);
      const result = await searchService.updateAdminSearchSettings(
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/admin/search/index/status',
    { schema: GetSearchIndexStatusSwaggerSchema, preHandler: requirePermission('search.view_index') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await searchService.getSearchIndexStatus();
      return reply.send(result);
    },
  );

  fastify.post(
    '/admin/search/reindex',
    { schema: ReindexSearchSwaggerSchema, preHandler: requirePermission('search.reindex') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = SearchReindexSchema.parse(request.body);
      const result = await searchService.requestReindex(request.dbAdmin!.id, body);
      return reply.status(202).send(result);
    },
  );
}
