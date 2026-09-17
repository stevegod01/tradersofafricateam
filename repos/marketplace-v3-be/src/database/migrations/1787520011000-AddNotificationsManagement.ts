import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationsManagement1787520011000 implements MigrationInterface {
  name = 'AddNotificationsManagement1787520011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`notifications\` (
        \`id\`               VARCHAR(36) NOT NULL,
        \`userId\`           VARCHAR(36) NOT NULL,
        \`type\`             VARCHAR(120) NOT NULL,
        \`category\`         ENUM('account','seller','product','rfq','payment','order','logistics','subscription','review','reward','message','system','marketing') NOT NULL,
        \`title\`            VARCHAR(255) NOT NULL,
        \`message\`          TEXT NOT NULL,
        \`actionType\`       ENUM('none','product','seller','direct_rfq','market_rfq','quote','payment','order','subscription','review','message','external') NOT NULL DEFAULT 'none',
        \`actionId\`         VARCHAR(120) NULL,
        \`actionUrl\`        VARCHAR(500) NULL,
        \`imageUrl\`         VARCHAR(1000) NULL,
        \`eventId\`          VARCHAR(160) NULL,
        \`deduplicationKey\` VARCHAR(220) NULL,
        \`isRead\`           TINYINT(1) NOT NULL DEFAULT 0,
        \`readAt\`           TIMESTAMP NULL,
        \`deletedAt\`        TIMESTAMP NULL,
        \`createdAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_notifications_user_deduplication\` (\`userId\`, \`deduplicationKey\`),
        INDEX \`IDX_notifications_user_read_deleted\` (\`userId\`, \`isRead\`, \`deletedAt\`),
        INDEX \`IDX_notifications_user_category_created\` (\`userId\`, \`category\`, \`createdAt\`),
        CONSTRAINT \`FK_notifications_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`notification_preferences\` (
        \`id\`           VARCHAR(36) NOT NULL,
        \`userId\`       VARCHAR(36) NOT NULL,
        \`category\`     ENUM('account','seller','product','rfq','payment','order','logistics','subscription','review','reward','message','system','marketing') NOT NULL,
        \`inAppEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
        \`emailEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
        \`isMandatory\`  TINYINT(1) NOT NULL DEFAULT 0,
        \`createdAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_notification_preferences_user_category\` (\`userId\`, \`category\`),
        CONSTRAINT \`FK_notification_preferences_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`system_announcements\` (
        \`id\`               VARCHAR(36) NOT NULL,
        \`title\`            JSON NOT NULL,
        \`message\`          JSON NOT NULL,
        \`audience\`         ENUM('all','buyers','sellers','admins','specific_users') NOT NULL,
        \`recipientUserIds\` JSON NULL,
        \`actionUrl\`        VARCHAR(500) NULL,
        \`sendInApp\`        TINYINT(1) NOT NULL DEFAULT 1,
        \`sendEmail\`        TINYINT(1) NOT NULL DEFAULT 0,
        \`status\`           ENUM('draft','scheduled','sent','cancelled') NOT NULL DEFAULT 'draft',
        \`scheduledAt\`      TIMESTAMP NULL,
        \`sentAt\`           TIMESTAMP NULL,
        \`createdBy\`        VARCHAR(36) NOT NULL,
        \`createdAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_system_announcements_status_audience\` (\`status\`, \`audience\`),
        INDEX \`IDX_system_announcements_scheduledAt\` (\`scheduledAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await this.addPermissions(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE arp FROM \`admin_role_permissions\` arp
      JOIN \`permissions\` p ON p.\`id\` = arp.\`permissionId\`
      WHERE p.\`code\` IN (
        'notifications.view',
        'notifications.manage_announcements',
        'notifications.view_stats',
        'notifications.manage_settings'
      )
    `);
    await queryRunner.query(`
      DELETE FROM \`permissions\`
      WHERE \`code\` IN (
        'notifications.view',
        'notifications.manage_announcements',
        'notifications.view_stats',
        'notifications.manage_settings'
      )
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS \`system_announcements\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`notification_preferences\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`notifications\``);
  }

  private async addPermissions(queryRunner: QueryRunner): Promise<void> {
    const permissions: Array<[string, string, string, string]> = [
      [
        'notifications.view',
        'View Notifications',
        'Allows the Admin to view notification history and announcements.',
        'notifications',
      ],
      [
        'notifications.manage_announcements',
        'Manage Notification Announcements',
        'Allows the Admin to create and cancel system announcements.',
        'notifications',
      ],
      [
        'notifications.view_stats',
        'View Notification Statistics',
        'Allows the Admin to view notification delivery and read statistics.',
        'notifications',
      ],
      [
        'notifications.manage_settings',
        'Manage Notification Settings',
        'Allows the Admin to manage notification defaults and retention settings.',
        'notifications',
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
          'notifications.view',
          'notifications.manage_announcements',
          'notifications.view_stats',
          'notifications.manage_settings'
        )
      WHERE r.\`name\` = 'Administrator'
    `);

    await queryRunner.query(`
      INSERT IGNORE INTO \`admin_role_permissions\` (\`id\`, \`roleId\`, \`permissionId\`)
      SELECT UUID(), r.\`id\`, p.\`id\`
      FROM \`admin_roles\` r
      JOIN \`permissions\` p
        ON p.\`code\` IN ('notifications.view', 'notifications.view_stats')
      WHERE r.\`name\` = 'Support Agent'
    `);
  }
}
