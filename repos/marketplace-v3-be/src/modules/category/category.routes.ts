import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CategoryService } from './category.service';
import { CategoryQuerySchema } from '../../common/utils/validation.schemas';
import {
  GetPublicCategoriesSchema,
  GetCategoryTreeSchema,
  GetPublicCategoryByIdSchema,
} from '../../common/utils/swagger.schemas';
import { optionalAuthenticate } from '../../common/middleware/auth.middleware';
import { I18nService } from '../i18n/i18n.service';

const CategoryParamSchema = z.object({
  categoryId: z.string().uuid(),
});

export async function categoryRoutes(fastify: FastifyInstance): Promise<void> {
  const categoryService = new CategoryService();
  const i18nService = new I18nService();

  fastify.get(
    '/',
    { schema: GetPublicCategoriesSchema, preHandler: optionalAuthenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = CategoryQuerySchema.parse(request.query);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await categoryService.getPublicCategories(
        {
          page: query.page,
          limit: query.limit,
          parentId: query.parentId,
          search: query.search,
        },
        language,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/tree',
    { schema: GetCategoryTreeSchema, preHandler: optionalAuthenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await categoryService.getCategoryTree(language);
      return reply.send(result);
    },
  );

  fastify.get(
    '/:categoryId',
    { schema: GetPublicCategoryByIdSchema, preHandler: optionalAuthenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { categoryId } = CategoryParamSchema.parse(request.params);
      const language = await i18nService.resolveRequestLanguage(
        request,
        request.dbUser,
      );
      const result = await categoryService.getPublicCategoryById(categoryId, language);
      return reply.send(result);
    },
  );
}
