# Traders of Africa Marketplace — Frontend

A multilingual marketplace frontend for Traders of Africa (TOFA), connecting African suppliers with buyers. Built with Next.js App Router, React, TypeScript, and Tailwind CSS.

The current implementation combines a demo product catalogue with API-backed authentication and buyer account features. Product details and the buyer dashboard are implemented; the complete purchasing and order-management flows are still in development.

## Features

- Responsive marketplace homepage, category navigation, product collections, and seller onboarding pages.
- Searchable catalogue with URL-backed filters, sorting, grid/list views, and mobile filter controls.
- Product-detail pages with image galleries, variants, quantity controls, specifications, reviews, and related products.
- English, French, Spanish, Swahili, and Portuguese interface translations.
- Currency selection for NGN, USD, EUR, GBP, KES, GHS, and XOF, retained in browser storage.
- Email/password registration and login, email OTP verification and resend, Google sign-in, terms acceptance, password recovery, and logout.
- Buyer dashboard with date-filtered order/RFQ analytics, account points, profile editing, and seller-upgrade requests.
- Shared components organized into atoms, molecules, organisms, and templates.

## Stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 16.2.0, React 19.2.4 |
| Language and styling | TypeScript 5, Tailwind CSS 4 |
| Localization | next-intl 4 |
| API and server state | Axios, TanStack Query 5 |
| Client state | Zustand 5 |
| UI | Base UI, shadcn/ui, Lucide React, Sonner |
| Animation | Framer Motion 12 |

## Local development

Requirements: Node.js **20.9 or later**, npm, and access to the matching backend API for account features.

From this frontend directory, install the locked dependencies:

```bash
npm ci
```

Create `.env.local` with the backend API base URL, including its API prefix:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

The localhost URL above is an example; set its port and prefix to match your backend. Google sign-in is optional and displays a disabled button if no client ID is configured. Both variables use the `NEXT_PUBLIC_` prefix and are visible in the browser; never place server secrets in them. Environment files are excluded from Git.

Start the application:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root redirects to `/en`. To use another port, run `npm run dev -- -p 3004`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm run build` | Create the production build |
| `npm run start` | Serve an existing production build |

No automated test script or test suite is configured. Run lint and a production build when validating changes, then manually check the affected routes and API flows.

## Routes

Replace `[locale]` with `en`, `fr`, `es`, `sw`, or `pt`.

| Route | Description |
| --- | --- |
| `/` | Redirect to the default English locale |
| `/[locale]` | Marketplace homepage |
| `/[locale]/products` | Product catalogue |
| `/[locale]/products/info/[slug]` | Product details for a supported demo product |
| `/[locale]/our-story` | Company story and team |
| `/[locale]/what-we-do` | Services and technology |
| `/[locale]/our-impact` | Customer impact stories |
| `/[locale]/become-seller` | Seller benefits, onboarding, pricing, and policy downloads |
| `/[locale]/register` | Registration |
| `/[locale]/verify-email` | Email OTP verification |
| `/[locale]/login` | Login |
| `/[locale]/forgot-password` | Request a password-reset code |
| `/[locale]/reset-password` | Reset a password using an OTP |
| `/[locale]/dashboard` | Buyer dashboard; unauthenticated visitors are redirected to login |

Unmatched localized routes display a custom 404 page. Several navigation links describe planned features whose pages are not implemented yet.

## Project structure

```text
messages/                    Translation JSON files for five locales
public/
  assets/                    Images, icons, and demo media
  documents/                 Seller policy source drafts and PDFs
src/
  app/
    [locale]/                Localized routes and layout
    globals.css              Global styles
    page.tsx                 Default-locale redirect
  components/
    atoms/                   Small shared UI primitives
    molecules/               Composed UI elements
    organisms/               Shared page sections
    providers/               Auth and currency context
    templates/               Shared page layouts
    ui/                      UI primitives
  features/
    auth/                    Account API calls, hooks, types, and components
    dashboard/               Buyer analytics, profile, and seller-upgrade features
    products/                Demo catalogue and product-detail features
    sellers/                 Seller landing-page constants
  i18n/                      Locale configuration
  lib/                       Shared Axios client, hooks, helpers, and constants
  store/                     Zustand authentication state
  proxy.ts                   Locale routing proxy
```

## Backend integration

`src/lib/axiosInstance.ts` reads `NEXT_PUBLIC_API_BASE_URL` and attaches a bearer token only when the `tofaToken` cookie is present. Anonymous requests omit the Authorization header.

The frontend calls these backend contracts:

| Feature | Endpoints |
| --- | --- |
| Registration and email verification | `POST /auth/signup`, `/auth/resend-otp`, `/auth/verify-email` |
| Login and Google sign-in | `POST /auth/login`, `/auth/google` |
| Terms acceptance | `PATCH /auth/update-terms/:userId` |
| Password recovery | `POST /auth/forgot-password`, `/auth/reset-password` |
| Current account | `GET /users/me` |
| Logout | `POST /auth/logout`, `/auth/logout-all` |
| Profile updates | `PATCH /users/profile` |
| Seller application | `POST /users/seller-upgrade` |
| Buyer analytics | `GET /buyer/analytics/overview` |

The dashboard fetches order and RFQ totals for the selected date range. Profile updates and seller-upgrade requests use API mutations. The recent-orders panel is currently an empty-state placeholder.

Authentication state is managed by the auth provider and Zustand store. The browser stores the JWT in a `tofaToken` cookie; the remember-me option controls whether it lasts up to 30 days or the current browser session. Backend availability, CORS configuration, and compatible response contracts are required for these flows.

## Catalogue and localization

Catalogue data lives in `src/features/products/constants/dummy.ts`; product details live in `src/features/products/constants/productDetails.ts`. Catalogue state is represented in URL parameters: `q`, `collection`, `category`, `minPrice`, `maxPrice`, `rating`, `verified`, `inStock`, `minOrder`, and `sort`.

Currency selection is stored under `tofa-currency` in browser local storage. Conversion rates in `src/lib/helpers/currency/currency.ts` are approximate constants, not live rates.

Supported locales are defined in `src/i18n/routing.ts`. Translations belong in `messages/<locale>.json`. Add new translation keys to all five files, use next-intl for user-facing copy, and preserve the active locale in internal links.

## Current limitations

- Products, categories, review content, ratings, availability, verification status, and currency rates use local demo data.
- Cart and wishlist controls are placeholders; saving a product on its detail page changes local component state only.
- Checkout, RFQ submission, newsletter subscriptions, and most dashboard subpages are not implemented as complete backend-connected flows.
- Catalogue pagination controls are presentational.
- The dashboard overview is implemented, but its recent-orders panel does not fetch an order list.
- Automated tests are not configured.

## Production

Set the public environment variables for the target backend before building, then run:

```bash
npm run build
npm run start
```

Use a Next.js-compatible Node.js runtime. This project is not configured as a plain static export. `next.config.ts` allows remote images from Google Cloud Storage and Cloudinary. Builds use `next/font/google` and need access to the configured Google fonts.

When changing Next.js APIs or conventions, consult the version-matched documentation in `node_modules/next/dist/docs/`, as directed by `AGENTS.md`.

## Seller documents and ownership

`public/documents/` contains editable supplier-compliance and product-exclusion drafts alongside their PDFs. These are starter policies for review before production use.

This project is proprietary and owned by Traders of Africa. No open-source license is granted.
