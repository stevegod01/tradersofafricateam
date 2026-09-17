import { lockConfiguration, updateSetting } from '../system-settings/settings.service';
import { getSetting } from '../system-settings/settings.reader';
import { writeAudit } from '../audit-log/audit-log.writer';
import { auditedUpdate } from '../audit-log/audit-log.mutations';
import { FastifyRequest } from 'fastify';
import {
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import { AdminAuditEvent } from '../../database/entities/admin-audit-event.entity';
import { Category, TranslationMap } from '../../database/entities/category.entity';
import { DirectRFQ } from '../../database/entities/direct-rfq.entity';
import {
  Language,
  LanguageDirection,
  LanguageStatus,
} from '../../database/entities/language.entity';
import { MarketRFQ } from '../../database/entities/market-rfq.entity';
import { Product } from '../../database/entities/product.entity';
import { SubscriptionPlan } from '../../database/entities/subscription-plan.entity';
import { SystemAnnouncement } from '../../database/entities/system-announcement.entity';
import {
  TranslatableEntityType,
  TranslationMetadata,
  TranslationSource,
  TranslationStatus,
} from '../../database/entities/translation-metadata.entity';
import { User } from '../../database/entities/user.entity';
import { createError } from '../../common/utils/http-error.util';
import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  isValidLanguageCode,
  normalizeLanguageCode,
} from '../../common/utils/i18n.util';
import {
  LanguageCreateDto,
  LanguageStatusUpdateDto,
  LanguageUpdateDto,
  TranslationStatusQueryDto,
} from '../../common/utils/validation.schemas';

type EntityTranslationRequest = {
  entityType: TranslatableEntityType;
  entityId: string;
  sourceLanguage: string;
  fields: Record<string, TranslationMap | null | undefined>;
  markNonSourceStale?: boolean;
};

type EntityTranslationTarget = {
  entity: EntityTarget<ObjectLiteral>;
  fields: string[];
};

export const INITIAL_LANGUAGE_DEFINITIONS = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    direction: LanguageDirection.LTR,
    isDefault: true,
    status: LanguageStatus.ACTIVE,
    sortOrder: 1,
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    direction: LanguageDirection.LTR,
    isDefault: false,
    status: LanguageStatus.ACTIVE,
    sortOrder: 2,
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    direction: LanguageDirection.RTL,
    isDefault: false,
    status: LanguageStatus.ACTIVE,
    sortOrder: 3,
  },
  {
    code: 'sw',
    name: 'Swahili',
    nativeName: 'Kiswahili',
    direction: LanguageDirection.LTR,
    isDefault: false,
    status: LanguageStatus.ACTIVE,
    sortOrder: 4,
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    direction: LanguageDirection.LTR,
    isDefault: false,
    status: LanguageStatus.ACTIVE,
    sortOrder: 5,
  },
] as const;

const ENTITY_TRANSLATION_TARGETS: Record<TranslatableEntityType, EntityTranslationTarget> = {
  [TranslatableEntityType.PRODUCT]: {
    entity: Product,
    fields: ['productName', 'productDescription'],
  },
  [TranslatableEntityType.CATEGORY]: {
    entity: Category,
    fields: ['name', 'description'],
  },
  [TranslatableEntityType.DIRECT_RFQ]: {
    entity: DirectRFQ,
    fields: ['description', 'buyerNotes'],
  },
  [TranslatableEntityType.MARKET_RFQ]: {
    entity: MarketRFQ,
    fields: ['requirementTitle', 'description', 'buyerNotes'],
  },
  [TranslatableEntityType.SUBSCRIPTION_PLAN]: {
    entity: SubscriptionPlan,
    fields: ['name', 'description'],
  },
  [TranslatableEntityType.SYSTEM_ANNOUNCEMENT]: {
    entity: SystemAnnouncement,
    fields: ['title', 'message'],
  },
};

export class I18nService {
  private languageRepo = AppDataSource.getRepository(Language);
  private translationRepo = AppDataSource.getRepository(TranslationMetadata);
  private userRepo = AppDataSource.getRepository(User);
  private adminAuditRepo = AppDataSource.getRepository(AdminAuditEvent);

  async getSupportedLanguages(): Promise<{ success: true; data: Record<string, unknown>[] }> {
    await this.ensureInitialLanguages();
    const languages = await this.languageRepo.find({
      where: { status: LanguageStatus.ACTIVE },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    return {
      success: true,
      data: languages.map((language) => serializeLanguage(language, false)),
    };
  }

  async listAdminLanguages(): Promise<{ success: true; data: Record<string, unknown>[] }> {
    await this.ensureInitialLanguages();
    const languages = await this.languageRepo.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    return {
      success: true,
      data: languages.map((language) => serializeLanguage(language, true)),
    };
  }

  async createLanguage(
    adminId: string,
    dto: LanguageCreateDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    await this.ensureInitialLanguages();
    const code = normalizeLanguageCode(dto.code);
    if (!isValidLanguageCode(code)) throw createError.badRequest('Invalid language code');
    if(code==='ar' && dto.direction!=='rtl')throw createError.badRequest('Arabic requires right-to-left direction');

    const existing = await this.languageRepo.findOne({ where: { code } });
    if (existing) throw createError.conflict('Language already exists');

    const language = await this.languageRepo.save(
      this.languageRepo.create({
        code,
        name: dto.name,
        nativeName: dto.nativeName,
        direction: dto.direction as LanguageDirection,
        isDefault: false,
        status: LanguageStatus.INACTIVE,
        sortOrder: dto.sortOrder,
      }),
    );

    await this.recordAdminAuditEvent(adminId, 'LANGUAGE_CREATED', {
      languageId: language.id,
      code: language.code,
      status: language.status,
    });

    return {
      success: true,
      message: 'Language added successfully.',
      data: {
        id: language.id,
        code: language.code,
        status: language.status,
      },
    };
  }

  async updateLanguage(
    adminId: string,
    languageId: string,
    dto: LanguageUpdateDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const language = await this.requireLanguage(languageId);
    if(language.code==='ar' && dto.direction && dto.direction!=='rtl')throw createError.badRequest('Arabic requires right-to-left direction');
    await auditedUpdate(this.languageRepo, language.id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.nativeName !== undefined ? { nativeName: dto.nativeName } : {}),
      ...(dto.direction !== undefined
        ? { direction: dto.direction as LanguageDirection }
        : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    });

    const updated = await this.requireLanguage(language.id);
    await this.recordAdminAuditEvent(adminId, 'LANGUAGE_UPDATED', {
      languageId: language.id,
      code: language.code,
      updatedFields: Object.keys(dto),
    });

    return {
      success: true,
      message: 'Language updated successfully.',
      data: serializeLanguage(updated, true),
    };
  }

  async updateLanguageStatus(
    adminId: string,
    languageId: string,
    dto: LanguageStatusUpdateDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const updated = await AppDataSource.transaction(async manager=>{
      await lockConfiguration(manager);
      const language=await manager.findOneByOrFail(Language,{id:languageId});
      const nextStatus=dto.status as LanguageStatus;
      if(nextStatus===LanguageStatus.INACTIVE && (language.isDefault || language.code===await getSetting<string>('defaultLanguage',manager)))throw createError.conflict('Choose another default language before deactivation');
      const previous=language.status;language.status=nextStatus;
      await manager.save(language);
      await writeAudit(manager,{eventCode:nextStatus===LanguageStatus.ACTIVE?'LANGUAGE_ACTIVATED':'LANGUAGE_DEACTIVATED',module:'system_settings',actorType:'admin',actorId:adminId,entityType:'language',entityId:languageId,oldValue:{status:previous},newValue:{status:nextStatus}});
      return language;
    });

    return {
      success: true,
      message: 'Language status updated successfully.',
      data: serializeLanguage(updated, true),
    };
  }

  async setDefaultLanguage(
    adminId: string,
    languageId: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const language = await this.requireLanguage(languageId);

    await AppDataSource.transaction(async manager=>{
      await updateSetting(manager,adminId,'defaultLanguage',language.code);
    });

    const updated = await this.requireLanguage(language.id);
    await this.recordAdminAuditEvent(adminId, 'DEFAULT_LANGUAGE_CHANGED', {
      languageId: language.id,
      code: language.code,
    });

    return {
      success: true,
      message: 'Default language updated successfully.',
      data: serializeLanguage(updated, true),
    };
  }

  async updateUserLanguage(
    userId: string,
    languageCode: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const language = await this.ensureSelectableLanguage(languageCode);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');

    await this.userRepo.update(user.id, { selectedLanguage: language.code });

    return {
      success: true,
      message: 'Language preference updated successfully.',
      data: {
        selectedLanguage: language.code,
        language: {
          code: language.code,
          name: language.name,
          nativeName: language.nativeName,
          direction: language.direction,
        },
      },
    };
  }

  async ensureSelectableLanguage(languageCode: string): Promise<Language> {
    await this.ensureInitialLanguages();
    const code = normalizeLanguageCode(languageCode);
    const language = await this.languageRepo.findOne({
      where: { code, status: LanguageStatus.ACTIVE },
    });

    if (!language) {
      throw createError.badRequest('Language is not supported or active');
    }

    return language;
  }

  async resolveRequestLanguage(
    request: FastifyRequest,
    user?: User | null,
  ): Promise<string> {
    await this.ensureInitialLanguages();
    const activeCodes = new Set(await this.getActiveLanguageCodes());
    const queryLanguage = (request.query as { lang?: string } | undefined)?.lang;
    const headerCandidates = languageCodesFromHeader(request.headers['accept-language']);
    const defaultLanguage = await this.getDefaultLanguageCode();

    const candidates = [
      queryLanguage,
      user?.selectedLanguage,
      ...headerCandidates,
      defaultLanguage,
      config.i18n.fallbackLanguage,
      FALLBACK_LANGUAGE,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const code = normalizeLanguageCode(candidate);
      if (activeCodes.has(code)) return code;
      const primaryCode = code.split('-')[0];
      if (activeCodes.has(primaryCode)) return primaryCode;
    }

    return DEFAULT_LANGUAGE;
  }

  async trackEntityTranslations(
    input: EntityTranslationRequest,
    manager?: EntityManager,
  ): Promise<void> {
    if (!config.i18n.autoQueueEnabled) return;

    await this.ensureInitialLanguages(manager);
    const repo = manager
      ? manager.getRepository(TranslationMetadata)
      : this.translationRepo;
    const activeCodes = await this.getActiveLanguageCodes(manager);
    const sourceLanguage = normalizeLanguageCode(input.sourceLanguage);
    const targetCodes = Array.from(
      new Set([...activeCodes, sourceLanguage, FALLBACK_LANGUAGE]),
    );

    for (const [fieldName, translations] of Object.entries(input.fields)) {
      if (!translations) continue;
      for (const targetLanguage of targetCodes) {
        const value = translations[targetLanguage];
        const existing = await repo.findOne({
          where: {
            entityType: input.entityType,
            entityId: input.entityId,
            fieldName,
            targetLanguage,
          },
        });

        if (existing?.translationSource === TranslationSource.MANUAL && !value) {
          await repo.update(existing.id, { stale: true });
          continue;
        }

        const completed = Boolean(value);
        const translationSource = completed
          ? targetLanguage === sourceLanguage
            ? TranslationSource.ORIGINAL
            : TranslationSource.MANUAL
          : TranslationSource.MACHINE;
        const stale =
          input.markNonSourceStale && targetLanguage !== sourceLanguage
            ? true
            : false;
        const status =
          stale && translationSource !== TranslationSource.MANUAL
            ? TranslationStatus.PENDING
            : completed
              ? TranslationStatus.COMPLETED
              : TranslationStatus.PENDING;

        if (existing) {
          await repo.update(existing.id, {
            sourceLanguage,
            status,
            translationSource,
            stale,
            failureReason: null,
            lastTranslatedAt: completed ? new Date() : existing.lastTranslatedAt,
            metadata: {
              ...(existing.metadata ?? {}),
              provider: config.i18n.translationProvider,
            },
          });
        } else {
          await repo.save(
            repo.create({
              entityType: input.entityType,
              entityId: input.entityId,
              fieldName,
              sourceLanguage,
              targetLanguage,
              status,
              translationSource,
              stale,
              lastTranslatedAt: completed ? new Date() : null,
              failureReason: null,
              metadata: { provider: config.i18n.translationProvider },
            }),
          );
        }
      }
    }
  }

  async listTranslationStatus(
    query: TranslationStatusQueryDto,
  ): Promise<{
    success: true;
    data: {
      summary: Record<TranslationStatus, number>;
      failedItems: Record<string, unknown>[];
      items: Record<string, unknown>[];
    };
    pagination: Record<string, number>;
  }> {
    const summaryQb = this.translationRepo.createQueryBuilder('translation');
    applyTranslationStatusFilters(summaryQb, query, false);
    const summaryRows = await summaryQb
      .select('translation.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('translation.status')
      .getRawMany<{ status: TranslationStatus; count: string }>();

    const summary = {
      [TranslationStatus.COMPLETED]: 0,
      [TranslationStatus.PENDING]: 0,
      [TranslationStatus.FAILED]: 0,
    };
    for (const row of summaryRows) {
      summary[row.status] = Number(row.count);
    }

    const listQb = this.translationRepo.createQueryBuilder('translation');
    applyTranslationStatusFilters(listQb, query, true);
    const [items, total] = await listQb
      .orderBy('translation.updatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const failedQb = this.translationRepo.createQueryBuilder('translation');
    applyTranslationStatusFilters(
      failedQb,
      { ...query, status: TranslationStatus.FAILED },
      true,
    );
    const failedItems = await failedQb
      .orderBy('translation.updatedAt', 'DESC')
      .take(20)
      .getMany();

    return {
      success: true,
      data: {
        summary,
        failedItems: failedItems.map((item) => ({
          translationId: item.id,
          entityType: item.entityType,
          entityId: item.entityId,
          fieldName: item.fieldName,
          language: item.targetLanguage,
          status: item.status,
          failureReason: item.failureReason,
          stale: item.stale,
        })),
        items: items.map(serializeTranslationMetadata),
      },
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async retryTranslation(
    adminId: string,
    translationId: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const translation = await this.requireTranslation(translationId);
    await this.translationRepo.update(translation.id, {
      status: TranslationStatus.PENDING,
      stale: true,
      failureReason: null,
      metadata: {
        ...(translation.metadata ?? {}),
        retriedAt: new Date().toISOString(),
        retriedBy: adminId,
      },
    });

    await this.recordAdminAuditEvent(adminId, 'TRANSLATION_RETRIED', {
      translationId: translation.id,
      entityType: translation.entityType,
      entityId: translation.entityId,
      fieldName: translation.fieldName,
      targetLanguage: translation.targetLanguage,
    });

    return {
      success: true,
      message: 'Translation queued for retry.',
      data: serializeTranslationMetadata(await this.requireTranslation(translation.id)),
    };
  }

  async updateTranslationValue(
    adminId: string,
    translationId: string,
    value: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const translation = await this.requireTranslation(translationId);
    await this.updateEntityTranslationField(translation, value);

    await this.translationRepo.update(translation.id, {
      status: TranslationStatus.COMPLETED,
      translationSource: TranslationSource.MANUAL,
      stale: false,
      failureReason: null,
      lastTranslatedAt: new Date(),
      manuallyUpdatedBy: adminId,
      manuallyUpdatedAt: new Date(),
      metadata: {
        ...(translation.metadata ?? {}),
        manualOverride: true,
      },
    });

    await this.recordAdminAuditEvent(adminId, 'TRANSLATION_MANUALLY_UPDATED', {
      translationId: translation.id,
      entityType: translation.entityType,
      entityId: translation.entityId,
      fieldName: translation.fieldName,
      targetLanguage: translation.targetLanguage,
    });

    return {
      success: true,
      message: 'Translation updated successfully.',
      data: serializeTranslationMetadata(await this.requireTranslation(translation.id)),
    };
  }

  private async ensureInitialLanguages(manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Language) : this.languageRepo;
    const count = await repo.count();
    if (count > 0) return;

    await repo.save(
      INITIAL_LANGUAGE_DEFINITIONS.map((language) =>
        repo.create({
          ...language,
          code: normalizeLanguageCode(language.code),
        }),
      ),
    );
  }

  private async getActiveLanguageCodes(manager?: EntityManager): Promise<string[]> {
    const repo = manager ? manager.getRepository(Language) : this.languageRepo;
    const languages = await repo.find({
      where: { status: LanguageStatus.ACTIVE },
      select: ['code'],
      order: { sortOrder: 'ASC' },
    });
    const activeCodes = languages.map((language) => normalizeLanguageCode(language.code));
    if (activeCodes.length > 0) return Array.from(new Set(activeCodes));

    const configured = config.i18n.supportedLanguages
      .map((language) => normalizeLanguageCode(language))
      .filter(isValidLanguageCode);
    return configured.length > 0
      ? Array.from(new Set(configured))
      : INITIAL_LANGUAGE_DEFINITIONS.map((language) => language.code);
  }

  private async getDefaultLanguageCode(): Promise<string> {
    const language = await this.languageRepo.findOne({
      where: { isDefault: true, status: LanguageStatus.ACTIVE },
      select: ['code'],
    });

    return normalizeLanguageCode(
      language?.code || config.i18n.defaultLanguage || DEFAULT_LANGUAGE,
    );
  }

  private async requireLanguage(languageId: string): Promise<Language> {
    const language = await this.languageRepo.findOne({ where: { id: languageId } });
    if (!language) throw createError.notFound('Language not found');
    return language;
  }

  private async requireTranslation(translationId: string): Promise<TranslationMetadata> {
    const translation = await this.translationRepo.findOne({
      where: { id: translationId },
    });
    if (!translation) throw createError.notFound('Translation record not found');
    return translation;
  }

  private async updateEntityTranslationField(
    translation: TranslationMetadata,
    value: string,
  ): Promise<void> {
    const target = ENTITY_TRANSLATION_TARGETS[translation.entityType];
    if (!target || !target.fields.includes(translation.fieldName)) {
      throw createError.badRequest('Translation field cannot be manually overridden');
    }

    const repo = AppDataSource.getRepository<ObjectLiteral>(target.entity);
    const entity = await repo.findOne({
      where: { id: translation.entityId },
    });
    if (!entity) throw createError.notFound('Translated entity not found');

    const current = ((entity as Record<string, unknown>)[translation.fieldName] ??
      {}) as TranslationMap;
    const next = {
      ...current,
      [translation.targetLanguage]: value,
    };

    await repo.update(translation.entityId, {
      [translation.fieldName]: next,
    });
  }

  private async recordAdminAuditEvent(
    adminId: string,
    eventType: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.adminAuditRepo.save(
      this.adminAuditRepo.create({
        eventType,
        actorAdminId: adminId,
        targetAdminId: null,
        targetUserId: null,
        targetRoleId: null,
        metadata,
      }),
    );
  }
}

function serializeLanguage(
  language: Language,
  includeStatus: boolean,
): Record<string, unknown> {
  return {
    id: includeStatus ? language.id : undefined,
    code: language.code,
    name: language.name,
    nativeName: language.nativeName,
    direction: language.direction,
    isDefault: language.isDefault,
    status: includeStatus ? language.status : undefined,
    sortOrder: includeStatus ? language.sortOrder : undefined,
    createdAt: includeStatus ? language.createdAt : undefined,
    updatedAt: includeStatus ? language.updatedAt : undefined,
  };
}

function serializeTranslationMetadata(
  translation: TranslationMetadata,
): Record<string, unknown> {
  return {
    translationId: translation.id,
    entityType: translation.entityType,
    entityId: translation.entityId,
    fieldName: translation.fieldName,
    sourceLanguage: translation.sourceLanguage,
    targetLanguage: translation.targetLanguage,
    status: translation.status,
    translationSource: translation.translationSource,
    stale: translation.stale,
    lastTranslatedAt: translation.lastTranslatedAt,
    failureReason: translation.failureReason,
    manuallyUpdatedBy: translation.manuallyUpdatedBy,
    manuallyUpdatedAt: translation.manuallyUpdatedAt,
    metadata: translation.metadata,
    createdAt: translation.createdAt,
    updatedAt: translation.updatedAt,
  };
}

function languageCodesFromHeader(header?: string | string[]): string[] {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return [];

  return raw
    .split(',')
    .map((part) => normalizeLanguageCode(part.split(';')[0]?.trim()))
    .filter(Boolean);
}

function applyTranslationStatusFilters(
  qb: SelectQueryBuilder<TranslationMetadata>,
  query: Partial<TranslationStatusQueryDto>,
  includeStatus: boolean,
): void {
  if (query.entityType) {
    qb.andWhere('translation.entityType = :entityType', { entityType: query.entityType });
  }
  if (query.language) {
    qb.andWhere('translation.targetLanguage = :language', {
      language: normalizeLanguageCode(query.language),
    });
  }
  if (includeStatus && query.status) {
    qb.andWhere('translation.status = :status', { status: query.status });
  }
}
