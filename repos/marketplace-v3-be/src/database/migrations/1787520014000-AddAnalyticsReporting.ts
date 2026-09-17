import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnalyticsReporting1787520014000 implements MigrationInterface {
  name = 'AddAnalyticsReporting1787520014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`analytics_events\` (
        \`id\`            VARCHAR(36) NOT NULL,
        \`sourceModule\`  VARCHAR(80) NOT NULL,
        \`eventName\`     VARCHAR(120) NOT NULL,
        \`sourceEventId\` VARCHAR(120) NOT NULL,
        \`entityType\`    VARCHAR(80) NULL,
        \`entityId\`      VARCHAR(80) NULL,
        \`actorId\`       VARCHAR(36) NULL,
        \`payload\`       JSON NULL,
        \`createdAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_analytics_events_source_event\` (\`sourceModule\`, \`eventName\`, \`sourceEventId\`),
        INDEX \`IDX_analytics_events_entity_created\` (\`entityType\`, \`entityId\`, \`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`analytics_reports\` (
        \`id\`              VARCHAR(36) NOT NULL,
        \`requestedBy\`     VARCHAR(36) NOT NULL,
        \`requestedByType\` VARCHAR(20) NOT NULL DEFAULT 'user',
        \`reportType\`      VARCHAR(80) NOT NULL,
        \`format\`          ENUM('csv','xlsx','pdf') NOT NULL,
        \`filters\`         JSON NOT NULL,
        \`status\`          ENUM('processing','completed','failed','expired') NOT NULL DEFAULT 'processing',
        \`fileUrl\`         VARCHAR(500) NULL,
        \`expiresAt\`       TIMESTAMP NULL,
        \`errorMessage\`    TEXT NULL,
        \`createdAt\`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`completedAt\`     TIMESTAMP NULL,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_analytics_reports_requestedBy_created\` (\`requestedBy\`, \`createdAt\`),
        INDEX \`IDX_analytics_reports_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`analytics_rebuild_jobs\` (
        \`id\`                 VARCHAR(36) NOT NULL,
        \`entityType\`         VARCHAR(80) NOT NULL,
        \`entityId\`           VARCHAR(36) NULL,
        \`dateFrom\`           DATE NULL,
        \`dateTo\`             DATE NULL,
        \`requestedByAdminId\` VARCHAR(36) NOT NULL,
        \`status\`             ENUM('processing','completed','failed') NOT NULL DEFAULT 'processing',
        \`errorMessage\`       TEXT NULL,
        \`metadata\`           JSON NULL,
        \`createdAt\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`completedAt\`        TIMESTAMP NULL,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_analytics_rebuild_jobs_status_created\` (\`status\`, \`createdAt\`),
        INDEX \`IDX_analytics_rebuild_jobs_requestedByAdminId\` (\`requestedByAdminId\`),
        CONSTRAINT \`FK_analytics_rebuild_jobs_requestedByAdminId\`
          FOREIGN KEY (\`requestedByAdminId\`) REFERENCES \`admins\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`analytics_rebuild_jobs\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`analytics_reports\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`analytics_events\``);
  }
}
