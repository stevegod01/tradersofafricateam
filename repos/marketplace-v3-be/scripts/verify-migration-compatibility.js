'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });

  const currentId = randomUUID();
  const legacyId = randomUUID();
  const passwordlessCurrentId = randomUUID();
  const currentPlanId = randomUUID();
  const legacyPlanId = randomUUID();
  const longPhone = `+${'1'.repeat(29)}`;

  try {
    await connection.execute(
      `INSERT INTO users
        (id, firstName, lastName, email, passwordHash, phoneNumber,
         userType, currentStatus, isEmailVerified, isCompanyVerified)
       VALUES (?, 'Current', 'Package', ?, 'current-hash', ?,
         'buyer', 'inactive', 0, 0)`,
      [currentId, `current-${currentId}@example.test`, longPhone],
    );

    const [[current]] = await connection.execute(
      `SELECT password, passwordHash, phone, phoneNumber, status, currentStatus
       FROM users WHERE id = ?`,
      [currentId],
    );
    assert.equal(current.password, 'current-hash');
    assert.equal(current.passwordHash, 'current-hash');
    assert.equal(current.phone, longPhone);
    assert.equal(current.phoneNumber, longPhone);
    assert.equal(current.status, 'suspended');
    assert.equal(current.currentStatus, 'inactive');

    await connection.execute(
      `INSERT INTO users
        (id, firstName, lastName, email, password, phone,
         userType, status, isEmailVerified, isCompanyVerified)
       VALUES (?, 'Legacy', 'Package', ?, 'legacy-hash', '+2348000000000',
         'buyer', 'active', 1, 0)`,
      [legacyId, `legacy-${legacyId}@example.test`],
    );

    const [[legacy]] = await connection.execute(
      `SELECT password, passwordHash, phone, phoneNumber, status, currentStatus
       FROM users WHERE id = ?`,
      [legacyId],
    );
    assert.equal(legacy.passwordHash, 'legacy-hash');
    assert.equal(legacy.phoneNumber, '+2348000000000');
    assert.equal(legacy.status, 'active');
    assert.equal(legacy.currentStatus, 'active');

    await connection.execute(
      `INSERT INTO users
        (id, firstName, lastName, email, passwordHash, phoneNumber,
         userType, currentStatus, isEmailVerified, isCompanyVerified)
       VALUES (?, 'Passwordless', 'Current', ?, NULL, NULL,
         'buyer', 'inactive', 1, 0)`,
      [passwordlessCurrentId, `passwordless-${passwordlessCurrentId}@example.test`],
    );
    const [[passwordlessCurrent]] = await connection.execute(
      `SELECT password, passwordHash, status, currentStatus
       FROM users WHERE id = ?`,
      [passwordlessCurrentId],
    );
    assert.equal(passwordlessCurrent.passwordHash, null);
    assert.ok(passwordlessCurrent.password.length > 0);
    assert.equal(passwordlessCurrent.status, 'suspended');
    assert.equal(passwordlessCurrent.currentStatus, 'inactive');

    await connection.execute(
      `UPDATE users SET currentStatus = 'deleted', passwordHash = 'current-hash-2'
       WHERE id = ?`,
      [currentId],
    );
    const [[currentUpdated]] = await connection.execute(
      'SELECT password, status FROM users WHERE id = ?',
      [currentId],
    );
    assert.equal(currentUpdated.password, 'current-hash-2');
    assert.equal(currentUpdated.status, 'banned');

    await connection.execute(
      `UPDATE users SET status = 'suspended', phone = ? WHERE id = ?`,
      [longPhone, legacyId],
    );
    const [[legacyUpdated]] = await connection.execute(
      'SELECT phoneNumber, currentStatus FROM users WHERE id = ?',
      [legacyId],
    );
    assert.equal(legacyUpdated.phoneNumber, longPhone);
    assert.equal(legacyUpdated.currentStatus, 'disabled');

    const [triggerRows] = await connection.execute(
      `SELECT TRIGGER_NAME AS triggerName
       FROM information_schema.TRIGGERS
       WHERE TRIGGER_SCHEMA = DATABASE()
         AND TRIGGER_NAME IN (
           'TR_direct_rfqs_i18n_compat_insert',
           'TR_direct_rfqs_i18n_compat_update',
           'TR_market_rfqs_i18n_compat_insert',
           'TR_market_rfqs_i18n_compat_update',
           'TR_subscription_plans_i18n_compat_insert',
           'TR_subscription_plans_i18n_compat_update'
         )`,
    );
    assert.equal(triggerRows.length, 6);

    await connection.execute(
      `INSERT INTO subscription_plans
        (id, name_i18n, description_i18n, sourceLanguage, audience, status)
       VALUES (?, JSON_OBJECT('en', 'Current plan'),
         JSON_OBJECT('en', 'Current description'), 'en', 'seller', 'draft')`,
      [currentPlanId],
    );
    const [[currentPlan]] = await connection.execute(
      `SELECT name, description FROM subscription_plans WHERE id = ?`,
      [currentPlanId],
    );
    assert.equal(currentPlan.name, 'Current plan');
    assert.equal(currentPlan.description, 'Current description');

    await connection.execute(
      `INSERT INTO subscription_plans (id, name, description, audience, status)
       VALUES (?, 'Legacy plan', 'Legacy description', 'seller', 'draft')`,
      [legacyPlanId],
    );
    const [[legacyPlan]] = await connection.execute(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(name_i18n, '$.en')) AS name,
              JSON_UNQUOTE(JSON_EXTRACT(description_i18n, '$.en')) AS description
       FROM subscription_plans WHERE id = ?`,
      [legacyPlanId],
    );
    assert.equal(legacyPlan.name, 'Legacy plan');
    assert.equal(legacyPlan.description, 'Legacy description');

    await connection.execute(
      `UPDATE subscription_plans
       SET name_i18n = JSON_OBJECT('en', 'Current plan updated')
       WHERE id = ?`,
      [currentPlanId],
    );
    const [[currentPlanUpdated]] = await connection.execute(
      'SELECT name FROM subscription_plans WHERE id = ?',
      [currentPlanId],
    );
    assert.equal(currentPlanUpdated.name, 'Current plan updated');

    await connection.execute(
      `UPDATE subscription_plans SET name = 'Legacy plan updated' WHERE id = ?`,
      [legacyPlanId],
    );
    const [[legacyPlanUpdated]] = await connection.execute(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(name_i18n, '$.en')) AS name
       FROM subscription_plans WHERE id = ?`,
      [legacyPlanId],
    );
    assert.equal(legacyPlanUpdated.name, 'Legacy plan updated');

    console.log('Current and rollback package database writes are compatible');
  } finally {
    await connection.execute('DELETE FROM subscription_plans WHERE id IN (?, ?)', [
      currentPlanId,
      legacyPlanId,
    ]);
    await connection.execute('DELETE FROM users WHERE id IN (?, ?, ?)', [
      currentId,
      legacyId,
      passwordlessCurrentId,
    ]);
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Migration compatibility verification failed:', error.message);
  process.exit(1);
});
