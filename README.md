# Traders of Africa Marketplace

Traders of Africa (TOFA) is a marketplace project connecting African suppliers with buyers. This public repository brings together a source snapshot of the web frontend, backend API, and Azure infrastructure. It preserves the original component attribution and does not imply sole authorship or a new open-source license.

## Project layout

| Component | Source | Documentation |
| --- | --- | --- |
| Web application | `repos/marketplace-v3-fe/` | [Frontend setup and features](repos/marketplace-v3-fe/README.md) |
| Backend API | `repos/marketplace-v3-be/` | [API setup, configuration, and tests](repos/marketplace-v3-be/README.md) |
| Azure infrastructure | `repos/marketplace-v3-infra/` | [Infrastructure templates and deployment notes](repos/marketplace-v3-infra/README.md) |

Each component has its own dependencies and commands. There is no root npm package; run npm commands inside the relevant component directory.

## What is included

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, multilingual pages, a demo product catalogue, product details, authentication, and a buyer dashboard.
- **Backend:** Fastify 5, TypeORM, MySQL, JWT authentication, marketplace products and orders, RFQs, payments, logistics, messaging, reviews, after-sales, rewards, saved products, settlements, and administrative APIs.
- **Infrastructure:** Azure Bicep templates for networking, private MySQL, Key Vault, VMs, Bastion, and a load balancer. Backend deployment scripts also describe an App Service release architecture; the VM templates do not provision that entire architecture.

The frontend uses local demo data for product listings and several shopping interactions. Authentication and buyer account features call the backend. See the frontend README for the exact implementation limits.

## Run locally

### 1. Clone the repository

```bash
git clone https://github.com/stevegod01/tradersofafricateam.git
cd tradersofafricateam
```

### 2. Start the API

The backend declares Node.js `>=20.19.0 <21` and npm `11.13.0`. A local MySQL 8 instance is required. Check the backend README for optional external services and integration settings.

```bash
cd repos/marketplace-v3-be
npm ci
cp .env.example .env.development.local
```

On PowerShell, use `Copy-Item .env.example .env.development.local` for the copy step. Edit the copied environment file before starting the API. Create the MySQL database and set its credentials, strong JWT secrets, and local URL/CORS settings. For the example below, use `PORT=5000`, `APP_URL=http://localhost:5000/api`, and `FRONTEND_URL=http://localhost:3000`; include that frontend origin in `CORS_ORIGINS`.

Set `AZURE_STORAGE_ACCOUNT_NAME` as well: the current API requires this setting at startup. Upload and download operations need an accessible Azure Blob account and container. Keep optional integrations disabled unless configured. With `EMAIL_DELIVERY_ENABLED=false`, registration and email OTP delivery are unavailable; configure Postmark to use those flows.

```bash
npm run migration:run:local
npm run start:dev
```

### 3. Start the frontend

Open a second terminal at the repository root:

```bash
cd repos/marketplace-v3-fe
npm ci
```

Create `.env.local` in that directory:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Google sign-in requires a configured client ID. The API URL must include `/api`, and the backend CORS configuration must allow the frontend origin.

## Useful commands

Run these from the indicated component directory:

| Component | Command | Purpose |
| --- | --- | --- |
| Frontend | `npm run lint` | ESLint checks |
| Frontend | `npm run build` | Production build |
| Frontend | `npm run start` | Serve the production build |
| Backend | `npm run typecheck` | TypeScript checks without emitting output |
| Backend | `npm run lint` | ESLint checks |
| Backend | `npm test` | Build and run the default API/Swagger tests |
| Backend | `npm run test:after-sales` | After-sales regression suite |
| Backend | `npm run test:rewards` | Rewards regression suite |
| Backend | `npm run test:saved-products` | Saved-products regression suite |
| Backend | `npm run test:settlements` | Settlement regression suite |

The backend also includes audit-log, settings, and MySQL integration suites; see its README and `package.json`. The frontend does not currently define an automated test suite.

## Continuous integration

[Snapshot validation](.github/workflows/validate.yml) runs from the repository root on pushes and pull requests. Commands and npm caches point to each component's own directory and lockfile. Both jobs use Node.js `20.19.5`; the backend uses its declared npm `11.13.0`.

- Backend: TypeScript, ESLint, the default API/Swagger tests, and six additional suites covering after-sales, audit logs, settings, rewards, saved products, and settlements.
- Frontend: ESLint and a Next.js production build. The build downloads its configured Google Fonts, so it requires internet access.

These checks require no cloud credentials or running database. They do not run migrations, MySQL integration tests, deployment scripts, or live payment, email, storage, and logistics integrations. Passing them does not establish production readiness or complete storefront behavior.

## Deployment

Read the component documentation before deploying. Azure resources, runtime secrets, database migrations, identity permissions, and frontend build-time settings require environment-specific configuration.

Backend GitHub Actions files remain under `repos/marketplace-v3-be/.github/workflows/` as source from the component repository. GitHub does not run workflows from that nested directory. The root workflow above enables validation only; deployment remains inactive and requires a separate review of paths, permissions, secrets, infrastructure, and branch rules before it can be enabled here.

The infrastructure repository includes both root templates and a nested `tradersofafricateam/` variant. They have different load-balancer settings. The checked-in ARM JSON is a legacy template; consult the infrastructure README before choosing a deployment entrypoint.

## Source and configuration

This combined repository is a source snapshot of the local component checkouts, rather than a merge of their separate Git histories. [Source snapshot notes](SOURCE_SNAPSHOT.md) record the original commits and recovery details.

Environment files containing local credentials, dependency directories, build output, caches, release archives, and duplicate legacy working copies are excluded. Commit safe examples and source files; keep runtime credentials in local environment files or the deployment secret store. The original component repositories remain separate working copies in the source workspace.

No new software license is granted by this consolidation. Existing ownership and component notices continue to apply.
