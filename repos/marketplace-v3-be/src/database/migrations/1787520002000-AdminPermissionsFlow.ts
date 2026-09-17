import { MigrationInterface, QueryRunner } from 'typeorm';
import { ADMIN_PERMISSION_DEFINITIONS } from '../../modules/admin/admin.permissions';

export class AdminPermissionsFlow1787520002000 implements MigrationInterface {
  name = 'AdminPermissionsFlow1787520002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`admin_roles\` (
        \`id\`          VARCHAR(36) NOT NULL,
        \`name\`        VARCHAR(120) NOT NULL,
        \`description\` TEXT NULL,
        \`status\`      ENUM('active','inactive') NOT NULL DEFAULT 'active',
        \`createdBy\`   VARCHAR(36) NULL,
        \`createdAt\`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_admin_roles_name\` (\`name\`),
        INDEX \`IDX_admin_roles_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`permissions\` (
        \`id\`          VARCHAR(36) NOT NULL,
        \`code\`        VARCHAR(120) NOT NULL,
        \`name\`        VARCHAR(160) NOT NULL,
        \`description\` TEXT NOT NULL,
        \`module\`      VARCHAR(80) NOT NULL,
        \`status\`      ENUM('active','inactive') NOT NULL DEFAULT 'active',
        \`createdAt\`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_permissions_code\` (\`code\`),
        INDEX \`IDX_permissions_module\` (\`module\`),
        INDEX \`IDX_permissions_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`admin_role_permissions\` (
        \`id\`           VARCHAR(36) NOT NULL,
        \`roleId\`       VARCHAR(36) NOT NULL,
        \`permissionId\` VARCHAR(36) NOT NULL,
        \`createdAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_admin_role_permissions_role_permission\` (\`roleId\`, \`permissionId\`),
        INDEX \`IDX_admin_role_permissions_roleId\` (\`roleId\`),
        INDEX \`IDX_admin_role_permissions_permissionId\` (\`permissionId\`),
        CONSTRAINT \`FK_admin_role_permissions_roleId\`
          FOREIGN KEY (\`roleId\`) REFERENCES \`admin_roles\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_admin_role_permissions_permissionId\`
          FOREIGN KEY (\`permissionId\`) REFERENCES \`permissions\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`admin_audit_events\` (
        \`id\`            VARCHAR(36) NOT NULL,
        \`eventType\`     VARCHAR(120) NOT NULL,
        \`actorAdminId\`  VARCHAR(36) NULL,
        \`targetAdminId\` VARCHAR(36) NULL,
        \`targetUserId\`  VARCHAR(36) NULL,
        \`targetRoleId\`  VARCHAR(36) NULL,
        \`metadata\`      JSON NULL,
        \`createdAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_admin_audit_events_eventType\` (\`eventType\`),
        INDEX \`IDX_admin_audit_events_actorAdminId\` (\`actorAdminId\`),
        INDEX \`IDX_admin_audit_events_targetAdminId\` (\`targetAdminId\`),
        INDEX \`IDX_admin_audit_events_targetUserId\` (\`targetUserId\`),
        INDEX \`IDX_admin_audit_events_targetRoleId\` (\`targetRoleId\`),
        INDEX \`IDX_admin_audit_events_createdAt\` (\`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    for (const permission of ADMIN_PERMISSION_DEFINITIONS) {
      await queryRunner.query(
        `
          INSERT IGNORE INTO \`permissions\`
            (\`id\`, \`code\`, \`name\`, \`description\`, \`module\`, \`status\`)
          VALUES (UUID(), ?, ?, ?, ?, 'active')
        `,
        [
          permission.code,
          permission.name,
          permission.description,
          permission.module,
        ],
      );
    }

    await queryRunner.query(`
      ALTER TABLE \`admins\`
      ADD \`roleId\` VARCHAR(36) NULL,
      ADD \`isSuperAdmin\` TINYINT(1) NOT NULL DEFAULT 0,
      ADD \`lastLoginAt\` TIMESTAMP NULL,
      ADD \`failedLoginAttempts\` INT NOT NULL DEFAULT 0,
      ADD \`lockedUntil\` TIMESTAMP NULL,
      ADD \`deactivatedBy\` VARCHAR(36) NULL,
      ADD \`deactivatedAt\` TIMESTAMP NULL,
      ADD \`deactivationReason\` TEXT NULL,
      ADD \`setupTokenHash\` VARCHAR(255) NULL,
      ADD \`setupTokenExpiry\` TIMESTAMP NULL,
      ADD \`setupTokenUsedAt\` TIMESTAMP NULL,
      ADD \`passwordResetToken\` VARCHAR(255) NULL,
      ADD \`passwordResetExpiry\` TIMESTAMP NULL,
      ADD \`authVersion\` INT NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE \`admins\`
      SET \`isSuperAdmin\` = CASE WHEN \`role\` = 'super_admin' THEN 1 ELSE 0 END
    `);

    await this.createLegacyRole(queryRunner, 'Administrator', 'Migrated default administrative role.', 'admin');
    await this.createLegacyRole(queryRunner, 'Support Agent', 'Migrated support administrative role.', 'support_agent');
    await this.createLegacyRole(queryRunner, 'Finance Officer', 'Migrated finance administrative role.', 'finance');

    await this.assignPermissionsToRoleByName(
      queryRunner,
      'Administrator',
      ADMIN_PERMISSION_DEFINITIONS.map((permission) => permission.code),
    );
    await this.assignPermissionsToRoleByName(queryRunner, 'Support Agent', [
      'users.view',
      'sellers.view',
      'sellers.verify',
      'sellers.reject',
      'orders.view',
      'disputes.view',
      'disputes.request_information',
      'reviews.view',
      'reviews.moderate',
    ]);
    await this.assignPermissionsToRoleByName(queryRunner, 'Finance Officer', [
      'payments.view',
      'payments.verify',
      'payments.reject',
      'analytics.view_revenue',
      'analytics.view_payments',
      'subscriptions.view',
    ]);

    await queryRunner.query(`
      UPDATE \`admins\` a
      JOIN \`admin_roles\` r ON r.\`name\` = 'Administrator'
      SET a.\`roleId\` = r.\`id\`
      WHERE a.\`role\` = 'admin' AND a.\`isSuperAdmin\` = 0
    `);

    await queryRunner.query(`
      UPDATE \`admins\` a
      JOIN \`admin_roles\` r ON r.\`name\` = 'Support Agent'
      SET a.\`roleId\` = r.\`id\`
      WHERE a.\`role\` = 'support_agent' AND a.\`isSuperAdmin\` = 0
    `);

    await queryRunner.query(`
      UPDATE \`admins\` a
      JOIN \`admin_roles\` r ON r.\`name\` = 'Finance Officer'
      SET a.\`roleId\` = r.\`id\`
      WHERE a.\`role\` = 'finance' AND a.\`isSuperAdmin\` = 0
    `);

    await queryRunner.query(`
      UPDATE \`admins\`
      SET
        \`deactivationReason\` = \`statusReason\`,
        \`deactivatedAt\` = CASE WHEN \`status\` IN ('inactive', 'suspended') THEN NOW() ELSE NULL END
      WHERE \`statusReason\` IS NOT NULL OR \`status\` IN ('inactive', 'suspended')
    `);

    await queryRunner.query(`
      UPDATE \`admins\`
      SET \`status\` = 'inactive'
      WHERE \`status\` = 'suspended'
    `);

    await queryRunner.query(`
      ALTER TABLE \`admins\`
      MODIFY \`passwordHash\` VARCHAR(255) NULL,
      MODIFY \`status\` ENUM('pending','active','inactive','suspended') NOT NULL DEFAULT 'pending'
    `);

    // Keep the legacy role/statusReason columns and index during this rollout.
    // Azure package rollback must remain compatible with the expanded schema.

    await queryRunner.query(`CREATE INDEX \`IDX_admins_roleId\` ON \`admins\` (\`roleId\`)`);
    await queryRunner.query(`CREATE INDEX \`IDX_admins_isSuperAdmin\` ON \`admins\` (\`isSuperAdmin\`)`);
    await queryRunner.query(`CREATE INDEX \`IDX_admins_lockedUntil\` ON \`admins\` (\`lockedUntil\`)`);

    await queryRunner.query(`
      ALTER TABLE \`users\`
      ADD \`disabledBy\` VARCHAR(36) NULL,
      ADD \`disabledAt\` TIMESTAMP NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
      DROP COLUMN \`disabledAt\`,
      DROP COLUMN \`disabledBy\`
    `);

    await queryRunner.query(`
      UPDATE \`admins\` a
      LEFT JOIN \`admin_roles\` r ON r.\`id\` = a.\`roleId\`
      SET
        a.\`role\` = CASE
          WHEN a.\`isSuperAdmin\` = 1 THEN 'super_admin'
          WHEN LOWER(r.\`name\`) LIKE '%finance%' THEN 'finance'
          WHEN LOWER(r.\`name\`) LIKE '%support%' THEN 'support_agent'
          ELSE 'admin'
        END,
        a.\`statusReason\` = a.\`deactivationReason\`
    `);

    await queryRunner.query(`
      UPDATE \`admins\`
      SET \`status\` = 'inactive'
      WHERE \`status\` = 'pending'
    `);

    await queryRunner.query(`
      UPDATE \`admins\`
      SET \`passwordHash\` = ''
      WHERE \`passwordHash\` IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`admins\`
      MODIFY \`passwordHash\` VARCHAR(255) NOT NULL,
      MODIFY \`status\` ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active'
    `);

    await queryRunner.query(`DROP INDEX \`IDX_admins_lockedUntil\` ON \`admins\``);
    await queryRunner.query(`DROP INDEX \`IDX_admins_isSuperAdmin\` ON \`admins\``);
    await queryRunner.query(`DROP INDEX \`IDX_admins_roleId\` ON \`admins\``);

    await queryRunner.query(`
      ALTER TABLE \`admins\`
      DROP COLUMN \`authVersion\`,
      DROP COLUMN \`passwordResetExpiry\`,
      DROP COLUMN \`passwordResetToken\`,
      DROP COLUMN \`setupTokenUsedAt\`,
      DROP COLUMN \`setupTokenExpiry\`,
      DROP COLUMN \`setupTokenHash\`,
      DROP COLUMN \`deactivationReason\`,
      DROP COLUMN \`deactivatedAt\`,
      DROP COLUMN \`deactivatedBy\`,
      DROP COLUMN \`lockedUntil\`,
      DROP COLUMN \`failedLoginAttempts\`,
      DROP COLUMN \`lastLoginAt\`,
      DROP COLUMN \`isSuperAdmin\`,
      DROP COLUMN \`roleId\`
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS \`admin_role_permissions\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`admin_audit_events\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`permissions\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`admin_roles\``);
  }

  private async createLegacyRole(
    queryRunner: QueryRunner,
    name: string,
    description: string,
    legacyRole: string,
  ): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO \`admin_roles\`
          (\`id\`, \`name\`, \`description\`, \`status\`, \`createdBy\`)
        SELECT UUID(), ?, ?, 'active', NULL
        WHERE EXISTS (
          SELECT 1 FROM \`admins\` WHERE \`role\` = ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM \`admin_roles\` WHERE \`name\` = ?
        )
      `,
      [name, description, legacyRole, name],
    );
  }

  private async assignPermissionsToRoleByName(
    queryRunner: QueryRunner,
    roleName: string,
    permissionCodes: readonly string[],
  ): Promise<void> {
    for (const permissionCode of permissionCodes) {
      await queryRunner.query(
        `
          INSERT IGNORE INTO \`admin_role_permissions\`
            (\`id\`, \`roleId\`, \`permissionId\`)
          SELECT UUID(), r.\`id\`, p.\`id\`
          FROM \`admin_roles\` r
          JOIN \`permissions\` p ON p.\`code\` = ?
          WHERE r.\`name\` = ?
        `,
        [permissionCode, roleName],
      );
    }
  }
}
