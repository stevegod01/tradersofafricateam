import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInternationalizationLocalization1787520012000 implements MigrationInterface {
  name = 'AddInternationalizationLocalization1787520012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`languages\` (
        \`id\`         VARCHAR(36) NOT NULL,
        \`code\`       VARCHAR(20) NOT NULL,
        \`name\`       VARCHAR(120) NOT NULL,
        \`nativeName\` VARCHAR(120) NOT NULL,
        \`direction\`  ENUM('ltr','rtl') NOT NULL DEFAULT 'ltr',
        \`isDefault\`  TINYINT(1) NOT NULL DEFAULT 0,
        \`status\`     ENUM('active','inactive') NOT NULL DEFAULT 'inactive',
        \`sortOrder\`  INT NOT NULL DEFAULT 0,
        \`createdAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_languages_code\` (\`code\`),
        INDEX \`IDX_languages_status_sort\` (\`status\`, \`sortOrder\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      INSERT IGNORE INTO \`languages\`
        (\`id\`, \`code\`, \`name\`, \`nativeName\`, \`direction\`, \`isDefault\`, \`status\`, \`sortOrder\`)
      VALUES
        (UUID(), 'en', 'English', 'English', 'ltr', 1, 'active', 1),
        (UUID(), 'fr', 'French', 'Français', 'ltr', 0, 'active', 2),
        (UUID(), 'ar', 'Arabic', 'العربية', 'rtl', 0, 'active', 3),
        (UUID(), 'sw', 'Swahili', 'Kiswahili', 'ltr', 0, 'active', 4),
        (UUID(), 'pt', 'Portuguese', 'Português', 'ltr', 0, 'active', 5)
    `);

    await queryRunner.query(`
      CREATE TABLE \`translation_metadata\` (
        \`id\`                 VARCHAR(36) NOT NULL,
        \`entityType\`         ENUM('product','category','direct_rfq','market_rfq','subscription_plan','system_announcement') NOT NULL,
        \`entityId\`           VARCHAR(36) NOT NULL,
        \`fieldName\`          VARCHAR(120) NOT NULL,
        \`sourceLanguage\`     VARCHAR(20) NOT NULL,
        \`targetLanguage\`     VARCHAR(20) NOT NULL,
        \`status\`             ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
        \`translationSource\`  ENUM('original','machine','manual') NOT NULL DEFAULT 'machine',
        \`stale\`              TINYINT(1) NOT NULL DEFAULT 0,
        \`lastTranslatedAt\`   TIMESTAMP NULL,
        \`failureReason\`      TEXT NULL,
        \`manuallyUpdatedBy\`  VARCHAR(36) NULL,
        \`manuallyUpdatedAt\`  TIMESTAMP NULL,
        \`metadata\`           JSON NULL,
        \`createdAt\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_translation_metadata_target\`
          (\`entityType\`, \`entityId\`, \`fieldName\`, \`targetLanguage\`),
        INDEX \`IDX_translation_metadata_entity\` (\`entityType\`, \`entityId\`),
        INDEX \`IDX_translation_metadata_status_language\` (\`status\`, \`targetLanguage\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      ALTER TABLE \`categories\`
        ADD COLUMN \`sourceLanguage\` VARCHAR(20) NOT NULL DEFAULT 'en' AFTER \`description\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`products\`
        ADD COLUMN \`sourceLanguage\` VARCHAR(20) NOT NULL DEFAULT 'en' AFTER \`productDescription\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`direct_rfqs\`
        ADD COLUMN \`description_i18n\` JSON NULL AFTER \`unit\`,
        ADD COLUMN \`sourceLanguage\` VARCHAR(20) NOT NULL DEFAULT 'en' AFTER \`description_i18n\`,
        ADD COLUMN \`buyerNotes_i18n\` JSON NULL AFTER \`currencyPreference\`
    `);
    await queryRunner.query(`
      UPDATE \`direct_rfqs\`
      SET
        \`description_i18n\` = JSON_OBJECT('en', \`description\`),
        \`buyerNotes_i18n\` = CASE
          WHEN \`buyerNotes\` IS NULL THEN NULL
          ELSE JSON_OBJECT('en', \`buyerNotes\`)
        END
    `);
    await queryRunner.query(`
      ALTER TABLE \`direct_rfqs\`
        MODIFY COLUMN \`description_i18n\` JSON NOT NULL,
        MODIFY COLUMN \`buyerNotes_i18n\` JSON NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`market_rfqs\`
        ADD COLUMN \`sourceLanguage\` VARCHAR(20) NOT NULL DEFAULT 'en' AFTER \`description\`,
        ADD COLUMN \`buyerNotes_i18n\` JSON NULL AFTER \`currencyPreference\`
    `);
    await queryRunner.query(`
      UPDATE \`market_rfqs\`
      SET \`buyerNotes_i18n\` = CASE
        WHEN \`buyerNotes\` IS NULL THEN NULL
        ELSE JSON_OBJECT('en', \`buyerNotes\`)
      END
    `);
    await queryRunner.query(`
      ALTER TABLE \`subscription_plans\`
        ADD COLUMN \`name_i18n\` JSON NULL AFTER \`id\`,
        ADD COLUMN \`description_i18n\` JSON NULL AFTER \`description\`,
        ADD COLUMN \`sourceLanguage\` VARCHAR(20) NOT NULL DEFAULT 'en' AFTER \`description_i18n\`
    `);
    await queryRunner.query(`
      UPDATE \`subscription_plans\`
      SET
        \`name_i18n\` = JSON_OBJECT('en', \`name\`),
        \`description_i18n\` = CASE
          WHEN \`description\` IS NULL THEN NULL
          ELSE JSON_OBJECT('en', \`description\`)
        END
    `);
    await queryRunner.query(`
      ALTER TABLE \`subscription_plans\`
        MODIFY COLUMN \`name_i18n\` JSON NOT NULL,
        MODIFY COLUMN \`description_i18n\` JSON NULL
    `);

    await this.addCompatibilityTriggers(queryRunner);
    await this.addPermissions(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.removePermissions(queryRunner);
    await this.removeCompatibilityTriggers(queryRunner);

    await queryRunner.query(`
      ALTER TABLE \`subscription_plans\`
        DROP COLUMN \`name_i18n\`,
        DROP COLUMN \`description_i18n\`,
        DROP COLUMN \`sourceLanguage\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`market_rfqs\`
        DROP COLUMN \`buyerNotes_i18n\`,
        DROP COLUMN \`sourceLanguage\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`direct_rfqs\`
        DROP COLUMN \`description_i18n\`,
        DROP COLUMN \`buyerNotes_i18n\`,
        DROP COLUMN \`sourceLanguage\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`products\`
        DROP COLUMN \`sourceLanguage\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`categories\`
        DROP COLUMN \`sourceLanguage\`
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS \`translation_metadata\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`languages\``);
  }

  public async addCompatibilityTriggers(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TRIGGER \`TR_direct_rfqs_i18n_compat_insert\`
      BEFORE INSERT ON \`direct_rfqs\`
      FOR EACH ROW
      BEGIN
        IF NEW.\`description_i18n\` IS NOT NULL THEN
          SET NEW.\`description\` = COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`description_i18n\`, CONCAT('$."', NEW.\`sourceLanguage\`, '"'))),
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`description_i18n\`, '$.en')),
            ''
          );
        ELSE
          SET NEW.\`description_i18n\` = JSON_OBJECT('en', NEW.\`description\`);
        END IF;

        IF NEW.\`buyerNotes_i18n\` IS NOT NULL THEN
          SET NEW.\`buyerNotes\` = COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`buyerNotes_i18n\`, CONCAT('$."', NEW.\`sourceLanguage\`, '"'))),
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`buyerNotes_i18n\`, '$.en'))
          );
        ELSEIF NEW.\`buyerNotes\` IS NOT NULL THEN
          SET NEW.\`buyerNotes_i18n\` = JSON_OBJECT('en', NEW.\`buyerNotes\`);
        END IF;
      END
    `);

    await queryRunner.query(`
      CREATE TRIGGER \`TR_direct_rfqs_i18n_compat_update\`
      BEFORE UPDATE ON \`direct_rfqs\`
      FOR EACH ROW
      BEGIN
        IF NOT (NEW.\`description_i18n\` <=> OLD.\`description_i18n\`) THEN
          SET NEW.\`description\` = COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`description_i18n\`, CONCAT('$."', NEW.\`sourceLanguage\`, '"'))),
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`description_i18n\`, '$.en')),
            ''
          );
        ELSEIF NOT (NEW.\`description\` <=> OLD.\`description\`) THEN
          SET NEW.\`description_i18n\` = JSON_OBJECT('en', NEW.\`description\`);
        END IF;

        IF NOT (NEW.\`buyerNotes_i18n\` <=> OLD.\`buyerNotes_i18n\`) THEN
          SET NEW.\`buyerNotes\` = COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`buyerNotes_i18n\`, CONCAT('$."', NEW.\`sourceLanguage\`, '"'))),
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`buyerNotes_i18n\`, '$.en'))
          );
        ELSEIF NOT (NEW.\`buyerNotes\` <=> OLD.\`buyerNotes\`) THEN
          SET NEW.\`buyerNotes_i18n\` = CASE
            WHEN NEW.\`buyerNotes\` IS NULL THEN NULL
            ELSE JSON_OBJECT('en', NEW.\`buyerNotes\`)
          END;
        END IF;
      END
    `);

    await queryRunner.query(`
      CREATE TRIGGER \`TR_market_rfqs_i18n_compat_insert\`
      BEFORE INSERT ON \`market_rfqs\`
      FOR EACH ROW
      BEGIN
        IF NEW.\`buyerNotes_i18n\` IS NOT NULL THEN
          SET NEW.\`buyerNotes\` = COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`buyerNotes_i18n\`, CONCAT('$."', NEW.\`sourceLanguage\`, '"'))),
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`buyerNotes_i18n\`, '$.en'))
          );
        ELSEIF NEW.\`buyerNotes\` IS NOT NULL THEN
          SET NEW.\`buyerNotes_i18n\` = JSON_OBJECT('en', NEW.\`buyerNotes\`);
        END IF;
      END
    `);

    await queryRunner.query(`
      CREATE TRIGGER \`TR_market_rfqs_i18n_compat_update\`
      BEFORE UPDATE ON \`market_rfqs\`
      FOR EACH ROW
      BEGIN
        IF NOT (NEW.\`buyerNotes_i18n\` <=> OLD.\`buyerNotes_i18n\`) THEN
          SET NEW.\`buyerNotes\` = COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`buyerNotes_i18n\`, CONCAT('$."', NEW.\`sourceLanguage\`, '"'))),
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`buyerNotes_i18n\`, '$.en'))
          );
        ELSEIF NOT (NEW.\`buyerNotes\` <=> OLD.\`buyerNotes\`) THEN
          SET NEW.\`buyerNotes_i18n\` = CASE
            WHEN NEW.\`buyerNotes\` IS NULL THEN NULL
            ELSE JSON_OBJECT('en', NEW.\`buyerNotes\`)
          END;
        END IF;
      END
    `);

    await queryRunner.query(`
      CREATE TRIGGER \`TR_subscription_plans_i18n_compat_insert\`
      BEFORE INSERT ON \`subscription_plans\`
      FOR EACH ROW
      BEGIN
        IF NEW.\`name_i18n\` IS NOT NULL THEN
          SET NEW.\`name\` = COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`name_i18n\`, CONCAT('$."', NEW.\`sourceLanguage\`, '"'))),
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`name_i18n\`, '$.en')),
            ''
          );
        ELSE
          SET NEW.\`name_i18n\` = JSON_OBJECT('en', NEW.\`name\`);
        END IF;

        IF NEW.\`description_i18n\` IS NOT NULL THEN
          SET NEW.\`description\` = COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`description_i18n\`, CONCAT('$."', NEW.\`sourceLanguage\`, '"'))),
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`description_i18n\`, '$.en'))
          );
        ELSEIF NEW.\`description\` IS NOT NULL THEN
          SET NEW.\`description_i18n\` = JSON_OBJECT('en', NEW.\`description\`);
        END IF;
      END
    `);

    await queryRunner.query(`
      CREATE TRIGGER \`TR_subscription_plans_i18n_compat_update\`
      BEFORE UPDATE ON \`subscription_plans\`
      FOR EACH ROW
      BEGIN
        IF NOT (NEW.\`name_i18n\` <=> OLD.\`name_i18n\`) THEN
          SET NEW.\`name\` = COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`name_i18n\`, CONCAT('$."', NEW.\`sourceLanguage\`, '"'))),
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`name_i18n\`, '$.en')),
            ''
          );
        ELSEIF NOT (NEW.\`name\` <=> OLD.\`name\`) THEN
          SET NEW.\`name_i18n\` = JSON_OBJECT('en', NEW.\`name\`);
        END IF;

        IF NOT (NEW.\`description_i18n\` <=> OLD.\`description_i18n\`) THEN
          SET NEW.\`description\` = COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`description_i18n\`, CONCAT('$."', NEW.\`sourceLanguage\`, '"'))),
            JSON_UNQUOTE(JSON_EXTRACT(NEW.\`description_i18n\`, '$.en'))
          );
        ELSEIF NOT (NEW.\`description\` <=> OLD.\`description\`) THEN
          SET NEW.\`description_i18n\` = CASE
            WHEN NEW.\`description\` IS NULL THEN NULL
            ELSE JSON_OBJECT('en', NEW.\`description\`)
          END;
        END IF;
      END
    `);
  }

  public async removeCompatibilityTriggers(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS `TR_subscription_plans_i18n_compat_update`');
    await queryRunner.query('DROP TRIGGER IF EXISTS `TR_subscription_plans_i18n_compat_insert`');
    await queryRunner.query('DROP TRIGGER IF EXISTS `TR_market_rfqs_i18n_compat_update`');
    await queryRunner.query('DROP TRIGGER IF EXISTS `TR_market_rfqs_i18n_compat_insert`');
    await queryRunner.query('DROP TRIGGER IF EXISTS `TR_direct_rfqs_i18n_compat_update`');
    await queryRunner.query('DROP TRIGGER IF EXISTS `TR_direct_rfqs_i18n_compat_insert`');
  }

  private async addPermissions(queryRunner: QueryRunner): Promise<void> {
    const permissions: Array<[string, string, string, string]> = [
      [
        'languages.view',
        'View Languages',
        'Allows the Admin to view platform language configuration.',
        'languages',
      ],
      [
        'languages.manage',
        'Manage Languages',
        'Allows the Admin to create, update, activate and set default languages.',
        'languages',
      ],
      [
        'translations.view',
        'View Translations',
        'Allows the Admin to monitor translation status across marketplace content.',
        'translations',
      ],
      [
        'translations.manage',
        'Manage Translations',
        'Allows the Admin to manually override translated marketplace content.',
        'translations',
      ],
      [
        'translations.retry',
        'Retry Translations',
        'Allows the Admin to queue failed or stale translations for retry.',
        'translations',
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
          'languages.view',
          'languages.manage',
          'translations.view',
          'translations.manage',
          'translations.retry'
        )
      WHERE r.\`name\` = 'Administrator'
    `);

    await queryRunner.query(`
      INSERT IGNORE INTO \`admin_role_permissions\` (\`id\`, \`roleId\`, \`permissionId\`)
      SELECT UUID(), r.\`id\`, p.\`id\`
      FROM \`admin_roles\` r
      JOIN \`permissions\` p
        ON p.\`code\` IN ('languages.view', 'translations.view')
      WHERE r.\`name\` = 'Support Agent'
    `);
  }

  private async removePermissions(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE arp FROM \`admin_role_permissions\` arp
      JOIN \`permissions\` p ON p.\`id\` = arp.\`permissionId\`
      WHERE p.\`code\` IN (
        'languages.view',
        'languages.manage',
        'translations.view',
        'translations.manage',
        'translations.retry'
      )
    `);
    await queryRunner.query(`
      DELETE FROM \`permissions\`
      WHERE \`code\` IN (
        'languages.view',
        'languages.manage',
        'translations.view',
        'translations.manage',
        'translations.retry'
      )
    `);
  }
}
