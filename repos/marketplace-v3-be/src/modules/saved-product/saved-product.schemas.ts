import { z } from 'zod';
import { ProductQuerySchema } from '../../common/utils/validation.schemas';
export const SavedProductInput = z.object({ productId: z.string().uuid() }).strict();
export const SavedProductBulkInput = z.object({ productIds: z.array(z.string().uuid()).min(1).max(100).transform(ids => [...new Set(ids)]) }).strict();
export const SavedProductQuery = ProductQuerySchema.innerType().innerType().pick({
    page: true, limit: true, search: true, categoryId: true, sellerId: true, countryOfOrigin: true, minPrice: true, maxPrice: true, currency: true, lang: true
}).extend({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    availability: z.enum(['available', 'unavailable', 'in_stock', 'out_of_stock']).optional(),
    sortBy: z.enum(['newest', 'oldest', 'price_low_to_high', 'price_high_to_low', 'highest_rating']).default('newest'),
}).strict().refine(q => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, { message: 'minPrice must not exceed maxPrice', path: ['minPrice'] })
    .refine(q => (q.minPrice === undefined && q.maxPrice === undefined) || !!q.currency, { message: 'currency is required with price filters', path: ['currency'] })
    .refine(q => !q.sortBy.startsWith('price_') || !!q.currency, { message: 'currency is required for price sorting', path: ['currency'] });
export type SavedQuery = z.infer<typeof SavedProductQuery>;
