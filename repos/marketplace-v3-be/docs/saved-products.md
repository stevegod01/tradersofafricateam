# Saved products (module 24)

Saved Products is the user-facing wishlist feature. Authenticated, active buyers **and sellers** can save a product once. A save is a private preference: it does not reserve inventory, lock prices, create orders, add items to cart, create RFQs, or earn reward points.

## Deployment

Run `npm run build` and apply migration `1787520021000-AddSavedProducts` with `npm run migration:run` before deploying the new API. It adds `saved_products` with a unique `(userId, productId)` constraint, owner/date and product indexes, and cascading foreign keys for hard-deleted users/products. Reverting this migration removes saved relationships, not products or financial history.

No new environment variables or secrets are needed. The existing authentication, database, language resolution and API rate limits apply. No emails, alerts, new notification preferences, or admin wishlist CRUD endpoints are introduced.

## User endpoints

All saved-product endpoints require a user JWT, derive ownership exclusively from authentication, and use `Cache-Control: private, no-store`. Admin tokens cannot access private lists.

| Method | Endpoint | Input / behavior |
|---|---|---|
| POST | `/saved-products` | `{ "productId": "uuid" }`; idempotent save, HTTP 200 |
| DELETE | `/saved-products/:productId` | Idempotent removal; missing relationships are successful |
| GET | `/saved-products` | Paginated current product summaries |
| GET | `/saved-products/:productId/status` | `{ success: true, data: { productId, isSaved } }` |
| GET | `/saved-products/count` | Count of currently visible saved products |
| DELETE | `/saved-products/bulk` | `{ "productIds": ["uuid"] }`; 1–100 input IDs; duplicates collapsed |
| DELETE | `/saved-products` | Clear all relationships, including hidden products; frontend confirms first |

Save response:

```json
{
  "success": true,
  "message": "Product saved successfully.",
  "data": { "productId": "00000000-0000-4000-8000-000000000001", "isSaved": true }
}
```

Invalid UUIDs/filters return 400; missing or invalid authentication returns 401; inactive user accounts return 403. New saves of nonexistent, draft, inactive, archived, deleted, category-hidden or seller-restricted products return 404. An already-saved product is still checked for current save eligibility on a repeated POST. Removal never requires the product to remain visible.

The status endpoint returns false for missing or hidden products without disclosing restricted product details. It returns true for saved inactive/archived products that remain visible under seller/category rules. Count uses the same visibility conditions as an unfiltered saved list, so navigation counts align with the list. Relationships hidden by restrictions can reappear when visibility returns.

## Current product data and availability

The list joins the current product, images and seller data. It returns `id`, `savedAt`, and a product summary containing `id`, localized `name`, `productType`, `price`, `finalPrice`, `currency`, `origin`, `status`, `inventoryStatus`, `isSaved`, `isAvailable`, `availabilityLabel`, `primaryImage`, `seller` and `rating`.

There is no product slug field in the existing product model, so the API does not invent one. Use the normal product-ID route. Variable products are saved at product level, without `variantId`; their base price may be null. The user selects a current variant on the normal product page.

| Current state | Saved-list behavior |
|---|---|
| Active and in stock | Visible, `Available` |
| Active and out of stock | Remains saved and visible, `Out of Stock` |
| Inactive or archived | Visible, `Currently unavailable` |
| Draft, deleted, or `deletedAt` set | Hidden |
| Seller inactive/disabled/deleted or unverified | Hidden |
| No eligible active category | Hidden |

Visibility uses the same shared eligibility function as public product list/detail APIs. Saved lists deliberately retain out-of-stock items even when public discovery is configured to hide them. `isAvailable` is a display hint, not purchase authorization. Cart and Direct RFQ continue to enforce their existing seller, product, price, variant, quantity and inventory checks.

Filters reuse the existing catalog filter implementation: `search`, `categoryId`, `sellerId`, `countryOfOrigin`, `minPrice`, `maxPrice`, `currency`. Language is resolved using existing request/user preferences and optional `lang`.

Additional list controls:

- `availability`: `available`, `unavailable`, `in_stock`, `out_of_stock`. Unavailable includes inactive/archived and out-of-stock items; inventory-only filters inspect stock regardless of active/inactive status.
- `sortBy`: `newest` (default), `oldest`, `price_low_to_high`, `price_high_to_low`, `highest_rating`. Newest/oldest mean date saved; ties have stable ID ordering.
- `page`: default 1, maximum 100,000; `limit`: default 20, maximum 100.
- Price filtering and sorting require `currency`, so unrelated currencies are not compared. Price filters use current base prices, consistent with product search; variable products without base prices are not matched by numeric price ranges.

## Product-page and analytics integration

Authenticated public product list and detail responses include `isSaved`. Lists load saved IDs in one batch, avoiding one lookup per product. Anonymous responses omit this field. Personalized responses are marked private/non-cacheable, and `Vary: Authorization` is appended without discarding existing variation headers. The product response Swagger schemas preserve the actual product payload and document saved state.

Seller product analytics now includes `savedCount`, a **current** aggregate independent of report date range; deleted accounts are excluded. Existing seller analytics permission/subscription checks remain in place. No saver identities or private lists are exposed. Saves do not alter conversion, purchase, RFQ or inventory metrics, and do not modify search ranking.

Real transitions emit durable `PRODUCT_SAVED` and `PRODUCT_UNSAVED` analytics events in the mutation transaction. Repeated no-op requests emit no duplicate engagement events. Events contain product identity, not saver identity. They do not create central audit entries, notifications or emails. User-row locking serializes save/remove/clear operations; the database unique constraint independently prevents duplicate saves. Event-write failure rolls back the preference mutation.

## Retention

Hard deletion cascades remove saved relationships. Soft-deleted accounts cannot access them, and deleted products are hidden immediately. Optional maintenance:

```sh
npm run saved-products:cleanup
```

This command removes relationships belonging to soft-deleted users or deleted products in batches of 500. Schedule it according to the platform retention policy; no timer is started by this module. Inactive, archived and out-of-stock products are retained. Cleanup does not claim a user-initiated unsave event.

## Frontend checklist

Use `isSaved` to render save icons on catalog/detail pages. Prompt anonymous visitors to sign in, return to the product, then call save. Show the API success messages as toasts. Confirm before clear-all. Use the existing cart and Direct RFQ endpoints for subsequent actions, and disable those actions when a saved item is unavailable. Saving itself sends no email.

## Tests

- `npm run test:saved-products`: validation, limits, anonymous lookup behavior, authenticated routes and Swagger.
- `SAVED_PRODUCTS_TEST_SOCKET=/tmp/tofa-saved-products-mysql-XXXXXX/mysql.sock npm run test:saved-products:mysql`: isolated MySQL migration, concurrent idempotency, owner isolation, buyer/seller access, live prices/stock, unavailable states, filters/pagination, product-response integration, analytics, rollback, removal and deletion cleanup. The suite uses a temporary database and test credentials only; without an isolated socket it is skipped.
