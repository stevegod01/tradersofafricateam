import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { clearLoadedSecrets, loadRuntimeSecrets } from './config/key-vault';

let dataSource: DataSource | undefined;

async function bootstrap(): Promise<void> {
  try {
    await loadRuntimeSecrets();
    const [{ AppDataSource }, { buildApp }, { config }] = await Promise.all([
      import('./database/data-source'),
      import('./app'),
      import('./config'),
    ]);
    clearLoadedSecrets();
    dataSource = AppDataSource;

    console.log(`[Bootstrap] Connecting to database (${config.env})...`);
    await AppDataSource.initialize();
    console.log('[Bootstrap] Database connected');

    // Migrations are an explicit release step and never run during startup.
    const app = await buildApp();
    await app.listen({ port: config.app.port, host: config.app.host });
    console.log(`[Bootstrap] Server listening on ${config.app.host}:${config.app.port}`);
    if (config.swagger.enabled) {
      console.log('[Bootstrap] Swagger docs enabled at /api/docs');
    }
  } catch (err) {
    clearLoadedSecrets();
    console.error('[Bootstrap] Startup failed:', err);
    process.exit(1);
  }
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`[Shutdown] Received ${signal}`);
  try {
    if (dataSource?.isInitialized) await dataSource.destroy();
    process.exit(0);
  } catch (err) {
    console.error('[Shutdown] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason);
  process.exit(1);
});

void bootstrap();
