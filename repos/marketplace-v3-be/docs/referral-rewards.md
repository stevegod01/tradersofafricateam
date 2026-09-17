# Referral and reward management

Implements module 23 alongside existing authentication, seller verification, orders, reviews, notifications, audit logs and analytics. This repository provides the API; the frontend consumes these endpoints. Points have no monetary value or redemption facility.

## Deployment and existing data

1. Back up the database and pause application writers. This migration renames `points_transactions` to `reward_transactions`; old and new application versions must not write concurrently during rollout.
2. Run `npm run build` and `npm run migration:run` using the deployment database configuration. Migration `1787520020000-AddReferralRewards` requires permission to create database triggers.
3. Deploy the new application. Grant the new permissions through the existing admin role manager. No existing role is automatically granted adjustment or rule-management access; super admins retain their existing access.
4. Review `/admin/rewards/policy` and `/admin/reward-rules` before enabling trade rewards. Check `/admin/rewards/reconciliation` for discrepancies.

The migration preserves transaction IDs, amounts, timestamps and balances, adds canonical metadata, and backfills valid existing referral attributions as pending. Missing referral codes are generated without exposing user IDs. Historical referrals are not automatically rewarded. An authorized admin may explicitly retry qualification after reviewing eligibility.

The migration checks that existing balances equal the sum of the old ledger **before changing the schema**. A mismatch stops deployment for reconciliation rather than fabricating reward history. MySQL DDL is not transactional; restore the backup if a subsequent migration statement fails. Automatic rollback is deliberately unavailable after immutable reward history has been introduced.

`reward_transactions` is the single authoritative ledger. Internally, `points` stays signed to preserve the existing review APIs and queries. New `/rewards/history` and admin transaction responses return positive absolute `points` together with `transactionType: credit|debit`. `balanceBefore`, `balanceAfter`, `eventCode`, `createdBy`, and a unique `idempotencyKey` are stored. ORM guards and database triggers reject editing/deleting transactions; foreign keys prevent user deletion from cascading into reward history. Account soft deletion remains supported.

## Defaults and configuration

Policy is stored in `reward_settings`, managed using GET/PATCH `/admin/rewards/policy`:

```json
{
  "referralQualificationEvent": "company_verified",
  "tradeRewardBeneficiary": "buyer",
  "reverseTradeRewardsOnRefund": false
}
```

Qualification accepts `email_verified`, `company_verified`, or `first_successful_trade`. Beneficiary accepts `buyer`, `seller`, or `both`. If refund reversal is enabled, any successful refund, including a partial refund, reverses the order's full successful-trade point awards once. It does not calculate a cash value for points or reverse unrelated review/referral awards. This policy is disabled by default.

Initial rules:

| Event | Initial points | Status |
|---|---:|---|
| `REVIEW_SUBMITTED` | Existing database-configured product-review base, otherwise 10 | active |
| `REFERRAL_QUALIFIED` | 30 | active |
| `SUCCESSFUL_TRADE` | 20 | inactive |

Seeded rules have `createdBy: null` to identify system configuration; admin-created rules record the authenticated admin ID. One rule exists per supported event. Changes apply to future awards; existing transactions are unchanged.

`maxPerUser` caps lifetime award **count**, and `maxPerPeriod` caps award count within the selected UTC day, ISO week starting Monday, calendar month, or lifetime. A period is required when setting `maxPerPeriod`. Null caps mean unlimited. Reversals do not restore award capacity. Inactive rules and exhausted caps leave qualifying referrals in `qualified` state; admins can retry after changing policy/caps. A zero-point rule issues no transaction.

`FRONTEND_URL` generates `/signup?ref=CODE` links. Existing Postmark and `NOTIFICATION_EMAIL_ENABLED` settings control email delivery; reward-category preferences are respected. No new secrets or duplicated environment reward-policy settings are needed.

## Integration behavior

- Signup normalizes referral codes case-insensitively. The existing strict invalid-code behavior remains: invalid codes return validation errors; the user can remove the optional code and retry. Account and referral creation commit together.
- Unique referred-user attribution, self-referral checks, account status checks and matching referrer/referred business registration checks prevent basic abuse. This is not a comprehensive device/IP fraud scoring system.
- Email OTP verification and verification through Google sign-in, seller approval, and completed-order transitions call qualification within the business transaction. Signup alone does not award points.
- Completed orders apply the active trade rule to configured beneficiaries. Only order management can trigger this event; no public award endpoint exists.
- Review management still validates purchases, eligibility, content, moderation and duplicates. The reward rule now owns the shared review base; existing image bonuses and per-order caps remain. Previously distinct product/seller base values are replaced prospectively by the shared rule. Editing/recreating an ineligible review does not create another award. Rejection reverses the original credit.
- All awards lock the reward owner before checking idempotency and caps. Balances and ledger writes commit atomically. Negative or overflowing balances are rejected. Reversal failure leaves the business transaction unchanged and requires operational resolution; points are never silently clamped or deleted.
- Credits create durable notification outbox entries in the same transaction. A worker delivers only committed credits, retries failures and deduplicates in-app messages by transaction ID. Referral credits also generate reward emails through the existing email delivery helper. Email delivery is at least once: a crash after the provider accepts an email but before the outbox commits can cause a duplicate email.
- Referral lifecycle, rule changes, corrections, adjustments and point movements write central audit records; analytics events expose referral/reward activity to analytics consumers.

## User endpoints

User JWT required; all results are restricted to the authenticated owner. Unnecessary referred-user personal information is excluded.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/referrals/me` | Stable code, shareable link and status statistics |
| GET | `/referrals` | Referrals; `status`, `page`, `limit` |
| GET | `/rewards/balance` | `data.totalPoints` |
| GET | `/rewards/history` | Absolute points, direction, balances and description; `transactionType`, `eventCode`, `dateFrom`, `dateTo`, `page`, `limit` |

Pagination defaults to page 1 and 20 entries, with at most 100 per page. Dates accept ISO timestamps; ranges are inclusive. Lists use stable creation-time/ID ordering. The frontend displays credits/debits from `transactionType` and never calculates an authoritative balance.

## Admin endpoints and permissions

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/admin/referrals` | `referrals.view` |
| GET | `/admin/referrals/analytics` | `referrals.analytics.view` |
| PATCH | `/admin/referrals/:id` | `referrals.manage` |
| POST | `/admin/referrals/:id/invalidate` | `referrals.manage` |
| POST | `/admin/referrals/:id/retry` | `referrals.manage` |
| GET | `/admin/rewards/transactions` | `rewards.view` |
| GET | `/admin/rewards/reconciliation` | `rewards.view` |
| POST | `/admin/rewards/adjust` | `rewards.adjust` |
| GET | `/admin/reward-rules` | `rewards.rules.view` |
| POST | `/admin/reward-rules` | `rewards.rules.manage` |
| PATCH | `/admin/reward-rules/:id` | `rewards.rules.manage` |
| GET/PATCH | `/admin/rewards/policy` | `rewards.rules.view` / `rewards.rules.manage` |

Admin referral search matches referral code, with `status`, `referrerId`, `referredUserId`, date and pagination filters. Admin transaction history supports `userId`, `eventCode`, `transactionType`, `sourceType`, dates and pagination. Analytics reports gross referral points issued; `qualifiedReferrals` includes rewarded referrals, while user statistics are mutually exclusive status counts.

Correction accepts `{ "referrerId": "uuid", "reason": "Explanation" }` and applies only to pending referrals, updating the legacy `users.referral` reference transactionally. Invalidation requires a reason and creates a compensating debit where an award exists. Retrying also requires a reason and rechecks the actual qualifying user/order state; it cannot resurrect invalid referrals or duplicate an existing award.

Adjustments require an `Idempotency-Key` header (8–100 letters, digits, `_` or `-`). Reuse it only to retry the identical request. Different payloads using the same key are rejected. Example:

```json
{
  "userId": "00000000-0000-4000-8000-000000000001",
  "transactionType": "credit",
  "points": 50,
  "reason": "Customer service reward adjustment."
}
```

## Legacy API compatibility

`/rewards/points` and `/rewards/points/history` continue to use the unified ledger and retain their signed-points response conventions. `/admin/rewards/points/adjust` retains its signed request/response shape but now requires `rewards.adjust` and `Idempotency-Key`. Prefer the new adjustment endpoint.

`GET /admin/rewards/settings` reports the shared rule base for both review types. Its update endpoint continues managing review eligibility, image bonus and order caps; updating `productReviewPoints` or `sellerReviewPoints` there returns an error directing clients to `REVIEW_SUBMITTED` in `/admin/reward-rules`.

## Verification

- `npm run test:rewards`: validation, UTC periods, balance bounds, immutable metadata, idempotency, caps, Swagger and unauthenticated routes.
- `REWARDS_TEST_SOCKET=/tmp/tofa-rewards-mysql-XXXXXX/mysql.sock npm run test:rewards:mysql`: isolated MySQL migration preservation, concurrent qualification/caps, review integration, reversal, adjustment idempotency, owner isolation, admin permissions and reconciliation. The test creates and removes only its randomly named database; it does not use application database credentials.
