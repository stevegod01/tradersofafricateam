import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderManagement1787520004000 implements MigrationInterface {
  name = 'AddOrderManagement1787520004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`checkout_seller_groups\`
        ADD \`itemsSnapshot\` JSON NULL,
        ADD \`deliverySnapshot\` JSON NULL
    `);

    await queryRunner.query(`
      CREATE TABLE \`orders\` (
        \`id\`                      VARCHAR(36) NOT NULL,
        \`orderReference\`          VARCHAR(40) NOT NULL,
        \`paymentId\`               VARCHAR(36) NOT NULL,
        \`checkoutId\`              VARCHAR(36) NULL,
        \`buyerId\`                 VARCHAR(36) NOT NULL,
        \`sellerId\`                VARCHAR(36) NOT NULL,
        \`sourceType\`              ENUM('cart','direct_rfq','market_rfq') NOT NULL DEFAULT 'cart',
        \`sourceId\`                VARCHAR(80) NULL,
        \`quoteId\`                 VARCHAR(80) NULL,
        \`quoteVersionId\`          VARCHAR(80) NULL,
        \`status\`                  ENUM('paid','processing','ready_for_shipment','shipped','delivered','received','completed','cancelled') NOT NULL DEFAULT 'paid',
        \`orderCurrency\`           VARCHAR(3) NOT NULL,
        \`productsSubtotal\`        DECIMAL(18,2) NOT NULL,
        \`logisticsAmount\`         DECIMAL(18,2) NULL,
        \`orderTotal\`              DECIMAL(18,2) NOT NULL,
        \`paymentCurrency\`         VARCHAR(3) NOT NULL,
        \`paymentAmount\`           DECIMAL(18,2) NOT NULL,
        \`fxApplied\`               TINYINT(1) NOT NULL DEFAULT 0,
        \`fxRateSnapshot\`          DECIMAL(18,8) NULL,
        \`fxSourceCurrency\`        VARCHAR(3) NULL,
        \`fxTargetCurrency\`        VARCHAR(3) NULL,
        \`fxSourceAmount\`          DECIMAL(18,2) NULL,
        \`fxConvertedAmount\`       DECIMAL(18,2) NULL,
        \`fxQuotedAt\`              TIMESTAMP NULL,
        \`fxProvider\`              VARCHAR(120) NULL,
        \`deliveryType\`            ENUM('integrated_logistics','seller_arranged','buyer_arranged','b2b_logistics') NOT NULL,
        \`deliveryAddressSnapshot\` JSON NOT NULL,
        \`buyerNotes\`              TEXT NULL,
        \`sellerBuyerNote\`         TEXT NULL,
        \`sellerInternalNote\`      TEXT NULL,
        \`receivedAt\`              TIMESTAMP NULL,
        \`cancelledAt\`             TIMESTAMP NULL,
        \`cancellationReason\`      TEXT NULL,
        \`completedAt\`             TIMESTAMP NULL,
        \`createdAt\`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_orders_orderReference\` (\`orderReference\`),
        UNIQUE KEY \`IDX_orders_payment_seller\` (\`paymentId\`, \`sellerId\`),
        INDEX \`IDX_orders_buyer_status\` (\`buyerId\`, \`status\`),
        INDEX \`IDX_orders_seller_status\` (\`sellerId\`, \`status\`),
        INDEX \`IDX_orders_checkoutId\` (\`checkoutId\`),
        INDEX \`IDX_orders_source\` (\`sourceType\`, \`sourceId\`),
        CONSTRAINT \`FK_orders_paymentId\`
          FOREIGN KEY (\`paymentId\`) REFERENCES \`payments\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_orders_checkoutId\`
          FOREIGN KEY (\`checkoutId\`) REFERENCES \`checkout_sessions\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_orders_buyerId\`
          FOREIGN KEY (\`buyerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_orders_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`order_items\` (
        \`id\`                   VARCHAR(36) NOT NULL,
        \`orderId\`              VARCHAR(36) NOT NULL,
        \`productId\`            VARCHAR(36) NOT NULL,
        \`variantId\`            VARCHAR(36) NULL,
        \`productNameSnapshot\`  JSON NOT NULL,
        \`productImageSnapshot\` VARCHAR(500) NULL,
        \`skuSnapshot\`          VARCHAR(160) NULL,
        \`attributesSnapshot\`   JSON NULL,
        \`unitPrice\`            DECIMAL(18,2) NOT NULL,
        \`discount\`             DECIMAL(18,2) NULL,
        \`finalUnitPrice\`       DECIMAL(18,2) NOT NULL,
        \`quantity\`             DECIMAL(18,3) NOT NULL,
        \`unit\`                 VARCHAR(40) NULL,
        \`subtotal\`             DECIMAL(18,2) NOT NULL,
        \`createdAt\`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_order_items_orderId\` (\`orderId\`),
        INDEX \`IDX_order_items_productId\` (\`productId\`),
        CONSTRAINT \`FK_order_items_orderId\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`order_deliveries\` (
        \`id\`                       VARCHAR(36) NOT NULL,
        \`orderId\`                  VARCHAR(36) NOT NULL,
        \`deliveryType\`             ENUM('integrated_logistics','seller_arranged','buyer_arranged','b2b_logistics') NOT NULL,
        \`providerId\`               VARCHAR(120) NULL,
        \`providerNameSnapshot\`     VARCHAR(160) NULL,
        \`serviceNameSnapshot\`      VARCHAR(160) NULL,
        \`logisticsQuoteId\`         VARCHAR(120) NULL,
        \`logisticsAmount\`          DECIMAL(18,2) NULL,
        \`logisticsCurrency\`        VARCHAR(3) NULL,
        \`trackingId\`               VARCHAR(160) NULL,
        \`trackingUrl\`              VARCHAR(500) NULL,
        \`deliveryContact\`          VARCHAR(160) NULL,
        \`buyerLogisticsContactName\` VARCHAR(160) NULL,
        \`buyerLogisticsEmail\`      VARCHAR(255) NULL,
        \`expectedPickupDate\`       DATE NULL,
        \`handoverTo\`               VARCHAR(160) NULL,
        \`handoverReference\`        VARCHAR(160) NULL,
        \`pickupAddressSnapshot\`    JSON NOT NULL,
        \`deliveryAddressSnapshot\`  JSON NOT NULL,
        \`estimatedDelivery\`        JSON NULL,
        \`shippedAt\`                TIMESTAMP NULL,
        \`deliveredAt\`              TIMESTAMP NULL,
        \`sellerDeliveryNotes\`      TEXT NULL,
        \`buyerLogisticsNotes\`      TEXT NULL,
        \`createdAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_order_deliveries_orderId\` (\`orderId\`),
        CONSTRAINT \`FK_order_deliveries_orderId\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`order_status_histories\` (
        \`id\`            VARCHAR(36) NOT NULL,
        \`orderId\`       VARCHAR(36) NOT NULL,
        \`fromStatus\`    ENUM('paid','processing','ready_for_shipment','shipped','delivered','received','completed','cancelled') NULL,
        \`toStatus\`      ENUM('paid','processing','ready_for_shipment','shipped','delivered','received','completed','cancelled') NOT NULL,
        \`changedByType\` ENUM('system','buyer','seller','admin','provider') NOT NULL,
        \`changedById\`   VARCHAR(36) NULL,
        \`notes\`         TEXT NULL,
        \`createdAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_order_status_histories_orderId\` (\`orderId\`),
        INDEX \`IDX_order_status_histories_createdAt\` (\`createdAt\`),
        CONSTRAINT \`FK_order_status_histories_orderId\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`order_cancellation_requests\` (
        \`id\`              VARCHAR(36) NOT NULL,
        \`orderId\`         VARCHAR(36) NOT NULL,
        \`requestedByType\` ENUM('system','buyer','seller','admin','provider') NOT NULL,
        \`requestedById\`   VARCHAR(36) NOT NULL,
        \`reason\`          VARCHAR(500) NOT NULL,
        \`notes\`           TEXT NULL,
        \`status\`          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        \`reviewedBy\`      VARCHAR(36) NULL,
        \`reviewedAt\`      TIMESTAMP NULL,
        \`reviewNotes\`     TEXT NULL,
        \`createdAt\`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_order_cancellation_requests_orderId\` (\`orderId\`),
        INDEX \`IDX_order_cancellation_requests_status\` (\`status\`),
        CONSTRAINT \`FK_order_cancellation_requests_orderId\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`order_cancellation_requests\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`order_status_histories\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`order_deliveries\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`order_items\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`orders\``);
    await queryRunner.query(`
      ALTER TABLE \`checkout_seller_groups\`
        DROP COLUMN \`deliverySnapshot\`,
        DROP COLUMN \`itemsSnapshot\`
    `);
  }
}
