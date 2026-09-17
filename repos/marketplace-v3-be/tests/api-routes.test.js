'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_URL: 'http://127.0.0.1:3000/api',
  FRONTEND_URL: 'http://127.0.0.1:5173',
  CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001,http://localhost:5173',
  DB_HOST: '127.0.0.1',
  DB_USERNAME: 'test',
  DB_PASSWORD: 'test',
  DB_NAME: 'test',
  DB_SSL: 'true',
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough',
  EMAIL_DELIVERY_ENABLED: 'false',
  SWAGGER_ENABLED: 'true',
  SWAGGER_REQUIRE_AUTH: 'true',
  SWAGGER_USERNAME: 'docs-user',
  SWAGGER_PASSWORD: 'docs-password',
  AZURE_STORAGE_ACCOUNT_NAME: 'teststorageaccount',
});

const { buildApp } = require('../dist/app');
const { AppDataSource } = require('../dist/database/data-source');
const { config } = require('../dist/config');
const { parseBoolean } = require('../dist/config/environment');
const {
  UploadValidationError,
  validateAndProcessUpload,
} = require('../dist/common/utils/file-upload.util');
const { ensureEmailDeliveryEnabled } = require('../dist/common/utils/email.service');
const {
  productRelevanceExpression,
} = require('../dist/modules/search/search.service');
const {
  AlignUserAdminDocs1787520001000,
} = require('../dist/database/migrations/1787520001000-AlignUserAdminDocs');
const {
  RepairUserSignupSchema1787520016000,
} = require('../dist/database/migrations/1787520016000-RepairUserSignupSchema');
const {
  AddInternationalizationLocalization1787520012000,
} = require('../dist/database/migrations/1787520012000-AddInternationalizationLocalization');
const {
  RefreshDeploymentCompatibility1787520017000,
} = require('../dist/database/migrations/1787520017000-RefreshDeploymentCompatibility');

test('platform booleans and verified database TLS are enforced', () => {
  assert.equal(parseBoolean('False', true), false);
  assert.equal(parseBoolean(' TRUE ', false), true);
  assert.throws(() => parseBoolean('enabled', false), /Expected a boolean value/);
  assert.equal(config.db.ssl.rejectUnauthorized, true);
  assert.deepEqual(config.disputes.allowedEvidenceMimeTypes, [
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);
});

test('search relevance SQL uses a driver parameter instead of embedding input', () => {
  const payload = String.raw`\'; SELECT SLEEP(5); --`;
  const expression = productRelevanceExpression(payload);
  assert.match(expression, /:productRelevanceSearch/);
  assert.doesNotMatch(expression, /SLEEP|SELECT/);
});

test('production rejects disabled database TLS', () => {
  const result = spawnSync(process.execPath, ['-e', `
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DB_SSL: 'false',
      DB_HOST: 'localhost',
      DB_USERNAME: 'user',
      DB_PASSWORD: 'password',
      DB_NAME: 'database'
    });
    require('./dist/config/database');
  `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /DB_SSL cannot be disabled/);
});

test('App Service refuses a non-production runtime mode', () => {
  const result = spawnSync(process.execPath, ['-e', `
    Object.assign(process.env, {
      WEBSITE_SITE_NAME: 'test-app',
      NODE_ENV: 'development'
    });
    require('./dist/config/environment');
  `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /must run with NODE_ENV=production/);
});

test('production Swagger cannot be exposed without authentication', () => {
  const result = spawnSync(process.execPath, ['-e', `
    Object.assign(process.env, {
      NODE_ENV: 'production',
      APP_URL: 'https://example.test/api',
      FRONTEND_URL: 'https://frontend.example.test',
      DB_HOST: 'localhost',
      DB_USERNAME: 'user',
      DB_PASSWORD: 'password',
      DB_NAME: 'database',
      DB_SSL: 'true',
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
      AZURE_STORAGE_ACCOUNT_NAME: 'teststorageaccount',
      SWAGGER_ENABLED: 'true',
      SWAGGER_REQUIRE_AUTH: 'false'
    });
    require('./dist/config');
  `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /Production Swagger must require authentication/);
});

test('production runtime refuses plaintext secret environment values', () => {
  const result = spawnSync(process.execPath, ['-e', `
    Object.assign(process.env, {
      NODE_ENV: 'production',
      KEY_VAULT_NAME: 'test-vault',
      DB_USERNAME: 'plaintext-user'
    });
    require('./dist/config/key-vault').loadRuntimeSecrets()
      .then(() => process.exit(0))
      .catch((error) => { console.error(error.message); process.exit(1); });
  `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /must come directly from Azure Key Vault/);
});

test('migration data source does not require runtime JWT, Postmark, or Blob secrets', () => {
  const result = spawnSync(process.execPath, ['-e', `
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DB_SSL: 'true',
      DB_HOST: 'localhost',
      DB_USERNAME: 'migration_user',
      DB_PASSWORD: 'migration_password',
      DB_NAME: 'database'
    });
    require('./dist/database/data-source');
  `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test('all TypeORM entity metadata builds without a database connection', async () => {
  await AppDataSource.buildMetadatas();
  assert.ok(AppDataSource.entityMetadatas.length >= 60);
  assert.ok(AppDataSource.entityMetadatas.some(
    (metadata) => metadata.tableName === 'notifications',
  ));
});

test('user schema migrations remain compatible with the rollback package', async () => {
  const statements = [];
  await new AlignUserAdminDocs1787520001000().up({
    query: async (sql) => statements.push(sql),
  });
  const sql = statements.join('\n');

  assert.match(sql, /ADD `passwordHash`/);
  assert.match(sql, /ADD `phoneNumber`/);
  assert.match(sql, /MODIFY `phone` VARCHAR\(30\)/);
  assert.match(sql, /ADD `currentStatus`/);
  assert.match(sql, /CREATE TRIGGER `TR_users_credentials_compat_insert`/);
  assert.match(sql, /CREATE TRIGGER `TR_users_credentials_compat_update`/);
  assert.match(sql, /DECLARE legacy_write BOOLEAN/);
  assert.doesNotMatch(sql, /CHANGE `password`/);
  assert.doesNotMatch(sql, /CHANGE `phone`/);
  assert.match(sql, /WHEN 'deleted' THEN 'banned'/);
  assert.match(sql, /ELSE 'suspended'/);
  assert.match(sql, /WHEN 'suspended' THEN 'disabled'/);
  assert.match(sql, /WHEN 'banned' THEN 'deleted'/);

  const repairStatements = [];
  await new RepairUserSignupSchema1787520016000().up({
    hasTable: async () => true,
    hasColumn: async () => true,
    query: async (statement) => {
      repairStatements.push(statement);
      return /information_schema\.statistics/.test(statement) ? [{ present: 1 }] : [];
    },
  });
  const repairSql = repairStatements.join('\n');

  assert.doesNotMatch(repairSql, /CHANGE `password`/);
  assert.doesNotMatch(repairSql, /CHANGE `phone`/);
  assert.doesNotMatch(repairSql, /DROP COLUMN/);
  assert.match(repairSql, /DROP TRIGGER IF EXISTS \`TR_users_credentials_compat_insert\`/);
  assert.match(repairSql, /DECLARE legacy_write BOOLEAN/);
  assert.match(repairSql, /IF legacy_write THEN/);
  assert.match(repairSql, /MODIFY `status` ENUM\('active','suspended','banned'\)/);
  assert.match(repairSql, /MODIFY `currentStatus` ENUM\('active','inactive','disabled','deleted'\)/);
  assert.match(repairSql, /`passwordHash` = COALESCE\(`passwordHash`, `password`\)/);
  assert.match(repairSql, /WHEN 'deleted' THEN 'banned'/);
});

test('localization migration preserves rollback-package text columns', async () => {
  const statements = [];
  await new AddInternationalizationLocalization1787520012000().up({
    query: async (sql) => statements.push(sql),
  });
  const sql = statements.join('\n');

  assert.match(sql, /ADD COLUMN `description_i18n` JSON/);
  assert.match(sql, /ADD COLUMN `buyerNotes_i18n` JSON/);
  assert.match(sql, /ADD COLUMN `name_i18n` JSON/);
  assert.match(sql, /CREATE TRIGGER `TR_direct_rfqs_i18n_compat_insert`/);
  assert.match(sql, /CREATE TRIGGER `TR_direct_rfqs_i18n_compat_update`/);
  assert.match(sql, /CREATE TRIGGER `TR_market_rfqs_i18n_compat_insert`/);
  assert.match(sql, /CREATE TRIGGER `TR_market_rfqs_i18n_compat_update`/);
  assert.match(sql, /CREATE TRIGGER `TR_subscription_plans_i18n_compat_insert`/);
  assert.match(sql, /CREATE TRIGGER `TR_subscription_plans_i18n_compat_update`/);
  assert.doesNotMatch(sql, /CHANGE `description`/);
  assert.doesNotMatch(sql, /CHANGE `buyerNotes`/);
  assert.doesNotMatch(sql, /CHANGE `name`/);
  assert.doesNotMatch(sql, /DROP COLUMN/);
});

test('forward repair converts already-applied destructive localization layouts', async () => {
  const tableColumns = new Map([
    ['direct_rfqs', new Map([
      ['description', 'json'],
      ['buyerNotes', 'json'],
      ['sourceLanguage', 'varchar'],
    ])],
    ['market_rfqs', new Map([
      ['buyerNotes', 'json'],
      ['sourceLanguage', 'varchar'],
    ])],
    ['subscription_plans', new Map([
      ['name', 'json'],
      ['description', 'json'],
      ['sourceLanguage', 'varchar'],
    ])],
  ]);
  const statements = [];

  await new RefreshDeploymentCompatibility1787520017000().up({
    hasTable: async () => true,
    hasColumn: async (table, column) => (
      table === 'users' || tableColumns.get(table)?.has(column) === true
    ),
    query: async (statement, parameters = []) => {
      statements.push(statement);
      if (/information_schema\.statistics/.test(statement)) return [{ present: 1 }];
      if (/information_schema\.triggers/.test(statement)) return [];
      if (/information_schema\.columns/.test(statement)) {
        const [table, column] = parameters;
        const dataType = tableColumns.get(table)?.get(column);
        return dataType ? [{ dataType }] : [];
      }

      const change = statement.match(
        /ALTER TABLE `([^`]+)`\s+CHANGE COLUMN `([^`]+)` `([^`]+)` JSON NULL/,
      );
      if (change) {
        const [, table, oldColumn, newColumn] = change;
        tableColumns.get(table)?.delete(oldColumn);
        tableColumns.get(table)?.set(newColumn, 'json');
      }

      const add = statement.match(
        /ALTER TABLE `([^`]+)`\s+ADD COLUMN `([^`]+)` ([A-Z]+(?:\(\d+\))?)/,
      );
      if (add) {
        const [, table, column, dataType] = add;
        tableColumns.get(table)?.set(column, dataType.toLowerCase());
      }

      return [];
    },
  });

  const sql = statements.join('\n');
  assert.match(sql, /CHANGE COLUMN `description` `description_i18n` JSON NULL/);
  assert.match(sql, /CHANGE COLUMN `buyerNotes` `buyerNotes_i18n` JSON NULL/);
  assert.match(sql, /CHANGE COLUMN `name` `name_i18n` JSON NULL/);
  assert.match(sql, /DROP TRIGGER IF EXISTS `TR_users_credentials_compat_insert`/);
  assert.match(sql, /CREATE TRIGGER `TR_users_credentials_compat_insert`/);
  assert.match(sql, /CREATE TRIGGER `TR_direct_rfqs_i18n_compat_insert`/);
  assert.match(sql, /CREATE TRIGGER `TR_market_rfqs_i18n_compat_insert`/);
  assert.match(sql, /CREATE TRIGGER `TR_subscription_plans_i18n_compat_insert`/);
  assert.doesNotMatch(sql, /DROP COLUMN/);
});

test('upload validation rejects content that does not match its declared MIME type', () => {
  assert.throws(
    () => validateAndProcessUpload({
      filename: 'forged.png',
      mimetype: 'image/png',
      buffer: Buffer.from('this is not a PNG'),
    }),
    UploadValidationError,
  );

  const valid = validateAndProcessUpload({
    filename: 'valid.png',
    mimetype: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  assert.match(valid.storedName, /^general\/\d+-[a-f0-9]{16}\.png$/);
});

test('account email workflows fail closed when delivery is disabled', () => {
  assert.throws(
    ensureEmailDeliveryEnabled,
    (error) => error.statusCode === 503 && error.code === 'EMAIL_DELIVERY_UNAVAILABLE',
  );
});

test('address and admin response fields survive Fastify serialization', async () => {
  const app = require('fastify')();
  const { CreateAddressSchema, GetAddressesSchema, AdminLoginSchema } = require('../dist/common/utils/swagger.schemas');
  const address = {
    id: 'address-id', userId: 'user-id', label: 'Home', recipientName: 'Test Buyer',
    phoneNumber: '+2348000000000', addressLine1: '1 Test Street', addressLine2: null,
    city: 'Lagos', state: 'Lagos', country: 'Nigeria', postalCode: null,
    isDefault: false, createdAt: '2026-09-11T00:00:00.000Z', updatedAt: '2026-09-11T00:00:00.000Z',
  };
  const role = { id: 'role-id', name: 'Support', description: null, status: 'active' };
  const cases = [
    ['POST', '/addresses', CreateAddressSchema, 201, { success: true, message: 'Address added successfully.', data: { id: address.id, isDefault: false } }],
    ['GET', '/addresses', GetAddressesSchema, 200, { success: true, data: [address] }],
    ['GET', '/empty-addresses', GetAddressesSchema, 200, { success: true, data: [] }],
    ['POST', '/admin/login', AdminLoginSchema, 200, { success: true, data: { token: 'test-token', admin: { id: 'admin-id', role } } }],
    ['POST', '/admin/no-role', AdminLoginSchema, 200, { success: true, data: { token: 'test-token', admin: { id: 'admin-id', role: null } } }],
  ];
  try {
    for (const [method, url, schema, status, payload] of cases) {
      app.route({ method, url, schema: { response: schema.response }, handler: async (_request, reply) => reply.code(status).send(payload) });
    }
    for (const [method, url, , status, payload] of cases) {
      const response = await app.inject({ method, url });
      assert.equal(response.statusCode, status);
      assert.deepEqual(response.json(), payload, url);
    }
  } finally {
    await app.close();
  }
});

test('all application routes are under /api and health verifies the database', async () => {
  const app = await buildApp();
  try {
    const legacyHealth = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(legacyHealth.statusCode, 404);

    const apiRoot = await app.inject({ method: 'GET', url: '/api' });
    assert.equal(apiRoot.statusCode, 200);
    assert.deepEqual(apiRoot.json(), {
      name: 'Traders of Africa',
      service: 'Marketplace API',
      version: '1.0.0',
      status: 'online',
      health: '/api/health',
    });

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(health.statusCode, 503);
    assert.equal(health.json().status, 'degraded');

    const originalInitialized = AppDataSource.isInitialized;
    const originalQuery = AppDataSource.query;
    let healthQuery;
    AppDataSource.isInitialized = true;
    AppDataSource.query = async (sql) => {
      healthQuery = sql;
      return [{ ok: 1 }];
    };
    const readyHealth = await app.inject({ method: 'GET', url: '/api/health' });
    AppDataSource.isInitialized = originalInitialized;
    AppDataSource.query = originalQuery;
    assert.equal(readyHealth.statusCode, 200);
    assert.equal(readyHealth.json().status, 'ok');
    assert.equal(healthQuery, 'SELECT 1 AS ok');

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {},
    });
    assert.notEqual(login.statusCode, 404);

    for (const origin of [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
    ]) {
      const preflight = await app.inject({
        method: 'OPTIONS',
        url: '/api/auth/signup',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      assert.equal(preflight.statusCode, 204);
      assert.equal(preflight.headers['access-control-allow-origin'], origin);
      assert.equal(preflight.headers['access-control-allow-credentials'], 'true');
    }

    const rejectedPreflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/signup',
      headers: {
        origin: 'https://unapproved.example',
        'access-control-request-method': 'POST',
      },
    });
    assert.equal(rejectedPreflight.headers['access-control-allow-origin'], undefined);

    const anonymousTermsUpdate = await app.inject({
      method: 'PATCH',
      url: '/api/auth/update-terms/user-1',
      payload: { termsOfUse: true },
    });
    assert.equal(anonymousTermsUpdate.statusCode, 401);

    const anonymousSearchEvent = await app.inject({
      method: 'POST',
      url: '/api/search/events',
      payload: {
        eventType: 'result_click',
        entityType: 'product',
        entityId: '00000000-0000-4000-8000-000000000001',
        position: 1,
      },
    });
    assert.equal(anonymousSearchEvent.statusCode, 401);

    const otherUserToken = app.jwt.sign({
      sub: 'user-2',
      email: 'other@example.test',
      role: 'buyer',
      tokenType: 'user',
    });
    const crossUserTermsUpdate = await app.inject({
      method: 'PATCH',
      url: '/api/auth/update-terms/user-1',
      headers: { authorization: `Bearer ${otherUserToken}` },
      payload: { termsOfUse: true },
    });
    assert.equal(crossUserTermsUpdate.statusCode, 403);

    const anonymousPaymentProof = await app.inject({
      method: 'GET',
      url: '/api/uploads/payment-proofs/1700000000000-0123456789abcdef.pdf',
    });
    assert.equal(anonymousPaymentProof.statusCode, 401);

    const anonymousMessageAttachment = await app.inject({
      method: 'GET',
      url: '/api/uploads/message-attachments/1700000000000-0123456789abcdef.pdf',
    });
    assert.equal(anonymousMessageAttachment.statusCode, 401);

    const paymentWebhook = await app.inject({
      method: 'POST',
      url: '/api/payments/webhooks/paystack',
      payload: {
        providerReference: 'provider-reference',
        amount: 100,
        currency: 'NGN',
        status: 'success',
      },
    });
    assert.equal(paymentWebhook.statusCode, 503);

    const logisticsWebhook = await app.inject({
      method: 'POST',
      url: '/api/logistics/webhooks/test-provider',
      payload: { status: 'in_transit' },
    });
    assert.equal(logisticsWebhook.statusCode, 503);

    const originalGetRepository = AppDataSource.getRepository;
    AppDataSource.getRepository = function getRepository(entity) {
      switch (entity.name) {
        case 'User':
          return { findOne: async () => ({ id: 'user-1', status: 'active' }) };
        case 'Payment':
          return { existsBy: async () => false };
        case 'MessageUpload':
          return { findOne: async () => ({ userId: 'user-2', status: 'attached' }) };
        case 'MessageAttachment':
          return {
            findOne: async () => ({
              message: { conversationId: 'conversation-1', status: 'sent' },
            }),
          };
        case 'ConversationParticipant':
          return { existsBy: async () => false };
        default:
          return originalGetRepository.call(AppDataSource, entity);
      }
    };
    try {
      const userToken = app.jwt.sign({
        sub: 'user-1',
        email: 'user@example.test',
        role: 'buyer',
        tokenType: 'user',
      });
      const crossUserPaymentProof = await app.inject({
        method: 'GET',
        url: '/api/uploads/payment-proofs/1700000000000-0123456789abcdef.pdf',
        headers: { authorization: `Bearer ${userToken}` },
      });
      assert.equal(crossUserPaymentProof.statusCode, 404);

      const nonParticipantAttachment = await app.inject({
        method: 'GET',
        url: '/api/uploads/message-attachments/1700000000000-0123456789abcdef.pdf',
        headers: { authorization: `Bearer ${userToken}` },
      });
      assert.equal(nonParticipantAttachment.statusCode, 404);
    } finally {
      AppDataSource.getRepository = originalGetRepository;
    }

    const unauthorizedDocs = await app.inject({ method: 'GET', url: '/api/docs/json' });
    assert.equal(unauthorizedDocs.statusCode, 401);
    assert.match(unauthorizedDocs.headers['www-authenticate'], /^Basic /);

    const authorizedDocs = await app.inject({
      method: 'GET',
      url: '/api/docs/json',
      headers: {
        authorization: `Basic ${Buffer.from('docs-user:docs-password').toString('base64')}`,
      },
    });
    assert.equal(authorizedDocs.statusCode, 200);
    assert.equal(authorizedDocs.json().info.title, 'Traders of Africa API');
    // Audit registered routes, including schemas built by module helpers.
    const emptyObjects = [];
    function inspectResponse(schema, location) {
      if (!schema || typeof schema !== 'object') return;
      if (schema.type === 'object' && !Object.keys(schema.properties ?? {}).length &&
          !schema.additionalProperties && !schema.patternProperties && !schema.$ref &&
          !schema.allOf && !schema.anyOf && !schema.oneOf) {
        emptyObjects.push(location);
      }
      for (const [key, value] of Object.entries(schema)) inspectResponse(value, `${location}.${key}`);
    }
    for (const [url, methods] of Object.entries(authorizedDocs.json().paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        inspectResponse(operation.responses, `${method} ${url}`);
      }
    }
    assert.deepEqual(emptyObjects, [], 'Response object schemas must define fields or explicitly allow additional properties');
  } finally {
    await app.close();
  }
});

test('public admin login bypasses the admin JWT hook while admin routes remain protected', async () => {
  const { AdminService } = require('../dist/modules/admin/admin.service');
  const originalLoginAdmin = AdminService.prototype.loginAdmin;
  AdminService.prototype.loginAdmin = async ({ email }) => ({
    success: true,
    message: 'Login successful.',
    data: {
      token: 'test-admin-token',
      admin: {
        id: 'admin-id',
        firstName: 'Test',
        lastName: 'Admin',
        phoneNumber: null,
        email,
        status: 'active',
        isSuperAdmin: true,
        role: null,
        permissions: [],
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    },
  });

  const app = await buildApp();
  try {
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: {
        email: 'admin@tradersofafrica.com',
        password: 'valid-test-password',
      },
    });
    assert.equal(login.statusCode, 200);
    assert.equal(login.json().data.token, 'test-admin-token');

    const currentAdmin = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/me',
    });
    assert.equal(currentAdmin.statusCode, 401);
    assert.equal(currentAdmin.json().message, 'Invalid or expired token');
  } finally {
    AdminService.prototype.loginAdmin = originalLoginAdmin;
    await app.close();
  }
});

test('startup and one-time admin seed contain no automatic migration or default credential path', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../dist/main.js'), 'utf8');
  const migrationRunner = fs.readFileSync(
    path.resolve(__dirname, '../dist/scripts/run-migrations.js'),
    'utf8',
  );
  const seed = fs.readFileSync(
    path.resolve(__dirname, '../dist/scripts/seed-admin.js'),
    'utf8',
  );
  assert.doesNotMatch(main, /runMigrations|showMigrations/);
  assert.doesNotMatch(seed, /Admin@123456|Password:/);
  assert.match(seed, /loadAdminSeedSecrets/);
  assert.match(migrationRunner, /information_schema\.TRIGGERS/);
  assert.match(migrationRunner, /GRANT TRIGGER ON/);
  assert.match(migrationRunner, /Temporary DDL permissions revoked/);
});
