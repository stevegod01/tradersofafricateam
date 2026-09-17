import { ManagedIdentityCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

type SecretBinding = Readonly<{
  env: string;
  defaultName: string;
  overrideEnv: string;
}>;

const runtimeBindings: readonly SecretBinding[] = [
  { env: 'DB_USERNAME', defaultName: 'app-username', overrideEnv: 'KV_DB_USERNAME_SECRET' },
  { env: 'DB_PASSWORD', defaultName: 'app-user-password', overrideEnv: 'KV_DB_PASSWORD_SECRET' },
  { env: 'JWT_ACCESS_SECRET', defaultName: 'jwt-access-secret', overrideEnv: 'KV_JWT_ACCESS_SECRET' },
  { env: 'JWT_REFRESH_SECRET', defaultName: 'jwt-refresh-secret', overrideEnv: 'KV_JWT_REFRESH_SECRET' },
];

const postmarkBindings: readonly SecretBinding[] = [
  { env: 'POSTMARK_API_TOKEN', defaultName: 'postmark-api-token', overrideEnv: 'KV_POSTMARK_API_TOKEN_SECRET' },
  { env: 'POSTMARK_FROM_EMAIL', defaultName: 'postmark-from-email', overrideEnv: 'KV_POSTMARK_FROM_EMAIL_SECRET' },
];

const swaggerBindings: readonly SecretBinding[] = [
  { env: 'SWAGGER_USERNAME', defaultName: 'swagger-username', overrideEnv: 'KV_SWAGGER_USERNAME_SECRET' },
  { env: 'SWAGGER_PASSWORD', defaultName: 'swagger-password', overrideEnv: 'KV_SWAGGER_PASSWORD_SECRET' },
];

const paymentWebhookBindings: readonly SecretBinding[] = [
  { env: 'PAYMENT_WEBHOOK_SHARED_SECRET', defaultName: 'payment-webhook-shared-secret', overrideEnv: 'KV_PAYMENT_WEBHOOK_SHARED_SECRET' },
];

const logisticsWebhookBindings: readonly SecretBinding[] = [
  { env: 'LOGISTICS_WEBHOOK_SHARED_SECRET', defaultName: 'logistics-webhook-shared-secret', overrideEnv: 'KV_LOGISTICS_WEBHOOK_SHARED_SECRET' },
];

const migrationDatabaseBindings: readonly SecretBinding[] = [
  { env: 'DB_USERNAME', defaultName: 'migration-username', overrideEnv: 'KV_MIGRATION_USERNAME_SECRET' },
  { env: 'DB_PASSWORD', defaultName: 'migration-password', overrideEnv: 'KV_MIGRATION_PASSWORD_SECRET' },
];

const migrationAdminBindings: readonly SecretBinding[] = [
  { env: 'DB_ADMIN_PASSWORD', defaultName: 'mysql-admin-password', overrideEnv: 'KV_DB_ADMIN_PASSWORD_SECRET' },
];

const adminBindings: readonly SecretBinding[] = [
  { env: 'ADMIN_EMAIL', defaultName: 'admin-email', overrideEnv: 'KV_ADMIN_EMAIL_SECRET' },
  { env: 'ADMIN_PASSWORD', defaultName: 'admin-password', overrideEnv: 'KV_ADMIN_PASSWORD_SECRET' },
];

const loadedEnvironmentKeys = new Set<string>();

function vaultClient(): SecretClient {
  const vaultName = process.env.KEY_VAULT_NAME?.trim();
  if (!vaultName) throw new Error('KEY_VAULT_NAME is required in production');
  return new SecretClient(
    `https://${vaultName}.vault.azure.net`,
    new ManagedIdentityCredential(),
  );
}

async function getSecretValue(client: SecretClient, secretName: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const secret = await client.getSecret(secretName);
      if (!secret.value) throw new Error(`Azure Key Vault secret is empty: ${secretName}`);
      return secret.value;
    } catch (error) {
      lastError = error;
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  throw lastError;
}

async function loadBindings(bindings: readonly SecretBinding[]): Promise<void> {
  if ((process.env.NODE_ENV || 'development') !== 'production') return;

  for (const binding of bindings) {
    if (process.env[binding.env]) {
      throw new Error(
        `${binding.env} must come directly from Azure Key Vault in production`,
      );
    }
  }

  const client = vaultClient();
  await Promise.all(bindings.map(async (binding) => {
    const secretName = process.env[binding.overrideEnv]?.trim() || binding.defaultName;
    process.env[binding.env] = await getSecretValue(client, secretName);
    loadedEnvironmentKeys.add(binding.env);
  }));
}

export async function loadRuntimeSecrets(): Promise<void> {
  const bindings = [...runtimeBindings];
  if (process.env.EMAIL_DELIVERY_ENABLED?.trim().toLowerCase() === 'true') {
    bindings.push(...postmarkBindings);
  }
  if (
    process.env.SWAGGER_ENABLED?.trim().toLowerCase() === 'true'
    && process.env.SWAGGER_REQUIRE_AUTH?.trim().toLowerCase() !== 'false'
  ) {
    bindings.push(...swaggerBindings);
  }
  if (process.env.PAYMENT_WEBHOOKS_ENABLED?.trim().toLowerCase() === 'true') {
    bindings.push(...paymentWebhookBindings);
  }
  if (process.env.LOGISTICS_WEBHOOKS_ENABLED?.trim().toLowerCase() === 'true') {
    bindings.push(...logisticsWebhookBindings);
  }
  await loadBindings(bindings);
}

export async function loadMigrationSecrets(): Promise<void> {
  await loadBindings([...migrationDatabaseBindings, ...migrationAdminBindings]);
}

export async function loadAdminSeedSecrets(): Promise<void> {
  await loadBindings([...migrationDatabaseBindings, ...adminBindings]);
}

export function clearLoadedSecrets(): void {
  for (const key of loadedEnvironmentKeys) delete process.env[key];
  loadedEnvironmentKeys.clear();
}
