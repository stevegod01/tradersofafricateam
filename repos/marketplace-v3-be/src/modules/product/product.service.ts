import { applyProductVisibility } from './product.visibility';
import { applyProductFilters } from './product.filters';
import { savedProductIds } from '../saved-product/saved-product.reader';
import { requireActiveCurrency } from '../system-settings/settings.reader';
import { auditedUpdate } from '../audit-log/audit-log.mutations';
import crypto from 'crypto';
import { In, SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { Category, CategoryStatus } from '../../database/entities/category.entity';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { ProductImage } from '../../database/entities/product-image.entity';
import {
  InventoryStatus,
  Product,
  ProductStatus,
  ProductType,
} from '../../database/entities/product.entity';
import { ProductVariantOption } from '../../database/entities/product-variant-option.entity';
import { ProductVariant, VariantAttributes } from '../../database/entities/product-variant.entity';
import { User, UserStatus, UserType } from '../../database/entities/user.entity';
import {
  ProductCreateDto,
  ProductUpdateDto,
} from '../../common/utils/validation.schemas';
import { createError } from '../../common/utils/http-error.util';
import {
  mergeTranslationInput,
  normalizeLanguageCode,
  resolveTranslation,
  toTranslationMap,
} from '../../common/utils/i18n.util';
import {
  calculateFinalPrice,
  roundMoney,
  toNumber,
} from '../../common/utils/pricing.util';
import { CategoryService } from '../category/category.service';
import { I18nService } from '../i18n/i18n.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { TranslatableEntityType } from '../../database/entities/translation-metadata.entity';
import {
  activeEntitlementValueExpression,
  activeFeaturedProductExistsExpression,
  EffectiveSearchSettings,
  freshnessExpression,
  priorityScoreExpression,
  productRelevanceExpression,
  SearchService,
} from '../search/search.service';
import { SearchIndexEntityType } from '../../database/entities/search-index-job.entity';

export type ProductQuery = {
  page: number;
  limit: number;
  status?: ProductStatus;
  categoryId?: string;
  categoryIds?: string[];
  sellerId?: string;
  countryOfOrigin?: string;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  minRating?: number;
  inventoryStatus?: InventoryStatus;
  hasDiscount?: boolean;
  sortBy?:
    | 'relevance'
    | 'ranking'
    | 'newest'
    | 'price_low_to_high'
    | 'price_high_to_low'
    | 'highest_rating'
    | 'most_reviewed';
  search?: string;
};

type VariantOptionInput = {
  name: string;
  values: string[];
  sortOrder?: number;
};

type VariantInput = {
  attributes: VariantAttributes;
  price: number;
  discount?: number | null;
  quantity: number;
  weight?: number | null;
  weightUnit?: string | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  dimensionUnit?: string | null;
  image?: string | null;
};

type ProductImageInput = {
  url: string;
  sortOrder?: number;
  isPrimary?: boolean;
};

type NormalizedProductInput = {
  productName: Record<string, string>;
  productDescription: Record<string, string>;
  sourceLanguage: string;
  categoryIds: string[];
  countryOfOrigin: string;
  currency: string;
  productType: ProductType;
  price: number | null;
  discount: number | null;
  quantity: number | null;
  weight: number | null;
  weightUnit: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dimensionUnit: string | null;
  barcode: string | null;
  supplyCapacity: number;
  unitForSupplyCapacity: string;
  minOrdersAllowed: number;
  unitForMinOrder: string;
  minDuration: number;
  maxDuration: number;
  durationUnit: string;
  images: ProductImageInput[];
  variantOptions: VariantOptionInput[];
  variants: VariantInput[];
};

const PRODUCT_STATUS_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  [ProductStatus.DRAFT]: [
    ProductStatus.ACTIVE,
    ProductStatus.ARCHIVED,
    ProductStatus.DELETED,
  ],
  [ProductStatus.ACTIVE]: [
    ProductStatus.INACTIVE,
    ProductStatus.ARCHIVED,
    ProductStatus.DELETED,
  ],
  [ProductStatus.INACTIVE]: [
    ProductStatus.ACTIVE,
    ProductStatus.ARCHIVED,
    ProductStatus.DELETED,
  ],
  [ProductStatus.ARCHIVED]: [ProductStatus.ACTIVE, ProductStatus.DELETED],
  [ProductStatus.DELETED]: [],
};

export class ProductService {
  private productRepo = AppDataSource.getRepository(Product);
  private userRepo = AppDataSource.getRepository(User);
  private productCategoryRepo = AppDataSource.getRepository(ProductCategory);
  private imageRepo = AppDataSource.getRepository(ProductImage);
  private variantOptionRepo = AppDataSource.getRepository(ProductVariantOption);
  private variantRepo = AppDataSource.getRepository(ProductVariant);
  private categoryService = new CategoryService();
  private i18nService = new I18nService();
  private subscriptionService = new SubscriptionService();
  private searchService = new SearchService();

  async createProduct(
    sellerId: string,
    dto: ProductCreateDto,
  ): Promise<{ success: true; message: string; data: unknown }> {
    await this.ensureVerifiedSeller(sellerId);
    await this.subscriptionService.assertProductCreationAllowed(sellerId);
    await this.categoryService.validateActiveCategoryIds(dto.categoryIds);

    const input = this.normalizeCreateInput(dto);
    await requireActiveCurrency(input.currency);
    await this.i18nService.ensureSelectableLanguage(input.sourceLanguage);
    await this.subscriptionService.assertProductConfigurationAllowed(
      sellerId,
      input.images.length,
      input.variants.length,
    );
    this.validateProductInput(input);
    const stock = this.calculateStock(input);

    let productId = '';

    await AppDataSource.transaction(async (manager) => {
      const product = manager.create(Product, {
        sellerId,
        productName: input.productName,
        productDescription: input.productDescription,
        sourceLanguage: input.sourceLanguage,
        countryOfOrigin: input.countryOfOrigin,
        currency: input.currency,
        price: input.productType === ProductType.SIMPLE ? input.price : null,
        discount: input.productType === ProductType.SIMPLE ? input.discount : null,
        quantity: input.productType === ProductType.SIMPLE ? input.quantity : null,
        weight: input.weight,
        weightUnit: input.weightUnit,
        length: input.length,
        width: input.width,
        height: input.height,
        dimensionUnit: input.dimensionUnit,
        productType: input.productType,
        barcode: input.barcode,
        supplyCapacity: input.supplyCapacity,
        unitForSupplyCapacity: input.unitForSupplyCapacity,
        minOrdersAllowed: input.minOrdersAllowed,
        unitForMinOrder: input.unitForMinOrder,
        minDuration: input.minDuration,
        maxDuration: input.maxDuration,
        durationUnit: input.durationUnit,
        status: ProductStatus.DRAFT,
        totalStock: stock.totalStock,
        inventoryStatus: stock.inventoryStatus,
        deletedAt: null,
      });

      const saved = await manager.save(Product, product);
      productId = saved.id;

      await manager.save(
        ProductCategory,
        input.categoryIds.map((categoryId) =>
          manager.create(ProductCategory, { productId: saved.id, categoryId }),
        ),
      );

      await this.replaceImages(manager, saved.id, input.images);
      await this.replaceVariantData(manager, saved, input);
      await this.i18nService.trackEntityTranslations(
        {
          entityType: TranslatableEntityType.PRODUCT,
          entityId: saved.id,
          sourceLanguage: input.sourceLanguage,
          fields: {
            productName: input.productName,
            productDescription: input.productDescription,
          },
        },
        manager,
      );
    });
    void this.searchService
      .queueIndexUpdate(SearchIndexEntityType.PRODUCT, productId)
      .catch(() => undefined);

    return {
      success: true,
      message: 'Product created successfully.',
      data: await this.getSellerProductById(sellerId, productId, 'en'),
    };
  }

  async getPublicProducts(
    query: ProductQuery,
    language: string,
    userId: string | null = null,
  ): Promise<{
    success: true;
    data: unknown[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    language: string;
  }> {
    const settings = await this.searchService.getEffectiveSettings();
    const search = query.search?.toLowerCase();
    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.seller', 'seller')
      .leftJoinAndSelect('p.images', 'images')
      .leftJoinAndSelect('p.productCategories', 'pc')
      .leftJoinAndSelect(
        'pc.category',
        'category',
        'category.status = :activeCategoryStatus AND category.deletedAt IS NULL',
        { activeCategoryStatus: CategoryStatus.ACTIVE },
      )
      .distinct(true);
    applyProductVisibility(qb);

    if (!settings.outOfStockProductsVisible && !query.inventoryStatus) {
      qb.andWhere('p.inventoryStatus = :visibleInventoryStatus', {
        visibleInventoryStatus: InventoryStatus.IN_STOCK,
      });
    }

    applyProductFilters(qb, query);

    applyProductSearchRanking(qb, query.sortBy, Boolean(search), settings, search);
    qb.addOrderBy('images.sortOrder', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [products, total] = await qb.getManyAndCount();
    const featuredProductIds = await this.searchService.activeFeaturedProductIds(
      products.map((product) => product.id),
    );
    void this.searchService
      .recordSearchPerformed(userId, query.search, sanitizeProductSearchFilters(query), total)
      .catch(() => undefined);

    const savedIds = await savedProductIds(userId, products.map(product => product.id));
    return {
      success: true,
      data: products.map((product) =>
        ({
          ...this.serializeProduct(product, language, false, true, featuredProductIds),
          ...(userId ? { isSaved: savedIds.has(product.id) } : {}),
        }),
      ),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      language,
    };
  }

  async getPublicProductById(
    productId: string,
    language: string,
    userId: string | null = null,
  ): Promise<{ success: true; data: unknown; language: string }> {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.seller', 'seller')
      .leftJoinAndSelect('p.images', 'images')
      .leftJoinAndSelect('p.productCategories', 'pc')
      .leftJoinAndSelect(
        'pc.category',
        'category',
        'category.status = :activeCategoryStatus AND category.deletedAt IS NULL',
        { activeCategoryStatus: CategoryStatus.ACTIVE },
      )
      .leftJoinAndSelect('p.variantOptions', 'variantOptions')
      .leftJoinAndSelect('p.variants', 'variants')
      .where('p.id = :productId', { productId })
      .orderBy('images.sortOrder', 'ASC')
      .addOrderBy('variantOptions.sortOrder', 'ASC');
    applyProductVisibility(qb);
    const product = await qb.getOne();

    if (!product) throw createError.notFound('Product not found');
    const featuredProductIds = await this.searchService.activeFeaturedProductIds([
      product.id,
    ]);
    return {
      success: true,
      data: {
        ...this.serializeProduct(product, language, false, false, featuredProductIds),
        ...(userId ? { isSaved: (await savedProductIds(userId, [product.id])).has(product.id) } : {}),
      },
      language,
    };
  }

  async getMyProducts(
    sellerId: string,
    query: ProductQuery,
    language: string,
  ): Promise<{
    success: true;
    data: unknown[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.images', 'images')
      .leftJoinAndSelect('p.productCategories', 'pc')
      .leftJoinAndSelect('pc.category', 'category')
      .where('p.sellerId = :sellerId', { sellerId })
      .orderBy('p.createdAt', 'DESC')
      .addOrderBy('images.sortOrder', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .distinct(true);

    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    } else {
      qb.andWhere('p.status != :deleted', { deleted: ProductStatus.DELETED });
    }

    if (query.categoryId) {
      qb.innerJoin(
        'p.productCategories',
        'filterPc',
        'filterPc.categoryId = :categoryId',
        { categoryId: query.categoryId },
      );
    }

    if (query.search) {
      qb.andWhere(
        "LOWER(JSON_UNQUOTE(JSON_EXTRACT(p.productName, '$.en'))) LIKE :search",
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    const [products, total] = await qb.getManyAndCount();
    return {
      success: true,
      data: products.map((product) => this.serializeProduct(product, language, true, true)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getSellerProductById(
    sellerId: string,
    productId: string,
    language: string,
  ): Promise<{ success: true; data: unknown }> {
    const product = await this.findOwnedProduct(sellerId, productId);
    return { success: true, data: this.serializeProduct(product, language, true, false) };
  }

  async updateProduct(
    sellerId: string,
    productId: string,
    dto: ProductUpdateDto,
  ): Promise<{ success: true; message: string; data: unknown }> {
    const product = await this.findOwnedProduct(sellerId, productId);
    if (product.status === ProductStatus.DELETED) {
      throw createError.conflict('Deleted products cannot be modified');
    }

    const merged = this.normalizeUpdateInput(product, dto);
    if(dto.currency!==undefined && dto.currency!==product.currency)await requireActiveCurrency(merged.currency);
    await this.i18nService.ensureSelectableLanguage(merged.sourceLanguage);
    if (dto.categoryIds) {
      await this.categoryService.validateActiveCategoryIds(dto.categoryIds);
    }
    await this.subscriptionService.assertProductConfigurationAllowed(
      sellerId,
      merged.images.length,
      merged.variants.length,
    );
    this.validateProductInput(merged);
    const stock = this.calculateStock(merged);

    await AppDataSource.transaction(async (manager) => {
      await auditedUpdate(manager.getRepository(Product), product.id, {
        productName: merged.productName,
        productDescription: merged.productDescription,
        sourceLanguage: merged.sourceLanguage,
        countryOfOrigin: merged.countryOfOrigin,
        currency: merged.currency,
        price: merged.productType === ProductType.SIMPLE ? merged.price : null,
        discount: merged.productType === ProductType.SIMPLE ? merged.discount : null,
        quantity: merged.productType === ProductType.SIMPLE ? merged.quantity : null,
        weight: merged.weight,
        weightUnit: merged.weightUnit,
        length: merged.length,
        width: merged.width,
        height: merged.height,
        dimensionUnit: merged.dimensionUnit,
        productType: merged.productType,
        barcode: merged.barcode,
        supplyCapacity: merged.supplyCapacity,
        unitForSupplyCapacity: merged.unitForSupplyCapacity,
        minOrdersAllowed: merged.minOrdersAllowed,
        unitForMinOrder: merged.unitForMinOrder,
        minDuration: merged.minDuration,
        maxDuration: merged.maxDuration,
        durationUnit: merged.durationUnit,
        totalStock: stock.totalStock,
        inventoryStatus: stock.inventoryStatus,
      });

      if (dto.categoryIds) {
        await manager.delete(ProductCategory, { productId: product.id });
        await manager.save(
          ProductCategory,
          merged.categoryIds.map((categoryId) =>
            manager.create(ProductCategory, { productId: product.id, categoryId }),
          ),
        );
      }

      if (dto.images) {
        await this.replaceImages(manager, product.id, merged.images);
      }

      if (
        dto.productType !== undefined ||
        dto.variantOptions !== undefined ||
        dto.variants !== undefined
      ) {
        await this.replaceVariantData(manager, product, merged);
      }

      if (
        dto.productName !== undefined ||
        dto.productDescription !== undefined ||
        dto.sourceLanguage !== undefined
      ) {
        await this.i18nService.trackEntityTranslations(
          {
            entityType: TranslatableEntityType.PRODUCT,
            entityId: product.id,
            sourceLanguage: merged.sourceLanguage,
            markNonSourceStale: true,
            fields: {
              productName: merged.productName,
              productDescription: merged.productDescription,
            },
          },
          manager,
        );
      }
    });
    void this.searchService
      .queueIndexUpdate(SearchIndexEntityType.PRODUCT, product.id)
      .catch(() => undefined);

    return {
      success: true,
      message: 'Product updated successfully.',
      data: await this.getSellerProductById(sellerId, productId, 'en'),
    };
  }

  async updateProductStatus(
    sellerId: string,
    productId: string,
    status: ProductStatus,
  ): Promise<{ success: true; message: string; data: { id: string; status: ProductStatus } }> {
    const product = await this.findOwnedProduct(sellerId, productId);

    if (product.status === status) {
      return {
        success: true,
        message: 'Product status updated successfully.',
        data: { id: product.id, status },
      };
    }

    if (!PRODUCT_STATUS_TRANSITIONS[product.status].includes(status)) {
      throw createError.badRequest(
        `Product cannot transition from ${product.status} to ${status}`,
      );
    }

    if (status === ProductStatus.ACTIVE) {
      const categories = product.productCategories?.map((pc) => pc.category) || [];
      if (!categories.length || categories.some((category) => category.status !== 'active')) {
        throw createError.badRequest('Product must have at least one active category before publishing');
      }
    }

    await auditedUpdate(this.productRepo, product.id, {
      status,
      deletedAt: status === ProductStatus.DELETED ? new Date() : product.deletedAt,
    });
    void this.searchService
      .queueIndexUpdate(SearchIndexEntityType.PRODUCT, product.id)
      .catch(() => undefined);

    return {
      success: true,
      message: 'Product status updated successfully.',
      data: { id: product.id, status },
    };
  }

  async updateInventory(
    sellerId: string,
    productId: string,
    payload: { quantity?: number; variants?: Array<{ variantId: string; quantity: number }> },
  ): Promise<{ success: true; message: string; data: { totalStock: number; inventoryStatus: InventoryStatus } }> {
    const product = await this.findOwnedProduct(sellerId, productId);
    if (product.status === ProductStatus.DELETED) {
      throw createError.conflict('Deleted products cannot be modified');
    }

    let totalStock = 0;

    if (product.productType === ProductType.SIMPLE) {
      if (payload.quantity === undefined) {
        throw createError.badRequest('quantity is required for simple products');
      }
      totalStock = payload.quantity;
      await auditedUpdate(this.productRepo, product.id, {
        quantity: payload.quantity,
        totalStock,
        inventoryStatus: this.inventoryStatus(totalStock),
      });
    } else {
      if (!payload.variants?.length) {
        throw createError.badRequest('variants are required for variable products');
      }

      const variantIds = product.variants.map((variant) => variant.id);
      for (const variantUpdate of payload.variants) {
        if (!variantIds.includes(variantUpdate.variantId)) {
          throw createError.badRequest('Every variant must belong to the product');
        }
      }

      await AppDataSource.transaction(async (manager) => {
        for (const variantUpdate of payload.variants || []) {
          await manager.update(ProductVariant, variantUpdate.variantId, {
            quantity: variantUpdate.quantity,
          });
        }

        const variants = await manager.find(ProductVariant, {
          where: { productId: product.id },
        });
        totalStock = variants.reduce(
          (sum, variant) => sum + toNumber(variant.quantity),
          0,
        );
        await auditedUpdate(manager.getRepository(Product), product.id, {
          totalStock,
          inventoryStatus: this.inventoryStatus(totalStock),
        });
      });
    }
    void this.searchService
      .queueIndexUpdate(SearchIndexEntityType.PRODUCT, product.id)
      .catch(() => undefined);

    return {
      success: true,
      message: 'Inventory updated successfully.',
      data: { totalStock, inventoryStatus: this.inventoryStatus(totalStock) },
    };
  }

  async deleteProductImage(
    sellerId: string,
    productId: string,
    imageId: string,
  ): Promise<{ success: true; message: string }> {
    const product = await this.findOwnedProduct(sellerId, productId);
    const image = product.images.find((item) => item.id === imageId);
    if (!image) throw createError.notFound('Product image not found');

    await AppDataSource.transaction(async (manager) => {
      await manager.delete(ProductImage, image.id);
      if (image.isPrimary) {
        const replacement = await manager.findOne(ProductImage, {
          where: { productId: product.id },
          order: { sortOrder: 'ASC', createdAt: 'ASC' },
        });
        if (replacement) {
          await manager.update(ProductImage, replacement.id, { isPrimary: true });
        }
      }
    });
    void this.searchService
      .queueIndexUpdate(SearchIndexEntityType.PRODUCT, product.id)
      .catch(() => undefined);

    return { success: true, message: 'Product image deleted successfully.' };
  }

  async softDeleteProduct(
    sellerId: string,
    productId: string,
  ): Promise<{ success: true; message: string; data: { id: string; status: ProductStatus } }> {
    return this.updateProductStatus(sellerId, productId, ProductStatus.DELETED);
  }

  private normalizeCreateInput(dto: ProductCreateDto): NormalizedProductInput {
    const sourceLanguage = normalizeLanguageCode(dto.sourceLanguage);
    return {
      productName: toTranslationMap(dto.productName, sourceLanguage),
      productDescription: toTranslationMap(dto.productDescription, sourceLanguage),
      sourceLanguage,
      categoryIds: dto.categoryIds,
      countryOfOrigin: dto.countryOfOrigin,
      currency: dto.currency,
      productType: dto.productType as ProductType,
      price: dto.price ?? null,
      discount: dto.discount ?? null,
      quantity: dto.quantity ?? null,
      weight: dto.weight ?? null,
      weightUnit: dto.weightUnit ?? null,
      length: dto.length ?? null,
      width: dto.width ?? null,
      height: dto.height ?? null,
      dimensionUnit: dto.dimensionUnit ?? null,
      barcode: dto.barcode ?? null,
      supplyCapacity: dto.supplyCapacity,
      unitForSupplyCapacity: dto.unitForSupplyCapacity,
      minOrdersAllowed: dto.minOrdersAllowed,
      unitForMinOrder: dto.unitForMinOrder,
      minDuration: dto.minDuration,
      maxDuration: dto.maxDuration,
      durationUnit: dto.durationUnit,
      images: dto.images || [],
      variantOptions: dto.variantOptions || [],
      variants: dto.variants || [],
    };
  }

  private normalizeUpdateInput(
    product: Product,
    dto: ProductUpdateDto,
  ): NormalizedProductInput {
    const sourceLanguage = normalizeLanguageCode(
      dto.sourceLanguage ?? product.sourceLanguage,
    );
    const existingOptions = (product.variantOptions || []).map((option) => ({
      name: option.name,
      values: option.values,
      sortOrder: option.sortOrder,
    }));

    const existingVariants = (product.variants || []).map((variant) => ({
      attributes: variant.attributes,
      price: toNumber(variant.price),
      discount: variant.discount === null ? null : toNumber(variant.discount),
      quantity: toNumber(variant.quantity),
      weight: variant.weight === null ? null : toNumber(variant.weight),
      weightUnit: variant.weightUnit,
      length: variant.length === null ? null : toNumber(variant.length),
      width: variant.width === null ? null : toNumber(variant.width),
      height: variant.height === null ? null : toNumber(variant.height),
      dimensionUnit: variant.dimensionUnit,
      image: variant.image,
    }));

    const existingImages = (product.images || []).map((image) => ({
      url: image.url,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
    }));

    return {
      productName: dto.productName
        ? mergeTranslationInput(product.productName, dto.productName, sourceLanguage)
        : product.productName,
      productDescription: dto.productDescription
        ? mergeTranslationInput(
            product.productDescription,
            dto.productDescription,
            sourceLanguage,
          )
        : product.productDescription,
      sourceLanguage,
      categoryIds:
        dto.categoryIds ||
        (product.productCategories || []).map((category) => category.categoryId),
      countryOfOrigin: dto.countryOfOrigin ?? product.countryOfOrigin,
      currency: dto.currency ?? product.currency,
      productType: (dto.productType ?? product.productType) as ProductType,
      price: dto.price !== undefined ? dto.price ?? null : product.price === null ? null : toNumber(product.price),
      discount:
        dto.discount !== undefined
          ? dto.discount ?? null
          : product.discount === null
            ? null
            : toNumber(product.discount),
      quantity:
        dto.quantity !== undefined
          ? dto.quantity ?? null
          : product.quantity === null
            ? null
            : toNumber(product.quantity),
      weight:
        dto.weight !== undefined
          ? dto.weight ?? null
          : product.weight === null
            ? null
            : toNumber(product.weight),
      weightUnit: dto.weightUnit !== undefined ? dto.weightUnit ?? null : product.weightUnit,
      length:
        dto.length !== undefined
          ? dto.length ?? null
          : product.length === null
            ? null
            : toNumber(product.length),
      width:
        dto.width !== undefined
          ? dto.width ?? null
          : product.width === null
            ? null
            : toNumber(product.width),
      height:
        dto.height !== undefined
          ? dto.height ?? null
          : product.height === null
            ? null
            : toNumber(product.height),
      dimensionUnit:
        dto.dimensionUnit !== undefined ? dto.dimensionUnit ?? null : product.dimensionUnit,
      barcode: dto.barcode !== undefined ? dto.barcode ?? null : product.barcode,
      supplyCapacity: dto.supplyCapacity ?? toNumber(product.supplyCapacity),
      unitForSupplyCapacity: dto.unitForSupplyCapacity ?? product.unitForSupplyCapacity,
      minOrdersAllowed: dto.minOrdersAllowed ?? toNumber(product.minOrdersAllowed),
      unitForMinOrder: dto.unitForMinOrder ?? product.unitForMinOrder,
      minDuration: dto.minDuration ?? product.minDuration,
      maxDuration: dto.maxDuration ?? product.maxDuration,
      durationUnit: dto.durationUnit ?? product.durationUnit,
      images: dto.images ?? existingImages,
      variantOptions: dto.variantOptions ?? existingOptions,
      variants: dto.variants ?? existingVariants,
    };
  }

  private validateProductInput(input: NormalizedProductInput): void {
    if (new Set(input.categoryIds).size !== input.categoryIds.length) {
      throw createError.badRequest('Duplicate category IDs are not allowed');
    }

    if (input.minDuration > input.maxDuration) {
      throw createError.badRequest('maxDuration must be greater than or equal to minDuration');
    }

    const primaryImages = input.images.filter((image) => image.isPrimary);
    if (primaryImages.length > 1) {
      throw createError.badRequest('Only one product image can be primary');
    }

    if (input.productType === ProductType.SIMPLE) {
      if (input.price === null || input.quantity === null) {
        throw createError.badRequest('Simple products require price and quantity');
      }
      if (input.variantOptions.length || input.variants.length) {
        throw createError.badRequest('Simple products cannot include variants');
      }
      return;
    }

    if (input.price !== null || input.discount !== null || input.quantity !== null) {
      throw createError.badRequest(
        'Variable products must keep product-level price, discount, and quantity null',
      );
    }

    if (!input.variantOptions.length || input.variantOptions.length > 3) {
      throw createError.badRequest('Variable products require one to three variant options');
    }

    if (!input.variants.length) {
      throw createError.badRequest('Variable products require at least one variant');
    }

    this.validateVariantOptions(input.variantOptions);
    this.validateVariants(input.variantOptions, input.variants);
  }

  private validateVariantOptions(options: VariantOptionInput[]): void {
    const seenNames = new Set<string>();
    for (const option of options) {
      const normalizedName = option.name.toLowerCase();
      if (seenNames.has(normalizedName)) {
        throw createError.badRequest('Variant option names must be unique');
      }
      seenNames.add(normalizedName);

      const seenValues = new Set<string>();
      for (const value of option.values) {
        const normalizedValue = value.toLowerCase();
        if (seenValues.has(normalizedValue)) {
          throw createError.badRequest(`Variant option "${option.name}" has duplicate values`);
        }
        seenValues.add(normalizedValue);
      }
    }
  }

  private validateVariants(
    options: VariantOptionInput[],
    variants: VariantInput[],
  ): void {
    const optionMap = new Map(
      options.map((option) => [
        option.name,
        new Set(option.values.map((value) => value.toLowerCase())),
      ]),
    );
    const optionNames = options.map((option) => option.name);
    const seenCombinations = new Set<string>();
    const colorOption = options.find((option) => option.name.toLowerCase() === 'color');
    const colorImages = new Set<string>();

    for (const variant of variants) {
      const attrNames = Object.keys(variant.attributes);
      if (attrNames.length !== optionNames.length) {
        throw createError.badRequest('Every variant must include exactly one value for each option');
      }

      for (const optionName of optionNames) {
        const value = variant.attributes[optionName];
        const allowedValues = optionMap.get(optionName);
        if (!value || !allowedValues?.has(value.toLowerCase())) {
          throw createError.badRequest(
            `Variant attribute "${optionName}" contains an invalid value`,
          );
        }
      }

      const combination = optionNames
        .map((optionName) => `${optionName}:${variant.attributes[optionName].toLowerCase()}`)
        .join('|');
      if (seenCombinations.has(combination)) {
        throw createError.badRequest('Variant combinations must be unique');
      }
      seenCombinations.add(combination);

      if (colorOption && variant.image) {
        colorImages.add(variant.attributes[colorOption.name].toLowerCase());
      }
    }

    if (colorOption) {
      const missingImage = colorOption.values.find(
        (value) => !colorImages.has(value.toLowerCase()),
      );
      if (missingImage) {
        throw createError.badRequest(
          `A variant image is required for color "${missingImage}"`,
        );
      }
    }
  }

  private calculateStock(input: NormalizedProductInput): {
    totalStock: number;
    inventoryStatus: InventoryStatus;
  } {
    const totalStock =
      input.productType === ProductType.SIMPLE
        ? toNumber(input.quantity)
        : input.variants.reduce((sum, variant) => sum + toNumber(variant.quantity), 0);

    return {
      totalStock,
      inventoryStatus: this.inventoryStatus(totalStock),
    };
  }

  private inventoryStatus(totalStock: number): InventoryStatus {
    return totalStock > 0 ? InventoryStatus.IN_STOCK : InventoryStatus.OUT_OF_STOCK;
  }

  private async replaceImages(
    manager: typeof AppDataSource.manager,
    productId: string,
    images: ProductImageInput[],
  ): Promise<void> {
    await manager.delete(ProductImage, { productId });
    if (!images.length) return;

    const hasPrimary = images.some((image) => image.isPrimary);
    await manager.save(
      ProductImage,
      images.map((image, index) =>
        manager.create(ProductImage, {
          productId,
          url: image.url,
          sortOrder: image.sortOrder ?? index,
          isPrimary: hasPrimary ? Boolean(image.isPrimary) : index === 0,
        }),
      ),
    );
  }

  private async replaceVariantData(
    manager: typeof AppDataSource.manager,
    product: Product,
    input: NormalizedProductInput,
  ): Promise<void> {
    await manager.delete(ProductVariant, { productId: product.id });
    await manager.delete(ProductVariantOption, { productId: product.id });

    if (input.productType === ProductType.SIMPLE) return;

    await manager.save(
      ProductVariantOption,
      input.variantOptions.map((option, index) =>
        manager.create(ProductVariantOption, {
          productId: product.id,
          name: option.name,
          values: option.values,
          sortOrder: option.sortOrder ?? index,
        }),
      ),
    );

    const baseSku = this.buildSkuBase(input.productName.en, input.variantOptions);
    await manager.save(
      ProductVariant,
      input.variants.map((variant, index) =>
        manager.create(ProductVariant, {
          productId: product.id,
          sku: `${baseSku}-${String(index + 1).padStart(3, '0')}-${crypto
            .randomBytes(2)
            .toString('hex')
            .toUpperCase()}`,
          attributes: variant.attributes,
          price: variant.price,
          discount: variant.discount ?? null,
          quantity: variant.quantity,
          weight: variant.weight ?? null,
          weightUnit: variant.weightUnit ?? null,
          length: variant.length ?? null,
          width: variant.width ?? null,
          height: variant.height ?? null,
          dimensionUnit: variant.dimensionUnit ?? null,
          image: variant.image ?? null,
        }),
      ),
    );
  }

  private buildSkuBase(productName: string, options: VariantOptionInput[]): string {
    const productPart = productName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((word) => word.replace(/[^a-z0-9]/gi, '').charAt(0))
      .join('')
      .toUpperCase();
    const optionPart = options
      .map((option) => option.name.replace(/[^a-z0-9]/gi, '').slice(0, 2))
      .join('')
      .toUpperCase();
    return `${productPart || 'PRD'}${optionPart ? `-${optionPart}` : ''}`;
  }

  private async ensureVerifiedSeller(sellerId: string): Promise<User> {
    const seller = await this.userRepo.findOne({ where: { id: sellerId } });
    if (!seller) throw createError.notFound('Seller not found');
    if (seller.userType !== UserType.SELLER) {
      throw createError.forbidden('Only sellers can manage products');
    }
    if (seller.status !== UserStatus.ACTIVE) {
      throw createError.forbidden('Seller account is not active');
    }
    if (!seller.isCompanyVerified) {
      throw createError.forbidden('Only verified sellers can manage products');
    }
    return seller;
  }

  private async findOwnedProduct(sellerId: string, productId: string): Promise<Product> {
    await this.ensureVerifiedSeller(sellerId);
    const product = await this.productRepo.findOne({
      where: { id: productId, sellerId },
      relations: [
        'seller',
        'images',
        'productCategories',
        'productCategories.category',
        'variantOptions',
        'variants',
      ],
      order: {
        images: { sortOrder: 'ASC' },
        variantOptions: { sortOrder: 'ASC' },
      },
    });

    if (!product) throw createError.notFound('Product not found');
    return product;
  }

  private serializeProduct(
    product: Product,
    language: string,
    fullTranslations: boolean,
    summaryOnly: boolean,
    featuredProductIds: Set<string> = new Set(),
  ): Record<string, unknown> {
    const categories = (product.productCategories || [])
      .map((pc) => pc.category)
      .filter(Boolean) as Category[];
    const images = (product.images || []).sort((a, b) => a.sortOrder - b.sortOrder);
    const variants = (product.variants || []).map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      attributes: variant.attributes,
      price: toNumber(variant.price),
      discount: variant.discount === null ? null : toNumber(variant.discount),
      finalPrice: calculateFinalPrice(variant.price, variant.discount),
      quantity: toNumber(variant.quantity),
      weight: variant.weight === null ? null : toNumber(variant.weight),
      weightUnit: variant.weightUnit,
      length: variant.length === null ? null : toNumber(variant.length),
      width: variant.width === null ? null : toNumber(variant.width),
      height: variant.height === null ? null : toNumber(variant.height),
      dimensionUnit: variant.dimensionUnit,
      image: variant.image,
    }));

    return {
      id: product.id,
      sellerId: product.sellerId,
      seller: product.seller
        ? {
            id: product.seller.id,
            storeName: product.seller.storeName,
            companyName: product.seller.companyName,
            country: product.seller.country,
            isCompanyVerified: product.seller.isCompanyVerified,
          }
        : undefined,
      productName: fullTranslations
        ? product.productName
        : resolveTranslation(product.productName, language, product.sourceLanguage),
      productDescription: fullTranslations
        ? product.productDescription
        : resolveTranslation(
            product.productDescription,
            language,
            product.sourceLanguage,
          ),
      sourceLanguage: product.sourceLanguage,
      countryOfOrigin: product.countryOfOrigin,
      currency: product.currency,
      price: product.price === null ? null : toNumber(product.price),
      discount: product.discount === null ? null : toNumber(product.discount),
      finalPrice:
        product.price === null ? null : roundMoney(calculateFinalPrice(product.price, product.discount)),
      quantity: product.quantity === null ? null : toNumber(product.quantity),
      logistics: {
        weight: product.weight === null ? null : toNumber(product.weight),
        weightUnit: product.weightUnit,
        length: product.length === null ? null : toNumber(product.length),
        width: product.width === null ? null : toNumber(product.width),
        height: product.height === null ? null : toNumber(product.height),
        dimensionUnit: product.dimensionUnit,
      },
      productType: product.productType,
      barcode: product.barcode,
      supplyCapacity: toNumber(product.supplyCapacity),
      unitForSupplyCapacity: product.unitForSupplyCapacity,
      minOrdersAllowed: toNumber(product.minOrdersAllowed),
      unitForMinOrder: product.unitForMinOrder,
      minDuration: product.minDuration,
      maxDuration: product.maxDuration,
      durationUnit: product.durationUnit,
      status: product.status,
      inventoryStatus: product.inventoryStatus,
      totalStock: toNumber(product.totalStock),
      averageRating: toNumber(product.averageRating),
      totalReviews: product.totalReviews,
      mainImage:
        images.find((image) => image.isPrimary)?.url ?? images[0]?.url ?? null,
      isFeatured: featuredProductIds.has(product.id),
      categoryIds: categories.map((category) => category.id),
      categories: categories.map((category) => ({
        id: category.id,
        name: fullTranslations
          ? category.name
          : resolveTranslation(category.name, language, category.sourceLanguage),
        slug: category.slug,
      })),
      images: images.map((image) => ({
        id: image.id,
        url: image.url,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
      })),
      variantOptions: summaryOnly
        ? undefined
        : (product.variantOptions || []).map((option) => ({
            id: option.id,
            name: option.name,
            values: option.values,
            sortOrder: option.sortOrder,
          })),
      variants: summaryOnly ? undefined : variants,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      deletedAt: product.deletedAt,
    };
  }

  async findCartProduct(productId: string): Promise<Product | null> {
    return this.productRepo.findOne({
      where: { id: productId },
      relations: ['seller', 'images', 'variants'],
      order: { images: { sortOrder: 'ASC' } },
    });
  }

  async findCartVariant(productId: string, variantId: string): Promise<ProductVariant | null> {
    return this.variantRepo.findOne({ where: { id: variantId, productId } });
  }

  async findProductsByIds(productIds: string[]): Promise<Product[]> {
    if (!productIds.length) return [];
    return this.productRepo.find({
      where: { id: In(productIds) },
      relations: ['seller', 'images', 'variants'],
      order: { images: { sortOrder: 'ASC' } },
    });
  }
}

function applyProductSearchRanking(
  qb: SelectQueryBuilder<Product>,
  sortBy: ProductQuery['sortBy'],
  hasSearch: boolean,
  settings: EffectiveSearchSettings,
  search?: string,
): void {
  const relevanceSql = productRelevanceExpression(search, 'p', 'category', 'seller');
  const prioritySql = priorityScoreExpression(
    activeEntitlementValueExpression('seller.id', 'product_priority'),
    settings.weights.subscriptionPriorityMaxWeight,
  );
  const featuredSql = activeFeaturedProductExistsExpression('p.id');
  const rankingSql = [
    relevanceSql,
    settings.ranking.ratingEnabled
      ? `LEAST(CAST(p.averageRating AS DECIMAL(5,2)), 5) * ${settings.weights.ratingWeight}`
      : '0',
    settings.ranking.ratingEnabled
      ? `LEAST(p.totalReviews, 100) / 100 * ${settings.weights.ratingWeight}`
      : '0',
    settings.ranking.subscriptionPriorityEnabled ? prioritySql : '0',
    settings.featuredBoostEnabled
      ? `CASE WHEN ${featuredSql} THEN ${settings.weights.featuredBoost} ELSE 0 END`
      : '0',
    settings.ranking.availabilityEnabled
      ? `CASE WHEN p.inventoryStatus = '${InventoryStatus.IN_STOCK}' THEN ${settings.weights.availabilityWeight} ELSE -${settings.weights.outOfStockPenalty} END`
      : '0',
    settings.ranking.freshnessEnabled
      ? freshnessExpression('p.createdAt', settings.weights.freshnessWeight)
      : '0',
  ].join(' + ');

  qb.addSelect(relevanceSql, 'searchRelevance')
    .addSelect(prioritySql, 'subscriptionPriorityScore')
    .addSelect(featuredSql, 'featuredProduct')
    .addSelect(rankingSql, 'searchRankingScore')
    .setParameter('productRelevanceSearch', search);

  if (sortBy === 'newest') {
    qb.orderBy('p.createdAt', 'DESC');
    return;
  }
  if (sortBy === 'price_low_to_high') {
    qb.orderBy('p.price IS NULL', 'ASC').addOrderBy('p.price', 'ASC');
    return;
  }
  if (sortBy === 'price_high_to_low') {
    qb.orderBy('p.price IS NULL', 'ASC').addOrderBy('p.price', 'DESC');
    return;
  }
  if (sortBy === 'highest_rating') {
    qb.orderBy('p.averageRating', 'DESC').addOrderBy('p.totalReviews', 'DESC');
    return;
  }
  if (sortBy === 'most_reviewed') {
    qb.orderBy('p.totalReviews', 'DESC').addOrderBy('p.averageRating', 'DESC');
    return;
  }
  if (sortBy === 'relevance' || hasSearch) {
    qb.orderBy('searchRelevance', 'DESC').addOrderBy('searchRankingScore', 'DESC');
    return;
  }

  qb.orderBy('searchRankingScore', 'DESC').addOrderBy('p.createdAt', 'DESC');
}

function sanitizeProductSearchFilters(query: ProductQuery): Record<string, unknown> {
  return {
    categoryId: query.categoryId,
    categoryIds: query.categoryIds,
    sellerId: query.sellerId,
    countryOfOrigin: query.countryOfOrigin,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    currency: query.currency,
    minRating: query.minRating,
    inventoryStatus: query.inventoryStatus,
    hasDiscount: query.hasDiscount,
    sortBy: query.sortBy,
  };
}
