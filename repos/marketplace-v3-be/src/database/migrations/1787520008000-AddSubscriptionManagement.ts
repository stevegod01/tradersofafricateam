import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionManagement1787520008000 implements MigrationInterface {
  name = 'AddSubscriptionManagement1787520008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`subscription_plans\` (
        \`id\`           VARCHAR(36) NOT NULL,
        \`name\`         VARCHAR(120) NOT NULL,
        \`description\`  TEXT NULL,
        \`audience\`     ENUM('seller','buyer','all') NOT NULL DEFAULT 'seller',
        \`status\`       ENUM('draft','active','inactive','archived') NOT NULL DEFAULT 'draft',
        \`isFree\`       TINYINT(1) NOT NULL DEFAULT 0,
        \`isDefault\`    TINYINT(1) NOT NULL DEFAULT 0,
        \`displayOrder\` INT NOT NULL DEFAULT 0,
        \`createdBy\`    VARCHAR(36) NULL,
        \`createdAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_subscription_plans_status_audience\` (\`status\`, \`audience\`),
        INDEX \`IDX_subscription_plans_default\` (\`audience\`, \`isDefault\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`subscription_plan_prices\` (
        \`id\`            VARCHAR(36) NOT NULL,
        \`planId\`        VARCHAR(36) NOT NULL,
        \`currency\`      VARCHAR(3) NOT NULL,
        \`amount\`        DECIMAL(18,2) NOT NULL,
        \`billingPeriod\` ENUM('free','monthly','quarterly','yearly') NOT NULL,
        \`status\`        ENUM('active','inactive') NOT NULL DEFAULT 'active',
        \`createdAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_subscription_plan_prices_plan_currency_period\` (\`planId\`, \`currency\`, \`billingPeriod\`),
        INDEX \`IDX_subscription_plan_prices_status\` (\`status\`),
        CONSTRAINT \`FK_subscription_plan_prices_planId\`
          FOREIGN KEY (\`planId\`) REFERENCES \`subscription_plans\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`entitlement_definitions\` (
        \`id\`           VARCHAR(36) NOT NULL,
        \`code\`         VARCHAR(120) NOT NULL,
        \`name\`         VARCHAR(160) NOT NULL,
        \`description\`  TEXT NULL,
        \`valueType\`    ENUM('boolean','integer','decimal','string','enum') NOT NULL,
        \`defaultValue\` JSON NULL,
        \`category\`     VARCHAR(80) NULL,
        \`status\`       ENUM('active','inactive') NOT NULL DEFAULT 'active',
        \`createdAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_entitlement_definitions_code\` (\`code\`),
        INDEX \`IDX_entitlement_definitions_status_category\` (\`status\`, \`category\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`subscription_plan_entitlements\` (
        \`id\`              VARCHAR(36) NOT NULL,
        \`planId\`          VARCHAR(36) NOT NULL,
        \`entitlementCode\` VARCHAR(120) NOT NULL,
        \`value\`           JSON NOT NULL,
        \`createdAt\`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_subscription_plan_entitlements_plan_code\` (\`planId\`, \`entitlementCode\`),
        INDEX \`IDX_subscription_plan_entitlements_code\` (\`entitlementCode\`),
        CONSTRAINT \`FK_subscription_plan_entitlements_planId\`
          FOREIGN KEY (\`planId\`) REFERENCES \`subscription_plans\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`user_subscriptions\` (
        \`id\`            VARCHAR(36) NOT NULL,
        \`userId\`        VARCHAR(36) NOT NULL,
        \`planId\`        VARCHAR(36) NOT NULL,
        \`status\`        ENUM('pending','active','expired','cancelled') NOT NULL DEFAULT 'pending',
        \`billingPeriod\` ENUM('free','monthly','quarterly','yearly') NOT NULL,
        \`currency\`      VARCHAR(3) NOT NULL,
        \`pricePaid\`     DECIMAL(18,2) NOT NULL DEFAULT 0,
        \`startedAt\`     TIMESTAMP NULL,
        \`expiresAt\`     TIMESTAMP NULL,
        \`autoRenew\`     TINYINT(1) NOT NULL DEFAULT 0,
        \`paymentId\`     VARCHAR(36) NULL,
        \`metadata\`      JSON NULL,
        \`createdAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_user_subscriptions_user_status\` (\`userId\`, \`status\`),
        INDEX \`IDX_user_subscriptions_plan_status\` (\`planId\`, \`status\`),
        INDEX \`IDX_user_subscriptions_paymentId\` (\`paymentId\`),
        CONSTRAINT \`FK_user_subscriptions_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_user_subscriptions_planId\`
          FOREIGN KEY (\`planId\`) REFERENCES \`subscription_plans\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`subscription_audit_events\` (
        \`id\`             VARCHAR(36) NOT NULL,
        \`eventType\`      VARCHAR(120) NOT NULL,
        \`actorType\`      ENUM('admin','user','system') NOT NULL,
        \`actorId\`        VARCHAR(36) NULL,
        \`targetUserId\`   VARCHAR(36) NULL,
        \`planId\`         VARCHAR(36) NULL,
        \`subscriptionId\` VARCHAR(36) NULL,
        \`metadata\`       JSON NULL,
        \`createdAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_subscription_audit_events_eventType\` (\`eventType\`),
        INDEX \`IDX_subscription_audit_events_planId\` (\`planId\`),
        INDEX \`IDX_subscription_audit_events_subscriptionId\` (\`subscriptionId\`),
        INDEX \`IDX_subscription_audit_events_targetUserId\` (\`targetUserId\`),
        INDEX \`IDX_subscription_audit_events_createdAt\` (\`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      ALTER TABLE \`orders\`
        ADD \`subscriptionId\` VARCHAR(36) NULL AFTER \`orderTotal\`,
        ADD \`subscriptionPlanId\` VARCHAR(36) NULL AFTER \`subscriptionId\`,
        ADD \`transactionFeePercentage\` DECIMAL(5,2) NULL AFTER \`subscriptionPlanId\`,
        ADD \`feeBaseAmount\` DECIMAL(18,2) NULL AFTER \`transactionFeePercentage\`,
        ADD \`transactionFeeAmount\` DECIMAL(18,2) NULL AFTER \`feeBaseAmount\`,
        ADD \`sellerNetProductAmount\` DECIMAL(18,2) NULL AFTER \`transactionFeeAmount\`,
        ADD INDEX \`IDX_orders_subscriptionId\` (\`subscriptionId\`),
        ADD INDEX \`IDX_orders_subscriptionPlanId\` (\`subscriptionPlanId\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`orders\`
        DROP INDEX \`IDX_orders_subscriptionPlanId\`,
        DROP INDEX \`IDX_orders_subscriptionId\`,
        DROP COLUMN \`sellerNetProductAmount\`,
        DROP COLUMN \`transactionFeeAmount\`,
        DROP COLUMN \`feeBaseAmount\`,
        DROP COLUMN \`transactionFeePercentage\`,
        DROP COLUMN \`subscriptionPlanId\`,
        DROP COLUMN \`subscriptionId\`
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS \`subscription_audit_events\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`user_subscriptions\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`subscription_plan_entitlements\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`entitlement_definitions\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`subscription_plan_prices\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`subscription_plans\``);
  }
}
