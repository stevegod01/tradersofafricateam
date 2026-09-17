# System Settings & Marketplace Configuration (Module 22)

Run `npm run build` and `npm run migration:run` before deploying this API version. Migration `1787520019000` creates `system_settings`, `countries`, `currencies`, and `payment_method_configs`, seeds the closed setting registry, and adds settings permissions. It preserves the existing database return window and default language and copies configured payment providers into availability records. It does not change financial history, credentials, or deployment environment files.

## Configuration ownership

The settings registry supplies validated operational policy. Payment providers, subscription plans, entitlements, language translations, disputes, returns, refunds and delivery workflows remain in their existing modules. Each setting has a stable key, category, type, visibility, editability, description, required permission and scope. Clients cannot create arbitrary keys or change visibility/editability through the API. Unknown keys and unsupported values are rejected.

Secrets remain in the existing environment/secret-management infrastructure. No endpoint stores gateway keys, webhook secrets, database passwords or cloud credentials. Public configuration is explicitly assembled from safe fields; marking an unrelated database row public cannot expose it.

Reads go directly to the database. There is no process-local settings cache to invalidate, so subsequent operations on every replica see committed updates. Financial snapshots, accepted quote versions, completed payments, refunds, and audit-export expiry timestamps are not recalculated. New return requests capture the current return policy in their existing snapshot. Changes to return/dispute windows govern new requests, including requests against an existing order; already created cases keep their state.

## API

Swagger exposes the new endpoints under **System Settings**. Existing language endpoints remain under their current tag.

| Endpoint | Permission |
| --- | --- |
| GET `/config` | Public; safe marketplace, country, currency, language and policy fields only |
| GET `/countries` | Public; active entries only |
| GET `/currencies` | Public; active entries only |
| GET `/admin/settings` | `settings.view` |
| GET `/admin/settings/:key` | `settings.view` |
| PATCH `/admin/settings/:key` | Key-specific permission; see below |
| GET, POST `/admin/countries` | `settings.countries.manage` |
| PATCH `/admin/countries/:id` and `/:id/status` | `settings.countries.manage` |
| GET, POST `/admin/currencies` | `settings.currencies.manage` |
| PATCH `/admin/currencies/:id` and `/:id/status` | `settings.currencies.manage` |
| GET, POST `/admin/payment-methods` | `settings.payment_methods.manage` |
| PATCH `/admin/payment-methods/:id` and `/:id/status` | `settings.payment_methods.manage` |
| Existing language create/update/status/default endpoints | `settings.languages.manage` |

List settings with `category`, `search`, `page`, and `limit` (maximum 100). Responses include `requiredPermission`, `scope`, and available validation bounds. Send native JSON types:

```json
{"value":14}
```

For currency-specific payout thresholds:

```json
{"value":{"NGN":5000,"USD":10}}
```

Most changes require `settings.update`. Settlement settings require `settings.settlement.manage`; payout settings require `settings.payout.manage`. Default country/currency/language settings require their respective catalogue-management permission. Security and refund policies additionally require Super Admin. Super Admin does not bypass value validation or read-only safety policies.

Existing `languages.manage` assignments are migrated to `settings.languages.manage`. Existing read permissions on the language listing remain unchanged. The legacy return-policy update endpoint now requires `settings.update` and delegates return-window changes to the central setting, avoiding two independent values.

High-impact clients should display the old value, proposed value and returned scope and ask the admin to confirm before submitting. No frontend application exists in this repository; enforcement and documentation are implemented in the API.

## Integrated policies

- `returnWindowDays`, `maximumReturnEvidenceFiles`: return eligibility/evidence. Existing return snapshots remain intact.
- `disputeWindowDays`, `maximumDisputeEvidenceFiles`: new dispute eligibility and evidence capacity.
- `maxLoginAttempts` (3–10), `loginLockMinutes` (15–1440), user/admin OTP lifetimes and admin invitation expiry: authentication and account setup. Existing issued token and lock expiry timestamps remain unchanged.
- `defaultQuoteValidityDays`: expiry of newly created direct RFQs. Explicit quote terms remain owned by RFQ negotiation.
- `maximumMarketRFQResponses`: concurrency-safe global cap for new seller quotations; zero disables the global cap. Subscription-specific limits still apply.
- Delivery switches: validated when selecting delivery and again when preparing new checkout. At least one method must remain enabled. Existing shipments are not cancelled.
- Country status: checked when creating addresses and selecting an address for new checkout; existing address and order records are retained.
- Currency status: checked for new product currency selections, quote versions, checkout and payment initiation. Deactivation never converts or deletes historical records.
- Payment method availability: checkout discovery, selection, and payment initiation use the same availability logic. It intersects admin configuration with the provider's existing currencies, context, status, buyer-country requirements and bank-account availability. An admin cannot create a new working gateway merely by adding a configuration record.
- `defaultFreePlanId`: optional active free plan used for future default plan selection, subject to audience and existing subscription rules. Plan-specific fees/entitlements remain in plans.
- Upload MIME/size policies: global limits applied by the shared upload function, with any stricter module limits retained. Defaults permit JPEG/PNG/WebP images and PDF documents; review existing attachment needs before rollout. The multipart transport ceiling still applies.
- `refundNotificationEnabled`: controls delivery of refund notifications, independently of audit and analytics records.
- `auditExportExpiryMinutes`: expiry of newly queued audit exports. Existing exports retain their original expiry. `auditLogRetentionDays` is an archive-policy value; it does not enable automatic deletion.

## Catalogue and historical safety

Country, currency and payment-method codes are immutable after creation. Deactivate obsolete entries instead of renaming codes or deleting records. Default country, currency and language must remain active; select a replacement default first. Default changes and deactivations share a database lock to prevent races.

Currency precision is fixed at two decimal places because the current marketplace ledgers use two-decimal arithmetic. Other precision is rejected rather than allowing accounting configuration that the application cannot safely process. Expanding precision requires a separate financial-model migration.

Currency payout maps accept only active supported codes and bounded non-negative amounts with at most two decimal places. Settings updates, catalogue mutations and their central audit records commit together; audit failure rolls back the change. Audit records preserve validated scalar, array and object setting values without exposing arbitrary payloads.

## Reserved financial and optional features

Module 25 settlement/payout lifecycle is not present in this repository. Module 22 stores its safe operational policy without inventing payout processing. Defaults include a two-day hold, processing enabled, verified seller/account requirements, maker-checker approval and retries enabled. Minimum/automatic payout maps are empty initially.

Automatic settlement/refund activation and weakening mandatory approvals or verification are read-only. These cannot be enabled until the owning workflow supports final eligibility checks, holds, provider availability, idempotency and separation of duties. The settings API does not release money, recalculate `eligibleAt`, reverse completed payouts, or bypass dispute/refund holds.

Optional RFQ attachment/reminder, dispute autoclose, subscription-reminder and settlement-scheduling settings are explicitly read-only where no consuming workflow exists. Their presence is not a claim that a new worker has been implemented. Administrators can inspect their descriptions and editability. No meaningless editable toggle is advertised for those features.

## Deployment and environment

Operational keys migrated into `system_settings` are database-authoritative after deployment. Review the seeded values against any custom environment settings before serving traffic; the migration preserves database-backed language/return configuration but does not import arbitrary environment overrides. Provider secrets and infrastructure configuration remain environment-owned. No new secret or cache connection is required.

Use the migration account for schema changes. The runtime account needs normal read/write permissions for the new configuration tables and append-only access to central audit history. Audit retention and database privileges follow the Module 21 operations guide. No triggers or database-user changes are introduced.

## Tests

- `npm run test:settings`: validation, safe defaults, permission mapping, credential rejection, audit snapshots and Swagger/authentication.
- `npm run test:settings:mysql`: full migrations, live consumers, permissions, default guards, language synchronization, provider availability, upload limits and rollback on audit failure.
- Existing audit and after-sales suites run with Module 22 enabled to check regression behavior.

Database tests require an isolated `AFTER_SALES_TEST_SOCKET` under `/tmp/tofa-after-sales-mysql-*`. They create and delete only uniquely named test databases and do not load development/production credentials.
