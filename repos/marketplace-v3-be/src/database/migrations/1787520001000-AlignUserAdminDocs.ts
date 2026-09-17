import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignUserAdminDocs1787520001000 implements MigrationInterface {
  name = 'AlignUserAdminDocs1787520001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
      MODIFY \`password\` VARCHAR(255) NULL,
      MODIFY \`phone\` VARCHAR(30) NULL,
      ADD \`passwordHash\` VARCHAR(255) NULL AFTER \`password\`,
      ADD \`phoneNumber\` VARCHAR(30) NULL AFTER \`phone\`,
      ADD \`currentStatus\` ENUM('active','inactive','disabled','deleted') NULL AFTER \`status\`
    `);

    await queryRunner.query(`
      UPDATE \`users\`
      SET
        \`passwordHash\` = \`password\`,
        \`phoneNumber\` = \`phone\`,
        \`currentStatus\` = CASE
          WHEN \`status\` = 'suspended' THEN 'disabled'
          WHEN \`status\` = 'banned' THEN 'deleted'
          WHEN \`isEmailVerified\` = 0 THEN 'inactive'
          ELSE 'active'
        END
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_users_currentStatus\`
      ON \`users\` (\`currentStatus\`)
    `);

    // This is an expand/contract migration. The legacy columns and status values
    // remain available while the previous application package is a rollback
    // candidate. Triggers keep writes from both package versions synchronized.
    await queryRunner.query(`
      CREATE TRIGGER \`TR_users_credentials_compat_insert\`
      BEFORE INSERT ON \`users\`
      FOR EACH ROW
      BEGIN
        DECLARE legacy_write BOOLEAN DEFAULT FALSE;
        SET legacy_write = NEW.\`passwordHash\` IS NULL
          AND NEW.\`password\` IS NOT NULL;

        IF NEW.\`passwordHash\` IS NOT NULL THEN
          SET NEW.\`password\` = NEW.\`passwordHash\`;
        ELSEIF NEW.\`password\` IS NOT NULL THEN
          SET NEW.\`passwordHash\` = NEW.\`password\`;
        ELSE
          SET NEW.\`password\` = UUID();
        END IF;

        IF legacy_write THEN
          SET NEW.\`phoneNumber\` = NEW.\`phone\`;
        ELSE
          SET NEW.\`phone\` = NEW.\`phoneNumber\`;
        END IF;

        IF legacy_write THEN
          SET NEW.\`currentStatus\` = CASE NEW.\`status\`
            WHEN 'suspended' THEN 'disabled'
            WHEN 'banned' THEN 'deleted'
            ELSE 'active'
          END;
        ELSE
          SET NEW.\`status\` = CASE NEW.\`currentStatus\`
            WHEN 'active' THEN 'active'
            WHEN 'deleted' THEN 'banned'
            ELSE 'suspended'
          END;
        END IF;
      END
    `);

    await queryRunner.query(`
      CREATE TRIGGER \`TR_users_credentials_compat_update\`
      BEFORE UPDATE ON \`users\`
      FOR EACH ROW
      BEGIN
        IF NOT (NEW.\`passwordHash\` <=> OLD.\`passwordHash\`) THEN
          SET NEW.\`password\` = COALESCE(NEW.\`passwordHash\`, UUID());
        ELSEIF NOT (NEW.\`password\` <=> OLD.\`password\`) THEN
          SET NEW.\`passwordHash\` = NEW.\`password\`;
        END IF;

        IF NOT (NEW.\`phoneNumber\` <=> OLD.\`phoneNumber\`) THEN
          SET NEW.\`phone\` = NEW.\`phoneNumber\`;
        ELSEIF NOT (NEW.\`phone\` <=> OLD.\`phone\`) THEN
          SET NEW.\`phoneNumber\` = NEW.\`phone\`;
        END IF;

        IF NOT (NEW.\`currentStatus\` <=> OLD.\`currentStatus\`) THEN
          SET NEW.\`status\` = CASE NEW.\`currentStatus\`
            WHEN 'active' THEN 'active'
            WHEN 'deleted' THEN 'banned'
            ELSE 'suspended'
          END;
        ELSEIF NOT (NEW.\`status\` <=> OLD.\`status\`) THEN
          SET NEW.\`currentStatus\` = CASE NEW.\`status\`
            WHEN 'suspended' THEN 'disabled'
            WHEN 'banned' THEN 'deleted'
            ELSE 'active'
          END;
        END IF;
      END
    `);

    await queryRunner.query(`
      ALTER TABLE \`users\`
      ADD \`termsOfUse\` TINYINT(1) NOT NULL DEFAULT 0,
      ADD \`merchantTerms\` TINYINT(1) NOT NULL DEFAULT 0,
      ADD \`deliveryAddress\` VARCHAR(500) NULL,
      ADD \`totalReviewCount\` INT NOT NULL DEFAULT 0,
      ADD \`totalAverageReviews\` DECIMAL(3,2) NOT NULL DEFAULT 0,
      ADD \`totalPoints\` INT NOT NULL DEFAULT 0,
      ADD \`referral\` VARCHAR(50) NULL,
      ADD \`referralCode\` VARCHAR(50) NULL,
      ADD \`statusReason\` TEXT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`UQ_users_referralCode\`
      ON \`users\` (\`referralCode\`)
    `);

    await queryRunner.query(`
      CREATE TABLE \`admins\` (
        \`id\`           VARCHAR(36) NOT NULL,
        \`email\`        VARCHAR(255) NOT NULL,
        \`firstName\`    VARCHAR(100) NOT NULL,
        \`lastName\`     VARCHAR(100) NOT NULL,
        \`phoneNumber\`  VARCHAR(30) NULL,
        \`passwordHash\` VARCHAR(255) NOT NULL,
        \`role\`         ENUM('admin','super_admin','support_agent','finance')
                       NOT NULL DEFAULT 'admin',
        \`createdBy\`    VARCHAR(36) NULL,
        \`status\`       ENUM('active','inactive','suspended')
                       NOT NULL DEFAULT 'active',
        \`statusReason\` TEXT NULL,
        \`createdAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_admins_email\` (\`email\`),
        INDEX \`IDX_admins_role\` (\`role\`),
        INDEX \`IDX_admins_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      ALTER TABLE \`company_verifications\`
      DROP FOREIGN KEY \`FK_cv_reviewedBy\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`categories\`
      DROP FOREIGN KEY \`FK_categories_createdBy\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`categories\`
      DROP FOREIGN KEY \`FK_categories_updatedBy\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS \`TR_users_credentials_compat_update\``);
    await queryRunner.query(`DROP TRIGGER IF EXISTS \`TR_users_credentials_compat_insert\``);

    await queryRunner.query(`DROP TABLE IF EXISTS \`admins\``);

    await queryRunner.query(`
      DROP INDEX \`UQ_users_referralCode\` ON \`users\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`users\`
      DROP COLUMN \`statusReason\`,
      DROP COLUMN \`referralCode\`,
      DROP COLUMN \`referral\`,
      DROP COLUMN \`totalPoints\`,
      DROP COLUMN \`totalAverageReviews\`,
      DROP COLUMN \`totalReviewCount\`,
      DROP COLUMN \`deliveryAddress\`,
      DROP COLUMN \`merchantTerms\`,
      DROP COLUMN \`termsOfUse\`
    `);

    await queryRunner.query(`
      UPDATE \`users\`
      SET
        \`password\` = COALESCE(\`passwordHash\`, \`password\`, UUID()),
        \`phone\` = COALESCE(\`phoneNumber\`, \`phone\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`users\`
      DROP COLUMN \`currentStatus\`,
      DROP COLUMN \`phoneNumber\`,
      DROP COLUMN \`passwordHash\`,
      MODIFY \`password\` VARCHAR(255) NOT NULL
    `);
  }
}
