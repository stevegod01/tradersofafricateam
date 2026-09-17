import fs from 'fs';
import { environment, parseBoolean, requireEnv } from './environment';

const isProd = environment === 'production';
const sslEnabled = parseBoolean(process.env.DB_SSL, isProd);

if (isProd && !sslEnabled) {
  throw new Error('DB_SSL cannot be disabled in production');
}

const caFile = process.env.DB_SSL_CA_FILE?.trim();
const ssl = sslEnabled
  ? {
      rejectUnauthorized: true,
      ...(caFile ? { ca: fs.readFileSync(caFile, 'utf8') } : {}),
    }
  : undefined;

export const databaseConfig = {
  host: requireEnv('DB_HOST'),
  port: Number.parseInt(process.env.DB_PORT || '3306', 10),
  username: requireEnv('DB_USERNAME'),
  password: requireEnv('DB_PASSWORD'),
  name: requireEnv('DB_NAME'),
  ssl,
  isProd,
  isDev: environment === 'development',
} as const;
