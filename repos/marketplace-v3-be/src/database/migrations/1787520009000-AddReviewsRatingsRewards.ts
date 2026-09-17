import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewsRatingsRewards1787520009000 implements MigrationInterface {
  name = 'AddReviewsRatingsRewards1787520009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`products\`
        ADD \`averageRating\` DECIMAL(3,2) NOT NULL DEFAULT 0 AFTER \`totalStock\`,
        ADD \`totalReviews\` INT NOT NULL DEFAULT 0 AFTER \`averageRating\`,
        ADD INDEX \`IDX_products_rating\` (\`averageRating\`, \`totalReviews\`)
    `);

    await queryRunner.query(`
      CREATE TABLE \`review_eligibilities\` (
        \`id\`             VARCHAR(36) NOT NULL,
        \`eligibilityKey\` VARCHAR(160) NOT NULL,
        \`orderId\`        VARCHAR(36) NOT NULL,
        \`orderItemId\`    VARCHAR(36) NULL,
        \`buyerId\`        VARCHAR(36) NOT NULL,
        \`sellerId\`       VARCHAR(36) NOT NULL,
        \`productId\`      VARCHAR(36) NULL,
        \`reviewType\`     ENUM('product','seller') NOT NULL,
        \`status\`         ENUM('eligible','submitted','expired','revoked') NOT NULL DEFAULT 'eligible',
        \`reviewId\`       VARCHAR(36) NULL,
        \`eligibleAt\`     TIMESTAMP NOT NULL,
        \`expiresAt\`      TIMESTAMP NULL,
        \`submittedAt\`    TIMESTAMP NULL,
        \`createdAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_review_eligibilities_key\` (\`eligibilityKey\`),
        INDEX \`IDX_review_eligibilities_buyer_status\` (\`buyerId\`, \`status\`),
        INDEX \`IDX_review_eligibilities_order_type\` (\`orderId\`, \`reviewType\`),
        INDEX \`IDX_review_eligibilities_orderItemId\` (\`orderItemId\`),
        INDEX \`IDX_review_eligibilities_sellerId\` (\`sellerId\`),
        CONSTRAINT \`FK_review_eligibilities_orderId\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_review_eligibilities_orderItemId\`
          FOREIGN KEY (\`orderItemId\`) REFERENCES \`order_items\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_review_eligibilities_buyerId\`
          FOREIGN KEY (\`buyerId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_review_eligibilities_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`product_reviews\` (
        \`id\`                 VARCHAR(36) NOT NULL,
        \`eligibilityId\`      VARCHAR(36) NOT NULL,
        \`orderId\`            VARCHAR(36) NOT NULL,
        \`orderItemId\`        VARCHAR(36) NOT NULL,
        \`buyerId\`            VARCHAR(36) NOT NULL,
        \`sellerId\`           VARCHAR(36) NOT NULL,
        \`productId\`          VARCHAR(36) NOT NULL,
        \`rating\`             INT NOT NULL,
        \`title\`              VARCHAR(160) NULL,
        \`comment\`            TEXT NOT NULL,
        \`images\`             JSON NOT NULL,
        \`status\`             ENUM('published','pending_moderation','hidden','rejected','deleted') NOT NULL DEFAULT 'published',
        \`isVerifiedPurchase\` TINYINT(1) NOT NULL DEFAULT 1,
        \`pointsAwarded\`      INT NOT NULL DEFAULT 0,
        \`helpfulCount\`       INT NOT NULL DEFAULT 0,
        \`notHelpfulCount\`    INT NOT NULL DEFAULT 0,
        \`moderationReason\`   TEXT NULL,
        \`moderationFlags\`    JSON NULL,
        \`createdAt\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_product_reviews_eligibility\` (\`eligibilityId\`),
        INDEX \`IDX_product_reviews_product_status\` (\`productId\`, \`status\`),
        INDEX \`IDX_product_reviews_buyer_status\` (\`buyerId\`, \`status\`),
        INDEX \`IDX_product_reviews_seller_status\` (\`sellerId\`, \`status\`),
        INDEX \`IDX_product_reviews_orderId\` (\`orderId\`),
        INDEX \`IDX_product_reviews_orderItemId\` (\`orderItemId\`),
        CONSTRAINT \`FK_product_reviews_eligibilityId\`
          FOREIGN KEY (\`eligibilityId\`) REFERENCES \`review_eligibilities\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_product_reviews_orderId\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_product_reviews_orderItemId\`
          FOREIGN KEY (\`orderItemId\`) REFERENCES \`order_items\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_product_reviews_buyerId\`
          FOREIGN KEY (\`buyerId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_product_reviews_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`seller_reviews\` (
        \`id\`                    VARCHAR(36) NOT NULL,
        \`eligibilityId\`         VARCHAR(36) NOT NULL,
        \`orderId\`               VARCHAR(36) NOT NULL,
        \`buyerId\`               VARCHAR(36) NOT NULL,
        \`sellerId\`              VARCHAR(36) NOT NULL,
        \`overallRating\`         INT NOT NULL,
        \`communicationRating\`   INT NULL,
        \`fulfillmentRating\`     INT NULL,
        \`reliabilityRating\`     INT NULL,
        \`comment\`               TEXT NOT NULL,
        \`status\`                ENUM('published','pending_moderation','hidden','rejected','deleted') NOT NULL DEFAULT 'published',
        \`isVerifiedTransaction\` TINYINT(1) NOT NULL DEFAULT 1,
        \`pointsAwarded\`         INT NOT NULL DEFAULT 0,
        \`helpfulCount\`          INT NOT NULL DEFAULT 0,
        \`notHelpfulCount\`       INT NOT NULL DEFAULT 0,
        \`moderationReason\`      TEXT NULL,
        \`moderationFlags\`       JSON NULL,
        \`createdAt\`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_seller_reviews_eligibility\` (\`eligibilityId\`),
        INDEX \`IDX_seller_reviews_seller_status\` (\`sellerId\`, \`status\`),
        INDEX \`IDX_seller_reviews_buyer_status\` (\`buyerId\`, \`status\`),
        INDEX \`IDX_seller_reviews_orderId\` (\`orderId\`),
        CONSTRAINT \`FK_seller_reviews_eligibilityId\`
          FOREIGN KEY (\`eligibilityId\`) REFERENCES \`review_eligibilities\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_seller_reviews_orderId\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_seller_reviews_buyerId\`
          FOREIGN KEY (\`buyerId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_seller_reviews_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`review_votes\` (
        \`id\`         VARCHAR(36) NOT NULL,
        \`reviewType\` ENUM('product','seller') NOT NULL,
        \`reviewId\`   VARCHAR(36) NOT NULL,
        \`userId\`     VARCHAR(36) NOT NULL,
        \`vote\`       ENUM('helpful','not_helpful') NOT NULL,
        \`createdAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_review_votes_review_user\` (\`reviewType\`, \`reviewId\`, \`userId\`),
        INDEX \`IDX_review_votes_review\` (\`reviewType\`, \`reviewId\`),
        INDEX \`IDX_review_votes_userId\` (\`userId\`),
        CONSTRAINT \`FK_review_votes_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`review_responses\` (
        \`id\`         VARCHAR(36) NOT NULL,
        \`reviewType\` ENUM('product','seller') NOT NULL,
        \`reviewId\`   VARCHAR(36) NOT NULL,
        \`sellerId\`   VARCHAR(36) NOT NULL,
        \`comment\`    TEXT NOT NULL,
        \`status\`     ENUM('published','hidden','deleted') NOT NULL DEFAULT 'published',
        \`createdAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_review_responses_review_seller\` (\`reviewType\`, \`reviewId\`, \`sellerId\`),
        INDEX \`IDX_review_responses_review\` (\`reviewType\`, \`reviewId\`),
        INDEX \`IDX_review_responses_sellerId\` (\`sellerId\`),
        CONSTRAINT \`FK_review_responses_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`reward_settings\` (
        \`id\`           VARCHAR(36) NOT NULL,
        \`settingKey\`   VARCHAR(120) NOT NULL,
        \`settingValue\` JSON NOT NULL,
        \`updatedBy\`    VARCHAR(36) NULL,
        \`createdAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_reward_settings_key\` (\`settingKey\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`points_transactions\` (
        \`id\`           VARCHAR(36) NOT NULL,
        \`userId\`       VARCHAR(36) NOT NULL,
        \`type\`         ENUM('earned','redeemed','adjusted','expired','reversed') NOT NULL,
        \`points\`       INT NOT NULL,
        \`sourceType\`   ENUM('product_review','seller_review','admin_adjustment','referral') NOT NULL,
        \`sourceId\`     VARCHAR(36) NOT NULL,
        \`rewardType\`   VARCHAR(80) NOT NULL,
        \`description\`  VARCHAR(255) NOT NULL,
        \`balanceAfter\` INT NOT NULL,
        \`createdAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_points_transactions_source_reward\` (\`sourceType\`, \`sourceId\`, \`rewardType\`),
        INDEX \`IDX_points_transactions_user_type\` (\`userId\`, \`type\`),
        INDEX \`IDX_points_transactions_source\` (\`sourceType\`, \`sourceId\`),
        CONSTRAINT \`FK_points_transactions_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`review_audit_events\` (
        \`id\`                  VARCHAR(36) NOT NULL,
        \`eventType\`           VARCHAR(120) NOT NULL,
        \`actorType\`           ENUM('buyer','seller','admin','system') NOT NULL,
        \`actorId\`             VARCHAR(36) NULL,
        \`reviewType\`          ENUM('product','seller') NULL,
        \`reviewId\`            VARCHAR(36) NULL,
        \`eligibilityId\`       VARCHAR(36) NULL,
        \`pointsTransactionId\` VARCHAR(36) NULL,
        \`metadata\`            JSON NULL,
        \`createdAt\`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_review_audit_events_eventType\` (\`eventType\`),
        INDEX \`IDX_review_audit_events_review\` (\`reviewType\`, \`reviewId\`),
        INDEX \`IDX_review_audit_events_eligibilityId\` (\`eligibilityId\`),
        INDEX \`IDX_review_audit_events_createdAt\` (\`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await this.addRewardPermission(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE arp FROM \`admin_role_permissions\` arp
      JOIN \`permissions\` p ON p.\`id\` = arp.\`permissionId\`
      WHERE p.\`code\` = 'rewards.manage'
    `);
    await queryRunner.query(`DELETE FROM \`permissions\` WHERE \`code\` = 'rewards.manage'`);

    await queryRunner.query(`DROP TABLE IF EXISTS \`review_audit_events\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`points_transactions\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`reward_settings\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`review_responses\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`review_votes\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`seller_reviews\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`product_reviews\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`review_eligibilities\``);
    await queryRunner.query(`
      ALTER TABLE \`products\`
        DROP INDEX \`IDX_products_rating\`,
        DROP COLUMN \`totalReviews\`,
        DROP COLUMN \`averageRating\`
    `);
  }

  private async addRewardPermission(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        INSERT IGNORE INTO \`permissions\`
          (\`id\`, \`code\`, \`name\`, \`description\`, \`module\`, \`status\`)
        VALUES (UUID(), ?, ?, ?, ?, 'active')
      `,
      [
        'rewards.manage',
        'Manage Rewards',
        'Allows the Admin to update reward settings and adjust user points.',
        'rewards',
      ],
    );

    await queryRunner.query(`
      INSERT IGNORE INTO \`admin_role_permissions\` (\`id\`, \`roleId\`, \`permissionId\`)
      SELECT UUID(), r.\`id\`, p.\`id\`
      FROM \`admin_roles\` r
      JOIN \`permissions\` p ON p.\`code\` = 'rewards.manage'
      WHERE r.\`name\` IN ('Administrator', 'Finance Officer')
    `);
  }
}
