import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ProductService } from './product.service';
import {
  ProductCreateSchema as ProductCreateZod,
  ProductInventoryUpdateSchema as ProductInventoryZod,
  ProductQuerySchema,
  ProductStatusUpdateSchema as ProductStatusZod,
  ProductUpdateSchema as ProductUpdateZod,
} from '../../common/utils/validation.schemas';
import {
  CreateProductSchema,
  DeleteProductImageSchema,
  DeleteProductSchema,
  GetProductByIdSchema,
  GetProductsSchema,
  GetSellerProductByIdSchema,
  GetSellerProductsSchema,
  UpdateProductInventorySchema,
  UpdateProductSchema,
  UpdateProductStatusSchema,
} from '../../common/utils/swagger.schemas';
import {
  optionalAuthenticate,
  requireAuth,
} from '../../common/middleware/auth.middleware';
import { I18nService } from '../i18n/i18n.service';
import { InventoryStatus, ProductStatus } from '../../database/entities/product.entity';

const ProductParamSchema = z.object({
  productId: z.string().uuid(),
});

const ProductImageParamSchema = z.object({
  productId: z.string().uuid(),
  imageId: z.string().uuid(),
});

export async function productRoutes(fastify: FastifyInstance): Promise<void> {
  const productService = new ProductService();
  const i18nService = new I18nService();

  fastify.post(
    '/',
    { schema: CreateProductSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = ProductCreateZod.parse(request.body);
      const result = await productService.createProduct(request.dbUser!.id, body);
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/mine',
    { schema: GetSellerProductsSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = ProductQuerySchema.parse(request.query);
      const result = await productService.getMyProducts(
        request.dbUser!.id,
        {
          page: query.page,
          limit: query.limit,
          status: query.status as ProductStatus | undefined,
          categoryId: query.categoryId,
          search: query.search,
        },
        request.dbUser!.selectedLanguage,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/mine/:productId',
    { schema: GetSellerProductByIdSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = ProductParamSchema.parse(request.params);
      const result = await productService.getSellerProductById(
        request.dbUser!.id,
        productId,
        request.dbUser!.selectedLanguage,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/',
    { schema: GetProductsSchema, preHandler: optionalAuthenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = ProductQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      reply.header('Vary', [reply.getHeader('Vary'), 'Authorization'].filter(Boolean).join(', '));
      if (request.dbUser) reply.header('Cache-Control', 'private, no-store');
      const result = await productService.getPublicProducts(
        {
          page: query.page,
          limit: query.limit,
          categoryId: query.categoryId,
          categoryIds: query.categoryIds,
          sellerId: query.sellerId,
          countryOfOrigin: query.countryOfOrigin,
          minPrice: query.minPrice,
          maxPrice: query.maxPrice,
          currency: query.currency,
          minRating: query.minRating,
          inventoryStatus: query.inventoryStatus as InventoryStatus | undefined,
          hasDiscount: query.hasDiscount,
          sortBy: query.sortBy,
          search: query.search,
        },
        language,
        request.dbUser?.id ?? null,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/:productId',
    { schema: GetProductByIdSchema, preHandler: optionalAuthenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = ProductParamSchema.parse(request.params);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      reply.header('Vary', [reply.getHeader('Vary'), 'Authorization'].filter(Boolean).join(', '));
      if (request.dbUser) reply.header('Cache-Control', 'private, no-store');
      const result = await productService.getPublicProductById(productId, language, request.dbUser?.id ?? null);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/:productId',
    { schema: UpdateProductSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = ProductParamSchema.parse(request.params);
      const body = ProductUpdateZod.parse(request.body);
      const result = await productService.updateProduct(
        request.dbUser!.id,
        productId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/:productId/status',
    { schema: UpdateProductStatusSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = ProductParamSchema.parse(request.params);
      const { status } = ProductStatusZod.parse(request.body);
      const result = await productService.updateProductStatus(
        request.dbUser!.id,
        productId,
        status as ProductStatus,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/:productId/inventory',
    { schema: UpdateProductInventorySchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = ProductParamSchema.parse(request.params);
      const body = ProductInventoryZod.parse(request.body);
      const result = await productService.updateInventory(
        request.dbUser!.id,
        productId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.delete(
    '/:productId/images/:imageId',
    { schema: DeleteProductImageSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId, imageId } = ProductImageParamSchema.parse(request.params);
      const result = await productService.deleteProductImage(
        request.dbUser!.id,
        productId,
        imageId,
      );
      return reply.send(result);
    },
  );

  fastify.delete(
    '/:productId',
    { schema: DeleteProductSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = ProductParamSchema.parse(request.params);
      const result = await productService.softDeleteProduct(request.dbUser!.id, productId);
      return reply.send(result);
    },
  );
}
