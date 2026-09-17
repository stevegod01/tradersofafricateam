import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  requireAuth,
  requirePermission,
} from '../../common/middleware/auth.middleware';
import {
  LanguageCreateSchema,
  LanguageDefaultUpdateSchema,
  LanguagePreferenceUpdateSchema,
  LanguageStatusUpdateSchema,
  LanguageUpdateSchema,
  ManualTranslationUpdateSchema,
  TranslationStatusQuerySchema,
} from '../../common/utils/validation.schemas';
import {
  CreateLanguageSwaggerSchema,
  GetAdminLanguagesSwaggerSchema,
  GetSupportedLanguagesSwaggerSchema,
  GetTranslationStatusSwaggerSchema,
  RetryTranslationSwaggerSchema,
  SetDefaultLanguageSwaggerSchema,
  UpdateLanguagePreferenceSwaggerSchema,
  UpdateLanguageStatusSwaggerSchema,
  UpdateLanguageSwaggerSchema,
  UpdateManualTranslationSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { I18nService } from './i18n.service';

const LanguageParamSchema = z.object({
  languageId: z.string().uuid(),
});

const TranslationParamSchema = z.object({
  translationId: z.string().uuid(),
});

export async function i18nRoutes(fastify: FastifyInstance): Promise<void> {
  const i18nService = new I18nService();

  fastify.get(
    '/languages',
    { schema: GetSupportedLanguagesSwaggerSchema },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await i18nService.getSupportedLanguages();
      return reply.send(result);
    },
  );

  fastify.patch(
    '/users/language',
    { schema: UpdateLanguagePreferenceSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { language } = LanguagePreferenceUpdateSchema.parse(request.body);
      const result = await i18nService.updateUserLanguage(request.dbUser!.id, language);
      return reply.send(result);
    },
  );

  fastify.get(
    '/admin/languages',
    { schema: GetAdminLanguagesSwaggerSchema, preHandler: requirePermission('languages.view') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await i18nService.listAdminLanguages();
      return reply.send(result);
    },
  );

  fastify.post(
    '/admin/languages',
    { schema: CreateLanguageSwaggerSchema, preHandler: requirePermission('settings.languages.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = LanguageCreateSchema.parse(request.body);
      const result = await i18nService.createLanguage(request.dbAdmin!.id, body);
      return reply.status(201).send(result);
    },
  );

  fastify.patch(
    '/admin/languages/:languageId',
    { schema: UpdateLanguageSwaggerSchema, preHandler: requirePermission('settings.languages.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { languageId } = LanguageParamSchema.parse(request.params);
      const body = LanguageUpdateSchema.parse(request.body);
      const result = await i18nService.updateLanguage(
        request.dbAdmin!.id,
        languageId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/admin/languages/:languageId/status',
    { schema: UpdateLanguageStatusSwaggerSchema, preHandler: requirePermission('settings.languages.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { languageId } = LanguageParamSchema.parse(request.params);
      const body = LanguageStatusUpdateSchema.parse(request.body);
      const result = await i18nService.updateLanguageStatus(
        request.dbAdmin!.id,
        languageId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/admin/languages/:languageId/default',
    { schema: SetDefaultLanguageSwaggerSchema, preHandler: requirePermission('settings.languages.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { languageId } = LanguageParamSchema.parse(request.params);
      LanguageDefaultUpdateSchema.parse(request.body);
      const result = await i18nService.setDefaultLanguage(request.dbAdmin!.id, languageId);
      return reply.send(result);
    },
  );

  fastify.get(
    '/admin/translations/status',
    { schema: GetTranslationStatusSwaggerSchema, preHandler: requirePermission('translations.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = TranslationStatusQuerySchema.parse(request.query);
      const result = await i18nService.listTranslationStatus(query);
      return reply.send(result);
    },
  );

  fastify.post(
    '/admin/translations/:translationId/retry',
    { schema: RetryTranslationSwaggerSchema, preHandler: requirePermission('translations.retry') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { translationId } = TranslationParamSchema.parse(request.params);
      const result = await i18nService.retryTranslation(
        request.dbAdmin!.id,
        translationId,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/admin/translations/:translationId',
    { schema: UpdateManualTranslationSwaggerSchema, preHandler: requirePermission('translations.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { translationId } = TranslationParamSchema.parse(request.params);
      const { value } = ManualTranslationUpdateSchema.parse(request.body);
      const result = await i18nService.updateTranslationValue(
        request.dbAdmin!.id,
        translationId,
        value,
      );
      return reply.send(result);
    },
  );
}
