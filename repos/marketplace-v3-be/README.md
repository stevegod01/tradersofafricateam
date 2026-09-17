# Traders of Africa Marketplace API

Backend API for the Traders of Africa marketplace, built with Node.js,
TypeScript, Fastify, TypeORM, Azure Database for MySQL, Azure Blob Storage, and
Postmark.

## Configured development environment

- Base URL: `https://dev.tradersofafrica.com/api`
- Database-backed health check: `https://dev.tradersofafrica.com/api/health`
- Swagger UI: `https://dev.tradersofafrica.com/api/docs`
- Swagger is protected with credentials stored in Azure Key Vault.
- Cloudflare is the public edge. The Azure App Service origin is restricted and
  uses HTTPS end to end.

The base URL already contains `/api`. Frontend clients should append paths such
as `/auth/login`, not another `/api` segment.

## Runtime stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js >=20.19.0 and <21; CI uses 20.19.5 |
| Package manager | npm 11.13.0, pinned in `package.json` |
| Language | TypeScript 5 |
| HTTP framework | Fastify 5 |
| ORM | TypeORM 0.3 |
| Database | Private Azure Database for MySQL with verified TLS |
| Authentication | JWT access and rotating refresh tokens |
| Email | Postmark, controlled by `EMAIL_DELIVERY_ENABLED` |
| File storage | Private Azure Blob Storage through managed identity |
| Validation | Zod |
| API documentation | OpenAPI and Swagger UI |

## Azure architecture

```text
Frontend / API client
        |
     Cloudflare
        |
Azure App Service (Linux, Standard)
   |                 |
managed identity     VNet integration
   |                 |
Key Vault + Blob     Private Azure MySQL
```

Runtime and deployment permissions are deliberately separate:

- The App Service managed identity can read only runtime Key Vault secrets and
  access the application Blob container. It has no database schema privileges.
- The GitHub Actions identity uses branch-bound OIDC. It cannot read Key Vault
  secrets or deploy directly to App Service.
- The private release-runner identity retrieves migration and one-time admin
  seed secrets from Key Vault and temporarily grants DDL permissions only while
  migrations run.

## Project structure

```text
.github/workflows/       CI, secret scanning, development deployment
deploy/                  Private release-runner configuration and entrypoint
docs/                    Deployment operations documentation
scripts/                 App Service release orchestration
src/
  common/                Middleware, errors, email, upload, validation helpers
  config/                Environment, Key Vault, database and application config
  database/
    entities/            Marketplace persistence models
    migrations/          Versioned schema changes
  modules/
    address/             User shipping and billing addresses
    admin/               Admin identity, roles, permissions and operations
    after-sales/         Cancellations, returns, refunds and policy
    analytics/           Buyer, seller and administrator analytics and exports
    audit-log/           Central audit history, exports and retention
    auth/                Registration, login, refresh and password recovery
    cart/                Buyer cart
    category/            Marketplace categories
    checkout/            Checkout sessions and seller groups
    direct-rfq/          Direct request-for-quotation workflow
    dispute/             Buyer/seller disputes, evidence and admin resolution
    i18n/                Languages, translations and localization operations
    logistics/           Quotes, shipments, tracking and webhooks
    market-rfq/          Open-market request-for-quotation workflow
    message/             Conversations, messages and attachments
    notification/        In-app and email notifications
    order/               Order and delivery lifecycle
    payment/             Payment methods, proof and provider events
    product/             Catalogue, variants and inventory
    review/              Reviews, ratings and votes
    reward/              Referral and reward ledger, policy and outbox
    saved-product/       Wishlist, saved-product visibility and cleanup
    search/              Product discovery, history, featured items and ranking
    seller/              Seller profile and verification
    settlement/          Seller accounts, settlements, payouts and reconciliation
    subscription/        Plans, subscriptions and entitlements
    system-settings/     Marketplace configuration and operational policy
    upload/              Managed-identity Blob upload/download routes
  scripts/               Restricted migration and one-time seed commands
tests/                    API and security-boundary regression tests
```

## Local development

Use Node.js 20.19 or newer in the Node 20 release line, npm 11.13.0,
and a local MySQL 8 database. Run commands from this backend directory.

```bash
npm ci
cp .env.example .env.development.local
```

On Windows PowerShell, copy the configuration with:

```powershell
Copy-Item .env.example .env.development.local
```

Edit the copied file before running the application. At minimum, configure:

| Settings | Purpose |
| --- | --- |
| `APP_URL`, `FRONTEND_URL`, `CORS_ORIGINS` | Local API URL including `/api`, frontend URL, and allowed browser origins |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` | An existing local MySQL database and account able to apply migrations |
| `DB_SSL` | Use `false` for local MySQL without TLS; production requires verified TLS |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Separate, randomly generated local signing secrets |
| `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_STORAGE_CONTAINER_NAME` | Storage configuration; authenticated Azure access is needed for upload/download operations |
| `EMAIL_DELIVERY_ENABLED` | Keep `false` until Postmark credentials and sender are configured |

The default API port is 3000. If the frontend also uses 3000, choose a different
backend `PORT` and update `APP_URL` and the frontend's API configuration together.

```bash
npm run migration:run:local
npm run start:dev
```

The application loads `.env.development` and then
`.env.development.local`; the local file overrides the first. Do not commit either
file with secrets. Registration requires enabled email delivery; existing verified
users and the configured administrator can sign in when email delivery is disabled.

Local Blob access uses `DefaultAzureCredential`, so authenticate with Azure CLI
and use an identity that can access the development Blob container.

`FRONTEND_URL` is the canonical frontend used for generated links.
`CORS_ORIGINS` is a comma-separated allowlist for browser clients and can include
multiple local development origins, such as `http://localhost:3000`,
`http://localhost:3001`, and `http://localhost:5173`. Never use `*` when
credentialed requests are enabled.

Useful commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run audit:prod
```

`npm test` covers the API-route and Swagger-contract suites. Additional feature
suites have separate scripts: `test:after-sales`, `test:audit-log`, `test:settings`,
`test:rewards`, `test:saved-products`, and `test:settlements`. Their `:mysql`
variants need an isolated test database; follow each module guide before running them.

Local Swagger defaults to `/api/docs`. Set `SWAGGER_REQUIRE_AUTH=true` and
provide explicit local Swagger credentials if authentication is required.

## API route groups

All application routes are below `/api`.

| Group | Base path |
| --- | --- |
| Platform metadata and health | `/api`, `/api/health` |
| Authentication | `/api/auth` |
| Languages and translations | `/api/languages`, `/api/admin/translations` |
| Users and sellers | `/api/users` |
| Categories, products and search | `/api/categories`, `/api/products`, `/api/search` |
| Cart and checkout | `/api/cart`, `/api/checkout` |
| Saved products / wishlist | `/api/saved-products` |
| Payments, orders and logistics | `/api/payments`, `/api/orders`, `/api/logistics` |
| Direct and market RFQs | `/api/rfqs/direct`, `/api/rfqs/market` |
| Plans and subscriptions | `/api/subscription-plans`, `/api/subscriptions` |
| Reviews and rewards | `/api/reviews`, `/api/rewards` |
| Messages and notifications | `/api/messages`, `/api/notifications` |
| Disputes | `/api/disputes`, `/api/admin/disputes` |
| Analytics and reports | `/api/seller/analytics`, `/api/buyer/analytics`, `/api/admin/analytics`, `/api/reports` |
| Uploads | `/api/uploads` |
| Administration | `/api/admin` |
| Configuration and audit logs | `/api/config`, `/api/admin/settings`, `/api/admin/audit-logs` |
| Seller settlements and payouts | `/api/seller/settlements`, `/api/seller/payouts`, `/api/admin/settlements`, `/api/admin/payouts` |

Use Swagger for the current request and response schemas rather than copying
endpoint definitions from this README.

## Production configuration and secrets

Production does not load `.env.production`. Non-secret settings are Azure App
Service application settings; secret values are fetched directly from Key Vault
through managed identity before the application modules are imported.

Runtime Key Vault secrets:

- `app-username`
- `app-user-password`
- `jwt-access-secret`
- `jwt-refresh-secret`
- `postmark-api-token` and `postmark-from-email` when email is enabled
- `swagger-username` and `swagger-password` when protected Swagger is enabled
- `payment-webhook-shared-secret` when payment callbacks are explicitly enabled
- `logistics-webhook-shared-secret` when logistics callbacks are explicitly enabled

Deployment-only Key Vault secrets:

- `migration-username`
- `migration-password`
- `mysql-admin-password`
- `admin-email`
- `admin-password`

Secret names can be overridden with the documented `KV_*_SECRET` settings.
Secret values must never be added to App Service settings, GitHub variables,
workflow logs, deployment configuration, or the repository.

## Database migrations

Application startup initializes the connection only. It never runs migrations.

For local development:

```bash
npm run migration:show:local
npm run migration:run:local
npm run migration:revert:local
```

For a reviewed deployment, `npm run migration:run` executes the compiled
restricted migration runner. The release identity loads its credentials from
Key Vault, temporarily grants the migration user the required DDL permissions,
runs all pending migrations, and revokes those permissions in a `finally` path.
Because MySQL checks a trigger's definer privileges when the trigger fires, the
runner preserves table-level `TRIGGER` permission only for tables whose triggers
are defined by the migration identity. Broader schema DDL permissions remain
temporary and are still revoked after every migration run.
If the release runner is forcibly terminated while DDL access
is active, an operator must inspect the migration account grants and revoke the
temporary privileges before another deployment.

MySQL DDL commits implicitly, so automated rollback restores only the application
package; it cannot atomically revert schema changes. Every deployment migration
must therefore use a backward-compatible expand/contract sequence. Destructive
column or table removal belongs in a later release after the old package can no
longer be restored.

The current user-schema expansion deliberately retains the legacy `password`,
`phone`, and `status` columns. Database triggers synchronize those fields with
`passwordHash`, `phoneNumber`, and the current application-only `currentStatus`
column. Inactive and disabled accounts map to legacy `suspended`; deleted
accounts map to legacy `banned`, so the previous package continues to deny their
tokens during an automatic rollback. Remove the compatibility columns and
triggers only in a separately reviewed contract migration after this package is
no longer an eligible rollback target.

The localization expansion follows the same rule for direct RFQs, market RFQs,
and subscription plans. New JSON translation columns are kept beside the legacy
text fields, and database triggers synchronize both representations so the
current and rollback packages can write safely during a failed deployment.

Never amend an already-applied migration as the only way to change a deployed
schema. Add a new forward migration so TypeORM will execute the correction on
databases that already recorded the earlier migration. The deployment
compatibility refresh migration intentionally reapplies the idempotent user
repair and restores the additive localization layout for databases that received
an earlier feature-branch migration draft.

## One-time initial admin seed

There is no default admin email or password, and the seed does not print
credentials. New accounts are active super admins (`isSuperAdmin=true`). If the
configured admin already exists, the command skips creation without resetting
their password.

For a local database, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally
`ADMIN_FIRST_NAME` and `ADMIN_LAST_NAME` in `.env.development.local` or the process
environment. The normal environment loader reads `.env.development` and then
`.env.development.local`; this version does not read a generic `.env` file.
The password must contain 12–128 characters, including uppercase and lowercase
letters, a number, and a supported special character (`@$!%*?&`).

```bash
npm run build
npm run seed:admin
```

For production, invoke the seed once through the private release identity after
building the reviewed release. The command obtains the migration database
credentials plus `admin-email` and `admin-password` directly from Key Vault.
Their secret names can be overridden with `KV_ADMIN_EMAIL_SECRET` and
`KV_ADMIN_PASSWORD_SECRET`. Names default to Platform / Admin if omitted.

The current development release script runs migrations and deploys the app;
admin seeding is a separate operation.

## File storage

Uploads are written to Azure Blob Storage with `ManagedIdentityCredential` in
production. Connection strings, account keys, SAS tokens, and client secrets are
not supported by the application runtime. File signatures are checked against
their declared MIME types before upload.

Dispute evidence is currently limited to verified JPEG, PNG, and WebP images.
Document formats must remain disabled until uploads have a malware-scanning and
quarantine pipeline.

Product images, review images, seller logos, and general marketplace media can
be read anonymously. Payment proofs require either the owning user or an Admin
with `payments.view`; message attachments require the uploader or a participant
in the associated conversation. Sensitive responses use `private, no-store`.
All downloads use content-type, content-disposition, and `nosniff` headers.

## External integration readiness

Postmark delivery and managed-identity Blob storage have implemented adapters.
The core payment gateway and logistics provider adapters are development
placeholders; they do not call real provider APIs. Separate Paystack refund and
seller-payout integrations are opt-in; see the after-sales and settlement guides. Their inbound webhooks are
disabled by default and fail closed. Do not enable either webhook family until
the provider integration and its authentication secret are configured and
verified. Provider-specific signature verification should replace the shared
secret compatibility gate before production use.

## CI/CD

The workflows in this directory were designed for the standalone backend repository. In the combined repository they remain under `repos/marketplace-v3-be/.github/workflows/`, so GitHub does not run them automatically. Adapt their paths, branch rules, permissions, and secrets before enabling them at the repository root.

In the standalone component repository, push and pull-request workflows are configured for:

- full-history Gitleaks secret scanning;
- locked dependency installation;
- TypeScript linting and compilation;
- all migrations against a clean MySQL 8 database;
- current-package and rollback-package credential, phone, and account-status
  writes against that migrated schema;
- regression tests;
- production dependency vulnerability auditing for development releases.

In the standalone component repository, commits merged to `master` can trigger the private development deployment when
the `DEPLOY_DEV_ENABLED` repository variable is `true`. The workflow creates an
immutable release archive, records its SHA-256 digest, authenticates to Azure by
OIDC, uploads to private Blob Storage, starts the release runner only when needed,
runs migrations, deploys the App Service package, verifies `/api/health`, and
restores the previous package if health verification fails.

See [development deployment](docs/development-deployment.md) for required GitHub
variables, Azure RBAC, release-runner prerequisites, and enablement gates.

## Security invariants

- MySQL TLS certificate verification is enabled in production.
- The production service listens on all interfaces only inside Azure App Service;
  non-App-Service production hosts are loopback-only.
- Forwarded client addresses are trusted only from configured proxy ranges.
- Runtime database credentials have no DDL permissions.
- Swagger production credentials come from Key Vault.
- Postmark is disabled unless explicitly enabled.
- Blob uploads use managed identity and never return placeholder storage URLs.
- Payment proofs and message attachments are never served anonymously.
- No migration or admin credential is available to the runtime identity.
- No plaintext production environment file is loaded or packaged.

## Cancellation, Returns and Refunds

See [Module 20 implementation and deployment guide](docs/after-sales.md) for policy settings, API routes, refund reconciliation, permissions and tests. Apply the after-sales migration before starting this API version.

### Audit log management

See [Module 21 implementation and operations guide](docs/audit-log.md) for central audit APIs, permissions, protected exports, migration, retention, historical backfill and tests. Apply the audit migration before starting this API version.

### System settings and marketplace configuration

See [Module 22 configuration and deployment guide](docs/system-settings.md) for public configuration, admin permissions, catalogues, live policy integrations, protected financial defaults and validation. Apply the settings migration and review seed values before deployment.

### Referral and reward management

See [Referral and reward management](docs/referral-rewards.md) for module 23 APIs, permissions, qualification and reward policy, legacy API changes, migration precautions and verification commands. The referral/reward ledger migration must be applied before deploying the updated API.

### Saved products / wishlist

See [Saved products](docs/saved-products.md) for module 24 APIs, catalog integration, visibility rules, analytics, retention and tests. Apply migration `1787520021000-AddSavedProducts` before deploying. No additional environment settings are required.

### Seller settlements and payouts (Module 25)

Seller bank accounts, per-order settlement eligibility/holds, approval and payout processing, historical refund recovery, statements, financial CSV exports and reconciliation are available. See [seller settlement setup, APIs and operating rules](docs/seller-settlements.md). Configure the payout encryption keyring and run migrations before use. Manual processing is the default; Paystack and automatic dispatch of approved payouts are explicitly opt-in. Run `npm run test:settlements` and the isolated MySQL suite documented there.
