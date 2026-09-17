import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessageCenter1787520010000 implements MigrationInterface {
  name = 'AddMessageCenter1787520010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`conversations\` (
        \`id\`                    VARCHAR(36) NOT NULL,
        \`conversationReference\` VARCHAR(40) NOT NULL,
        \`participantPairKey\`    VARCHAR(80) NOT NULL,
        \`status\`                ENUM('active','blocked') NOT NULL DEFAULT 'active',
        \`lastMessageId\`         VARCHAR(36) NULL,
        \`lastMessageAt\`         TIMESTAMP NULL,
        \`initiatedById\`         VARCHAR(36) NULL,
        \`blockedBy\`             VARCHAR(36) NULL,
        \`blockedAt\`             TIMESTAMP NULL,
        \`blockReason\`           TEXT NULL,
        \`createdAt\`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_conversations_reference\` (\`conversationReference\`),
        UNIQUE KEY \`UQ_conversations_participant_pair\` (\`participantPairKey\`),
        INDEX \`IDX_conversations_status_lastMessageAt\` (\`status\`, \`lastMessageAt\`),
        INDEX \`IDX_conversations_initiatedById\` (\`initiatedById\`),
        CONSTRAINT \`FK_conversations_initiatedById\`
          FOREIGN KEY (\`initiatedById\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`conversation_participants\` (
        \`id\`                    VARCHAR(36) NOT NULL,
        \`conversationId\`        VARCHAR(36) NOT NULL,
        \`userId\`                VARCHAR(36) NOT NULL,
        \`lastReadMessageId\`     VARCHAR(36) NULL,
        \`unreadCount\`           INT NOT NULL DEFAULT 0,
        \`joinedAt\`              TIMESTAMP NOT NULL,
        \`leftAt\`                TIMESTAMP NULL,
        \`lastUnreadEmailSentAt\` TIMESTAMP NULL,
        \`createdAt\`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_conversation_participants_conversation_user\` (\`conversationId\`, \`userId\`),
        INDEX \`IDX_conversation_participants_user_unread\` (\`userId\`, \`unreadCount\`),
        INDEX \`IDX_conversation_participants_lastReadMessageId\` (\`lastReadMessageId\`),
        CONSTRAINT \`FK_conversation_participants_conversationId\`
          FOREIGN KEY (\`conversationId\`) REFERENCES \`conversations\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_conversation_participants_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`message_uploads\` (
        \`id\`             VARCHAR(36) NOT NULL,
        \`userId\`         VARCHAR(36) NOT NULL,
        \`fileName\`       VARCHAR(255) NOT NULL,
        \`fileUrl\`        VARCHAR(1000) NOT NULL,
        \`storedName\`     VARCHAR(500) NOT NULL,
        \`attachmentType\` ENUM('image','file') NOT NULL,
        \`mimeType\`       VARCHAR(120) NOT NULL,
        \`fileSize\`       INT NOT NULL,
        \`status\`         ENUM('uploaded','attached','deleted') NOT NULL DEFAULT 'uploaded',
        \`usedAt\`         TIMESTAMP NULL,
        \`expiresAt\`      TIMESTAMP NULL,
        \`createdAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_message_uploads_user_status\` (\`userId\`, \`status\`),
        CONSTRAINT \`FK_message_uploads_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`messages\` (
        \`id\`               VARCHAR(36) NOT NULL,
        \`conversationId\`   VARCHAR(36) NOT NULL,
        \`senderId\`         VARCHAR(36) NOT NULL,
        \`clientMessageId\`  VARCHAR(80) NOT NULL,
        \`messageType\`      ENUM('text','image','file','mixed') NOT NULL,
        \`content\`          TEXT NULL,
        \`replyToMessageId\` VARCHAR(36) NULL,
        \`status\`           ENUM('sent','delivered','read','deleted') NOT NULL DEFAULT 'sent',
        \`sentAt\`           TIMESTAMP NOT NULL,
        \`deliveredAt\`      TIMESTAMP NULL,
        \`readAt\`           TIMESTAMP NULL,
        \`editedAt\`         TIMESTAMP NULL,
        \`deletedAt\`        TIMESTAMP NULL,
        \`createdAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_messages_sender_clientMessageId\` (\`senderId\`, \`clientMessageId\`),
        INDEX \`IDX_messages_conversation_sentAt\` (\`conversationId\`, \`sentAt\`),
        INDEX \`IDX_messages_sender_status\` (\`senderId\`, \`status\`),
        INDEX \`IDX_messages_replyToMessageId\` (\`replyToMessageId\`),
        CONSTRAINT \`FK_messages_conversationId\`
          FOREIGN KEY (\`conversationId\`) REFERENCES \`conversations\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_messages_senderId\`
          FOREIGN KEY (\`senderId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`message_attachments\` (
        \`id\`             VARCHAR(36) NOT NULL,
        \`messageId\`      VARCHAR(36) NOT NULL,
        \`fileName\`       VARCHAR(255) NOT NULL,
        \`fileUrl\`        VARCHAR(1000) NOT NULL,
        \`attachmentType\` ENUM('image','file') NOT NULL,
        \`mimeType\`       VARCHAR(120) NOT NULL,
        \`fileSize\`       INT NOT NULL,
        \`createdAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_message_attachments_messageId\` (\`messageId\`),
        CONSTRAINT \`FK_message_attachments_messageId\`
          FOREIGN KEY (\`messageId\`) REFERENCES \`messages\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`message_reports\` (
        \`id\`             VARCHAR(36) NOT NULL,
        \`messageId\`      VARCHAR(36) NOT NULL,
        \`conversationId\` VARCHAR(36) NOT NULL,
        \`reportedById\`   VARCHAR(36) NOT NULL,
        \`reportedUserId\` VARCHAR(36) NOT NULL,
        \`reason\`         ENUM('spam','abusive_content','fraud_attempt','payment_scam','inappropriate_content','off_platform_solicitation','other') NOT NULL,
        \`details\`        TEXT NULL,
        \`status\`         ENUM('pending','reviewing','resolved','dismissed') NOT NULL DEFAULT 'pending',
        \`action\`         ENUM('no_action','warning_issued','message_hidden','conversation_blocked','user_restricted','escalated') NULL,
        \`notes\`          TEXT NULL,
        \`reviewedById\`   VARCHAR(36) NULL,
        \`reviewedAt\`     TIMESTAMP NULL,
        \`createdAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_message_reports_message_reportedBy\` (\`messageId\`, \`reportedById\`),
        INDEX \`IDX_message_reports_status_reason\` (\`status\`, \`reason\`),
        INDEX \`IDX_message_reports_reported_user\` (\`reportedUserId\`, \`status\`),
        INDEX \`IDX_message_reports_conversationId\` (\`conversationId\`),
        CONSTRAINT \`FK_message_reports_messageId\`
          FOREIGN KEY (\`messageId\`) REFERENCES \`messages\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_message_reports_conversationId\`
          FOREIGN KEY (\`conversationId\`) REFERENCES \`conversations\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_message_reports_reportedById\`
          FOREIGN KEY (\`reportedById\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_message_reports_reportedUserId\`
          FOREIGN KEY (\`reportedUserId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`message_settings\` (
        \`id\`           VARCHAR(36) NOT NULL,
        \`settingKey\`   VARCHAR(120) NOT NULL,
        \`settingValue\` JSON NOT NULL,
        \`updatedBy\`    VARCHAR(36) NULL,
        \`createdAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_message_settings_key\` (\`settingKey\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await this.addEntitlements(queryRunner);
    await this.addPermissions(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE arp FROM \`admin_role_permissions\` arp
      JOIN \`permissions\` p ON p.\`id\` = arp.\`permissionId\`
      WHERE p.\`code\` IN (
        'messages.view',
        'messages.view_reports',
        'messages.moderate',
        'messages.block_conversation',
        'messages.manage_settings'
      )
    `);
    await queryRunner.query(`
      DELETE FROM \`permissions\`
      WHERE \`code\` IN (
        'messages.view',
        'messages.view_reports',
        'messages.moderate',
        'messages.block_conversation',
        'messages.manage_settings'
      )
    `);
    await queryRunner.query(`
      DELETE FROM \`entitlement_definitions\`
      WHERE \`code\` IN (
        'message_center_access',
        'max_new_conversations_per_month',
        'attachment_access'
      )
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS \`message_settings\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`message_reports\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`message_attachments\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`messages\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`message_uploads\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`conversation_participants\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`conversations\``);
  }

  private async addEntitlements(queryRunner: QueryRunner): Promise<void> {
    const entitlements: Array<[string, string, string, string, string, string]> = [
      [
        'message_center_access',
        'Message Center access',
        'Allows access to create and use Message Center conversations.',
        'boolean',
        'true',
        'messages',
      ],
      [
        'max_new_conversations_per_month',
        'Maximum new conversations per month',
        'Maximum new Message Center conversations a user may initiate in a subscription period.',
        'integer',
        'null',
        'messages',
      ],
      [
        'attachment_access',
        'Message attachment access',
        'Allows sending files and images through Message Center.',
        'boolean',
        'true',
        'messages',
      ],
    ];

    for (const entitlement of entitlements) {
      await queryRunner.query(
        `
          INSERT IGNORE INTO \`entitlement_definitions\`
            (\`id\`, \`code\`, \`name\`, \`description\`, \`valueType\`, \`defaultValue\`, \`category\`, \`status\`)
          VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'active')
        `,
        entitlement,
      );
    }
  }

  private async addPermissions(queryRunner: QueryRunner): Promise<void> {
    const permissions: Array<[string, string, string, string]> = [
      [
        'messages.view',
        'View Message Conversations',
        'Allows the Admin to view Message Center conversations.',
        'messages',
      ],
      [
        'messages.view_reports',
        'View Message Reports',
        'Allows the Admin to view reported Message Center content.',
        'messages',
      ],
      [
        'messages.moderate',
        'Moderate Messages',
        'Allows the Admin to review reports and moderate Message Center content.',
        'messages',
      ],
      [
        'messages.block_conversation',
        'Block Message Conversations',
        'Allows the Admin to block or unblock Message Center conversations.',
        'messages',
      ],
      [
        'messages.manage_settings',
        'Manage Message Settings',
        'Allows the Admin to update Message Center limits and attachment rules.',
        'messages',
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
          'messages.view',
          'messages.view_reports',
          'messages.moderate',
          'messages.block_conversation',
          'messages.manage_settings'
        )
      WHERE r.\`name\` = 'Administrator'
    `);

    await queryRunner.query(`
      INSERT IGNORE INTO \`admin_role_permissions\` (\`id\`, \`roleId\`, \`permissionId\`)
      SELECT UUID(), r.\`id\`, p.\`id\`
      FROM \`admin_roles\` r
      JOIN \`permissions\` p
        ON p.\`code\` IN (
          'messages.view',
          'messages.view_reports',
          'messages.moderate',
          'messages.block_conversation'
        )
      WHERE r.\`name\` = 'Support Agent'
    `);
  }
}
