import { MigrationInterface, QueryRunner } from 'typeorm';
import { AddInternationalizationLocalization1787520012000 } from './1787520012000-AddInternationalizationLocalization';
import { RepairUserSignupSchema1787520016000 } from './1787520016000-RepairUserSignupSchema';

interface TranslationPair {
  table: string;
  legacyColumn: string;
  localizedColumn: string;
  legacyType: string;
  required: boolean;
}

export class RefreshDeploymentCompatibility1787520017000 implements MigrationInterface {
  name = 'RefreshDeploymentCompatibility1787520017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // These migrations were amended while the development database already had
    // their original versions recorded. Re-run the idempotent user repair and
    // explicitly convert the earlier destructive localization layout into the
    // additive, rollback-compatible layout.
    await new RepairUserSignupSchema1787520016000().up(queryRunner);

    const localization = new AddInternationalizationLocalization1787520012000();
    const localizedTables = ['direct_rfqs', 'market_rfqs', 'subscription_plans'];
    const allLocalizedTablesExist = (
      await Promise.all(localizedTables.map((table) => queryRunner.hasTable(table)))
    ).every(Boolean);

    if (!allLocalizedTablesExist) return;

    for (const table of localizedTables) {
      await this.ensureSourceLanguage(queryRunner, table);
    }

    await this.repairTranslationPair(queryRunner, {
      table: 'direct_rfqs',
      legacyColumn: 'description',
      localizedColumn: 'description_i18n',
      legacyType: 'TEXT',
      required: true,
    });
    await this.repairTranslationPair(queryRunner, {
      table: 'direct_rfqs',
      legacyColumn: 'buyerNotes',
      localizedColumn: 'buyerNotes_i18n',
      legacyType: 'TEXT',
      required: false,
    });
    await this.repairTranslationPair(queryRunner, {
      table: 'market_rfqs',
      legacyColumn: 'buyerNotes',
      localizedColumn: 'buyerNotes_i18n',
      legacyType: 'TEXT',
      required: false,
    });
    await this.repairTranslationPair(queryRunner, {
      table: 'subscription_plans',
      legacyColumn: 'name',
      localizedColumn: 'name_i18n',
      legacyType: 'VARCHAR(120)',
      required: true,
    });
    await this.repairTranslationPair(queryRunner, {
      table: 'subscription_plans',
      legacyColumn: 'description',
      localizedColumn: 'description_i18n',
      legacyType: 'TEXT',
      required: false,
    });

    await localization.removeCompatibilityTriggers(queryRunner);
    await localization.addCompatibilityTriggers(queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: this forward repair restores columns used by the rollback package
    // and must never remove data or compatibility triggers.
  }

  private async ensureSourceLanguage(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    if (!(await queryRunner.hasColumn(table, 'sourceLanguage'))) {
      await queryRunner.query(`
        ALTER TABLE \`${table}\`
        ADD COLUMN \`sourceLanguage\` VARCHAR(20) NOT NULL DEFAULT 'en'
      `);
    }

    await queryRunner.query(`
      UPDATE \`${table}\`
      SET \`sourceLanguage\` = 'en'
      WHERE \`sourceLanguage\` IS NULL OR \`sourceLanguage\` = ''
    `);
  }

  private async repairTranslationPair(
    queryRunner: QueryRunner,
    pair: TranslationPair,
  ): Promise<void> {
    const { table, legacyColumn, localizedColumn, legacyType, required } = pair;
    let legacyDataType = await this.getColumnDataType(queryRunner, table, legacyColumn);
    const hasLocalizedColumn = await queryRunner.hasColumn(table, localizedColumn);

    if (!hasLocalizedColumn) {
      if (legacyDataType === 'json') {
        await queryRunner.query(`
          ALTER TABLE \`${table}\`
          CHANGE COLUMN \`${legacyColumn}\` \`${localizedColumn}\` JSON NULL
        `);
        legacyDataType = null;
      } else {
        await queryRunner.query(`
          ALTER TABLE \`${table}\`
          ADD COLUMN \`${localizedColumn}\` JSON NULL
        `);
      }
    }

    if (!(await queryRunner.hasColumn(table, legacyColumn)) && legacyDataType !== 'json') {
      await queryRunner.query(`
        ALTER TABLE \`${table}\`
        ADD COLUMN \`${legacyColumn}\` ${legacyType} NULL
      `);
    } else if (legacyDataType === 'json') {
      await queryRunner.query(`
        UPDATE \`${table}\`
        SET \`${localizedColumn}\` = COALESCE(\`${localizedColumn}\`, \`${legacyColumn}\`)
      `);
      await queryRunner.query(`
        ALTER TABLE \`${table}\`
        MODIFY COLUMN \`${legacyColumn}\` ${legacyType} NULL
      `);
    }

    const localizedFallback = required
      ? `JSON_OBJECT('en', COALESCE(\`${legacyColumn}\`, ''))`
      : `CASE
          WHEN \`${legacyColumn}\` IS NULL THEN NULL
          ELSE JSON_OBJECT('en', \`${legacyColumn}\`)
        END`;
    const legacyFallback = required ? `, \`${legacyColumn}\`, ''` : `, \`${legacyColumn}\``;

    await queryRunner.query(`
      UPDATE \`${table}\`
      SET
        \`${localizedColumn}\` = COALESCE(\`${localizedColumn}\`, ${localizedFallback}),
        \`${legacyColumn}\` = COALESCE(
          JSON_UNQUOTE(JSON_EXTRACT(
            \`${localizedColumn}\`,
            CONCAT('$."', \`sourceLanguage\`, '"')
          )),
          JSON_UNQUOTE(JSON_EXTRACT(\`${localizedColumn}\`, '$.en'))
          ${legacyFallback}
        )
    `);

    await queryRunner.query(`
      ALTER TABLE \`${table}\`
      MODIFY COLUMN \`${localizedColumn}\` JSON ${required ? 'NOT NULL' : 'NULL'},
      MODIFY COLUMN \`${legacyColumn}\` ${legacyType} ${required ? 'NOT NULL' : 'NULL'}
    `);
  }

  private async getColumnDataType(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<string | null> {
    const rows = (await queryRunner.query(
      `
        SELECT DATA_TYPE AS dataType
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name = ?
        LIMIT 1
      `,
      [table, column],
    )) as Array<{ dataType?: string }>;

    return rows[0]?.dataType?.toLowerCase() ?? null;
  }
}
