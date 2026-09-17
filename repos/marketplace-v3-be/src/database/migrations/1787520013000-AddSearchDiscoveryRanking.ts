import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchDiscoveryRanking1787520013000 implements MigrationInterface {
  name = 'AddSearchDiscoveryRanking1787520013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`featured_products\` (
        \`id\`        VARCHAR(36) NOT NULL,
        \`productId\` VARCHAR(36) NOT NULL,
        \`sellerId\`  VARCHAR(36) NOT NULL,
        \`status\`    ENUM('scheduled','active','expired','cancelled') NOT NULL DEFAULT 'active',
        \`startAt\`   TIMESTAMP NOT NULL,
        \`endAt\`     TIMESTAMP NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_featured_products_seller_status\` (\`sellerId\`, \`status\`),
        INDEX \`IDX_featured_products_product_status\` (\`productId\`, \`status\`),
        CONSTRAINT \`FK_featured_products_productId\`
          FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_featured_products_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`featured_stores\` (
        \`id\`        VARCHAR(36) NOT NULL,
        \`sellerId\`  VARCHAR(36) NOT NULL,
        \`status\`    ENUM('scheduled','active','expired','cancelled') NOT NULL DEFAULT 'active',
        \`startAt\`   TIMESTAMP NOT NULL,
        \`endAt\`     TIMESTAMP NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_featured_stores_seller_status\` (\`sellerId\`, \`status\`),
        CONSTRAINT \`FK_featured_stores_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`search_history\` (
        \`id\`        VARCHAR(36) NOT NULL,
        \`userId\`    VARCHAR(36) NOT NULL,
        \`query\`     VARCHAR(255) NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_search_history_user_created\` (\`userId\`, \`createdAt\`),
        CONSTRAINT \`FK_search_history_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`product_views\` (
        \`id\`        VARCHAR(36) NOT NULL,
        \`userId\`    VARCHAR(36) NOT NULL,
        \`productId\` VARCHAR(36) NOT NULL,
        \`viewedAt\`  TIMESTAMP NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_product_views_user_product\` (\`userId\`, \`productId\`),
        INDEX \`IDX_product_views_user_viewed\` (\`userId\`, \`viewedAt\`),
        CONSTRAINT \`FK_product_views_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_product_views_productId\`
          FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`search_events\` (
        \`id\`             VARCHAR(36) NOT NULL,
        \`userId\`         VARCHAR(36) NULL,
        \`sessionId\`      VARCHAR(120) NULL,
        \`query\`          VARCHAR(255) NULL,
        \`entityType\`     ENUM('product','seller','market_rfq','category') NULL,
        \`eventType\`      ENUM('search','result_click','no_result') NOT NULL,
        \`entityId\`       VARCHAR(36) NULL,
        \`resultPosition\` INT NULL,
        \`filters\`        JSON NULL,
        \`createdAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_search_events_type_created\` (\`eventType\`, \`createdAt\`),
        INDEX \`IDX_search_events_query_created\` (\`query\`, \`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`search_settings\` (
        \`settingKey\` VARCHAR(120) NOT NULL,
        \`value\`      JSON NOT NULL,
        \`updatedBy\`  VARCHAR(36) NULL,
        \`createdAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`settingKey\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      INSERT INTO \`search_settings\` (\`settingKey\`, \`value\`)
      VALUES (
        'global',
        JSON_OBJECT(
          'outOfStockProductsVisible', true,
          'searchHistoryLimit', 30,
          'popularSearchWindowDays', 30,
          'featuredBoostEnabled', true,
          'ranking',
            JSON_OBJECT(
              'subscriptionPriorityEnabled', true,
              'ratingEnabled', true,
              'freshnessEnabled', true,
              'availabilityEnabled', true
            ),
          'weights',
            JSON_OBJECT(
              'featuredBoost', 25,
              'subscriptionPriorityMaxWeight', 50,
              'ratingWeight', 10,
              'freshnessWeight', 8,
              'availabilityWeight', 10,
              'outOfStockPenalty', 20
            )
        )
      )
      ON DUPLICATE KEY UPDATE \`settingKey\` = \`settingKey\`
    `);

    await queryRunner.query(`
      CREATE TABLE \`search_index_jobs\` (
        \`id\`             VARCHAR(36) NOT NULL,
        \`entityType\`     ENUM('product','seller','market_rfq','category','products','sellers','market_rfqs','categories') NOT NULL,
        \`entityId\`       VARCHAR(36) NULL,
        \`status\`         ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
        \`attemptCount\`   INT NOT NULL DEFAULT 0,
        \`failureReason\`  TEXT NULL,
        \`requestedBy\`    VARCHAR(36) NULL,
        \`completedAt\`    TIMESTAMP NULL,
        \`createdAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_search_index_jobs_status_created\` (\`status\`, \`createdAt\`),
        INDEX \`IDX_search_index_jobs_entity\` (\`entityType\`, \`entityId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await this.addPermissions(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.removePermissions(queryRunner);
    await queryRunner.query(`DROP TABLE IF EXISTS \`search_index_jobs\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`search_settings\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`search_events\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`product_views\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`search_history\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`featured_stores\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`featured_products\``);
  }

  private async addPermissions(queryRunner: QueryRunner): Promise<void> {
    const permissions: Array<[string, string, string, string]> = [
      [
        'search.view_settings',
        'View Search Settings',
        'Allows the Admin to view Search, Discovery and Ranking settings.',
        'search',
      ],
      [
        'search.manage_settings',
        'Manage Search Settings',
        'Allows the Admin to update Search, Discovery and Ranking settings.',
        'search',
      ],
      [
        'search.view_index',
        'View Search Index',
        'Allows the Admin to view Search index health and update status.',
        'search',
      ],
      [
        'search.reindex',
        'Reindex Search',
        'Allows the Admin to request Search reindex operations.',
        'search',
      ],
    ];

    for (const permission of permissions) {
      await queryRunner.query(
        `
          INSERT IGNORE INTO \`permissions\`
            (\`id\`, \`code\`, \`name\`, \`description\`, \`module\`, \`status\`)
          VALUES (UUID(), ?, ?, ?, ?, 'active')
        `,
        permission,
      );
    }

    await queryRunner.query(`
      INSERT IGNORE INTO \`admin_role_permissions\` (\`id\`, \`roleId\`, \`permissionId\`)
      SELECT UUID(), r.\`id\`, p.\`id\`
      FROM \`admin_roles\` r
      JOIN \`permissions\` p
        ON p.\`code\` IN (
          'search.view_settings',
          'search.manage_settings',
          'search.view_index',
          'search.reindex'
        )
      WHERE r.\`name\` = 'Administrator'
    `);

    await queryRunner.query(`
      INSERT IGNORE INTO \`admin_role_permissions\` (\`id\`, \`roleId\`, \`permissionId\`)
      SELECT UUID(), r.\`id\`, p.\`id\`
      FROM \`admin_roles\` r
      JOIN \`permissions\` p
        ON p.\`code\` IN ('search.view_settings', 'search.view_index')
      WHERE r.\`name\` = 'Support Agent'
    `);
  }

  private async removePermissions(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE arp FROM \`admin_role_permissions\` arp
      JOIN \`permissions\` p ON p.\`id\` = arp.\`permissionId\`
      WHERE p.\`code\` IN (
        'search.view_settings',
        'search.manage_settings',
        'search.view_index',
        'search.reindex'
      )
    `);
    await queryRunner.query(`
      DELETE FROM \`permissions\`
      WHERE \`code\` IN (
        'search.view_settings',
        'search.manage_settings',
        'search.view_index',
        'search.reindex'
      )
    `);
  }
}
