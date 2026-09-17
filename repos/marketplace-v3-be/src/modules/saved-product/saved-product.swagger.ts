const uuid = { type: 'string', format: 'uuid' };
const string = { type: 'string' };
const integer = { type: 'integer' };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });
const state = object({ productId: uuid, isSaved: { type: 'boolean' } }, ['productId', 'isSaved']);
const product = object({
    id: uuid, name: string, productType: { type: 'string', enum: ['simple', 'variable'] }, price: { type: 'number', nullable: true }, finalPrice: { type: 'number', nullable: true }, currency: string, origin: string, status: { type: 'string', enum: ['active', 'inactive', 'archived'] }, inventoryStatus: { type: 'string', enum: ['in_stock', 'out_of_stock'] }, isSaved: { type: 'boolean' }, isAvailable: {
        type: 'boolean', description: 'Display hint only; cart and RFQ validate current eligibility, quantity and selected variant.'
    }, availabilityLabel: string, primaryImage: { ...object({ url: { type: 'string', format: 'uri' } }), nullable: true }, seller: object({ id: uuid, storeName: { type: 'string', nullable: true } }), rating: object({ average: { type: 'number' }, count: integer })
});
const response = (data?: unknown) => object({
    success: { type: 'boolean' }, message: string, ...(data ? { data } : {}), pagination: object({ page: integer, limit: integer, total: integer, totalPages: integer })
}, ['success']);
const errors = Object.fromEntries([400, 401, 403, 404, 409].map(code => [code, { type: 'object', additionalProperties: true }]));
const base = {
    tags: ['Saved Products'], security: [{ bearerAuth: [] }], description: 'Private to the authenticated user. Buyers and sellers may save products. Saving does not lock prices, reserve inventory or create a cart/RFQ/order.'
};
export const SaveProductSwagger = {
    ...base, summary: 'Save a product (idempotent)', body: { ...object({ productId: uuid }, ['productId']), additionalProperties: false }, response: { 200: response(state), ...errors }
};
export const SavedProductParams = {
    type: 'object', required: ['productId'], additionalProperties: false, properties: { productId: uuid }
};
export const SavedProductStatusSwagger = {
    ...base, summary: 'Check saved product state', params: SavedProductParams, response: { 200: response(state), ...errors }
};
export const RemoveSavedProductSwagger = { ...SavedProductStatusSwagger, summary: 'Remove a saved product (idempotent)' };
export const SavedCountSwagger = {
    ...base, summary: 'Count visible saved products', response: { 200: response(object({ count: integer }, ['count'])), ...errors }
};
export const ClearSavedProductsSwagger = {
    ...base, summary: 'Remove all saved products', description: 'Frontend should ask for confirmation before calling. Includes hidden saved relationships.', response: { 200: response(), ...errors }
};
export const BulkRemoveSavedProductsSwagger = {
    ...base, summary: 'Remove selected saved products', body: {
        ...object({ productIds: { type: 'array', minItems: 1, maxItems: 100, items: uuid } }, ['productIds']), additionalProperties: false
    }, response: { 200: response(), ...errors }
};
export const GetSavedProductsSwagger = {
    ...base, summary: 'List saved products with current product data', querystring: {
        type: 'object', additionalProperties: false, properties: {
            page: { type: 'integer', minimum: 1, maximum: 100000, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, search: { type: 'string', minLength: 1, maxLength: 120 }, categoryId: uuid, sellerId: uuid, countryOfOrigin: { type: 'string', minLength: 2, maxLength: 100 }, currency: { type: 'string', minLength: 3, maxLength: 3 }, minPrice: { type: 'number', minimum: 0 }, maxPrice: { type: 'number', minimum: 0 }, availability: { type: 'string', enum: ['available', 'unavailable', 'in_stock', 'out_of_stock'] }, sortBy: {
                type: 'string', enum: ['newest', 'oldest', 'price_low_to_high', 'price_high_to_low', 'highest_rating'], default: 'newest'
            }, lang: { type: 'string', maxLength: 20 }
        }
    }, description: `${base.description} Price filters and price sorting require currency. Newest/oldest refer to date saved. Inactive/archived items remain visible as unavailable; deleted/draft items and ineligible sellers/categories are hidden. Variable products are saved at product level; their price may be null.`, response: {
        200: response({
            type: 'array', items: object({ id: uuid, savedAt: { type: 'string', format: 'date-time' }, product }, ['id', 'savedAt', 'product'])
        }), ...errors
    }
};
