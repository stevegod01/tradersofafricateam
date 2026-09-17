import { In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { SavedProduct } from '../../database/entities/saved-product.entity';
/** One lookup per page, never one request/query per product. Anonymous results stay unpersonalized. */
export async function savedProductIds(userId: string | null, productIds: string[]): Promise<Set<string>> {
    if (!userId || !productIds.length)
        return new Set();
    const rows = await AppDataSource.manager.find(SavedProduct, { where: { userId, productId: In(productIds) }, select: ['productId'] });
    return new Set(rows.map(row => row.productId));
}
