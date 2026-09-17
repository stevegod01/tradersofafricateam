import { FastifyInstance } from 'fastify';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { SavedProductService } from './saved-product.service';
import { SavedProductInput, SavedProductBulkInput, SavedProductQuery } from './saved-product.schemas';
import { SaveProductSwagger, SavedProductStatusSwagger, RemoveSavedProductSwagger, SavedCountSwagger, ClearSavedProductsSwagger, BulkRemoveSavedProductsSwagger, GetSavedProductsSwagger } from './saved-product.swagger';
import { I18nService } from '../i18n/i18n.service';
export async function savedProductRoutes(app: FastifyInstance): Promise<void> {
    const service = new SavedProductService();
    app.addHook('onRequest', async (_req, reply) => { reply.header('Cache-Control', 'private, no-store'); });
    app.post('/saved-products', { schema: SaveProductSwagger, preHandler: requireAuth }, req => service.save(req.dbUser!.id, SavedProductInput.parse(req.body).productId));
    app.get('/saved-products', { schema: GetSavedProductsSwagger, preHandler: requireAuth }, async (req) => service.list(req.dbUser!.id, SavedProductQuery.parse(req.query), await new I18nService().resolveRequestLanguage(req, req.dbUser)));
    app.get('/saved-products/count', { schema: SavedCountSwagger, preHandler: requireAuth }, req => service.count(req.dbUser!.id));
    app.get('/saved-products/:productId/status', { schema: SavedProductStatusSwagger, preHandler: requireAuth }, req => service.status(req.dbUser!.id, SavedProductInput.parse(req.params).productId));
    app.delete('/saved-products/bulk', { schema: BulkRemoveSavedProductsSwagger, preHandler: requireAuth }, async (req) => {
        await service.remove(req.dbUser!.id, SavedProductBulkInput.parse(req.body).productIds);
        return { success: true, message: 'Selected products removed from saved items.' };
    });
    app.delete('/saved-products/:productId', { schema: RemoveSavedProductSwagger, preHandler: requireAuth }, async (req) => {
        const { productId } = SavedProductInput.parse(req.params);
        await service.remove(req.dbUser!.id, [productId]);
        return { success: true, message: 'Product removed from saved items.', data: { productId, isSaved: false } };
    });
    app.delete('/saved-products', { schema: ClearSavedProductsSwagger, preHandler: requireAuth }, async (req) => {
        await service.remove(req.dbUser!.id);
        return { success: true, message: 'All saved products have been removed.' };
    });
}
