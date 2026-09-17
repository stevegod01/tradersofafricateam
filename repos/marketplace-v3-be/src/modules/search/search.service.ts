import { Brackets, In, IsNull, SelectQueryBuilder } from 'typeorm';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import { AdminAuditEvent } from '../../database/entities/admin-audit-event.entity';
import { Category, CategoryStatus, TranslationMap } from '../../database/entities/category.entity';
import {
  FeaturedProduct,
  FeaturedPromotionStatus,
} from '../../database/entities/featured-product.entity';
import { FeaturedStore } from '../../database/entities/featured-store.entity';
import { MarketRFQ, MarketRFQStatus } from '../../database/entities/market-rfq.entity';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { ProductImage } from '../../database/entities/product-image.entity';
import { Product, ProductStatus } from '../../database/entities/product.entity';
import { ProductView } from '../../database/entities/product-view.entity';
import {
  SearchEntityType,
  SearchEvent,
  SearchEventType,
} from '../../database/entities/search-event.entity';
import { SearchHistory } from '../../database/entities/search-history.entity';
import {
  SearchIndexEntityType,
  SearchIndexJob,
  SearchIndexJobStatus,
} from '../../database/entities/search-index-job.entity';
import { SearchSetting } from '../../database/entities/search-setting.entity';
import {
  UserSubscriptionStatus,
} from '../../database/entities/user-subscription.entity';
import { User, UserStatus, UserType } from '../../database/entities/user.entity';
import { createError } from '../../common/utils/http-error.util';
import { resolveTranslation } from '../../common/utils/i18n.util';
import { roundMoney, toNumber } from '../../common/utils/pricing.util';
import {
  FeaturePromotionDto,
  ProductDiscoveryLimitQueryDto,
  SearchEventCreateDto,
  SearchHistoryQueryDto,
  SearchReindexDto,
  SearchSettingsUpdateDto,
  SearchSuggestionQueryDto,
  SellerDiscoveryQueryDto,
} from '../../common/utils/validation.schemas';
import { onMarketRFQEvent } from '../market-rfq/market-rfq.events';
import { onReviewEvent } from '../review/review.events';
import { ReviewType } from '../../database/entities/review-eligibility.entity';
import { onSubscriptionEvent } from '../subscription/subscription.events';
import { SubscriptionService } from '../subscription/subscription.service';

export type EffectiveSearchSettings = {
  outOfStockProductsVisible: boolean;
  searchHistoryLimit: number;
  popularSearchWindowDays: number;
  featuredBoostEnabled: boolean;
  ranking: {
    subscriptionPriorityEnabled: boolean;
    ratingEnabled: boolean;
    freshnessEnabled: boolean;
    availabilityEnabled: boolean;
  };
  weights: {
    featuredBoost: number;
    subscriptionPriorityMaxWeight: number;
    ratingWeight: number;
    freshnessWeight: number;
    availabilityWeight: number;
    outOfStockPenalty: number;
  };
};

const SEARCH_SETTINGS_KEY = 'global';
const ACTIVE_FEATURE_SQL =
  "status = 'active' AND startAt <= CURRENT_TIMESTAMP AND (endAt IS NULL OR endAt > CURRENT_TIMESTAMP)";

export class SearchService {
  private adminAuditRepo = AppDataSource.getRepository(AdminAuditEvent);
  private categoryRepo = AppDataSource.getRepository(Category);
  private featuredProductRepo = AppDataSource.getRepository(FeaturedProduct);
  private featuredStoreRepo = AppDataSource.getRepository(FeaturedStore);
  private historyRepo = AppDataSource.getRepository(SearchHistory);
  private indexJobRepo = AppDataSource.getRepository(SearchIndexJob);
  private marketRfqRepo = AppDataSource.getRepository(MarketRFQ);
  private productRepo = AppDataSource.getRepository(Product);
  private productViewRepo = AppDataSource.getRepository(ProductView);
  private searchEventRepo = AppDataSource.getRepository(SearchEvent);
  private settingRepo = AppDataSource.getRepository(SearchSetting);
  private userRepo = AppDataSource.getRepository(User);
  private subscriptionService = new SubscriptionService();

  async getEffectiveSettings(): Promise<EffectiveSearchSettings> {
    const row = await this.settingRepo.findOne({
      where: { settingKey: SEARCH_SETTINGS_KEY },
    });
    return mergeSearchSettings(defaultSearchSettings(), row?.value);
  }

  async listSellers(
    query: SellerDiscoveryQueryDto,
    language: string,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
    language: string;
  }> {
    const settings = await this.getEffectiveSettings();
    const search = query.search?.toLowerCase();
    const activeProductsCountSql = activeProductsCountExpression('seller.id');
    const featuredStoreSql = activeFeaturedStoreExistsExpression('seller.id');
    const storePrioritySql = priorityScoreExpression(
      activeEntitlementValueExpression('seller.id', 'store_priority'),
      settings.weights.subscriptionPriorityMaxWeight,
    );
    const relevanceSql = sellerRelevanceExpression(search);
    const rankingSql = [
      relevanceSql,
      settings.ranking.ratingEnabled
        ? `LEAST(CAST(seller.totalAverageReviews AS DECIMAL(5,2)), 5) * ${settings.weights.ratingWeight}`
        : '0',
      settings.ranking.subscriptionPriorityEnabled ? storePrioritySql : '0',
      settings.featuredBoostEnabled
        ? `CASE WHEN ${featuredStoreSql} THEN ${settings.weights.featuredBoost} ELSE 0 END`
        : '0',
      settings.ranking.freshnessEnabled
        ? freshnessExpression('seller.createdAt', settings.weights.freshnessWeight)
        : '0',
    ].join(' + ');

    const qb = this.userRepo
      .createQueryBuilder('seller')
      .where('seller.userType = :sellerType', { sellerType: UserType.SELLER })
      .andWhere('seller.status = :status', { status: UserStatus.ACTIVE })
      .andWhere('seller.isCompanyVerified = :verified', { verified: true });

    if (query.isVerified === false) qb.andWhere('1 = 0');
    if (query.country) {
      qb.andWhere('LOWER(seller.country) = :country', {
        country: query.country.toLowerCase(),
      });
    }
    if (query.minRating !== undefined) {
      qb.andWhere('CAST(seller.totalAverageReviews AS DECIMAL(5,2)) >= :minRating', {
        minRating: query.minRating,
      });
    }
    if (query.categoryId) {
      qb.andWhere(sellerCategoryExistsExpression('seller.id'), {
        sellerCategoryId: query.categoryId,
        activeProductStatus: ProductStatus.ACTIVE,
        activeCategoryStatus: CategoryStatus.ACTIVE,
      });
    }
    if (search) {
      qb.andWhere(
        new Brackets((searchQb) => {
          searchQb
            .where('LOWER(seller.storeName) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(seller.companyName) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(seller.companyBio) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(seller.country) LIKE :search', { search: `%${search}%` })
            .orWhere(sellerCategorySearchExpression('seller.id'), {
              search: `%${search}%`,
              activeProductStatus: ProductStatus.ACTIVE,
              activeCategoryStatus: CategoryStatus.ACTIVE,
            });
        }),
      );
    }

    const totalRaw = await qb
      .clone()
      .select('COUNT(DISTINCT seller.id)', 'total')
      .getRawOne<{ total: string }>();

    qb.addSelect(activeProductsCountSql, 'activeProductsCount')
      .addSelect(featuredStoreSql, 'featuredStore')
      .addSelect(storePrioritySql, 'storePriorityScore')
      .addSelect(relevanceSql, 'searchRelevance')
      .addSelect(rankingSql, 'searchRankingScore')
      .setParameter('sellerRelevanceSearch', search)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    applySellerSort(qb, query.sortBy, Boolean(search));
    const { entities, raw } = await qb.getRawAndEntities();

    return {
      success: true,
      data: entities.map((seller, index) =>
        serializeSellerDiscovery(
          seller,
          language,
          Number(raw[index]?.activeProductsCount ?? 0),
          Number(raw[index]?.featuredStore ?? 0) > 0,
        ),
      ),
      pagination: pagination(query.page, query.limit, Number(totalRaw?.total ?? 0)),
      language,
    };
  }

  async getSuggestions(
    query: SearchSuggestionQueryDto,
    language: string,
  ): Promise<{ success: true; data: Record<string, unknown>[]; language: string }> {
    const search = query.q.toLowerCase();
    const perTypeLimit =
      query.type === 'all' ? Math.max(2, Math.ceil(query.limit / 3)) : query.limit;
    const suggestions: Record<string, unknown>[] = [];

    if (query.type === 'all' || query.type === 'products') {
      suggestions.push(...(await this.productSuggestions(search, language, perTypeLimit)));
    }
    if (query.type === 'all' || query.type === 'categories') {
      suggestions.push(...(await this.categorySuggestions(search, language, perTypeLimit)));
    }
    if (query.type === 'all' || query.type === 'sellers') {
      suggestions.push(...(await this.sellerSuggestions(search, language, perTypeLimit)));
    }

    return {
      success: true,
      data: suggestions.slice(0, query.limit),
      language,
    };
  }

  async getSearchHistory(
    userId: string,
    query: SearchHistoryQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[] }> {
    const settings = await this.getEffectiveSettings();
    const limit = query.limit ?? settings.searchHistoryLimit;
    const items = await this.historyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return {
      success: true,
      data: items.map((item) => ({
        id: item.id,
        query: item.query,
        createdAt: item.createdAt,
      })),
    };
  }

  async deleteSearchHistoryItem(
    userId: string,
    searchHistoryId: string,
  ): Promise<{ success: true; message: string }> {
    const item = await this.historyRepo.findOne({
      where: { id: searchHistoryId, userId },
    });
    if (!item) throw createError.notFound('Search history item not found');
    await this.historyRepo.delete(item.id);
    return { success: true, message: 'Search removed successfully.' };
  }

  async clearSearchHistory(userId: string): Promise<{ success: true; message: string }> {
    await this.historyRepo.delete({ userId });
    return { success: true, message: 'Search history cleared successfully.' };
  }

  async getPopularSearches(
    limit = 10,
  ): Promise<{ success: true; data: Record<string, unknown>[] }> {
    const settings = await this.getEffectiveSettings();
    const since = new Date(
      Date.now() - settings.popularSearchWindowDays * 24 * 60 * 60 * 1000,
    );
    const rows = await this.searchEventRepo
      .createQueryBuilder('event')
      .select('event.query', 'query')
      .addSelect('COUNT(*)', 'count')
      .where('event.eventType = :eventType', { eventType: SearchEventType.SEARCH })
      .andWhere('event.query IS NOT NULL')
      .andWhere('event.createdAt >= :since', { since })
      .groupBy('event.query')
      .orderBy('count', 'DESC')
      .addOrderBy('MAX(event.createdAt)', 'DESC')
      .limit(limit)
      .getRawMany<{ query: string; count: string }>();

    return {
      success: true,
      data: rows.map((row) => ({
        query: row.query,
        count: Number(row.count),
      })),
    };
  }

  async recordSearchPerformed(
    userId: string | null,
    searchQuery: string | null | undefined,
    filters: Record<string, unknown> | null,
    resultCount: number,
  ): Promise<void> {
    const normalizedQuery = normalizeSearchQuery(searchQuery);
    if (!normalizedQuery) return;

    await this.searchEventRepo.save(
      this.searchEventRepo.create({
        userId,
        sessionId: null,
        query: normalizedQuery,
        eventType:
          resultCount === 0 ? SearchEventType.NO_RESULT : SearchEventType.SEARCH,
        entityType: SearchEntityType.PRODUCT,
        entityId: null,
        resultPosition: null,
        filters,
      }),
    );

    if (!userId) return;
    await this.historyRepo.delete({ userId, query: normalizedQuery });
    await this.historyRepo.save(
      this.historyRepo.create({
        userId,
        query: normalizedQuery,
      }),
    );
    await this.trimSearchHistory(userId);
  }

  async recordSearchEvent(
    userId: string | null,
    dto: SearchEventCreateDto,
  ): Promise<{ success: true; message: string }> {
    await this.searchEventRepo.save(
      this.searchEventRepo.create({
        userId,
        sessionId: dto.sessionId ?? null,
        query: normalizeSearchQuery(dto.searchQuery),
        eventType: dto.eventType as SearchEventType,
        entityType: (dto.entityType as SearchEntityType | undefined) ?? null,
        entityId: dto.entityId ?? null,
        resultPosition: dto.position ?? null,
        filters: dto.filters ?? null,
      }),
    );

    return { success: true, message: 'Search event recorded successfully.' };
  }

  async featureProduct(
    sellerId: string,
    productId: string,
    dto: FeaturePromotionDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    await this.expireEndedPromotions();
    const product = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['seller'],
    });
    if (!product || product.sellerId !== sellerId) {
      throw createError.notFound('Product not found');
    }
    if (product.status !== ProductStatus.ACTIVE || product.deletedAt) {
      throw createError.badRequest('Only active products can be featured');
    }
    if (
      !product.seller ||
      product.seller.status !== UserStatus.ACTIVE ||
      !product.seller.isCompanyVerified
    ) {
      throw createError.forbidden('Seller is not eligible to feature products');
    }

    const entitlements = await this.subscriptionService.getEffectiveEntitlements(sellerId);
    if (!booleanEntitlement(entitlements.featured_product_eligibility)) {
      throw createError.forbidden(
        'Your current plan does not allow featured products.',
        'FEATURED_PRODUCT_NOT_ALLOWED',
      );
    }

    const maxFeatured = limitFromEntitlement(entitlements.max_featured_products) ?? 0;
    const { feature, created } = await AppDataSource.transaction(async (manager) => {
      // Serialize quota checks per seller so concurrent requests cannot both
      // observe the same remaining entitlement and over-allocate placements.
      await manager
        .getRepository(User)
        .createQueryBuilder('seller')
        .setLock('pessimistic_write')
        .where('seller.id = :sellerId', { sellerId })
        .getOneOrFail();

      const featureRepo = manager.getRepository(FeaturedProduct);
      const now = new Date();
      const existing = await featureRepo
        .createQueryBuilder('feature')
        .where('feature.productId = :productId', { productId: product.id })
        .andWhere('feature.status = :status', {
          status: FeaturedPromotionStatus.ACTIVE,
        })
        .andWhere('feature.startAt <= :now', { now })
        .andWhere('(feature.endAt IS NULL OR feature.endAt > :now)', { now })
        .orderBy('feature.createdAt', 'DESC')
        .getOne();
      if (existing) return { feature: existing, created: false };

      const activeCount = await featureRepo
        .createQueryBuilder('feature')
        .where('feature.sellerId = :sellerId', { sellerId })
        .andWhere('feature.status = :status', {
          status: FeaturedPromotionStatus.ACTIVE,
        })
        .andWhere('feature.startAt <= :now', { now })
        .andWhere('(feature.endAt IS NULL OR feature.endAt > :now)', { now })
        .getCount();
      if (activeCount >= maxFeatured) {
        throw createError.forbidden(
          'You have reached the number of featured products allowed on your current plan.',
          'FEATURED_PRODUCT_LIMIT_REACHED',
        );
      }

      const durationDays = dto.durationDays ?? config.search.defaultFeatureDurationDays;
      const endAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const saved = await featureRepo.save(
        featureRepo.create({
          productId: product.id,
          sellerId,
          status: FeaturedPromotionStatus.ACTIVE,
          startAt: now,
          endAt,
        }),
      );
      return { feature: saved, created: true };
    });

    if (!created) {
      return {
        success: true,
        message: 'Product featured successfully.',
        data: serializeProductFeature(feature),
      };
    }

    await this.queueIndexUpdate(SearchIndexEntityType.PRODUCT, product.id);
    await this.recordAudit(null, 'PRODUCT_FEATURE_ACTIVATED', {
      productId: product.id,
      sellerId,
      featureId: feature.id,
      endAt: feature.endAt,
    });

    return {
      success: true,
      message: 'Product featured successfully.',
      data: serializeProductFeature(feature),
    };
  }

  async featureStore(
    sellerId: string,
    dto: FeaturePromotionDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    await this.expireEndedPromotions();
    const seller = await this.requireDiscoverableSeller(sellerId);
    const entitlements = await this.subscriptionService.getEffectiveEntitlements(seller.id);
    if (!booleanEntitlement(entitlements.featured_store_eligibility)) {
      throw createError.forbidden(
        'Your current plan does not allow featured store placement.',
        'FEATURED_STORE_NOT_ALLOWED',
      );
    }

    const { feature, created } = await AppDataSource.transaction(async (manager) => {
      await manager
        .getRepository(User)
        .createQueryBuilder('seller')
        .setLock('pessimistic_write')
        .where('seller.id = :sellerId', { sellerId: seller.id })
        .getOneOrFail();

      const featureRepo = manager.getRepository(FeaturedStore);
      const now = new Date();
      const existing = await featureRepo
        .createQueryBuilder('feature')
        .where('feature.sellerId = :sellerId', { sellerId: seller.id })
        .andWhere('feature.status = :status', {
          status: FeaturedPromotionStatus.ACTIVE,
        })
        .andWhere('feature.startAt <= :now', { now })
        .andWhere('(feature.endAt IS NULL OR feature.endAt > :now)', { now })
        .orderBy('feature.createdAt', 'DESC')
        .getOne();
      if (existing) return { feature: existing, created: false };

      const durationDays = dto.durationDays ?? config.search.defaultFeatureDurationDays;
      const endAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const saved = await featureRepo.save(
        featureRepo.create({
          sellerId: seller.id,
          status: FeaturedPromotionStatus.ACTIVE,
          startAt: now,
          endAt,
        }),
      );
      return { feature: saved, created: true };
    });

    if (!created) {
      return {
        success: true,
        message: 'Store featured successfully.',
        data: serializeStoreFeature(feature),
      };
    }

    await this.queueIndexUpdate(SearchIndexEntityType.SELLER, seller.id);
    await this.recordAudit(null, 'STORE_FEATURE_ACTIVATED', {
      sellerId: seller.id,
      featureId: feature.id,
      endAt: feature.endAt,
    });

    return {
      success: true,
      message: 'Store featured successfully.',
      data: serializeStoreFeature(feature),
    };
  }

  async recordProductView(
    userId: string,
    productId: string,
  ): Promise<{ success: true; message: string }> {
    await this.requirePublicProduct(productId);
    const viewedAt = new Date();
    const existing = await this.productViewRepo.findOne({
      where: { userId, productId },
    });

    if (existing) {
      await this.productViewRepo.update(existing.id, { viewedAt });
    } else {
      await this.productViewRepo.save(
        this.productViewRepo.create({ userId, productId, viewedAt }),
      );
    }

    await this.searchEventRepo.save(
      this.searchEventRepo.create({
        userId,
        sessionId: null,
        query: null,
        eventType: SearchEventType.RESULT_CLICK,
        entityType: SearchEntityType.PRODUCT,
        entityId: productId,
        resultPosition: null,
        filters: null,
      }),
    );

    return { success: true, message: 'Product view recorded successfully.' };
  }

  async getRecentlyViewedProducts(
    userId: string,
    language: string,
    query: ProductDiscoveryLimitQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[]; language: string }> {
    const views = await this.productViewRepo
      .createQueryBuilder('view')
      .leftJoinAndSelect('view.product', 'product')
      .leftJoinAndSelect('product.seller', 'seller')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.productCategories', 'pc')
      .leftJoinAndSelect('pc.category', 'category')
      .where('view.userId = :userId', { userId })
      .andWhere('product.status = :productStatus', {
        productStatus: ProductStatus.ACTIVE,
      })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('seller.status = :sellerStatus', { sellerStatus: UserStatus.ACTIVE })
      .andWhere('seller.isCompanyVerified = :verified', { verified: true })
      .andWhere(activeCategoryExistsExpression('product.id'), {
        activeCategoryStatus: CategoryStatus.ACTIVE,
      })
      .orderBy('view.viewedAt', 'DESC')
      .addOrderBy('images.sortOrder', 'ASC')
      .take(query.limit)
      .getMany();

    const featuredIds = await this.activeFeaturedProductIds(
      views.map((view) => view.productId),
    );

    return {
      success: true,
      data: views
        .map((view) => view.product)
        .filter(Boolean)
        .map((product) => serializeProductDiscovery(product, language, featuredIds)),
      language,
    };
  }

  async getRelatedProducts(
    productId: string,
    language: string,
    query: ProductDiscoveryLimitQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[]; language: string }> {
    const source = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['productCategories'],
    });
    if (!source) throw createError.notFound('Product not found');
    const categoryIds = (source.productCategories ?? []).map((item) => item.categoryId);

    if (categoryIds.length === 0) {
      return { success: true, data: [], language };
    }

    const qb = this.productRepo
      .createQueryBuilder('product')
      .distinct(true)
      .leftJoinAndSelect('product.seller', 'seller')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.productCategories', 'pc')
      .leftJoinAndSelect('pc.category', 'category')
      .innerJoin(
        ProductCategory,
        'relatedCategory',
        'relatedCategory.productId = product.id AND relatedCategory.categoryId IN (:...categoryIds)',
        { categoryIds },
      )
      .where('product.id != :productId', { productId })
      .andWhere('product.status = :productStatus', {
        productStatus: ProductStatus.ACTIVE,
      })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('seller.status = :sellerStatus', { sellerStatus: UserStatus.ACTIVE })
      .andWhere('seller.isCompanyVerified = :verified', { verified: true })
      .andWhere(activeCategoryExistsExpression('product.id'), {
        activeCategoryStatus: CategoryStatus.ACTIVE,
      })
      .addSelect(activeFeaturedProductExistsExpression('product.id'), 'featuredProduct')
      .orderBy('featuredProduct', 'DESC')
      .addOrderBy('product.averageRating', 'DESC')
      .addOrderBy('product.totalReviews', 'DESC')
      .addOrderBy('product.createdAt', 'DESC')
      .addOrderBy('images.sortOrder', 'ASC')
      .take(query.limit);

    const products = await qb.getMany();
    const featuredIds = await this.activeFeaturedProductIds(products.map((item) => item.id));

    return {
      success: true,
      data: products.map((product) =>
        serializeProductDiscovery(product, language, featuredIds),
      ),
      language,
    };
  }

  async getPopularProducts(
    language: string,
    query: ProductDiscoveryLimitQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[]; language: string }> {
    const viewCountSql =
      '(SELECT COUNT(*) FROM product_views pv WHERE pv.productId = product.id AND pv.viewedAt >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY))';
    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.seller', 'seller')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.productCategories', 'pc')
      .leftJoinAndSelect('pc.category', 'category')
      .where('product.status = :productStatus', {
        productStatus: ProductStatus.ACTIVE,
      })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('seller.status = :sellerStatus', { sellerStatus: UserStatus.ACTIVE })
      .andWhere('seller.isCompanyVerified = :verified', { verified: true })
      .andWhere(activeCategoryExistsExpression('product.id'), {
        activeCategoryStatus: CategoryStatus.ACTIVE,
      })
      .addSelect(viewCountSql, 'recentViewCount')
      .addSelect(activeFeaturedProductExistsExpression('product.id'), 'featuredProduct')
      .orderBy('recentViewCount', 'DESC')
      .addOrderBy('product.averageRating', 'DESC')
      .addOrderBy('product.totalReviews', 'DESC')
      .addOrderBy('featuredProduct', 'DESC')
      .addOrderBy('images.sortOrder', 'ASC')
      .take(query.limit);

    const products = await qb.getMany();
    const featuredIds = await this.activeFeaturedProductIds(products.map((item) => item.id));

    return {
      success: true,
      data: products.map((product) =>
        serializeProductDiscovery(product, language, featuredIds),
      ),
      language,
    };
  }

  async getAdminSearchSettings(): Promise<{
    success: true;
    data: EffectiveSearchSettings;
  }> {
    return {
      success: true,
      data: await this.getEffectiveSettings(),
    };
  }

  async updateAdminSearchSettings(
    adminId: string,
    dto: SearchSettingsUpdateDto,
  ): Promise<{ success: true; message: string; data: EffectiveSearchSettings }> {
    const current = await this.getEffectiveSettings();
    const next = mergeSearchSettings(current, dto);

    await this.settingRepo.save(
      this.settingRepo.create({
        settingKey: SEARCH_SETTINGS_KEY,
        value: next,
        updatedBy: adminId,
      }),
    );
    await this.recordAudit(adminId, 'SEARCH_SETTINGS_UPDATED', { settings: dto });

    return {
      success: true,
      message: 'Search settings updated successfully.',
      data: next,
    };
  }

  async getSearchIndexStatus(): Promise<{ success: true; data: Record<string, unknown> }> {
    const [productsIndexed, sellersIndexed, marketRfqsIndexed, pendingUpdates, failedUpdates, lastSync] =
      await Promise.all([
        this.countDiscoverableProducts(),
        this.userRepo.count({
          where: {
            userType: UserType.SELLER,
            status: UserStatus.ACTIVE,
            isCompanyVerified: true,
          },
        }),
        this.marketRfqRepo.count({
          where: {
            status: In([
              MarketRFQStatus.OPEN,
              MarketRFQStatus.QUOTED,
              MarketRFQStatus.NEGOTIATING,
            ]),
          },
        }),
        this.indexJobRepo.count({
          where: {
            status: In([
              SearchIndexJobStatus.PENDING,
              SearchIndexJobStatus.PROCESSING,
            ]),
          },
        }),
        this.indexJobRepo.count({ where: { status: SearchIndexJobStatus.FAILED } }),
        this.indexJobRepo
          .createQueryBuilder('job')
          .select('MAX(job.completedAt)', 'lastSuccessfulSyncAt')
          .where('job.status = :status', { status: SearchIndexJobStatus.COMPLETED })
          .getRawOne<{ lastSuccessfulSyncAt: Date | null }>(),
      ]);

    return {
      success: true,
      data: {
        productsIndexed,
        sellersIndexed,
        marketRfqsIndexed,
        pendingUpdates,
        failedUpdates,
        lastSuccessfulSyncAt: lastSync?.lastSuccessfulSyncAt ?? null,
      },
    };
  }

  async requestReindex(
    adminId: string,
    dto: SearchReindexDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    await this.validateReindexTarget(dto);
    const job = await this.queueIndexUpdate(
      dto.entityType as SearchIndexEntityType,
      dto.entityId ?? null,
      adminId,
    );
    await this.recordAudit(adminId, 'SEARCH_REINDEX_REQUESTED', {
      entityType: dto.entityType,
      entityId: dto.entityId ?? null,
      jobId: job.id,
    });

    return {
      success: true,
      message: 'Search reindex requested successfully.',
      data: {
        jobId: job.id,
        entityType: job.entityType,
        entityId: job.entityId,
        status: job.status,
      },
    };
  }

  async queueIndexUpdate(
    entityType: SearchIndexEntityType,
    entityId: string | null = null,
    requestedBy: string | null = null,
  ): Promise<SearchIndexJob> {
    const existing = await this.indexJobRepo.findOne({
      where: {
        entityType,
        entityId: entityId ?? IsNull(),
        status: In([SearchIndexJobStatus.PENDING, SearchIndexJobStatus.PROCESSING]),
      },
    });
    if (existing) return existing;

    return this.indexJobRepo.save(
      this.indexJobRepo.create({
        entityType,
        entityId,
        status: SearchIndexJobStatus.PENDING,
        attemptCount: 0,
        failureReason: null,
        requestedBy,
        completedAt: null,
      }),
    );
  }

  async queueSellerProductReindex(sellerId: string): Promise<void> {
    await this.queueIndexUpdate(SearchIndexEntityType.SELLER, sellerId);
    const products = await this.productRepo.find({
      where: { sellerId },
      select: ['id'],
    });
    await Promise.all(
      products.map((product) =>
        this.queueIndexUpdate(SearchIndexEntityType.PRODUCT, product.id),
      ),
    );
  }

  async activeFeaturedProductIds(productIds: string[]): Promise<Set<string>> {
    if (productIds.length === 0) return new Set();
    await this.expireEndedPromotions();
    const rows = await this.featuredProductRepo.find({
      where: {
        productId: In(productIds),
        status: FeaturedPromotionStatus.ACTIVE,
      },
      select: ['productId', 'startAt', 'endAt'],
    });
    const now = Date.now();
    return new Set(
      rows
        .filter(
          (row) =>
            row.startAt.getTime() <= now &&
            (!row.endAt || row.endAt.getTime() > now),
        )
        .map((row) => row.productId),
    );
  }

  private async productSuggestions(
    search: string,
    language: string,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const products = await this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.seller', 'seller')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.productCategories', 'pc')
      .leftJoinAndSelect('pc.category', 'category')
      .where('product.status = :productStatus', {
        productStatus: ProductStatus.ACTIVE,
      })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('seller.status = :sellerStatus', { sellerStatus: UserStatus.ACTIVE })
      .andWhere('seller.isCompanyVerified = :verified', { verified: true })
      .andWhere(activeCategoryExistsExpression('product.id'), {
        activeCategoryStatus: CategoryStatus.ACTIVE,
      })
      .andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(CAST(product.productName AS CHAR)) LIKE :search', {
            search: `%${search}%`,
          })
            .orWhere('LOWER(CAST(product.productDescription AS CHAR)) LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(seller.storeName) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(product.countryOfOrigin) LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(CAST(category.name AS CHAR)) LIKE :search', {
              search: `%${search}%`,
            });
        }),
      )
      .orderBy(productRelevanceExpression(search), 'DESC')
      .setParameter('productRelevanceSearch', search)
      .addOrderBy('product.averageRating', 'DESC')
      .addOrderBy('images.sortOrder', 'ASC')
      .take(limit)
      .getMany();

    return products.map((product) => ({
      type: 'product',
      id: product.id,
      label: resolveTranslation(product.productName, language, product.sourceLanguage),
      image: primaryImageUrl(product.images),
    }));
  }

  private async categorySuggestions(
    search: string,
    language: string,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const categories = await this.categoryRepo
      .createQueryBuilder('category')
      .where('category.status = :status', { status: CategoryStatus.ACTIVE })
      .andWhere('category.deletedAt IS NULL')
      .andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(CAST(category.name AS CHAR)) LIKE :search', {
            search: `%${search}%`,
          }).orWhere('LOWER(category.slug) LIKE :search', { search: `%${search}%` });
        }),
      )
      .orderBy('category.sortOrder', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .take(limit)
      .getMany();

    return categories.map((category) => ({
      type: 'category',
      id: category.id,
      label: resolveTranslation(category.name, language, category.sourceLanguage),
      image: category.image,
    }));
  }

  private async sellerSuggestions(
    search: string,
    language: string,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const sellers = await this.userRepo
      .createQueryBuilder('seller')
      .where('seller.userType = :sellerType', { sellerType: UserType.SELLER })
      .andWhere('seller.status = :status', { status: UserStatus.ACTIVE })
      .andWhere('seller.isCompanyVerified = :verified', { verified: true })
      .andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(seller.storeName) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(seller.companyName) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(seller.companyBio) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(seller.country) LIKE :search', { search: `%${search}%` });
        }),
      )
      .orderBy(sellerRelevanceExpression(search), 'DESC')
      .setParameter('sellerRelevanceSearch', search)
      .addOrderBy('seller.totalAverageReviews', 'DESC')
      .take(limit)
      .getMany();

    return sellers.map((seller) => ({
      type: 'seller',
      id: seller.id,
      label: seller.storeName ?? seller.companyName ?? displayUserName(seller),
      image: seller.companyLogo,
      companyBio: localizedOptionalText(seller.companyBio, language),
    }));
  }

  private async trimSearchHistory(userId: string): Promise<void> {
    const settings = await this.getEffectiveSettings();
    const overflow = await this.historyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: settings.searchHistoryLimit,
      take: 500,
      select: ['id'],
    });
    if (overflow.length > 0) {
      await this.historyRepo.delete({ id: In(overflow.map((item) => item.id)) });
    }
  }

  private async activeFeaturedProduct(productId: string): Promise<FeaturedProduct | null> {
    const now = new Date();
    return this.featuredProductRepo
      .createQueryBuilder('feature')
      .where('feature.productId = :productId', { productId })
      .andWhere('feature.status = :status', { status: FeaturedPromotionStatus.ACTIVE })
      .andWhere('feature.startAt <= :now', { now })
      .andWhere('(feature.endAt IS NULL OR feature.endAt > :now)', { now })
      .orderBy('feature.createdAt', 'DESC')
      .getOne();
  }

  private async activeFeaturedStore(sellerId: string): Promise<FeaturedStore | null> {
    const now = new Date();
    return this.featuredStoreRepo
      .createQueryBuilder('feature')
      .where('feature.sellerId = :sellerId', { sellerId })
      .andWhere('feature.status = :status', { status: FeaturedPromotionStatus.ACTIVE })
      .andWhere('feature.startAt <= :now', { now })
      .andWhere('(feature.endAt IS NULL OR feature.endAt > :now)', { now })
      .orderBy('feature.createdAt', 'DESC')
      .getOne();
  }

  private async expireEndedPromotions(): Promise<void> {
    const now = new Date();
    await Promise.all([
      this.featuredProductRepo
        .createQueryBuilder()
        .update(FeaturedProduct)
        .set({ status: FeaturedPromotionStatus.EXPIRED })
        .where('status = :status', { status: FeaturedPromotionStatus.ACTIVE })
        .andWhere('endAt IS NOT NULL')
        .andWhere('endAt <= :now', { now })
        .execute(),
      this.featuredStoreRepo
        .createQueryBuilder()
        .update(FeaturedStore)
        .set({ status: FeaturedPromotionStatus.EXPIRED })
        .where('status = :status', { status: FeaturedPromotionStatus.ACTIVE })
        .andWhere('endAt IS NOT NULL')
        .andWhere('endAt <= :now', { now })
        .execute(),
    ]);
  }

  private async requireDiscoverableSeller(sellerId: string): Promise<User> {
    const seller = await this.userRepo.findOne({ where: { id: sellerId } });
    if (
      !seller ||
      seller.userType !== UserType.SELLER ||
      seller.status !== UserStatus.ACTIVE ||
      !seller.isCompanyVerified
    ) {
      throw createError.forbidden('Seller is not eligible for marketplace discovery');
    }
    return seller;
  }

  private async requirePublicProduct(productId: string): Promise<Product> {
    const product = await this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.seller', 'seller')
      .where('product.id = :productId', { productId })
      .andWhere('product.status = :productStatus', {
        productStatus: ProductStatus.ACTIVE,
      })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('seller.status = :sellerStatus', { sellerStatus: UserStatus.ACTIVE })
      .andWhere('seller.isCompanyVerified = :verified', { verified: true })
      .andWhere(activeCategoryExistsExpression('product.id'), {
        activeCategoryStatus: CategoryStatus.ACTIVE,
      })
      .getOne();

    if (!product) throw createError.notFound('Product not found');
    return product;
  }

  private async validateReindexTarget(dto: SearchReindexDto): Promise<void> {
    if (!dto.entityId) return;
    if (dto.entityType === SearchIndexEntityType.PRODUCT) {
      if (!(await this.productRepo.exist({ where: { id: dto.entityId } }))) {
        throw createError.notFound('Product not found');
      }
    } else if (dto.entityType === SearchIndexEntityType.SELLER) {
      if (!(await this.userRepo.exist({ where: { id: dto.entityId } }))) {
        throw createError.notFound('Seller not found');
      }
    } else if (dto.entityType === SearchIndexEntityType.MARKET_RFQ) {
      if (!(await this.marketRfqRepo.exist({ where: { id: dto.entityId } }))) {
        throw createError.notFound('Market RFQ not found');
      }
    } else if (dto.entityType === SearchIndexEntityType.CATEGORY) {
      if (!(await this.categoryRepo.exist({ where: { id: dto.entityId } }))) {
        throw createError.notFound('Category not found');
      }
    }
  }

  private async countDiscoverableProducts(): Promise<number> {
    return this.productRepo
      .createQueryBuilder('product')
      .leftJoin('product.seller', 'seller')
      .where('product.status = :productStatus', {
        productStatus: ProductStatus.ACTIVE,
      })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('seller.status = :sellerStatus', { sellerStatus: UserStatus.ACTIVE })
      .andWhere('seller.isCompanyVerified = :verified', { verified: true })
      .andWhere(activeCategoryExistsExpression('product.id'), {
        activeCategoryStatus: CategoryStatus.ACTIVE,
      })
      .getCount();
  }

  private async recordAudit(
    adminId: string | null,
    eventType: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.adminAuditRepo.save(
      this.adminAuditRepo.create({
        eventType,
        actorAdminId: adminId,
        targetAdminId: null,
        targetUserId: typeof metadata.sellerId === 'string' ? metadata.sellerId : null,
        targetRoleId: null,
        metadata,
      }),
    );
  }
}

let searchHandlersRegistered = false;

export function registerSearchEventHandlers(): void {
  if (searchHandlersRegistered) return;
  searchHandlersRegistered = true;
  const service = new SearchService();

  for (const eventName of [
    'SUBSCRIPTION_ACTIVATED',
    'SUBSCRIPTION_UPGRADED',
    'SUBSCRIPTION_RENEWED',
    'SUBSCRIPTION_EXPIRED',
    'SUBSCRIPTION_CANCELLED',
  ] as const) {
    onSubscriptionEvent(eventName, async (payload) => {
      if (payload.userId) await service.queueSellerProductReindex(payload.userId);
    });
  }

  for (const eventName of [
    'SUBSCRIPTION_PLAN_CREATED',
    'SUBSCRIPTION_PLAN_UPDATED',
    'SUBSCRIPTION_PLAN_ACTIVATED',
    'SUBSCRIPTION_PLAN_DEACTIVATED',
  ] as const) {
    onSubscriptionEvent(eventName, async () => {
      await service.queueIndexUpdate(SearchIndexEntityType.PRODUCTS, null);
      await service.queueIndexUpdate(SearchIndexEntityType.SELLERS, null);
    });
  }

  for (const eventName of [
    'MARKET_RFQ_CREATED',
    'MARKET_RFQ_AWARDED',
    'MARKET_RFQ_CANCELLED',
    'MARKET_RFQ_EXPIRED',
  ] as const) {
    onMarketRFQEvent(eventName, async (payload) => {
      await service.queueIndexUpdate(SearchIndexEntityType.MARKET_RFQ, payload.rfqId);
    });
  }

  onReviewEvent('REVIEW_SUBMITTED', async (payload) => {
    if (payload.reviewType === ReviewType.PRODUCT && payload.productId) {
      await service.queueIndexUpdate(SearchIndexEntityType.PRODUCT, payload.productId);
    }
    if (payload.reviewType === ReviewType.SELLER && payload.sellerId) {
      await service.queueIndexUpdate(SearchIndexEntityType.SELLER, payload.sellerId);
    }
  });

  onReviewEvent('REVIEW_STATUS_CHANGED', async (payload) => {
    if (payload.productId) {
      await service.queueIndexUpdate(SearchIndexEntityType.PRODUCT, payload.productId);
    }
    if (payload.sellerId) {
      await service.queueIndexUpdate(SearchIndexEntityType.SELLER, payload.sellerId);
    }
  });
}

function defaultSearchSettings(): EffectiveSearchSettings {
  return {
    outOfStockProductsVisible: config.search.outOfStockProductsVisible,
    searchHistoryLimit: config.search.searchHistoryLimit,
    popularSearchWindowDays: config.search.popularSearchWindowDays,
    featuredBoostEnabled: config.search.featuredBoostEnabled,
    ranking: {
      subscriptionPriorityEnabled: config.search.subscriptionPriorityEnabled,
      ratingEnabled: config.search.ratingEnabled,
      freshnessEnabled: config.search.freshnessEnabled,
      availabilityEnabled: config.search.availabilityEnabled,
    },
    weights: {
      featuredBoost: config.search.featuredBoost,
      subscriptionPriorityMaxWeight: config.search.subscriptionPriorityMaxWeight,
      ratingWeight: config.search.ratingWeight,
      freshnessWeight: config.search.freshnessWeight,
      availabilityWeight: config.search.availabilityWeight,
      outOfStockPenalty: config.search.outOfStockPenalty,
    },
  };
}

function mergeSearchSettings(
  base: EffectiveSearchSettings,
  override?: Record<string, unknown> | null,
): EffectiveSearchSettings {
  if (!override) return base;
  const ranking = isRecord(override.ranking) ? override.ranking : {};
  const weights = isRecord(override.weights) ? override.weights : {};
  return {
    outOfStockProductsVisible: booleanSetting(
      override.outOfStockProductsVisible,
      base.outOfStockProductsVisible,
    ),
    searchHistoryLimit: numberSetting(
      override.searchHistoryLimit,
      base.searchHistoryLimit,
    ),
    popularSearchWindowDays: numberSetting(
      override.popularSearchWindowDays,
      base.popularSearchWindowDays,
    ),
    featuredBoostEnabled: booleanSetting(
      override.featuredBoostEnabled,
      base.featuredBoostEnabled,
    ),
    ranking: {
      subscriptionPriorityEnabled: booleanSetting(
        ranking.subscriptionPriorityEnabled,
        base.ranking.subscriptionPriorityEnabled,
      ),
      ratingEnabled: booleanSetting(ranking.ratingEnabled, base.ranking.ratingEnabled),
      freshnessEnabled: booleanSetting(
        ranking.freshnessEnabled,
        base.ranking.freshnessEnabled,
      ),
      availabilityEnabled: booleanSetting(
        ranking.availabilityEnabled,
        base.ranking.availabilityEnabled,
      ),
    },
    weights: {
      featuredBoost: numberSetting(weights.featuredBoost, base.weights.featuredBoost),
      subscriptionPriorityMaxWeight: numberSetting(
        weights.subscriptionPriorityMaxWeight,
        base.weights.subscriptionPriorityMaxWeight,
      ),
      ratingWeight: numberSetting(weights.ratingWeight, base.weights.ratingWeight),
      freshnessWeight: numberSetting(
        weights.freshnessWeight,
        base.weights.freshnessWeight,
      ),
      availabilityWeight: numberSetting(
        weights.availabilityWeight,
        base.weights.availabilityWeight,
      ),
      outOfStockPenalty: numberSetting(
        weights.outOfStockPenalty,
        base.weights.outOfStockPenalty,
      ),
    },
  };
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberSetting(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function activeProductsCountExpression(sellerIdSql: string): string {
  return `(
    SELECT COUNT(*)
    FROM products ap
    WHERE ap.sellerId = ${sellerIdSql}
      AND ap.status = 'active'
      AND ap.deletedAt IS NULL
  )`;
}

function activeFeaturedStoreExistsExpression(sellerIdSql: string): string {
  return `EXISTS (
    SELECT 1
    FROM featured_stores fs
    WHERE fs.sellerId = ${sellerIdSql}
      AND fs.${ACTIVE_FEATURE_SQL}
  )`;
}

export function activeFeaturedProductExistsExpression(productIdSql: string): string {
  return `EXISTS (
    SELECT 1
    FROM featured_products fp
    WHERE fp.productId = ${productIdSql}
      AND fp.${ACTIVE_FEATURE_SQL}
  )`;
}

export function activeEntitlementValueExpression(
  userIdSql: string,
  entitlementCode: string,
): string {
  return `(
    SELECT spe.value
    FROM user_subscriptions us
    JOIN subscription_plan_entitlements spe
      ON spe.planId = us.planId
     AND spe.entitlementCode = '${entitlementCode}'
    WHERE us.userId = ${userIdSql}
      AND us.status = '${UserSubscriptionStatus.ACTIVE}'
      AND (us.expiresAt IS NULL OR us.expiresAt > CURRENT_TIMESTAMP)
    ORDER BY us.startedAt DESC, us.createdAt DESC
    LIMIT 1
  )`;
}

export function priorityScoreExpression(
  valueSql: string,
  maxWeight = config.search.subscriptionPriorityMaxWeight,
): string {
  const unquoted = `LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${valueSql}, '$')), JSON_UNQUOTE(${valueSql}), 'standard'))`;
  return `CASE
    WHEN ${unquoted} IN ('premium', 'high', 'priority') THEN LEAST(${maxWeight}, 50)
    WHEN ${unquoted} IN ('growth', 'medium', 'boosted') THEN LEAST(${maxWeight}, 20)
    WHEN ${unquoted} IN ('basic', 'standard', 'none', 'false') THEN 0
    WHEN CAST(${unquoted} AS DECIMAL(10,2)) > 0 THEN LEAST(${maxWeight}, CAST(${unquoted} AS DECIMAL(10,2)))
    ELSE 0
  END`;
}

function sellerRelevanceExpression(search?: string): string {
  if (!search) return '0';
  return `CASE
    WHEN LOWER(seller.storeName) = :sellerRelevanceSearch THEN 100
    WHEN LOWER(seller.companyName) = :sellerRelevanceSearch THEN 90
    WHEN LOWER(seller.storeName) LIKE CONCAT('%', :sellerRelevanceSearch, '%') THEN 70
    WHEN LOWER(seller.companyName) LIKE CONCAT('%', :sellerRelevanceSearch, '%') THEN 60
    WHEN LOWER(seller.companyBio) LIKE CONCAT('%', :sellerRelevanceSearch, '%') THEN 30
    WHEN LOWER(seller.country) LIKE CONCAT('%', :sellerRelevanceSearch, '%') THEN 20
    ELSE 0
  END`;
}

export function productRelevanceExpression(
  search?: string,
  productAlias = 'product',
  categoryAlias = 'category',
  sellerAlias = 'seller',
): string {
  if (!search) return '0';
  return `CASE
    WHEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(${productAlias}.productName, '$.en'))) = :productRelevanceSearch THEN 120
    WHEN LOWER(CAST(${productAlias}.productName AS CHAR)) LIKE CONCAT('%', :productRelevanceSearch, '%') THEN 90
    WHEN LOWER(CAST(${categoryAlias}.name AS CHAR)) LIKE CONCAT('%', :productRelevanceSearch, '%') THEN 65
    WHEN LOWER(CAST(${productAlias}.productDescription AS CHAR)) LIKE CONCAT('%', :productRelevanceSearch, '%') THEN 45
    WHEN LOWER(${sellerAlias}.storeName) LIKE CONCAT('%', :productRelevanceSearch, '%') THEN 35
    WHEN LOWER(${productAlias}.countryOfOrigin) LIKE CONCAT('%', :productRelevanceSearch, '%') THEN 20
    ELSE 0
  END`;
}

export function freshnessExpression(dateSql: string, weight: number): string {
  return `GREATEST(0, ${weight} - LEAST(${weight}, TIMESTAMPDIFF(DAY, ${dateSql}, CURRENT_TIMESTAMP) / 7))`;
}

function sellerCategoryExistsExpression(sellerIdSql: string): string {
  return `EXISTS (
    SELECT 1
    FROM products cp
    JOIN product_categories cpc ON cpc.productId = cp.id
    JOIN categories cc ON cc.id = cpc.categoryId
    WHERE cp.sellerId = ${sellerIdSql}
      AND cp.status = :activeProductStatus
      AND cp.deletedAt IS NULL
      AND cpc.categoryId = :sellerCategoryId
      AND cc.status = :activeCategoryStatus
      AND cc.deletedAt IS NULL
  )`;
}

function sellerCategorySearchExpression(sellerIdSql: string): string {
  return `EXISTS (
    SELECT 1
    FROM products sp
    JOIN product_categories spc ON spc.productId = sp.id
    JOIN categories sc ON sc.id = spc.categoryId
    WHERE sp.sellerId = ${sellerIdSql}
      AND sp.status = :activeProductStatus
      AND sp.deletedAt IS NULL
      AND sc.status = :activeCategoryStatus
      AND sc.deletedAt IS NULL
      AND LOWER(CAST(sc.name AS CHAR)) LIKE :search
  )`;
}

export function activeCategoryExistsExpression(productIdSql: string): string {
  return `EXISTS (
    SELECT 1
    FROM product_categories acp
    JOIN categories ac ON ac.id = acp.categoryId
    WHERE acp.productId = ${productIdSql}
      AND ac.status = :activeCategoryStatus
      AND ac.deletedAt IS NULL
  )`;
}

function applySellerSort(
  qb: SelectQueryBuilder<User>,
  sortBy: SellerDiscoveryQueryDto['sortBy'],
  hasSearch: boolean,
): void {
  if (sortBy === 'newest') {
    qb.orderBy('seller.createdAt', 'DESC');
    return;
  }
  if (sortBy === 'highest_rating') {
    qb.orderBy('seller.totalAverageReviews', 'DESC').addOrderBy(
      'seller.totalReviewCount',
      'DESC',
    );
    return;
  }
  if (sortBy === 'most_reviewed') {
    qb.orderBy('seller.totalReviewCount', 'DESC').addOrderBy(
      'seller.totalAverageReviews',
      'DESC',
    );
    return;
  }
  if (sortBy === 'relevance' || hasSearch) {
    qb.orderBy('searchRelevance', 'DESC').addOrderBy('searchRankingScore', 'DESC');
    return;
  }
  qb.orderBy('searchRankingScore', 'DESC').addOrderBy('seller.createdAt', 'DESC');
}

function serializeSellerDiscovery(
  seller: User,
  language: string,
  activeProductsCount: number,
  isFeatured: boolean,
): Record<string, unknown> {
  return {
    id: seller.id,
    storeName: seller.storeName ?? seller.companyName ?? displayUserName(seller),
    companyName: seller.companyName,
    companyLogo: seller.companyLogo,
    companyBio: localizedOptionalText(seller.companyBio, language),
    country: seller.country,
    isVerified: seller.isCompanyVerified,
    averageRating: toNumber(seller.totalAverageReviews),
    totalReviews: seller.totalReviewCount,
    activeProductsCount,
    isFeatured,
  };
}

function serializeProductDiscovery(
  product: Product,
  language: string,
  featuredProductIds: Set<string>,
): Record<string, unknown> {
  const categories = (product.productCategories ?? [])
    .map((pc) => pc.category)
    .filter((category): category is Category => Boolean(category));
  const mainImage = primaryImageUrl(product.images);
  return {
    id: product.id,
    productName: resolveTranslation(
      product.productName,
      language,
      product.sourceLanguage,
    ),
    categories: categories.map((category) => ({
      id: category.id,
      name: resolveTranslation(category.name, language, category.sourceLanguage),
      slug: category.slug,
    })),
    seller: product.seller
      ? {
          id: product.seller.id,
          storeName: product.seller.storeName ?? product.seller.companyName,
          isVerified: product.seller.isCompanyVerified,
          rating: toNumber(product.seller.totalAverageReviews),
          totalReviews: product.seller.totalReviewCount,
        }
      : undefined,
    countryOfOrigin: product.countryOfOrigin,
    currency: product.currency,
    price: product.price === null ? null : toNumber(product.price),
    discount: product.discount === null ? null : toNumber(product.discount),
    finalPrice:
      product.price === null
        ? null
        : roundMoney(
            toNumber(product.price) -
              (toNumber(product.price) * toNumber(product.discount ?? 0)) / 100,
          ),
    inventoryStatus: product.inventoryStatus,
    averageRating: toNumber(product.averageRating),
    totalReviews: product.totalReviews,
    mainImage,
    isFeatured: featuredProductIds.has(product.id),
    createdAt: product.createdAt,
  };
}

function serializeProductFeature(feature: FeaturedProduct): Record<string, unknown> {
  return {
    productId: feature.productId,
    featured: feature.status === FeaturedPromotionStatus.ACTIVE,
    status: feature.status,
    startAt: feature.startAt,
    endAt: feature.endAt,
  };
}

function serializeStoreFeature(feature: FeaturedStore): Record<string, unknown> {
  return {
    sellerId: feature.sellerId,
    featured: feature.status === FeaturedPromotionStatus.ACTIVE,
    status: feature.status,
    startAt: feature.startAt,
    endAt: feature.endAt,
  };
}

function primaryImageUrl(images?: ProductImage[]): string | null {
  const sorted = [...(images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.find((image) => image.isPrimary)?.url ?? sorted[0]?.url ?? null;
}

function localizedOptionalText(value: string | TranslationMap | null, language: string): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return resolveTranslation(value, language);
}

function displayUserName(user: User): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function normalizeSearchQuery(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, 255) : null;
}

function booleanEntitlement(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return ['true', 'yes', '1', 'enabled'].includes(value.toLowerCase());
  return false;
}

function limitFromEntitlement(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : null;
}

function pagination(page: number, limit: number, total: number): Record<string, number> {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
