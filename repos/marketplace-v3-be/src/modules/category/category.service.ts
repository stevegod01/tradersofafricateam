import { auditedUpdate } from '../audit-log/audit-log.mutations';
import { In, Not } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import {
  Category,
  CategoryStatus,
} from '../../database/entities/category.entity';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { ProductStatus } from '../../database/entities/product.entity';
import {
  CategoryCreateDto,
  CategoryUpdateDto,
} from '../../common/utils/validation.schemas';
import {
  mergeTranslationInput,
  normalizeLanguageCode,
  resolveTranslation,
  slugify,
  toTranslationMap,
} from '../../common/utils/i18n.util';
import { createError } from '../../common/utils/http-error.util';
import { I18nService } from '../i18n/i18n.service';
import { TranslatableEntityType } from '../../database/entities/translation-metadata.entity';

type CategoryQuery = {
  page: number;
  limit: number;
  parentId?: string;
  search?: string;
  status?: CategoryStatus;
};

type PublicCategoryItem = {
  id: string;
  name: string | null;
  slug: string;
  icon: string | null;
  image: string | null;
  parentId: string | null;
  childrenCount: number;
};

const STATUS_TRANSITIONS: Record<CategoryStatus, CategoryStatus[]> = {
  [CategoryStatus.ACTIVE]: [
    CategoryStatus.INACTIVE,
    CategoryStatus.ARCHIVED,
    CategoryStatus.DELETED,
  ],
  [CategoryStatus.INACTIVE]: [
    CategoryStatus.ACTIVE,
    CategoryStatus.ARCHIVED,
    CategoryStatus.DELETED,
  ],
  [CategoryStatus.ARCHIVED]: [CategoryStatus.ACTIVE, CategoryStatus.DELETED],
  [CategoryStatus.DELETED]: [],
};

export class CategoryService {
  private categoryRepo = AppDataSource.getRepository(Category);
  private productCategoryRepo = AppDataSource.getRepository(ProductCategory);
  private i18nService = new I18nService();

  async createCategory(
    adminId: string,
    dto: CategoryCreateDto,
  ): Promise<{ success: true; message: string; data: Category }> {
    const sourceLanguage = normalizeLanguageCode(dto.sourceLanguage);
    await this.i18nService.ensureSelectableLanguage(sourceLanguage);
    const name = toTranslationMap(dto.name, sourceLanguage);
    const slug = slugify(resolveTranslation(name, 'en', sourceLanguage) ?? '');
    if (!slug) throw createError.badRequest('Category name cannot generate a valid slug');

    await this.ensureSlugAvailable(slug);
    await this.validateParent(dto.parentId ?? null);

    let saved: Category | null = null;
    await AppDataSource.transaction(async (manager) => {
      const category = manager.create(Category, {
        name,
        slug,
        description: dto.description ? toTranslationMap(dto.description, sourceLanguage) : null,
        sourceLanguage,
        parentId: dto.parentId ?? null,
        icon: dto.icon ?? null,
        image: dto.image ?? null,
        sortOrder: dto.sortOrder,
        status: CategoryStatus.ACTIVE,
        createdBy: adminId,
        updatedBy: null,
      });

      saved = await manager.save(Category, category);
      await this.i18nService.trackEntityTranslations(
        {
          entityType: TranslatableEntityType.CATEGORY,
          entityId: saved.id,
          sourceLanguage,
          fields: {
            name,
            description: category.description,
          },
        },
        manager,
      );
    });

    return {
      success: true,
      message: 'Category created successfully.',
      data: saved!,
    };
  }

  async getPublicCategories(
    query: Omit<CategoryQuery, 'status'>,
    language: string,
  ): Promise<{
    success: true;
    data: PublicCategoryItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    language: string;
  }> {
    const qb = this.categoryRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: CategoryStatus.ACTIVE })
      .orderBy('c.sortOrder', 'ASC')
      .addOrderBy('c.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.parentId) {
      qb.andWhere('c.parentId = :parentId', { parentId: query.parentId });
    } else {
      qb.andWhere('c.parentId IS NULL');
    }

    if (query.search) {
      qb.andWhere(
        "LOWER(JSON_UNQUOTE(JSON_EXTRACT(c.name, '$.en'))) LIKE :search",
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    const [categories, total] = await qb.getManyAndCount();
    const data = await Promise.all(
      categories.map((category) => this.toPublicItem(category, language)),
    );

    return {
      success: true,
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      language,
    };
  }

  async getCategoryTree(language: string): Promise<{
    success: true;
    data: Array<PublicCategoryItem & { children: PublicCategoryItem[] }>;
  }> {
    const categories = await this.categoryRepo.find({
      where: { status: CategoryStatus.ACTIVE },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });

    const byParent = new Map<string | null, Category[]>();
    for (const category of categories) {
      const siblings = byParent.get(category.parentId) || [];
      siblings.push(category);
      byParent.set(category.parentId, siblings);
    }

    const build = async (
      parentId: string | null,
    ): Promise<Array<PublicCategoryItem & { children: PublicCategoryItem[] }>> => {
      const children = byParent.get(parentId) || [];
      return Promise.all(
        children.map(async (category) => ({
          ...(await this.toPublicItem(category, language)),
          children: await build(category.id),
        })),
      );
    };

    return { success: true, data: await build(null) };
  }

  async getPublicCategoryById(
    categoryId: string,
    language: string,
  ): Promise<{ success: true; data: PublicCategoryItem & { description: string | null; status: CategoryStatus }; language: string }> {
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId, status: CategoryStatus.ACTIVE },
    });
    if (!category) throw createError.notFound('Category not found');

    return {
      success: true,
      data: {
        ...(await this.toPublicItem(category, language)),
        description: resolveTranslation(category.description, language, category.sourceLanguage),
        status: category.status,
      },
      language,
    };
  }

  async getAdminCategories(query: CategoryQuery): Promise<{
    success: true;
    data: Array<
      Category & {
        productsCount: number;
        childrenCount: number;
        createdByUser?: { id: string; name: string };
      }
    >;
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const qb = this.categoryRepo
      .createQueryBuilder('c')
      .leftJoin('c.creator', 'creator')
      .addSelect(['creator.id', 'creator.firstName', 'creator.lastName'])
      .orderBy('c.sortOrder', 'ASC')
      .addOrderBy('c.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.status) qb.andWhere('c.status = :status', { status: query.status });
    if (query.parentId) qb.andWhere('c.parentId = :parentId', { parentId: query.parentId });
    if (query.search) {
      qb.andWhere(
        "LOWER(JSON_UNQUOTE(JSON_EXTRACT(c.name, '$.en'))) LIKE :search",
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    const [categories, total] = await qb.getManyAndCount();
    const data = await Promise.all(
      categories.map(async (category) => {
        const [childrenCount, productsCount] = await Promise.all([
          this.categoryRepo.count({ where: { parentId: category.id } }),
          this.productCategoryRepo
            .createQueryBuilder('pc')
            .innerJoin('pc.product', 'p')
            .where('pc.categoryId = :categoryId', { categoryId: category.id })
            .andWhere('p.status != :deleted', { deleted: ProductStatus.DELETED })
            .getCount(),
        ]);

        return Object.assign(category, {
          childrenCount,
          productsCount,
        });
      }),
    );

    return {
      success: true,
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async updateCategory(
    categoryId: string,
    adminId: string,
    dto: CategoryUpdateDto,
  ): Promise<{ success: true; message: string; data: Category }> {
    const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) throw createError.notFound('Category not found');
    if (category.status === CategoryStatus.DELETED) {
      throw createError.conflict('Deleted categories cannot be modified');
    }

    const update: Partial<Category> = { updatedBy: adminId };

    const sourceLanguage = normalizeLanguageCode(
      dto.sourceLanguage ?? category.sourceLanguage,
    );
    await this.i18nService.ensureSelectableLanguage(sourceLanguage);

    if (dto.name) {
      const name = mergeTranslationInput(category.name, dto.name, sourceLanguage);
      const slug = slugify(resolveTranslation(name, 'en', sourceLanguage) ?? '');
      await this.ensureSlugAvailable(slug, category.id);
      update.name = name;
      update.slug = slug;
    }

    if (dto.description !== undefined) {
      update.description = dto.description
        ? mergeTranslationInput(category.description, dto.description, sourceLanguage)
        : null;
    }

    if (dto.sourceLanguage !== undefined) update.sourceLanguage = sourceLanguage;

    if (dto.parentId !== undefined) {
      const parentId = dto.parentId ?? null;
      await this.validateParent(parentId, category.id);
      update.parentId = parentId;
    }

    if (dto.icon !== undefined) update.icon = dto.icon ?? null;
    if (dto.image !== undefined) update.image = dto.image ?? null;
    if (dto.sortOrder !== undefined) update.sortOrder = dto.sortOrder;

    await auditedUpdate(this.categoryRepo, category.id, update);
    if (
      dto.name !== undefined ||
      dto.description !== undefined ||
      dto.sourceLanguage !== undefined
    ) {
      const next = await this.categoryRepo.findOneOrFail({ where: { id: category.id } });
      await this.i18nService.trackEntityTranslations({
        entityType: TranslatableEntityType.CATEGORY,
        entityId: next.id,
        sourceLanguage: next.sourceLanguage,
        markNonSourceStale: true,
        fields: {
          name: next.name,
          description: next.description,
        },
      });
    }
    const saved = await this.categoryRepo.findOneOrFail({ where: { id: category.id } });

    return {
      success: true,
      message: 'Category updated successfully.',
      data: saved,
    };
  }

  async updateCategoryStatus(
    categoryId: string,
    adminId: string,
    status: CategoryStatus,
  ): Promise<{ success: true; message: string; data: { id: string; status: CategoryStatus } }> {
    const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) throw createError.notFound('Category not found');

    if (category.status === status) {
      return {
        success: true,
        message: 'Category status updated successfully.',
        data: { id: category.id, status },
      };
    }

    if (!STATUS_TRANSITIONS[category.status].includes(status)) {
      throw createError.badRequest(
        `Category cannot transition from ${category.status} to ${status}`,
      );
    }

    await auditedUpdate(this.categoryRepo, category.id, {
      status,
      updatedBy: adminId,
      deletedAt: status === CategoryStatus.DELETED ? new Date() : category.deletedAt,
    });

    return {
      success: true,
      message: 'Category status updated successfully.',
      data: { id: category.id, status },
    };
  }

  async validateActiveCategoryIds(categoryIds: string[]): Promise<Category[]> {
    const uniqueIds = Array.from(new Set(categoryIds));
    if (uniqueIds.length !== categoryIds.length) {
      throw createError.badRequest('Duplicate category IDs are not allowed');
    }

    const categories = await this.categoryRepo.find({
      where: { id: In(uniqueIds), status: CategoryStatus.ACTIVE },
    });

    if (categories.length !== uniqueIds.length) {
      throw createError.badRequest('Every selected category must exist and be active');
    }

    return categories;
  }

  private async ensureSlugAvailable(slug: string, exceptId?: string): Promise<void> {
    const where = exceptId ? { slug, id: Not(exceptId) } : { slug };
    const duplicate = await this.categoryRepo.findOne({ where });
    if (duplicate) {
      throw createError.conflict('A category with this name already exists');
    }
  }

  private async validateParent(
    parentId: string | null,
    categoryId?: string,
  ): Promise<void> {
    if (!parentId) return;
    if (parentId === categoryId) {
      throw createError.badRequest('A category cannot be its own parent');
    }

    const parent = await this.categoryRepo.findOne({ where: { id: parentId } });
    if (!parent || parent.status === CategoryStatus.DELETED) {
      throw createError.badRequest('Selected parent category does not exist');
    }

    let cursor: Category | null = parent;
    while (cursor?.parentId) {
      if (cursor.parentId === categoryId) {
        throw createError.badRequest('Circular category relationships are not allowed');
      }
      cursor = await this.categoryRepo.findOne({ where: { id: cursor.parentId } });
    }
  }

  private async toPublicItem(
    category: Category,
    language: string,
  ): Promise<PublicCategoryItem> {
    const childrenCount = await this.categoryRepo.count({
      where: { parentId: category.id, status: CategoryStatus.ACTIVE },
    });

    return {
      id: category.id,
      name: resolveTranslation(category.name, language, category.sourceLanguage),
      slug: category.slug,
      icon: category.icon,
      image: category.image,
      parentId: category.parentId,
      childrenCount,
    };
  }
}
