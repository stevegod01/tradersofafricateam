import 'reflect-metadata';
import mysql, { Connection } from 'mysql2/promise';
import { clearLoadedSecrets, loadMigrationSecrets } from '../config/key-vault';
import { requireEnv } from '../config/environment';

const temporaryDdlPrivileges = 'CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER';

interface TriggerTableRow {
  tableName?: string;
}

function validateMysqlIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(value)) {
    throw new Error(`${label} contains unsupported characters`);
  }
  return value;
}

async function setTemporaryDdl(
  connection: Connection,
  databaseName: string,
  migrationUsername: string,
  grant: boolean,
): Promise<void> {
  const operation = grant ? 'GRANT' : 'REVOKE';
  const target = `\`${databaseName}\`.*`;
  const account = `\`${migrationUsername}\`@'%'`;
  const direction = grant ? `ON ${target} TO` : `ON ${target} FROM`;
  await connection.query(`${operation} ${temporaryDdlPrivileges} ${direction} ${account}`);
}

async function preserveTriggerDefinerPrivileges(
  connection: Connection,
  databaseName: string,
  migrationUsername: string,
): Promise<number> {
  const [rows] = await connection.query(
    `
      SELECT DISTINCT EVENT_OBJECT_TABLE AS tableName
      FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = ?
        AND DEFINER = CONCAT(?, '@%')
    `,
    [databaseName, migrationUsername],
  );

  let grantedTables = 0;
  for (const row of rows as TriggerTableRow[]) {
    if (!row.tableName) continue;
    const tableName = validateMysqlIdentifier(row.tableName, 'trigger table name');
    await connection.query(
      `GRANT TRIGGER ON \`${databaseName}\`.\`${tableName}\` TO \`${migrationUsername}\`@'%'`,
    );
    grantedTables += 1;
  }

  return grantedTables;
}

async function runMigrations(): Promise<void> {
  await loadMigrationSecrets();
  const migrationUsername = validateMysqlIdentifier(requireEnv('DB_USERNAME'), 'DB_USERNAME');
  const databaseName = validateMysqlIdentifier(requireEnv('DB_NAME'), 'DB_NAME');
  const adminUsername = validateMysqlIdentifier(requireEnv('DB_ADMIN_USERNAME'), 'DB_ADMIN_USERNAME');
  const adminPassword = requireEnv('DB_ADMIN_PASSWORD');
  const { AppDataSource } = await import('../database/data-source');
  const { databaseConfig } = await import('../config/database');
  clearLoadedSecrets();

  let adminConnection: Connection | undefined;
  let ddlGranted = false;
  try {
    adminConnection = await mysql.createConnection({
      host: databaseConfig.host,
      port: databaseConfig.port,
      user: adminUsername,
      password: adminPassword,
      database: databaseConfig.name,
      ssl: databaseConfig.ssl,
    });
    await setTemporaryDdl(adminConnection, databaseName, migrationUsername, true);
    ddlGranted = true;
    console.log('[Migration] Temporary DDL permissions granted');

    await AppDataSource.initialize();
    const migrations = await AppDataSource.runMigrations({ transaction: 'all' });
    console.log(`[Migration] Applied ${migrations.length} migration(s)`);
    const grantedTables = await preserveTriggerDefinerPrivileges(
      adminConnection,
      databaseName,
      migrationUsername,
    );
    console.log(
      `[Migration] Preserved TRIGGER permission for ${grantedTables} table(s)`,
    );
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    if (adminConnection) {
      try {
        if (ddlGranted) {
          await setTemporaryDdl(adminConnection, databaseName, migrationUsername, false);
          console.log('[Migration] Temporary DDL permissions revoked');
        }
      } finally {
        await adminConnection.end();
      }
    }
  }
}

void runMigrations().catch((error: unknown) => {
  clearLoadedSecrets();
  console.error('[Migration] Failed:', error);
  process.exit(1);
});
