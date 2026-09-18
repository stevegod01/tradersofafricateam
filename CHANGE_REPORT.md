# Public snapshot validation and documentation report

Date: 2026-09-18

Original HEAD: `1aaba9d134557461d0fe2c49f22818e072a4a218`

## Changes

| File | Change |
| --- | --- |
| `README.md` | Corrected stale private-repository wording; retained component attribution, frontend demo limits, and incomplete infrastructure/deployment scope; documented root CI and its boundaries |
| `SOURCE_SNAPSHOT.md` | Clarified owner-requested public visibility while preserving original component commits, recovery notes, history gaps, and ownership terms |
| `.github/workflows/validate.yml` | Added root CI with component-specific working directories and lockfile caches, declared Node `20.19.5`, npm `11.13.0`, read-only permissions, and no live-service or deployment jobs |
| `repos/marketplace-v3-fe/next.config.ts` | Set `turbopack.root` to the component directory so unrelated ancestor lockfiles do not redirect build resolution outside this checkout |

The original nested backend workflows remain intact as source. GitHub does not execute them from their nested location. Only the new root validation workflow is activated by this change.

## Local verification

All final runtime checks below used Node `20.19.5`. Its Windows executable was downloaded from the official Node distribution and verified against the distribution's SHA-256 manifest, without changing the globally installed runtime.

| Check | Result |
| --- | --- |
| Backend TypeScript without emit | Passed |
| Backend ESLint with zero warnings allowed | Passed |
| Backend TypeScript build | Passed |
| Default API/Swagger files plus six selected feature files, via `node --test` | **62 passed, 0 failed, 0 skipped** |
| Frontend ESLint | Passed |
| Frontend Next.js production build | Passed, including TypeScript and generation of 63 static pages |
| Root workflow YAML parsing and component/cache/test-path checks | Passed |
| Both lockfiles' declared Node engine ranges checked against `20.19.5` | No incompatible entries |
| README relative links and `git diff --check` | Passed |

The backend test command covered `api-routes.test.js`, `swagger-contracts.test.cjs`, `after-sales.test.cjs`, `audit-log.test.cjs`, `system-settings.test.cjs`, `rewards.test.cjs`, `saved-products.test.cjs`, and `settlement.test.cjs`. The contract suite reported 410 application operations and 203 imported validator bindings checked. These are contract checks, not 410 end-to-end transactions.

Dependencies were installed from existing lockfiles with scripts disabled, using the host's Node `24.16.0` and npm `11.13.0`; the backend's engine mismatch warning on that initial install prompted the declared-runtime rerun above. The initial backend `npm test` (22 tests) and six additional suites (40 tests) also passed under Node 24, as recorded by the coordinating task. Node 24 support is not being declared or introduced by this change. CI performs fresh installs with `--engine-strict` under Node 20.

The first frontend build exposed ancestor-lockfile root detection; the configuration fix removed that failure. A restricted-network attempt then failed to fetch the existing Google Fonts. With network access for those public font assets, the final build passed. No fonts or application behavior were replaced to bypass the check. The configuration follows the [Next.js 16.2.0 Turbopack root option](https://github.com/vercel/next.js/blob/v16.2.0/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.mdx) and the installed version's bundled guide.

## Remaining limits

- The GitHub-hosted Linux workflow has not yet run for this change; local checks ran on Windows. CI requires normal package-download access and the frontend's configured Google Fonts downloads.
- No MySQL integration tests, database migrations, Azure commands, deployment scripts, payment transactions, email delivery, blob operations, or live logistics calls were run. Test fixtures and in-process requests exercise the selected contracts and policies.
- The frontend still uses demo catalogue data and has incomplete shopping interactions; it has no automated browser or component test suite. The broader backend is not evidence that all storefront flows are integrated.
- Snapshot limitations in `SOURCE_SNAPSHOT.md` remain: component histories are separate, unpublished infrastructure parameters need recovery, and cached backend remote-only commits were not substituted.
- This change does not alter public visibility, original attribution, proprietary notices, or license terms. It makes no sole-authorship or production-readiness claim.
