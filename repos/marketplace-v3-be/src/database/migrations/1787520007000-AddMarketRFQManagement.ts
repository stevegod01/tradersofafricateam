import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketRFQManagement1787520007000 implements MigrationInterface {
  name = 'AddMarketRFQManagement1787520007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`market_rfqs\` (
        \`id\`                       VARCHAR(36) NOT NULL,
        \`rfqReference\`             VARCHAR(40) NOT NULL,
        \`buyerId\`                  VARCHAR(36) NOT NULL,
        \`productId\`                VARCHAR(36) NULL,
        \`variantId\`                VARCHAR(36) NULL,
        \`categoryIds\`              JSON NOT NULL,
        \`categorySnapshots\`        JSON NOT NULL,
        \`requirementTitle\`         JSON NOT NULL,
        \`description\`              JSON NOT NULL,
        \`quantity\`                 DECIMAL(18,3) NOT NULL,
        \`unit\`                     VARCHAR(40) NOT NULL,
        \`expectedDeliveryDate\`     DATE NULL,
        \`deliveryAddressId\`        VARCHAR(36) NULL,
        \`deliveryAddressSnapshot\`  JSON NOT NULL,
        \`deliveryType\`             ENUM('integrated_logistics','seller_arranged','buyer_arranged','b2b_logistics') NOT NULL,
        \`currencyPreference\`       VARCHAR(3) NULL,
        \`buyerNotes\`               TEXT NULL,
        \`productSnapshot\`          JSON NULL,
        \`status\`                   ENUM('open','quoted','negotiating','awarded','cancelled','expired') NOT NULL DEFAULT 'open',
        \`quotesCount\`              INT NOT NULL DEFAULT 0,
        \`awardedSellerId\`          VARCHAR(36) NULL,
        \`acceptedQuoteId\`          VARCHAR(36) NULL,
        \`acceptedQuoteVersionId\`   VARCHAR(36) NULL,
        \`submissionDeadline\`       TIMESTAMP NOT NULL,
        \`awardedAt\`                TIMESTAMP NULL,
        \`cancelledAt\`              TIMESTAMP NULL,
        \`cancellationReason\`       TEXT NULL,
        \`createdAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_market_rfqs_rfqReference\` (\`rfqReference\`),
        INDEX \`IDX_market_rfqs_buyer_status\` (\`buyerId\`, \`status\`),
        INDEX \`IDX_market_rfqs_status_deadline\` (\`status\`, \`submissionDeadline\`),
        INDEX \`IDX_market_rfqs_productId\` (\`productId\`),
        INDEX \`IDX_market_rfqs_deliveryType\` (\`deliveryType\`),
        INDEX \`IDX_market_rfqs_awarded_seller\` (\`awardedSellerId\`),
        INDEX \`IDX_market_rfqs_createdAt\` (\`createdAt\`),
        CONSTRAINT \`FK_market_rfqs_buyerId\`
          FOREIGN KEY (\`buyerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_market_rfqs_productId\`
          FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_market_rfqs_awardedSellerId\`
          FOREIGN KEY (\`awardedSellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`market_rfq_quotes\` (
        \`id\`               VARCHAR(36) NOT NULL,
        \`rfqId\`            VARCHAR(36) NOT NULL,
        \`sellerId\`         VARCHAR(36) NOT NULL,
        \`currentVersionId\` VARCHAR(36) NULL,
        \`status\`           ENUM('active','accepted','rejected','expired','closed') NOT NULL DEFAULT 'active',
        \`acceptedAt\`       TIMESTAMP NULL,
        \`rejectedAt\`       TIMESTAMP NULL,
        \`rejectionReason\`  TEXT NULL,
        \`closedAt\`         TIMESTAMP NULL,
        \`closedReason\`     VARCHAR(80) NULL,
        \`createdAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_market_rfq_quotes_rfq_seller\` (\`rfqId\`, \`sellerId\`),
        INDEX \`IDX_market_rfq_quotes_rfqId\` (\`rfqId\`),
        INDEX \`IDX_market_rfq_quotes_sellerId\` (\`sellerId\`),
        INDEX \`IDX_market_rfq_quotes_status\` (\`status\`),
        CONSTRAINT \`FK_market_rfq_quotes_rfqId\`
          FOREIGN KEY (\`rfqId\`) REFERENCES \`market_rfqs\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_market_rfq_quotes_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`market_rfq_quote_versions\` (
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
        UNIQUE KEY \`UQ_market_rfq_quote_versions_quote_version\` (\`quoteId\`, \`version\`),
        INDEX \`IDX_market_rfq_quote_versions_quoteId\` (\`quoteId\`),
        INDEX \`IDX_market_rfq_quote_versions_validUntil\` (\`validUntil\`),
        CONSTRAINT \`FK_market_rfq_quote_versions_quoteId\`
          FOREIGN KEY (\`quoteId\`) REFERENCES \`market_rfq_quotes\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`market_rfq_seller_visibilities\` (
        \`id\`                 VARCHAR(36) NOT NULL,
        \`rfqId\`              VARCHAR(36) NOT NULL,
        \`sellerId\`           VARCHAR(36) NOT NULL,
        \`matchedCategoryIds\` JSON NULL,
        \`eligibilityReason\`  VARCHAR(80) NULL,
        \`notifiedAt\`         TIMESTAMP NULL,
        \`createdAt\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_market_rfq_visibility_rfq_seller\` (\`rfqId\`, \`sellerId\`),
        INDEX \`IDX_market_rfq_seller_visibilities_rfqId\` (\`rfqId\`),
        INDEX \`IDX_market_rfq_seller_visibilities_sellerId\` (\`sellerId\`),
        CONSTRAINT \`FK_market_rfq_seller_visibilities_rfqId\`
          FOREIGN KEY (\`rfqId\`) REFERENCES \`market_rfqs\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_market_rfq_seller_visibilities_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`market_rfq_seller_views\` (
        \`id\`            VARCHAR(36) NOT NULL,
        \`rfqId\`         VARCHAR(36) NOT NULL,
        \`sellerId\`      VARCHAR(36) NOT NULL,
        \`firstViewedAt\` TIMESTAMP NOT NULL,
        \`lastViewedAt\`  TIMESTAMP NOT NULL,
        \`createdAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_market_rfq_seller_views_rfq_seller\` (\`rfqId\`, \`sellerId\`),
        INDEX \`IDX_market_rfq_seller_views_rfqId\` (\`rfqId\`),
        INDEX \`IDX_market_rfq_seller_views_sellerId\` (\`sellerId\`),
        CONSTRAINT \`FK_market_rfq_seller_views_rfqId\`
          FOREIGN KEY (\`rfqId\`) REFERENCES \`market_rfqs\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_market_rfq_seller_views_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`market_rfq_audit_events\` (
        \`id\`         VARCHAR(36) NOT NULL,
        \`rfqId\`      VARCHAR(36) NOT NULL,
        \`eventType\`  VARCHAR(120) NOT NULL,
        \`actorType\`  ENUM('buyer','seller','admin','system') NOT NULL,
        \`actorId\`    VARCHAR(36) NULL,
        \`metadata\`   JSON NULL,
        \`createdAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_market_rfq_audit_events_rfqId\` (\`rfqId\`),
        INDEX \`IDX_market_rfq_audit_events_eventType\` (\`eventType\`),
        INDEX \`IDX_market_rfq_audit_events_createdAt\` (\`createdAt\`),
        CONSTRAINT \`FK_market_rfq_audit_events_rfqId\`
          FOREIGN KEY (\`rfqId\`) REFERENCES \`market_rfqs\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`market_rfq_audit_events\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`market_rfq_seller_views\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`market_rfq_seller_visibilities\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`market_rfq_quote_versions\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`market_rfq_quotes\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`market_rfqs\``);
  }
}
