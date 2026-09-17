# Seller settlement and payout management (Module 25)

This module disburses confirmed marketplace proceeds to sellers. Buyer collection continues to use the Payment module. Each existing `orders.id` is a seller-order boundary: one seller order has one settlement and one payout, with separate immutable transfer attempts for retries. This is not a seller wallet or a partial/batched payout system.

## Setup

1. Run `npm run migration:run`. Migration `1787520022000` creates the financial tables; `1787520023000` completes their guards, report storage and active settings. The original settlement migration's permission inserts now tolerate permissions already created by the shared admin seeder.
2. Configure `PAYOUT_ENCRYPTION_KEYS` as a JSON object mapping a key ID to a base64-encoded 32-byte key, and set `PAYOUT_ENCRYPTION_KEY_ID` to that ID. Generate keys using `openssl rand -base64 32`. Keep keys in the deployment secret manager. There is no default encryption key. Retain old keys while any account or frozen payout destination references them.
3. Assign finance permissions through existing admin roles. Do not give sellers admin finance permissions. Set the hold days and per-currency minimum amounts through Module 22 settings.
4. `SETTLEMENT_WORKER_ENABLED=true` refreshes/backfills confirmed orders, checks eligibility, reconciles processing Paystack attempts, and delivers durable notifications every 15 seconds in bounded batches. Run it on at least one application replica; transactional locking protects mutations across replicas. It does not automatically approve payouts.

Manual transfers are the default. Paystack transfer support is optional and currently restricted to Nigerian NGN bank accounts. Set `PAYOUT_PAYSTACK_ENABLED=true` and `PAYOUT_PAYSTACK_SECRET_KEY` to enable it. After independent account verification, link the account through the finance endpoint to create and validate its recipient record. No bank transfers were made during implementation/tests.

For automatic **dispatch of already approved** Paystack payouts, all three gates must permit the transfer: `PAYOUT_AUTOMATIC_PROCESSING_ENABLED=true`, `automaticSettlementEnabled=true`, and a `maximumAutomaticPayoutAmount` entry covering its currency and amount. Missing currency ceilings disable automatic dispatch. `settlementProcessingEnabled=false` stops new approvals/processing, but reconciliation of existing transfers continues. Fully unattended approval and scheduled banking-day execution are not implemented; separation of duties remains mandatory.

## Financial rules

A settlement becomes eligible only after payment confirmation, order completion plus the snapshotted hold period, active verified seller status, and a verified default bank account in the same currency. Active disputes, return requests and unresolved refunds create system holds. Administrators may add independent manual/compliance holds; releasing one never releases another administrator's hold or a system hold. System holds clear only when their underlying condition clears.

`grossProductAmount + seller-collected seller_arranged logistics - original transaction fee - commercial-currency refund impact + fee reversals ± manual adjustments` determines the order's net. Integrated-logistics and buyer-arranged logistics are excluded. The historical order fee/subscription and FX allocations are authoritative. Missing/inconsistent snapshots block eligibility. All financial arithmetic uses integer minor units; API amounts are decimal strings, and aggregate totals are grouped by currency.

Successful refunds are converted cumulatively using their stored payment allocations, avoiding repeated rounding drift. Actual recorded transaction-fee reversals reduce the refund liability. Refunds confirmed after a successful payout create an append-only future debit (or correcting credit), while the paid statement remains unchanged. Credits are allocated before debits under a seller lock. A debit larger than the next settlement consumes only the available amount and carries its remainder forward. A fully consumed settlement completes through a zero-value `offset` payout; no negative or zero bank transfer is sent. If an unpaid order has a negative net (for example, a full refund whose fee is not reversed), existing credits first offset that debt and any uncovered remainder is recorded as a future debit when its zero-value settlement completes.

Manual adjustments require a UUID idempotency key, positive amount, matching currency and reason. Reusing a key with different details fails. The adjustment creator cannot approve its affected payout. Settled adjustments apply to future payouts; changes never rewrite settled history.

## Seller API

All seller endpoints require an active seller token and scope records to its identity. Lists and statements expose masked bank details and use `Cache-Control: private, no-store`.

| Endpoint | Purpose |
| --- | --- |
| `POST /seller/payout-accounts` | Add an encrypted pending bank account |
| `GET /seller/payout-accounts` | List masked accounts, verification status, version and default |
| `PATCH /seller/payout-accounts/:payoutAccountId` | Edit account; sensitive changes revoke verification/default |
| `PATCH /seller/payout-accounts/:payoutAccountId/default` | Select a verified default for its currency |
| `GET /seller/settlements` | Paginated settlement list |
| `GET /seller/settlements/summary` | Totals by currency and status |
| `GET /seller/settlements/:settlementId` | Financial breakdown, holds, adjustments and payout |
| `GET /seller/payouts` | Paginated payout history |
| `GET /seller/payouts/:payoutId/statement` | Frozen statement and transfer attempts |

Example account request:

```json
{"accountType":"bank","accountName":"Example Trading Ltd","accountNumber":"0123456789","bankCode":"058","bankName":"Example Bank","country":"NG","currency":"NGN","isDefault":true}
```

Account statuses: `pending`, `verified`, `invalid`, `inactive`. Settlement statuses: `pending`, `on_hold`, `eligible`, `processing`, `settled`, `cancelled`. Payout statuses: `pending`, `approved`, `processing`, `successful`, `failed`, `cancelled`.

The UI should display the returned verification/settlement/payout status and active hold reasons. A pending account cannot be used for a payout. Editing an account never changes a processing or successful payout's frozen destination.

## Finance API and duties

| Endpoint | Permission |
| --- | --- |
| `GET /admin/settlements`, `/summary`, `/:settlementId`, `/reconciliation` | `settlements.view` |
| `POST /admin/settlements/:settlementId/hold`, `/release` | `settlements.hold` |
| `POST /admin/settlements/:settlementId/adjustments` | `settlements.adjust` |
| `GET /admin/payouts`, `/:payoutId`, `/:payoutId/statement` | `payouts.view` |
| `POST /admin/payouts/:payoutId/approve` | `payouts.approve` |
| `POST /admin/payouts/:payoutId/process`, `/retry`, `/destination` | `payouts.process` |
| `PATCH /admin/payouts/:payoutId/confirm`, `/fail` | `payouts.confirm` |
| `POST /admin/payouts/:payoutId/reconcile` | `payouts.confirm` |
| `GET /admin/payout-accounts?sellerId=UUID` | `payout_accounts.view` |
| `POST /admin/payout-accounts/:payoutAccountId/verification-details` | `payout_accounts.verify` |
| `PATCH /admin/payout-accounts/:payoutAccountId/verify` | `payout_accounts.verify` |
| `POST /admin/payout-accounts/:payoutAccountId/link-paystack` | `payout_accounts.verify` |

Manual flow:

1. Retrieve the current bank details through `/verification-details` with a reason when needed (sensitive audited access). Verify independent bank ownership evidence using `{ "status":"verified", "version":1, "reason":"Evidence reference and verification notes" }`. The version check rejects concurrent account edits. Account verification is an administrator attestation, not an automatic KYC decision.
2. Approve the eligible payout with `{ "method":"manual" }`. Approval snapshots the current destination, financial breakdown and ledger offsets. Changes to eligibility, destination, amount or ledger require approval again.
3. A different administrator processes it. A durable processing attempt and reference are committed first. Only that manual processor may retrieve the frozen destination via `POST .../destination` with a reason. This sensitive endpoint is audited and must never be cached or body-logged.
4. Execute the bank transfer through the bank's authorized workflow, then confirm with `{ "reference":"BANK-UNIQUE-REFERENCE", "notes":"Definitive bank confirmation evidence" }`. The approver cannot confirm their own payout. A queued instruction or timeout is not evidence of success or failure.
5. If the bank definitively confirms failure, `/fail` records that evidence. `/retry` returns a failed payout to pending and requires fresh approval. Attempts and successful history remain immutable.

Use `{ "method":"paystack" }` to approve a linked account for Paystack processing. An HTTP timeout stays `processing`; neither process nor retry can send another transfer while it is uncertain. `/reconcile`, the worker, and callbacks fetch the financial transfer record and match reference, recipient, currency and amount. Provider reversals after recorded success create reconciliation exceptions for finance review rather than rewriting history or resending money.

Signed Paystack callbacks may use the existing `/payments/webhooks/paystack` endpoint (transfer events are routed to this module) or `/payouts/webhooks/paystack`. Configure the appropriate endpoint for the Paystack integration. The existing payment endpoint continues handling collection/refund events. HMAC-SHA512 validates original request bytes before any financial status lookup. See the official [transfer API](https://paystack.com/docs/api/transfer/), [recipient API](https://paystack.com/docs/api/transfer-recipient/) and [webhook documentation](https://paystack.com/docs/payments/webhooks/).

List filters: `status`, `sellerId` (admin; seller scope always overrides it), `orderId`/`sellerOrderId`, `currency`, `search`, `dateFrom`, `dateTo`, `eligibleFrom`, `eligibleTo`, `page`, `limit` (maximum 100). Dates use ISO 8601. Search matches settlement/payout numbers.

## Reporting, audit and operations

Reuse `POST /reports/export` with `seller_settlements`, `seller_payouts`, `admin_settlements`, or `admin_payouts`. Financial exports support `format:"csv"`; unsupported formats fail explicitly. Filters match the lists and exports are limited to 10,000 rows. Seller exports retain the existing subscription entitlement check and force seller ownership. Admin exports require both `analytics.export_reports` and the corresponding financial view permission. Generated CSV content is stored as an immutable report snapshot in `analytics_report_contents`, reusing existing `AnalyticsReport` ownership, status and expiry. Download through authenticated `GET /reports/:reportId/download`; it is never a public file URL. CSV values are escaped against spreadsheet formula injection.

Settlement events persist alongside financial mutations and feed the existing central audit and analytics tables. A durable outbox delivers processing, success, failure and hold notifications. Successful/failed payouts also use the existing email configuration. Notification retries are deduplicated; email delivery is at-least-once if an external send succeeds immediately before a process crash. Bank numbers, ciphertext and provider secrets are excluded from normal API/audit responses.

`GET /admin/settlements/reconciliation` reports missing records, mismatched amounts/currencies/statuses, processing transfers older than one hour, overallocated adjustments, post-payout refunds awaiting recovery and provider reversal exceptions (up to 100 rows per check). Review unresolved transfers using bank evidence or `/reconcile`; do not mark them failed merely to enable retry. The worker reports malformed historical records for review and continues its scan.

## Validation

```sh
npm run test:settlements
SETTLEMENT_TEST_SOCKET=/tmp/tofa-rewards-mysql-EXAMPLE/mysql.sock npm run test:settlements:mysql
```

Integration tests accept only an isolated test socket, create/drop their own random database, run all migrations, and mock all provider transfers. They cover concurrency, maker/checker separation, account changes, holds, historical FX/refunds, future offsets, immutable history, retry/reconciliation, ownership and CSV exports. Never point the tests at an application database. Apply migrations and configure encryption before exercising seller account endpoints in staging.
