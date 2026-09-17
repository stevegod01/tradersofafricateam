# Development deployment

The `Deploy backend to development` workflow runs automatically after a commit reaches `master` and can also be started manually. It stays disabled until the repository variable `DEPLOY_DEV_ENABLED` is set to `true`.

The App Service SCM endpoint accepts traffic only from the private release-runner subnet. The workflow therefore does not expose Kudu to GitHub runner IP ranges and does not store an Azure client secret or publish profile.

## Release path

1. GitHub validates, builds, and audits the exact `master` commit.
2. GitHub creates a source archive directly from Git and records its SHA-256 digest.
3. GitHub exchanges its branch-bound OIDC token for an Azure token and uploads the archive to the private `release-artifacts` container.
4. The workflow starts `tofa-jumpbox` only when it is stopped or deallocated.
5. Azure Run Command executes on the jumpbox. Its managed identity downloads and verifies the archive, runs migrations, creates the App Service ZIP, deploys it, and checks `/api/health`.
6. A failed deployment command or health check redeploys the last known-good ZIP. Database migrations remain forward-only.
7. The workflow deallocates the jumpbox only when the workflow started it.

## GitHub repository variables

Configure these under **Settings → Secrets and variables → Actions → Variables**. They are identifiers and names, not credentials.

| Variable | Development value |
| --- | --- |
| `DEPLOY_DEV_ENABLED` | Keep `false` until every prerequisite below passes, then set `true` |
| `AZURE_CLIENT_ID` | Client ID of the GitHub deployment user-assigned managed identity |
| `AZURE_TENANT_ID` | `cfdccd52-b74f-4969-8639-29cd9be2ddf2` |
| `AZURE_SUBSCRIPTION_ID` | `a2bf1d66-e5a6-42fe-ae78-eb0c64c31dbb` |
| `AZURE_RESOURCE_GROUP` | `tofadotcom-dev-rg` |
| `AZURE_APP_SERVICE_NAME` | `tofa-marketplace-api-dev-sn2m6a6fkrfyw` |
| `AZURE_JUMPBOX_NAME` | `tofa-jumpbox` |
| `AZURE_RELEASE_STORAGE_ACCOUNT` | `tofabgurw4lmdnwu6uploads` |
| `AZURE_RELEASE_CONTAINER` | `release-artifacts` |
| `DEV_HEALTH_URL` | `https://dev.tradersofafrica.com/api/health` |

The workflow intentionally uses repository variables instead of GitHub environment secrets so development deployment works on the repository's current private-plan capabilities. Add a protected GitHub `production` environment only when production is introduced and the organization plan supports the required approval rules.

## Azure OIDC identity

Create one user-assigned managed identity for this workflow. Its federated credential must trust only:

```text
issuer:   https://token.actions.githubusercontent.com
audience: api://AzureADTokenExchange
subject:  repo:tradersofafricateam/marketplace-v3-be:ref:refs/heads/master
```

At the `tofa-jumpbox` VM scope, assign a custom role containing only:

```json
{
  "actions": [
    "Microsoft.Compute/virtualMachines/read",
    "Microsoft.Compute/virtualMachines/instanceView/read",
    "Microsoft.Compute/virtualMachines/start/action",
    "Microsoft.Compute/virtualMachines/deallocate/action",
    "Microsoft.Compute/virtualMachines/runCommand/action"
  ],
  "notActions": [],
  "dataActions": [],
  "notDataActions": []
}
```

The deployable Azure role definition is versioned at
`deploy/github-development-deployer-role.json`.

At the `release-artifacts` container scope, assign `Storage Blob Data Contributor`. Do not give the GitHub identity Key Vault access, App Service write access, Owner, Contributor, or Virtual Machine Contributor. The jumpbox managed identity remains the only release identity with App Service and migration-secret access.

## Jumpbox prerequisites

Install `deploy/app-service-deployment.conf.example` as `/etc/tofa/app-service-deployment.conf`, owned by root and mode `0600`. The VM must have Azure CLI, Node.js 20.19 or newer, npm, `curl`, `tar`, and `zip`.

The deployment-ready backend must provide a `migration:run` command that resolves the migration user, migration password, and MySQL admin password from Key Vault through the jumpbox managed identity. It must revoke temporary schema permissions even when migration fails. Runtime code must resolve only runtime secrets through the App Service managed identity.

MySQL DDL is not transactional. Automatic rollback restores the application ZIP
only, so every migration must be backward-compatible with the previous package.
Use expand/contract changes and defer destructive cleanup to a later release.

The runner's `finally` block handles ordinary failures and interruptions, but a
host failure or `SIGKILL` cannot execute cleanup code. After any abruptly
terminated migration, use the restricted deployment identity to run:

```sql
SHOW GRANTS FOR '<migration-username>'@'%';
REVOKE CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER
  ON `<database-name>`.* FROM '<migration-username>'@'%';
```

Confirm with a second `SHOW GRANTS` before retrying deployment. Never grant these
permissions to the App Service runtime account.

## Enablement gates

Do not set `DEPLOY_DEV_ENABLED=true` until all of these pass:

- the deployment-ready backend branch is merged and exposes database-backed `GET /api/health`;
- `npm audit --omit=dev --audit-level=high` reports zero high or critical production advisories;
- the OIDC federated credential and least-privilege Azure assignments are active;
- the root-owned jumpbox configuration is installed;
- the App Service runtime can resolve its Key Vault references and reach private MySQL;
- `dev.tradersofafrica.com` reaches the App Service through Cloudflare with valid TLS.
