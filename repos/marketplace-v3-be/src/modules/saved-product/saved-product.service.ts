import { databaseErrorCode } from '../../common/utils/database-error.util';
import { EntityManager, In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { SavedProduct } from '../../database/entities/saved-product.entity';
import { Product, ProductStatus, InventoryStatus } from '../../database/entities/product.entity';
import { User, UserStatus } from '../../database/entities/user.entity';
import { CategoryStatus } from '../../database/entities/category.entity';
import { AnalyticsEvent } from '../../database/entities/analytics-event.entity';
import { applyProductFilters } from '../product/product.filters';
import { applyProductVisibility } from '../product/product.visibility';
import { resolveTranslation } from '../../common/utils/i18n.util';
import { toNumber, calculateFinalPrice, roundMoney } from '../../common/utils/pricing.util';
import { createError } from '../../common/utils/http-error.util';
import { SavedQuery } from './saved-product.schemas';
export class SavedProductService {
    private async mutate(work: (manager: EntityManager) => Promise<void>): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await AppDataSource.transaction(work);
                return;
            }
            catch (error) {
                if (attempt === 2 || !['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(databaseErrorCode(error) ?? ''))
                    throw error;
            }
        }
    }
    private async lockOwner(manager: EntityManager, userId: string): Promise<void> {
        const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
        if (!user || user.status !== UserStatus.ACTIVE)
            throw createError.forbidden('Account cannot perform actions');
    }
    private catalog(manager: EntityManager, includeUnavailable: boolean) {
        const qb = manager.getRepository(Product).createQueryBuilder('p')
            .innerJoinAndSelect('p.seller', 'seller')
            .leftJoinAndSelect('p.images', 'images')
            .leftJoin('p.productCategories', 'pc')
            .leftJoin('pc.category', 'category', 'category.status = :activeCategoryStatus AND category.deletedAt IS NULL', { activeCategoryStatus: CategoryStatus.ACTIVE });
        applyProductVisibility(qb, includeUnavailable);
        return qb;
    }
    private owned(userId: string) {
        return this.catalog(AppDataSource.manager, true)
            .innerJoin(SavedProduct, 'saved', 'saved.productId = p.id AND saved.userId = :ownerId', { ownerId: userId });
    }
    private async event(manager: EntityManager, row: SavedProduct, eventName: 'PRODUCT_SAVED' | 'PRODUCT_UNSAVED') {
        // No private owner identity is included in engagement analytics.
        await manager.save(AnalyticsEvent, manager.create(AnalyticsEvent, {
            sourceModule: 'saved_products', eventName, sourceEventId: row.id, entityType: 'product', entityId: row.productId, actorId: null, payload: { productId: row.productId }
        }));
    }
    async save(userId: string, productId: string) {
        await this.mutate(async (manager) => {
            await this.lockOwner(manager, userId);
            const product = await this.catalog(manager, false).andWhere('p.id = :productId', { productId }).setLock('pessimistic_read').getOne();
            if (!product)
                throw createError.notFound('Product not found');
            const existing = await manager.findOne(SavedProduct, { where: { userId, productId }, lock: { mode: 'pessimistic_write' } });
            if (existing)
                return;
            const row = await manager.save(SavedProduct, manager.create(SavedProduct, { userId, productId }));
            await this.event(manager, row, 'PRODUCT_SAVED');
        });
        return { success: true, message: 'Product saved successfully.', data: { productId, isSaved: true } };
    }
    async remove(userId: string, productIds?: string[]): Promise<void> {
        await this.mutate(async (manager) => {
            await this.lockOwner(manager, userId);
            // Bounded batches keep clear-all from loading an unbounded wishlist into memory.
            for (;;) {
                const rows = await manager.find(SavedProduct, {
                    where: { userId, ...(productIds ? { productId: In(productIds) } : {}) }, order: { id: 'ASC' }, take: 100, lock: { mode: 'pessimistic_write' }
                });
                if (!rows.length)
                    break;
                await manager.delete(SavedProduct, { userId, id: In(rows.map(row => row.id)) });
                for (const row of rows)
                    await this.event(manager, row, 'PRODUCT_UNSAVED');
                if (productIds)
                    break;
            }
        });
    }
    async status(userId: string, productId: string) {
        const product = await this.owned(userId).andWhere('p.id = :productId', { productId }).getOne();
        return { success: true, data: { productId, isSaved: !!product } };
    }
    async count(userId: string) {
        return { success: true, data: { count: await this.owned(userId).getCount() } };
    }
    async list(userId: string, query: SavedQuery, language: string) {
        const qb = this.owned(userId);
        applyProductFilters(qb, {
            ...query, sortBy: undefined, inventoryStatus: query.availability === 'in_stock' || query.availability === 'out_of_stock' ? query.availability as InventoryStatus : undefined
        });
        if (query.availability === 'available')
            qb.andWhere('p.status = :availableStatus AND p.inventoryStatus = :availableInventory', { availableStatus: ProductStatus.ACTIVE, availableInventory: InventoryStatus.IN_STOCK });
        if (query.availability === 'unavailable')
            qb.andWhere('(p.status <> :availableStatus OR p.inventoryStatus = :unavailableInventory)', { availableStatus: ProductStatus.ACTIVE, unavailableInventory: InventoryStatus.OUT_OF_STOCK });
        qb.addSelect(['saved.createdAt', 'saved.id']);
        if (query.sortBy === 'price_low_to_high' || query.sortBy === 'price_high_to_low')
            qb.orderBy('p.price', query.sortBy === 'price_low_to_high' ? 'ASC' : 'DESC');
        else if (query.sortBy === 'highest_rating')
            qb.orderBy('p.averageRating', 'DESC');
        else
            qb.orderBy('saved.createdAt', query.sortBy === 'oldest' ? 'ASC' : 'DESC');
        qb.addOrderBy('saved.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
        const [products, total] = await qb.getManyAndCount();
        const rows = products.length ? await AppDataSource.manager.findBy(SavedProduct, { userId, productId: In(products.map(p => p.id)) }) : [];
        const byProduct = new Map(rows.map(row => [row.productId, row]));
        const data = products.flatMap(product => {
            const saved = byProduct.get(product.id);
            if (!saved)
                return [];
            const image = [...(product.images ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))[0];
            const available = product.status === ProductStatus.ACTIVE && product.inventoryStatus === InventoryStatus.IN_STOCK;
            return [{
                    id: saved.id, savedAt: saved.createdAt, product: {
                        id: product.id, name: resolveTranslation(product.productName, language, product.sourceLanguage), productType: product.productType,
                        price: product.price === null ? null : toNumber(product.price), finalPrice: product.price === null ? null : roundMoney(calculateFinalPrice(product.price, product.discount)), currency: product.currency,
                        origin: product.countryOfOrigin, status: product.status, inventoryStatus: product.inventoryStatus, isSaved: true, isAvailable: available,
                        availabilityLabel: product.status !== ProductStatus.ACTIVE ? 'Currently unavailable' : product.inventoryStatus === InventoryStatus.OUT_OF_STOCK ? 'Out of Stock' : 'Available',
                        primaryImage: image ? { url: image.url } : null, seller: { id: product.seller.id, storeName: product.seller.storeName }, rating: { average: toNumber(product.averageRating), count: product.totalReviews }
                    }
                }];
        });
        return {
            success: true, data, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) }
        };
    }
}
