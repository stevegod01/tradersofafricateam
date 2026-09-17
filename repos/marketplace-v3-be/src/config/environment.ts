import dotenv from 'dotenv';
import path from 'path';

export const environment = process.env.NODE_ENV || 'development';
const isAppService = Boolean(process.env.WEBSITE_SITE_NAME?.trim());

if (isAppService && environment !== 'production') {
  throw new Error('Azure App Service must run with NODE_ENV=production');
}

// Azure App Service and Key Vault supply deployed configuration. Production
// must never depend on a plaintext .env.production file.
if (environment !== 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), `.env.${environment}`) });
  dotenv.config({
    path: path.resolve(process.cwd(), `.env.${environment}.local`),
    override: true,
  });
}

export function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Expected a boolean value, received: ${value}`);
}
