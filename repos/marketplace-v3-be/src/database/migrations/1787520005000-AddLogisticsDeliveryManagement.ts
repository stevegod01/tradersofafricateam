import { MigrationInterface, QueryRunner } from 'typeorm';
import { LOGISTICS_PROVIDER_DEFINITIONS } from '../../modules/logistics/logistics.providers';

export class AddLogisticsDeliveryManagement1787520005000 implements MigrationInterface {
  name = 'AddLogisticsDeliveryManagement1787520005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`products\`
        ADD \`weight\` DECIMAL(18,3) NULL,
        ADD \`weightUnit\` VARCHAR(20) NULL,
        ADD \`length\` DECIMAL(18,3) NULL,
        ADD \`width\` DECIMAL(18,3) NULL,
        ADD \`height\` DECIMAL(18,3) NULL,
        ADD \`dimensionUnit\` VARCHAR(20) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`product_variants\`
        ADD \`weight\` DECIMAL(18,3) NULL,
        ADD \`weightUnit\` VARCHAR(20) NULL,
        ADD \`length\` DECIMAL(18,3) NULL,
        ADD \`width\` DECIMAL(18,3) NULL,
        ADD \`height\` DECIMAL(18,3) NULL,
        ADD \`dimensionUnit\` VARCHAR(20) NULL
    `);

    await queryRunner.query(`
      CREATE TABLE \`logistics_providers\` (
        \`id\`                     VARCHAR(36) NOT NULL,
        \`code\`                   VARCHAR(80) NOT NULL,
        \`name\`                   VARCHAR(160) NOT NULL,
        \`logo\`                   VARCHAR(500) NULL,
        \`type\`                   ENUM('domestic','international','freight','aggregator') NOT NULL,
        \`supportedCountries\`     JSON NOT NULL,
        \`supportedCurrencies\`    JSON NOT NULL,
        \`supportsDomestic\`       TINYINT(1) NOT NULL DEFAULT 1,
        \`supportsInternational\`  TINYINT(1) NOT NULL DEFAULT 0,
        \`supportsTracking\`       TINYINT(1) NOT NULL DEFAULT 1,
        \`supportsWebhook\`        TINYINT(1) NOT NULL DEFAULT 0,
        \`supportsCancellation\`   TINYINT(1) NOT NULL DEFAULT 0,
        \`status\`                 ENUM('active','inactive') NOT NULL DEFAULT 'active',
        \`sortOrder\`              INT NOT NULL DEFAULT 0,
        \`createdAt\`              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_logistics_providers_code\` (\`code\`),
        INDEX \`IDX_logistics_providers_status\` (\`status\`),
        INDEX \`IDX_logistics_providers_sortOrder\` (\`sortOrder\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`logistics_quotes\` (
        \`id\`                       VARCHAR(36) NOT NULL,
        \`providerId\`               VARCHAR(36) NOT NULL,
        \`sellerId\`                 VARCHAR(36) NOT NULL,
        \`buyerId\`                  VARCHAR(36) NOT NULL,
        \`sourceType\`               ENUM('cart','direct_rfq','market_rfq','b2b_logistics','other') NOT NULL,
        \`sourceId\`                 VARCHAR(120) NULL,
        \`pickupAddressSnapshot\`    JSON NOT NULL,
        \`deliveryAddressSnapshot\`  JSON NOT NULL,
        \`itemsSnapshot\`            JSON NULL,
        \`amount\`                   DECIMAL(18,2) NOT NULL,
        \`currency\`                 VARCHAR(3) NOT NULL,
        \`serviceName\`              VARCHAR(160) NOT NULL,
        \`estimatedDeliveryMin\`     INT NOT NULL,
        \`estimatedDeliveryMax\`     INT NOT NULL,
        \`estimatedDeliveryUnit\`    VARCHAR(40) NOT NULL,
        \`providerQuoteReference\`   VARCHAR(160) NULL,
        \`status\`                   ENUM('active','selected','expired','cancelled') NOT NULL DEFAULT 'active',
        \`expiresAt\`                TIMESTAMP NOT NULL,
        \`createdAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_logistics_quotes_providerId\` (\`providerId\`),
        INDEX \`IDX_logistics_quotes_sellerId\` (\`sellerId\`),
        INDEX \`IDX_logistics_quotes_buyerId\` (\`buyerId\`),
        INDEX \`IDX_logistics_quotes_source\` (\`sourceType\`, \`sourceId\`),
        INDEX \`IDX_logistics_quotes_status\` (\`status\`),
        INDEX \`IDX_logistics_quotes_expiresAt\` (\`expiresAt\`),
        CONSTRAINT \`FK_logistics_quotes_providerId\`
          FOREIGN KEY (\`providerId\`) REFERENCES \`logistics_providers\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_logistics_quotes_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_logistics_quotes_buyerId\`
          FOREIGN KEY (\`buyerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`shipments\` (
        \`id\`                       VARCHAR(36) NOT NULL,
        \`shipmentReference\`        VARCHAR(60) NOT NULL,
        \`orderId\`                  VARCHAR(36) NOT NULL,
        \`providerId\`               VARCHAR(36) NOT NULL,
        \`providerNameSnapshot\`     VARCHAR(160) NOT NULL,
        \`serviceNameSnapshot\`      VARCHAR(160) NOT NULL,
        \`externalShipmentId\`       VARCHAR(160) NULL,
        \`trackingId\`               VARCHAR(160) NULL,
        \`trackingUrl\`              VARCHAR(500) NULL,
        \`pickupAddressSnapshot\`    JSON NOT NULL,
        \`deliveryAddressSnapshot\`  JSON NOT NULL,
        \`status\`                   ENUM('pending','shipment_created','awaiting_pickup','picked_up','in_transit','out_for_delivery','delivered','delivery_failed','cancelled') NOT NULL DEFAULT 'pending',
        \`estimatedPickupAt\`        TIMESTAMP NULL,
        \`pickedUpAt\`               TIMESTAMP NULL,
        \`estimatedDeliveryAt\`      TIMESTAMP NULL,
        \`deliveredAt\`              TIMESTAMP NULL,
        \`failureReason\`            TEXT NULL,
        \`createdAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_shipments_shipmentReference\` (\`shipmentReference\`),
        INDEX \`IDX_shipments_orderId\` (\`orderId\`),
        INDEX \`IDX_shipments_providerId\` (\`providerId\`),
        INDEX \`IDX_shipments_externalShipmentId\` (\`externalShipmentId\`),
        INDEX \`IDX_shipments_trackingId\` (\`trackingId\`),
        INDEX \`IDX_shipments_status\` (\`status\`),
        CONSTRAINT \`FK_shipments_orderId\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_shipments_providerId\`
          FOREIGN KEY (\`providerId\`) REFERENCES \`logistics_providers\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`shipment_status_histories\` (
        \`id\`             VARCHAR(36) NOT NULL,
        \`shipmentId\`     VARCHAR(36) NOT NULL,
        \`fromStatus\`     ENUM('pending','shipment_created','awaiting_pickup','picked_up','in_transit','out_for_delivery','delivered','delivery_failed','cancelled') NULL,
        \`toStatus\`       ENUM('pending','shipment_created','awaiting_pickup','picked_up','in_transit','out_for_delivery','delivered','delivery_failed','cancelled') NOT NULL,
        \`idempotencyKey\` VARCHAR(160) NULL,
        \`description\`    VARCHAR(255) NULL,
        \`location\`       VARCHAR(160) NULL,
        \`rawPayload\`     JSON NULL,
        \`createdAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_shipment_status_histories_shipmentId\` (\`shipmentId\`),
        UNIQUE KEY \`UQ_shipment_status_histories_idempotencyKey\` (\`idempotencyKey\`),
        CONSTRAINT \`FK_shipment_status_histories_shipmentId\`
          FOREIGN KEY (\`shipmentId\`) REFERENCES \`shipments\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`b2b_logistics_requests\` (
        \`id\`                       VARCHAR(36) NOT NULL,
        \`requesterId\`              VARCHAR(36) NOT NULL,
        \`sourceType\`               VARCHAR(80) NOT NULL,
        \`sourceId\`                 VARCHAR(120) NULL,
        \`cargoType\`                VARCHAR(120) NOT NULL,
        \`quantity\`                 DECIMAL(18,3) NOT NULL,
        \`unit\`                     VARCHAR(40) NOT NULL,
        \`weight\`                   DECIMAL(18,3) NULL,
        \`weightUnit\`               VARCHAR(20) NULL,
        \`volume\`                   DECIMAL(18,3) NULL,
        \`volumeUnit\`               VARCHAR(20) NULL,
        \`pickupAddressSnapshot\`    JSON NOT NULL,
        \`deliveryAddressSnapshot\`  JSON NOT NULL,
        \`specialInstructions\`      TEXT NULL,
        \`status\`                   ENUM('pending','quoted','accepted','cancelled') NOT NULL DEFAULT 'pending',
        \`createdAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_b2b_logistics_requests_requesterId\` (\`requesterId\`),
        INDEX \`IDX_b2b_logistics_requests_status\` (\`status\`),
        CONSTRAINT \`FK_b2b_logistics_requests_requesterId\`
          FOREIGN KEY (\`requesterId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`b2b_logistics_quotes\` (
        \`id\`                    VARCHAR(36) NOT NULL,
        \`requestId\`             VARCHAR(36) NOT NULL,
        \`providerId\`            VARCHAR(36) NOT NULL,
        \`amount\`                DECIMAL(18,2) NOT NULL,
        \`currency\`              VARCHAR(3) NOT NULL,
        \`estimatedTransitMin\`   INT NOT NULL,
        \`estimatedTransitMax\`   INT NOT NULL,
        \`estimatedTransitUnit\`  VARCHAR(40) NOT NULL,
        \`validUntil\`            TIMESTAMP NOT NULL,
        \`status\`                ENUM('active','accepted','expired','cancelled') NOT NULL DEFAULT 'active',
        \`createdAt\`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_b2b_logistics_quotes_requestId\` (\`requestId\`),
        INDEX \`IDX_b2b_logistics_quotes_providerId\` (\`providerId\`),
        INDEX \`IDX_b2b_logistics_quotes_status\` (\`status\`),
        CONSTRAINT \`FK_b2b_logistics_quotes_requestId\`
          FOREIGN KEY (\`requestId\`) REFERENCES \`b2b_logistics_requests\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_b2b_logistics_quotes_providerId\`
          FOREIGN KEY (\`providerId\`) REFERENCES \`logistics_providers\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    for (const provider of LOGISTICS_PROVIDER_DEFINITIONS) {
      await queryRunner.query(
        `
          INSERT IGNORE INTO \`logistics_providers\`
            (
              \`id\`,
              \`code\`,
              \`name\`,
              \`logo\`,
              \`type\`,
              \`supportedCountries\`,
              \`supportedCurrencies\`,
              \`supportsDomestic\`,
              \`supportsInternational\`,
              \`supportsTracking\`,
              \`supportsWebhook\`,
              \`supportsCancellation\`,
              \`status\`,
              \`sortOrder\`
            )
          VALUES (
            UUID(),
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'active',
            ?
          )
        `,
        [
          provider.code,
          provider.name,
          provider.logo,
          provider.type,
          JSON.stringify(provider.supportedCountries),
          JSON.stringify(provider.supportedCurrencies),
          provider.supportsDomestic,
          provider.supportsInternational,
          provider.supportsTracking,
          provider.supportsWebhook,
          provider.supportsCancellation,
          provider.sortOrder,
        ],
      );
    }

    await this.upsertPermission(
      queryRunner,
      'logistics.view',
      'View Logistics',
      'Allows the Admin to view logistics providers and shipments.',
      'logistics',
    );
    await this.upsertPermission(
      queryRunner,
      'logistics.manage',
      'Manage Logistics',
      'Allows the Admin to update logistics provider configuration.',
      'logistics',
    );
    await this.assignPermissionToRole(queryRunner, 'Administrator', 'logistics.view');
    await this.assignPermissionToRole(queryRunner, 'Administrator', 'logistics.manage');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`b2b_logistics_quotes\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`b2b_logistics_requests\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`shipment_status_histories\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`shipments\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`logistics_quotes\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`logistics_providers\``);

    await queryRunner.query(`
      ALTER TABLE \`product_variants\`
        DROP COLUMN \`dimensionUnit\`,
        DROP COLUMN \`height\`,
        DROP COLUMN \`width\`,
        DROP COLUMN \`length\`,
        DROP COLUMN \`weightUnit\`,
        DROP COLUMN \`weight\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`products\`
        DROP COLUMN \`dimensionUnit\`,
        DROP COLUMN \`height\`,
        DROP COLUMN \`width\`,
        DROP COLUMN \`length\`,
        DROP COLUMN \`weightUnit\`,
        DROP COLUMN \`weight\`
    `);
  }

  private async upsertPermission(
    queryRunner: QueryRunner,
    code: string,
    name: string,
    description: string,
    module: string,
  ): Promise<void> {
    await queryRunner.query(
      `
        INSERT IGNORE INTO \`permissions\`
          (\`id\`, \`code\`, \`name\`, \`description\`, \`module\`, \`status\`)
        VALUES (UUID(), ?, ?, ?, ?, 'active')
      `,
      [code, name, description, module],
    );
  }

  private async assignPermissionToRole(
    queryRunner: QueryRunner,
    roleName: string,
    permissionCode: string,
  ): Promise<void> {
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
