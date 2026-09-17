import { In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { SavedProduct } from '../../database/entities/saved-product.entity';
/** Optional retention job for terminally deleted accounts/products; no public/admin wishlist access. */
export async function cleanupDeletedSavedProducts(): Promise<number> {
    let removed = 0;
    for (;;) {
        const rows: {
            id: string;
        }[] = await AppDataSource.manager.query(`SELECT s.id FROM saved_products s
      JOIN users u ON u.id=s.userId JOIN products p ON p.id=s.productId
      WHERE u.status='deleted' OR p.status='deleted' OR p.deletedAt IS NOT NULL LIMIT 500`);
        if (!rows.length)
            return removed;
        const result = await AppDataSource.manager.delete(SavedProduct, { id: In(rows.map(row => row.id)) });
        removed += result.affected ?? 0;
    }
}
if (require.main === module) {
    (async () => {
        try {
            await AppDataSource.initialize();
            console.log(`Removed ${await cleanupDeletedSavedProducts()} deleted saved-product relationships.`);
        }
        finally {
            if (AppDataSource.isInitialized)
                await AppDataSource.destroy();
        }
    })().catch(err => { console.error('Saved-product cleanup failed:', err); process.exitCode = 1; });
}
