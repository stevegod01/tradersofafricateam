import { SelectQueryBuilder } from 'typeorm';
import { Product, ProductStatus } from '../../database/entities/product.entity';
import { UserStatus } from '../../database/entities/user.entity';
import { CategoryStatus } from '../../database/entities/category.entity';
import { activeCategoryExistsExpression } from '../search/search.service';
/** Catalog visibility shared by public products and saved products (aliases p and seller). */
export function applyProductVisibility(qb: SelectQueryBuilder<Product>, includeUnavailable = false): void {
    qb.andWhere('p.status IN (:...visibleProductStatuses)', {
        visibleProductStatuses: includeUnavailable ? [ProductStatus.ACTIVE, ProductStatus.INACTIVE, ProductStatus.ARCHIVED] : [ProductStatus.ACTIVE]
    })
        .andWhere('p.deletedAt IS NULL')
        .andWhere('seller.status = :visibleSellerStatus', { visibleSellerStatus: UserStatus.ACTIVE })
        .andWhere('seller.isCompanyVerified = :visibleSellerVerified', { visibleSellerVerified: true })
        .andWhere(activeCategoryExistsExpression('p.id'), { activeCategoryStatus: CategoryStatus.ACTIVE });
}
