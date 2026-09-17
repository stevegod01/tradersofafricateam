import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDirectRFQManagement1787520006000 implements MigrationInterface {
  name = 'AddDirectRFQManagement1787520006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`direct_rfqs\` (
        \`id\`                       VARCHAR(36) NOT NULL,
        \`rfqReference\`             VARCHAR(40) NOT NULL,
        \`buyerId\`                  VARCHAR(36) NOT NULL,
        \`sellerId\`                 VARCHAR(36) NOT NULL,
        \`productId\`                VARCHAR(36) NOT NULL,
        \`variantId\`                VARCHAR(36) NULL,
        \`status\`                   ENUM('open','viewed','quoted','negotiating','accepted','rejected','cancelled','expired') NOT NULL DEFAULT 'open',
        \`quantity\`                 DECIMAL(18,3) NOT NULL,
        \`unit\`                     VARCHAR(40) NOT NULL,
        \`description\`              TEXT NOT NULL,
        \`expectedDeliveryDate\`     DATE NULL,
        \`deliveryAddressId\`        VARCHAR(36) NULL,
        \`deliveryAddressSnapshot\`  JSON NOT NULL,
        \`deliveryType\`             ENUM('integrated_logistics','seller_arranged','buyer_arranged','b2b_logistics') NOT NULL,
        \`currencyPreference\`       VARCHAR(3) NULL,
        \`buyerNotes\`               TEXT NULL,
        \`productSnapshot\`          JSON NOT NULL,
        \`currentQuoteId\`           VARCHAR(36) NULL,
        \`acceptedQuoteId\`          VARCHAR(36) NULL,
        \`acceptedQuoteVersionId\`   VARCHAR(36) NULL,
        \`viewedAt\`                 TIMESTAMP NULL,
        \`acceptedAt\`               TIMESTAMP NULL,
        \`rejectedAt\`               TIMESTAMP NULL,
        \`rejectionReason\`          TEXT NULL,
        \`cancelledAt\`              TIMESTAMP NULL,
        \`cancellationReason\`       TEXT NULL,
        \`expiresAt\`                TIMESTAMP NULL,
        \`createdAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_direct_rfqs_rfqReference\` (\`rfqReference\`),
        INDEX \`IDX_direct_rfqs_buyer_status\` (\`buyerId\`, \`status\`),
        INDEX \`IDX_direct_rfqs_seller_status\` (\`sellerId\`, \`status\`),
        INDEX \`IDX_direct_rfqs_productId\` (\`productId\`),
        INDEX \`IDX_direct_rfqs_deliveryType\` (\`deliveryType\`),
        INDEX \`IDX_direct_rfqs_createdAt\` (\`createdAt\`),
        CONSTRAINT \`FK_direct_rfqs_buyerId\`
          FOREIGN KEY (\`buyerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_direct_rfqs_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_direct_rfqs_productId\`
          FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`direct_rfq_quotes\` (
        \`id\`               VARCHAR(36) NOT NULL,
        \`rfqId\`            VARCHAR(36) NOT NULL,
        \`sellerId\`         VARCHAR(36) NOT NULL,
        \`currentVersionId\` VARCHAR(36) NULL,
        \`status\`           ENUM('active','accepted','rejected','expired','superseded') NOT NULL DEFAULT 'active',
        \`createdAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_direct_rfq_quotes_rfqId\` (\`rfqId\`),
        INDEX \`IDX_direct_rfq_quotes_sellerId\` (\`sellerId\`),
        INDEX \`IDX_direct_rfq_quotes_status\` (\`status\`),
        CONSTRAINT \`FK_direct_rfq_quotes_rfqId\`
          FOREIGN KEY (\`rfqId\`) REFERENCES \`direct_rfqs\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_direct_rfq_quotes_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`direct_rfq_quote_versions\` (
        \`id\`                    VARCHAR(36) NOT NULL,
        \`quoteId\`               VARCHAR(36) NOT NULL,
        \`version\`               INT NOT NULL,
        \`createdByType\`         ENUM('buyer','seller','admin','system') NOT NULL,
        \`createdById\`           VARCHAR(36) NOT NULL,
        \`quantity\`              DECIMAL(18,3) NOT NULL,
        \`unit\`                  VARCHAR(40) NOT NULL,
        \`pricePerUnit\`          DECIMAL(18,2) NOT NULL,
        \`productsTotal\`         DECIMAL(18,2) NOT NULL,
        \`currency\`              VARCHAR(3) NOT NULL,
        \`deliveryType\`          ENUM('integrated_logistics','seller_arranged','buyer_arranged','b2b_logistics') NOT NULL,
        \`logisticsAmount\`       DECIMAL(18,2) NULL,
        \`quoteTotal\`            DECIMAL(18,2) NOT NULL,
        \`estimatedDeliveryDate\` DATE NULL,
        \`message\`               TEXT NULL,
        \`validUntil\`            TIMESTAMP NOT NULL,
        \`createdAt\`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_direct_rfq_quote_versions_quote_version\` (\`quoteId\`, \`version\`),
        INDEX \`IDX_direct_rfq_quote_versions_quoteId\` (\`quoteId\`),
        INDEX \`IDX_direct_rfq_quote_versions_validUntil\` (\`validUntil\`),
        CONSTRAINT \`FK_direct_rfq_quote_versions_quoteId\`
          FOREIGN KEY (\`quoteId\`) REFERENCES \`direct_rfq_quotes\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`direct_rfq_audit_events\` (
        \`id\`         VARCHAR(36) NOT NULL,
        \`rfqId\`      VARCHAR(36) NOT NULL,
        \`eventType\`  VARCHAR(120) NOT NULL,
        \`actorType\`  ENUM('buyer','seller','admin','system') NOT NULL,
        \`actorId\`    VARCHAR(36) NULL,
        \`metadata\`   JSON NULL,
        \`createdAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_direct_rfq_audit_events_rfqId\` (\`rfqId\`),
        INDEX \`IDX_direct_rfq_audit_events_eventType\` (\`eventType\`),
        INDEX \`IDX_direct_rfq_audit_events_createdAt\` (\`createdAt\`),
        CONSTRAINT \`FK_direct_rfq_audit_events_rfqId\`
          FOREIGN KEY (\`rfqId\`) REFERENCES \`direct_rfqs\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`direct_rfq_audit_events\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`direct_rfq_quote_versions\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`direct_rfq_quotes\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`direct_rfqs\``);
  }
}
