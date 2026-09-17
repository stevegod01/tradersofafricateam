import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairUserSignupSchema1787520016000 implements MigrationInterface {
  name = 'RepairUserSignupSchema1787520016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) return;

    // Keep the legacy columns required by the previous release. This migration
    // repairs drift without turning an application rollback into a schema rollback.
    await this.ensureColumn(queryRunner, 'password', 'VARCHAR(255) NULL');
    await this.ensureColumn(queryRunner, 'passwordHash', 'VARCHAR(255) NULL');
    await this.ensureColumn(queryRunner, 'phone', 'VARCHAR(30) NULL');
    await this.ensureColumn(queryRunner, 'phoneNumber', 'VARCHAR(30) NULL');

    await this.ensureColumn(queryRunner, 'termsOfUse', 'TINYINT(1) NOT NULL DEFAULT 0');
    await this.ensureColumn(queryRunner, 'merchantTerms', 'TINYINT(1) NOT NULL DEFAULT 0');
    await this.ensureColumn(queryRunner, 'isEmailVerified', 'TINYINT(1) NOT NULL DEFAULT 0');
    await this.ensureColumn(queryRunner, 'isCompanyVerified', 'TINYINT(1) NOT NULL DEFAULT 0');
    await this.ensureColumn(
      queryRunner,
      'selectedLanguage',
      "VARCHAR(20) NOT NULL DEFAULT 'en'",
    );
    await this.ensureColumn(queryRunner, 'deliveryAddress', 'VARCHAR(500) NULL');
    await this.ensureColumn(queryRunner, 'totalReviewCount', 'INT NOT NULL DEFAULT 0');
    await this.ensureColumn(
      queryRunner,
      'totalAverageReviews',
      'DECIMAL(3,2) NOT NULL DEFAULT 0',
    );
    await this.ensureColumn(queryRunner, 'totalPoints', 'INT NOT NULL DEFAULT 0');
    await this.ensureColumn(queryRunner, 'referral', 'VARCHAR(50) NULL');
    await this.ensureColumn(queryRunner, 'referralCode', 'VARCHAR(50) NULL');
    await this.ensureColumn(queryRunner, 'statusReason', 'TEXT NULL');
    await this.ensureColumn(queryRunner, 'disabledBy', 'VARCHAR(36) NULL');
    await this.ensureColumn(queryRunner, 'disabledAt', 'TIMESTAMP NULL');

    await queryRunner.query(`
      UPDATE \`users\`
      SET
        \`passwordHash\` = COALESCE(\`passwordHash\`, \`password\`),
        \`password\` = COALESCE(\`password\`, \`passwordHash\`, UUID()),
        \`phoneNumber\` = COALESCE(\`phoneNumber\`, \`phone\`),
        \`phone\` = COALESCE(\`phone\`, \`phoneNumber\`)
    `);

    await this.ensureCompatibleStatusColumns(queryRunner);
    // Replace the original insert trigger. After currentStatus became NOT NULL
    // with a default, a NULL check could no longer identify legacy-package
    // inserts and would incorrectly overwrite an explicit legacy status.
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS `TR_users_credentials_compat_insert`',
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS `TR_users_credentials_compat_update`',
    );
    await this.ensureCompatibilityTriggers(queryRunner);
    await this.ensureIndex(queryRunner, 'IDX_users_currentStatus', 'currentStatus');
    await this.ensureReferralCodeIndex(queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: this migration repairs schema drift without removing user data or
    // the compatibility surface required by the previous application release.
  }

  private async ensureColumn(
    queryRunner: QueryRunner,
    columnName: string,
    definition: string,
  ): Promise<void> {
    if (await queryRunner.hasColumn('users', columnName)) {
      await queryRunner.query(
        `ALTER TABLE \`users\` MODIFY \`${columnName}\` ${definition}`,
      );
      return;
    }

    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`${columnName}\` ${definition}`,
    );
  }

  private async ensureCompatibleStatusColumns(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('users', 'status'))) {
      await queryRunner.query(`
        ALTER TABLE \`users\`
        ADD \`status\` ENUM('active','suspended','banned','inactive','disabled','deleted')
        NOT NULL DEFAULT 'active'
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`users\`
        MODIFY \`status\`
        ENUM('active','suspended','banned','inactive','disabled','deleted')
        NOT NULL DEFAULT 'active'
      `);
    }

    if (!(await queryRunner.hasColumn('users', 'currentStatus'))) {
      await queryRunner.query(`
        ALTER TABLE \`users\`
        ADD \`currentStatus\` ENUM('active','inactive','disabled','deleted') NULL
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`users\`
        MODIFY \`currentStatus\` ENUM('active','inactive','disabled','deleted') NULL
      `);
    }

    await queryRunner.query(`
      UPDATE \`users\`
      SET \`currentStatus\` = CASE
        WHEN \`status\` = 'suspended' THEN 'disabled'
        WHEN \`status\` = 'banned' THEN 'deleted'
        WHEN \`status\` = 'disabled' THEN 'disabled'
        WHEN \`status\` = 'deleted' THEN 'deleted'
        WHEN \`status\` = 'inactive' THEN 'inactive'
        WHEN \`isEmailVerified\` = 0 THEN 'inactive'
        ELSE 'active'
      END
      WHERE \`currentStatus\` IS NULL
    `);

    await queryRunner.query(`
      UPDATE \`users\`
      SET \`status\` = CASE \`currentStatus\`
        WHEN 'active' THEN 'active'
        WHEN 'deleted' THEN 'banned'
        ELSE 'suspended'
      END
    `);

    await queryRunner.query(`
      ALTER TABLE \`users\`
      MODIFY \`status\` ENUM('active','suspended','banned')
      NOT NULL DEFAULT 'active',
      MODIFY \`currentStatus\` ENUM('active','inactive','disabled','deleted')
      NOT NULL DEFAULT 'inactive'
    `);
  }

  private async ensureCompatibilityTriggers(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasTrigger(queryRunner, 'TR_users_credentials_compat_insert'))) {
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
    }

    if (!(await this.hasTrigger(queryRunner, 'TR_users_credentials_compat_update'))) {
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
    }
  }

  private async ensureIndex(
    queryRunner: QueryRunner,
    indexName: string,
    columnName: string,
  ): Promise<void> {
    if (await this.hasUserIndex(queryRunner, indexName)) return;

    await queryRunner.query(
      `CREATE INDEX \`${indexName}\` ON \`users\` (\`${columnName}\`)`,
    );
  }

  private async ensureReferralCodeIndex(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasColumn('users', 'referralCode')) ||
      (await this.hasUserIndex(queryRunner, 'UQ_users_referralCode'))
    ) {
      return;
    }

    const duplicates = (await queryRunner.query(`
      SELECT \`referralCode\`
      FROM \`users\`
      WHERE \`referralCode\` IS NOT NULL
      GROUP BY \`referralCode\`
      HAVING COUNT(*) > 1
      LIMIT 1
    `)) as Array<Record<string, unknown>>;

    if (duplicates.length > 0) return;

    await queryRunner.query(`
      CREATE UNIQUE INDEX \`UQ_users_referralCode\`
      ON \`users\` (\`referralCode\`)
    `);
  }

  private async hasUserIndex(
    queryRunner: QueryRunner,
    indexName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'users'
          AND index_name = ?
        LIMIT 1
      `,
      [indexName],
    )) as Array<Record<string, unknown>>;

    return rows.length > 0;
  }

  private async hasTrigger(
    queryRunner: QueryRunner,
    triggerName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE()
          AND event_object_table = 'users'
          AND trigger_name = ?
        LIMIT 1
      `,
      [triggerName],
    )) as Array<Record<string, unknown>>;

    return rows.length > 0;
  }
}
