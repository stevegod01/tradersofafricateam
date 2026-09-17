# Cancellation, Return & Refund Management (Module 20)

This implementation extends the existing Order, Payment, Delivery, Dispute, Notification, Analytics and Admin permission modules. This repository provides the backend API; client applications consume the endpoints below.

## Data and lifecycle mapping

`orders.id` already identifies one seller's order. Both `orderId` and `sellerOrderId` in these APIs refer to that ID. Checkout and payment records group multiple seller orders. Cancelling or refunding one order does not change its siblings.

The specification's `order_cancellations` is implemented by extending the existing `order_cancellation_requests` table, retaining existing records and endpoints. New records use unique `CAN-<year>-<random>` references; existing records receive `CAN-<uuid>`. Returns and refunds use `RET` and `REF` references. References are collision-resistant identifiers, not sequential counters.

New tables: `returns`, `return_items`, `return_evidence`, `refunds`, `financial_adjustments`, `after_sales_settings`, and `after_sales_events`. Disputes can optionally reference a return. Order status changes and history remain in OrderService. PaymentRefundService owns processing and financial confirmation. No original order totals, payments, accepted RFQ quotes, FX snapshots, or transaction fees are overwritten.

## Deployment

1. Build with `npm run build` and apply migrations with `npm run migration:run` before starting the updated API. In production, supply the production environment to the migration command as in the existing deployment process.
2. Migration `1787520017000-AddAfterSales` adds the tables, cancellation fields, return/dispute link, default policy and permission definitions. Assign permissions to the appropriate existing Admin roles. New financial permissions are **not** automatically granted to all roles; existing super-admin behavior is retained.
3. Review policy using `GET /admin/returns/settings` and `PATCH /admin/returns/settings`.
4. Reuse the existing Azure Blob and Postmark/notification configuration. Optional automatic Paystack refunds use `PAYSTACK_REFUNDS_ENABLED` and `PAYSTACK_SECRET_KEY`. Evidence upload fails explicitly if Azure Blob storage is disabled instead of returning an unpersisted file reference.

The migration deliberately refuses destructive rollback of financial history. Use a reviewed forward migration for production rollback. It does not automatically create refunds for historical cancellations or historical resolved disputes: those require financial reconciliation to avoid refunding money already returned outside this system.

Fresh-install verification also exposed and corrected existing circular entity enum imports, invalid nullable localized Swagger fields, and redundant MODIFY operations before CHANGE in the localization migration. Already-applied migration history is unaffected.

## Policy defaults

| Setting | Default | Effect |
| --- | --- | --- |
| `returnWindowDays` | 7 | From confirmed delivery; shipped goods may also enter the return flow |
| `allowChangedMind` | false | Rejects changed-mind returns unless enabled |
| `refundLogisticsOnCancellation` | false | Logistics requires an explicit policy decision |
| `reverseTransactionFee` | true | Uses the original fee snapshot and proportional reversal |
| `nonReturnableProductIds` | [] | Excludes selected products from returns |

An order-item snapshot with `attributesSnapshot.returnable = false` also prevents return. Return policy is captured when a request is created. Item quantities are validated to three decimal places. Monetary API responses use decimal strings with two decimal places, matching the existing payment schema. Supply decimal strings for exact monetary input.

Buyer and seller cancellation requests require admin review, including RFQ orders, so the reviewer can inspect their locked commercial terms. Cancellation is restricted to pre-shipment orders. Outstanding integrated shipments must first be cancelled through Logistics. Existing active disputes prevent parallel operational decisions. The legacy cancellation approval endpoint rechecks eligibility inside the transaction.

An approved cancellation finalizes the seller order and, if payment was confirmed, creates a **pending** refund. A received return creates a pending refund for the eligible item quantity. An admin may explicitly approve `refundRequired: false` with documented replacement/non-refund terms; receipt then completes that return without creating a refund. Sellers cannot override this financial decision. A resolved dispute authorizing refund/partial refund creates its refund in the same transaction as the resolution. Cancellation/return reaches `completed` only after required financial confirmation.

## API routes

All user routes require an active authenticated user. Ownership is checked against the affected seller order. `GET /refunds` and refund details are buyer-only; cancellation and return reads are available to either participant. Admin reads use the permissions below.

| Method | Path | Purpose / permission |
| --- | --- | --- |
| GET | `/admin/after-sales/analytics` | Rates, gross/net GMV, successful refunds and fee reversals by currency; `analytics.view_revenue` |
| GET | `/orders/:id/after-sales-eligibility` | Backend eligibility, blocked reasons, reasons, deadlines and remaining item quantities |
| POST | `/orders/:sellerOrderId/cancellation` | Buyer request |
| POST | `/seller/orders/:sellerOrderId/cancellation` | Seller request |
| POST | `/admin/orders/:sellerOrderId/cancellation` | Immediate reviewed admin cancellation; `orders.cancel` |
| GET | `/cancellations` and `/cancellations/:id` | Participant cancellation history |
| GET | `/admin/cancellations` and `/admin/cancellations/:id` | `orders.view` |
| PATCH | `/admin/cancellations/:id/respond` | `decision: approve/reject`, notes; `orders.cancel` |
| POST | `/returns/evidence-uploads` | Multipart JPEG, PNG, WebP or PDF, at most 10 MB; returns a `fileId` |
| POST | `/returns` | Buyer return with items and optional evidence IDs |
| GET | `/returns` and `/returns/:id` | Participant return history and evidence |
| PATCH | `/seller/returns/:id/respond` | Seller approval/rejection and notes |
| PATCH | `/returns/:id/shipment` | Buyer carrier/tracking submission |
| PATCH | `/seller/returns/:id/received` | Seller receipt confirmation and refund request |
| PATCH | `/returns/:id/cancel` | Buyer withdrawal before shipment |
| GET | `/admin/returns` and `/admin/returns/:id` | `returns.view` |
| PATCH | `/admin/returns/:id/respond` and `/admin/returns/:id/received` | `returns.manage` |
| GET / PATCH | `/admin/returns/settings` | `returns.view` / `returns.manage` |
| POST | `/admin/refunds` | `refunds.create` |
| PATCH | `/admin/refunds/:id/approve` | `refunds.approve`; never marks money returned |
| PATCH | `/admin/refunds/:id/cancel` | `refunds.approve`; only before any processing attempt |
| POST | `/admin/refunds/:id/process` | `refunds.process` |
| POST | `/admin/refunds/:id/reconcile` | Fetch actual provider outcome without resubmission; `refunds.process` |
| POST | `/admin/refunds/:id/retry` | `refunds.process`; only confirmed failure is retryable |
| PATCH | `/admin/refunds/:id/confirm` | Manual transfer reference and notes; `refunds.confirm` |
| PATCH | `/admin/refunds/:id/fail` | Reconciled manual failure reference and notes; `refunds.confirm` |
| GET | `/refunds` and `/refunds/:id` | Buyer refund history |
| GET | `/admin/refunds` and `/admin/refunds/:id` | `refunds.view`; source, parties, payment, snapshots, adjustments and audit timeline |
| POST | `/payments/refunds/webhooks/:gateway` | Exact raw-body verification by a configured real gateway adapter |

Lists support pagination (`page`, `limit`, maximum 100), status and seller-order filters. Admin refund lists also support search, payment, currency, source/refund type and date range. See the **Cancellation, Returns & Refunds** Swagger group at `/docs` in development for payload and response schemas. Existing `/orders/:orderId/cancellation-request` and admin cancellation-review endpoints delegate into the same workflow.

Example return:

```json
{
  "sellerOrderId": "<order UUID>",
  "reason": "damaged_product",
  "description": "Two cartons arrived damaged.",
  "items": [{ "orderItemId": "<item UUID>", "quantity": "2.000" }],
  "evidence": ["<uploaded file UUID>"]
}
```

Example authorized partial adjustment:

```json
{
  "sellerOrderId": "<order UUID>",
  "sourceType": "admin",
  "refundType": "partial",
  "amount": "200000.00",
  "reason": "Approved financial correction",
  "breakdown": {
    "productAmount": "180000.00",
    "logisticsAmount": "20000.00",
    "otherAmount": "0.00"
  }
}
```

Clients cannot select the payment, currency or FX rate. Source-specific references must belong to the same order and be eligible. `otherAmount` must be zero because existing order snapshots do not establish any collected 'other' charge. Buyer-arranged external logistics is never refundable by this API. Ordinary returns refund the affected product amount; additional collected logistics corrections require a separately authorized admin decision.

## Financial processing and reconciliation

Automatic Paystack refunds are implemented and disabled by default. Set `PAYSTACK_REFUNDS_ENABLED=true` and supply `PAYSTACK_SECRET_KEY` for the integration that received the original payment. Keep the Paystack dashboard webhook pointed at `/payments/webhooks/paystack`; when enabled, this endpoint verifies exact-body signatures and dispatches both payment and refund events. The dedicated `/payments/refunds/webhooks/paystack` endpoint also accepts refund callbacks. Successful refund events are verified against the Paystack Fetch Refund API and the original transaction reference. Existing gateway payment initialization remains a placeholder and must supply a real original provider reference for live refunds.

Other providers use the manual Payment-module workflow until their real adapters are registered with `registerRefundGateway`. Process, carry out the actual refund through the original bank/provider, then confirm its reference. Approval or processing alone never means success.

The adapter contract uses the refund UUID as the stable correlation key, submits against the original payment reference, and verifies exact webhook bytes. The durable processing claim prevents duplicate submissions. Paystack does not document an idempotency key for Create Refund, so this adapter explicitly disables automatic POST retries; ambiguous or failed outcomes require reconciliation. Unconfigured webhook providers return 404. Verified receipts must match refund, gateway, amount, currency and provider reference. An adapter must only produce successful receipts after actual financial confirmation. Paystack credentials and an end-to-end test in your provider test account are required before enabling it in production. Its adapter has been tested with mocked HTTP responses and signed payloads, not live money movement. Other gateways require provider-specific adapters.

A timeout leaves the refund `processing` because money movement is uncertain. Repeating `/process` does not submit again. Reconcile the original refund UUID with the provider; do not create a second refund. `/admin/refunds/:id/reconcile` can fetch the stored reference, or accept `{ "reference": "<provider refund ID>" }` after a submission timeout. It only applies a final outcome after validating the provider record against this refund and original payment. `failed` refunds continue reserving their amount, and retries retain audit history. Cancellation of a refund is permitted only before its first processing attempt. A cancelled source-linked refund remains in history; any replacement is an explicit authorized admin adjustment.

Order and payment row locks plus current transactional reads enforce both seller allocation and shared-payment caps. A source can create only one refund. Unique adjustment and provider-reference indexes prevent duplicate financial entries. Concurrent confirmations are idempotent. Successful refunds create separate refund debits and proportional fee reversals in the original fee currency. Reporting uses locked payment allocations and original fee snapshots, never current FX.

## Events, analytics and operational notes

Business events, actor identity and analytics entries are committed atomically. `after_sales_events` also acts as the notification outbox. The application drains it every ten seconds, using database locks across replicas. In-app delivery is deduplicated. Email is at-least-once: a crash after sending but before acknowledgement can resend an email. Undelivered events remain available for retry; operational monitoring should watch their age.

Existing NotificationService delivers participant alerts. Financial confirmation notes and provider references are not included in buyer notification text. The order cancellation event is also forwarded to existing Order listeners after commit. Centralized admin audit entries are retained alongside the durable per-workflow timeline; there is no separate Module 21 implementation in this repository yet.

Seller sales and admin revenue analytics consume successful refunds and fee reversals, expose original gross values separately, and derive net values without changing historical GMV. After-sales aggregates use the existing order creation-date cohort and separate currencies. Cancellation counts distinguish initiator, and return counts distinguish status. These records do not automatically penalize seller performance or imply seller fault.

## Validation

- `npm run test:after-sales`: exact arithmetic, capacity/quantity checks, Swagger/app startup, entity metadata and unauthenticated API rejection.
- `AFTER_SALES_TEST_SOCKET=/tmp/tofa-after-sales-mysql-<directory>/mysql.sock npm run test:after-sales:mysql`: fresh migration chain and transactional regression tests against an isolated MySQL server with networking disabled. The test creates and removes its own uniquely named database; it refuses non-test socket paths and never reads development/production credentials.

The MySQL suite covers concurrent cancellations and refunds, shared-payment limits, duplicate confirmations, immutable FX/fee history, return ownership/quantity/window/evidence validation, manual failures and retries, dispute resolution, gateway timeout handling and private refund reads.

Paystack integration references: [Refund API](https://paystack.com/docs/api/refund/) and [webhook signature verification](https://paystack.com/docs/payments/webhooks/).
