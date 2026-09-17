import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketplaceModules1787520000000 implements MigrationInterface {
  name = 'AddMarketplaceModules1787520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
      ADD \`selectedLanguage\` VARCHAR(5) NOT NULL DEFAULT 'en'
    `);

    await queryRunner.query(`DROP INDEX \`IDX_rt_tokenHash\` ON \`refresh_tokens\``);
    await queryRunner.query(`
      ALTER TABLE \`refresh_tokens\`
      MODIFY \`tokenHash\` VARCHAR(64) NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX \`UQ_refresh_tokens_tokenHash\`
      ON \`refresh_tokens\` (\`tokenHash\`)
    `);

    await queryRunner.query(`
      CREATE TABLE \`categories\` (
        \`id\`          VARCHAR(36) NOT NULL,
        \`name\`        JSON NOT NULL,
        \`slug\`        VARCHAR(255) NOT NULL,
        \`description\` JSON NULL,
        \`parentId\`    VARCHAR(36) NULL,
        \`icon\`        VARCHAR(100) NULL,
        \`image\`       VARCHAR(500) NULL,
        \`status\`      ENUM('active','inactive','archived','deleted') NOT NULL DEFAULT 'active',
        \`sortOrder\`   INT NOT NULL DEFAULT 0,
        \`createdBy\`   VARCHAR(36) NOT NULL,
        \`updatedBy\`   VARCHAR(36) NULL,
        \`createdAt\`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deletedAt\`   TIMESTAMP NULL,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_categories_slug\` (\`slug\`),
        INDEX \`IDX_categories_parentId\` (\`parentId\`),
        INDEX \`IDX_categories_status\` (\`status\`),
        CONSTRAINT \`FK_categories_parentId\`
          FOREIGN KEY (\`parentId\`) REFERENCES \`categories\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_categories_createdBy\`
          FOREIGN KEY (\`createdBy\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_categories_updatedBy\`
          FOREIGN KEY (\`updatedBy\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`products\` (
        \`id\`                    VARCHAR(36) NOT NULL,
        \`sellerId\`              VARCHAR(36) NOT NULL,
        \`productName\`           JSON NOT NULL,
        \`productDescription\`    JSON NOT NULL,
        \`countryOfOrigin\`       VARCHAR(100) NOT NULL,
        \`currency\`              VARCHAR(3) NOT NULL,
        \`price\`                 DECIMAL(18,2) NULL,
        \`discount\`              DECIMAL(5,2) NULL,
        \`quantity\`              DECIMAL(18,3) NULL,
        \`productType\`           ENUM('simple','variable') NOT NULL,
        \`barcode\`               VARCHAR(100) NULL,
        \`supplyCapacity\`        DECIMAL(18,3) NOT NULL,
        \`unitForSupplyCapacity\` VARCHAR(40) NOT NULL,
        \`minOrdersAllowed\`      DECIMAL(18,3) NOT NULL,
        \`unitForMinOrder\`       VARCHAR(40) NOT NULL,
        \`minDuration\`           INT NOT NULL,
        \`maxDuration\`           INT NOT NULL,
        \`durationUnit\`          VARCHAR(40) NOT NULL,
        \`status\`                ENUM('draft','active','inactive','archived','deleted') NOT NULL DEFAULT 'draft',
        \`inventoryStatus\`       ENUM('in_stock','out_of_stock') NOT NULL DEFAULT 'out_of_stock',
        \`totalStock\`            DECIMAL(18,3) NOT NULL DEFAULT 0,
        \`createdAt\`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deletedAt\`             TIMESTAMP NULL,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_products_sellerId\` (\`sellerId\`),
        INDEX \`IDX_products_status\` (\`status\`),
        INDEX \`IDX_products_inventoryStatus\` (\`inventoryStatus\`),
        CONSTRAINT \`FK_products_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`product_categories\` (
        \`id\`         VARCHAR(36) NOT NULL,
        \`productId\`  VARCHAR(36) NOT NULL,
        \`categoryId\` VARCHAR(36) NOT NULL,
        \`createdAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_product_categories_product_category\` (\`productId\`, \`categoryId\`),
        INDEX \`IDX_product_categories_productId\` (\`productId\`),
        INDEX \`IDX_product_categories_categoryId\` (\`categoryId\`),
        CONSTRAINT \`FK_product_categories_productId\`
          FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_product_categories_categoryId\`
          FOREIGN KEY (\`categoryId\`) REFERENCES \`categories\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`product_images\` (
        \`id\`        VARCHAR(36) NOT NULL,
        \`productId\` VARCHAR(36) NOT NULL,
        \`url\`       VARCHAR(500) NOT NULL,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`isPrimary\` TINYINT(1) NOT NULL DEFAULT 0,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_product_images_productId\` (\`productId\`),
        CONSTRAINT \`FK_product_images_productId\`
          FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`product_variant_options\` (
        \`id\`        VARCHAR(36) NOT NULL,
        \`productId\` VARCHAR(36) NOT NULL,
        \`name\`      VARCHAR(80) NOT NULL,
        \`values\`    JSON NOT NULL,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_product_variant_options_productId\` (\`productId\`),
        CONSTRAINT \`FK_product_variant_options_productId\`
          FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`product_variants\` (
        \`id\`         VARCHAR(36) NOT NULL,
        \`productId\`  VARCHAR(36) NOT NULL,
        \`sku\`        VARCHAR(120) NOT NULL,
        \`attributes\` JSON NOT NULL,
        \`price\`      DECIMAL(18,2) NOT NULL,
        \`discount\`   DECIMAL(5,2) NULL,
        \`quantity\`   DECIMAL(18,3) NOT NULL,
        \`image\`      VARCHAR(500) NULL,
        \`createdAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_product_variants_sku\` (\`sku\`),
        INDEX \`IDX_product_variants_productId\` (\`productId\`),
        CONSTRAINT \`FK_product_variants_productId\`
          FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`user_addresses\` (
        \`id\`            VARCHAR(36) NOT NULL,
        \`userId\`        VARCHAR(36) NOT NULL,
        \`label\`         VARCHAR(80) NOT NULL,
        \`recipientName\` VARCHAR(160) NOT NULL,
        \`phoneNumber\`   VARCHAR(30) NOT NULL,
        \`addressLine1\`  VARCHAR(255) NOT NULL,
        \`addressLine2\`  VARCHAR(255) NULL,
        \`city\`          VARCHAR(100) NOT NULL,
        \`state\`         VARCHAR(100) NOT NULL,
        \`country\`       VARCHAR(100) NOT NULL,
        \`postalCode\`    VARCHAR(20) NULL,
        \`isDefault\`     TINYINT(1) NOT NULL DEFAULT 0,
        \`createdAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_user_addresses_userId\` (\`userId\`),
        INDEX \`IDX_user_addresses_default\` (\`userId\`, \`isDefault\`),
        CONSTRAINT \`FK_user_addresses_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`carts\` (
        \`id\`        VARCHAR(36) NOT NULL,
        \`userId\`    VARCHAR(36) NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_carts_userId\` (\`userId\`),
        CONSTRAINT \`FK_carts_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`cart_items\` (
        \`id\`        VARCHAR(36) NOT NULL,
        \`cartId\`    VARCHAR(36) NOT NULL,
        \`productId\` VARCHAR(36) NOT NULL,
        \`variantId\` VARCHAR(36) NULL,
        \`quantity\`  DECIMAL(18,3) NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_cart_items_cartId\` (\`cartId\`),
        INDEX \`IDX_cart_items_productId\` (\`productId\`),
        INDEX \`IDX_cart_items_lookup\` (\`cartId\`, \`productId\`, \`variantId\`),
        CONSTRAINT \`FK_cart_items_cartId\`
          FOREIGN KEY (\`cartId\`) REFERENCES \`carts\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_cart_items_productId\`
          FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_cart_items_variantId\`
          FOREIGN KEY (\`variantId\`) REFERENCES \`product_variants\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`checkout_drafts\` (
        \`id\`                 VARCHAR(36) NOT NULL,
        \`userId\`             VARCHAR(36) NOT NULL,
        \`deliveryAddressId\`  VARCHAR(36) NULL,
        \`deliveryQuotes\`     JSON NULL,
        \`deliverySelections\` JSON NULL,
        \`paymentMethod\`      VARCHAR(60) NULL,
        \`createdAt\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_checkout_drafts_userId\` (\`userId\`),
        INDEX \`IDX_checkout_drafts_deliveryAddressId\` (\`deliveryAddressId\`),
        CONSTRAINT \`FK_checkout_drafts_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_checkout_drafts_deliveryAddressId\`
          FOREIGN KEY (\`deliveryAddressId\`) REFERENCES \`user_addresses\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`checkout_sessions\` (
        \`id\`                      VARCHAR(36) NOT NULL,
        \`userId\`                  VARCHAR(36) NOT NULL,
        \`sourceType\`              ENUM('cart','direct_rfq','market_rfq') NOT NULL DEFAULT 'cart',
        \`sourceId\`                VARCHAR(36) NULL,
        \`quoteId\`                 VARCHAR(36) NULL,
        \`quoteVersionId\`          VARCHAR(36) NULL,
        \`deliveryAddressId\`       VARCHAR(36) NOT NULL,
        \`deliveryAddressSnapshot\` JSON NOT NULL,
        \`paymentMethod\`           VARCHAR(60) NOT NULL,
        \`productsTotal\`           DECIMAL(18,2) NOT NULL,
        \`logisticsTotal\`          DECIMAL(18,2) NOT NULL,
        \`totalAmount\`             DECIMAL(18,2) NOT NULL,
        \`currency\`                VARCHAR(3) NOT NULL,
        \`status\`                  ENUM('active','converted','expired','cancelled') NOT NULL DEFAULT 'active',
        \`notes\`                   TEXT NULL,
        \`expiresAt\`               TIMESTAMP NOT NULL,
        \`createdAt\`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_checkout_sessions_userId\` (\`userId\`),
        INDEX \`IDX_checkout_sessions_status\` (\`status\`),
        CONSTRAINT \`FK_checkout_sessions_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_checkout_sessions_deliveryAddressId\`
          FOREIGN KEY (\`deliveryAddressId\`) REFERENCES \`user_addresses\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`checkout_seller_groups\` (
        \`id\`               VARCHAR(36) NOT NULL,
        \`checkoutId\`       VARCHAR(36) NOT NULL,
        \`sellerId\`         VARCHAR(36) NOT NULL,
        \`productsSubtotal\` DECIMAL(18,2) NOT NULL,
        \`logisticsAmount\`  DECIMAL(18,2) NOT NULL,
        \`sellerTotal\`      DECIMAL(18,2) NOT NULL,
        \`deliveryType\`     ENUM('integrated_logistics','seller_arranged','buyer_arranged','b2b_logistics') NOT NULL,
        \`logisticsQuoteId\` VARCHAR(120) NULL,
        \`createdAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_checkout_seller_groups_checkoutId\` (\`checkoutId\`),
        INDEX \`IDX_checkout_seller_groups_sellerId\` (\`sellerId\`),
        CONSTRAINT \`FK_checkout_seller_groups_checkoutId\`
          FOREIGN KEY (\`checkoutId\`) REFERENCES \`checkout_sessions\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_checkout_seller_groups_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`checkout_seller_groups\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`checkout_sessions\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`checkout_drafts\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`cart_items\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`carts\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`user_addresses\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`product_variants\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`product_variant_options\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`product_images\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`product_categories\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`products\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`categories\``);

    await queryRunner.query(`DROP INDEX \`UQ_refresh_tokens_tokenHash\` ON \`refresh_tokens\``);
    await queryRunner.query(`
      ALTER TABLE \`refresh_tokens\`
      MODIFY \`tokenHash\` VARCHAR(500) NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_rt_tokenHash\`
      ON \`refresh_tokens\` (\`tokenHash\`(100))
    `);
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`selectedLanguage\``);
  }
}
