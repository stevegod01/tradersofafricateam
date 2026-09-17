import { Brackets, SelectQueryBuilder } from 'typeorm';
import { Product } from '../../database/entities/product.entity';
import type { ProductQuery } from './product.service';
/** Shared catalog filters; callers supply p, pc, category and seller aliases. */
export function applyProductFilters(qb: SelectQueryBuilder<Product>, query: ProductQuery): void {
    const search = query.search?.toLowerCase();
    const categoryIds = Array.from(new Set([...(query.categoryIds ?? []), ...(query.categoryId ? [query.categoryId] : [])]));
    if (categoryIds.length > 0) {
        qb.andWhere('pc.categoryId IN (:...categoryIds)', { categoryIds });
    }
    if (query.sellerId)
        qb.andWhere('p.sellerId = :sellerId', { sellerId: query.sellerId });
    if (query.countryOfOrigin) {
        qb.andWhere('LOWER(p.countryOfOrigin) = :countryOfOrigin', {
            countryOfOrigin: query.countryOfOrigin.toLowerCase(),
        });
    }
    if (query.currency)
        qb.andWhere('p.currency = :currency', { currency: query.currency });
    if (query.minPrice !== undefined)
        qb.andWhere('p.price >= :minPrice', { minPrice: query.minPrice });
    if (query.maxPrice !== undefined)
        qb.andWhere('p.price <= :maxPrice', { maxPrice: query.maxPrice });
    if (query.minRating !== undefined) {
        qb.andWhere('p.averageRating >= :minRating', { minRating: query.minRating });
    }
    if (query.inventoryStatus) {
        qb.andWhere('p.inventoryStatus = :inventoryStatus', {
            inventoryStatus: query.inventoryStatus,
        });
    }
    if (query.hasDiscount !== undefined) {
        if (query.hasDiscount) {
            qb.andWhere('p.discount IS NOT NULL AND p.discount > 0');
        }
        else {
            qb.andWhere('(p.discount IS NULL OR p.discount = 0)');
        }
    }
    if (search) {
        qb.andWhere(new Brackets((searchQb) => {
            searchQb
                .where('LOWER(CAST(p.productName AS CHAR)) LIKE :search', {
                search: `%${search}%`,
            })
                .orWhere('LOWER(CAST(p.productDescription AS CHAR)) LIKE :search', {
                search: `%${search}%`,
            })
                .orWhere('LOWER(CAST(category.name AS CHAR)) LIKE :search', {
                search: `%${search}%`,
            })
                .orWhere('LOWER(seller.storeName) LIKE :search', { search: `%${search}%` })
                .orWhere('LOWER(seller.companyName) LIKE :search', {
                search: `%${search}%`,
            })
                .orWhere('LOWER(p.countryOfOrigin) LIKE :search', {
                search: `%${search}%`,
            })
                .orWhere('EXISTS (SELECT 1 FROM product_variants sv WHERE sv.productId = p.id AND LOWER(sv.sku) LIKE :search)', { search: `%${search}%` });
        }));
    }
}
