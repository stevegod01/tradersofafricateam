import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisputeManagement1787520015000 implements MigrationInterface {
  name = 'AddDisputeManagement1787520015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`notifications\`
      MODIFY \`category\` ENUM('account','seller','product','rfq','payment','order','logistics','subscription','review','reward','message','dispute','system','marketing') NOT NULL,
      MODIFY \`actionType\` ENUM('none','product','seller','direct_rfq','market_rfq','quote','payment','order','subscription','review','message','dispute','external') NOT NULL DEFAULT 'none'
    `);

    await queryRunner.query(`
      ALTER TABLE \`notification_preferences\`
      MODIFY \`category\` ENUM('account','seller','product','rfq','payment','order','logistics','subscription','review','reward','message','dispute','system','marketing') NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE \`disputes\` (
        \`id\`              VARCHAR(36) NOT NULL,
        \`disputeNumber\`   VARCHAR(40) NOT NULL,
        \`orderId\`         VARCHAR(36) NOT NULL,
        \`sellerOrderId\`   VARCHAR(36) NOT NULL,
        \`raisedBy\`        VARCHAR(36) NOT NULL,
        \`raisedByType\`    ENUM('buyer','seller') NOT NULL,
        \`buyerId\`         VARCHAR(36) NOT NULL,
        \`sellerId\`        VARCHAR(36) NOT NULL,
        \`reason\`          VARCHAR(160) NOT NULL,
        \`description\`     TEXT NOT NULL,
        \`status\`          ENUM('open','under_review','awaiting_buyer','awaiting_seller','resolved','closed') NOT NULL DEFAULT 'open',
        \`resolutionType\`  ENUM('buyer_favour','seller_favour','partial_resolution','mutual_resolution','no_action') NULL,
        \`resolutionNotes\` TEXT NULL,
        \`financialAction\` JSON NULL,
        \`assignedAdminId\` VARCHAR(36) NULL,
        \`resolvedBy\`      VARCHAR(36) NULL,
        \`resolvedAt\`      TIMESTAMP NULL,
        \`closedAt\`        TIMESTAMP NULL,
        \`createdAt\`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_disputes_disputeNumber\` (\`disputeNumber\`),
        INDEX \`IDX_disputes_order_status\` (\`orderId\`, \`status\`),
        INDEX \`IDX_disputes_seller_order_status\` (\`sellerOrderId\`, \`status\`),
        INDEX \`IDX_disputes_buyer_status\` (\`buyerId\`, \`status\`),
        INDEX \`IDX_disputes_seller_status\` (\`sellerId\`, \`status\`),
        INDEX \`IDX_disputes_assigned_admin_status\` (\`assignedAdminId\`, \`status\`),
        CONSTRAINT \`FK_disputes_orderId\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`orders\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_disputes_raisedBy\`
          FOREIGN KEY (\`raisedBy\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_disputes_buyerId\`
          FOREIGN KEY (\`buyerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_disputes_sellerId\`
          FOREIGN KEY (\`sellerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`dispute_items\` (
        \`id\`               VARCHAR(36) NOT NULL,
        \`disputeId\`        VARCHAR(36) NOT NULL,
        \`orderItemId\`      VARCHAR(36) NOT NULL,
        \`quantityAffected\` DECIMAL(18,3) NOT NULL,
        \`createdAt\`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_dispute_items_dispute_order_item\` (\`disputeId\`, \`orderItemId\`),
        INDEX \`IDX_dispute_items_order_item\` (\`orderItemId\`),
        CONSTRAINT \`FK_dispute_items_disputeId\`
          FOREIGN KEY (\`disputeId\`) REFERENCES \`disputes\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_dispute_items_orderItemId\`
          FOREIGN KEY (\`orderItemId\`) REFERENCES \`order_items\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`dispute_evidence_uploads\` (
        \`id\`         VARCHAR(36) NOT NULL,
        \`userId\`     VARCHAR(36) NOT NULL,
        \`fileName\`   VARCHAR(255) NOT NULL,
        \`fileUrl\`    VARCHAR(1000) NOT NULL,
        \`storedName\` VARCHAR(500) NOT NULL,
        \`fileType\`   VARCHAR(120) NOT NULL,
        \`fileSize\`   INT NOT NULL,
        \`status\`     ENUM('uploaded','attached','deleted') NOT NULL DEFAULT 'uploaded',
        \`usedAt\`     TIMESTAMP NULL,
        \`expiresAt\`  TIMESTAMP NULL,
        \`createdAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_dispute_evidence_uploads_user_status\` (\`userId\`, \`status\`),
        CONSTRAINT \`FK_dispute_evidence_uploads_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`dispute_evidence\` (
        \`id\`          VARCHAR(36) NOT NULL,
        \`disputeId\`   VARCHAR(36) NOT NULL,
        \`uploadedBy\`  VARCHAR(36) NOT NULL,
        \`fileType\`    VARCHAR(120) NOT NULL,
        \`fileUrl\`     VARCHAR(1000) NOT NULL,
        \`fileName\`    VARCHAR(255) NOT NULL,
        \`storedName\`  VARCHAR(500) NULL,
        \`uploadId\`    VARCHAR(36) NULL,
        \`description\` VARCHAR(500) NULL,
        \`createdAt\`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_dispute_evidence_dispute_created\` (\`disputeId\`, \`createdAt\`),
        INDEX \`IDX_dispute_evidence_uploaded_by\` (\`uploadedBy\`),
        CONSTRAINT \`FK_dispute_evidence_disputeId\`
          FOREIGN KEY (\`disputeId\`) REFERENCES \`disputes\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_dispute_evidence_uploadedBy\`
          FOREIGN KEY (\`uploadedBy\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`dispute_messages\` (
        \`id\`          VARCHAR(36) NOT NULL,
        \`disputeId\`   VARCHAR(36) NOT NULL,
        \`senderId\`    VARCHAR(36) NOT NULL,
        \`senderType\`  ENUM('buyer','seller','admin') NOT NULL,
        \`message\`     TEXT NOT NULL,
        \`attachments\` JSON NULL,
        \`createdAt\`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_dispute_messages_dispute_created\` (\`disputeId\`, \`createdAt\`),
        CONSTRAINT \`FK_dispute_messages_disputeId\`
          FOREIGN KEY (\`disputeId\`) REFERENCES \`disputes\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`dispute_audit_events\` (
        \`id\`            VARCHAR(36) NOT NULL,
        \`disputeId\`     VARCHAR(36) NOT NULL,
        \`actorId\`       VARCHAR(36) NULL,
        \`actorType\`     ENUM('buyer','seller','admin','system') NOT NULL,
        \`action\`        VARCHAR(120) NOT NULL,
        \`previousValue\` JSON NULL,
        \`newValue\`      JSON NULL,
        \`metadata\`      JSON NULL,
        \`createdAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_dispute_audit_events_dispute_created\` (\`disputeId\`, \`createdAt\`),
        INDEX \`IDX_dispute_audit_events_action\` (\`action\`),
        CONSTRAINT \`FK_dispute_audit_events_disputeId\`
          FOREIGN KEY (\`disputeId\`) REFERENCES \`disputes\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await this.addPermissions(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM \`notifications\`
      WHERE \`category\` = 'dispute' OR \`actionType\` = 'dispute'
    `);
    await queryRunner.query(`
      DELETE FROM \`notification_preferences\`
      WHERE \`category\` = 'dispute'
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS \`dispute_audit_events\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`dispute_messages\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`dispute_evidence\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`dispute_items\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`dispute_evidence_uploads\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`disputes\``);

    await queryRunner.query(`
      DELETE arp FROM \`admin_role_permissions\` arp
      JOIN \`permissions\` p ON p.\`id\` = arp.\`permissionId\`
      WHERE p.\`code\` IN (
        'disputes.view',
        'disputes.assign',
        'disputes.manage',
        'disputes.request_information',
        'disputes.resolve',
        'disputes.close'
      )
    `);
    await queryRunner.query(`
      DELETE FROM \`permissions\`
      WHERE \`code\` IN (
        'disputes.view',
        'disputes.assign',
        'disputes.manage',
        'disputes.request_information',
        'disputes.resolve',
        'disputes.close'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE \`notification_preferences\`
      MODIFY \`category\` ENUM('account','seller','product','rfq','payment','order','logistics','subscription','review','reward','message','system','marketing') NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`notifications\`
      MODIFY \`category\` ENUM('account','seller','product','rfq','payment','order','logistics','subscription','review','reward','message','system','marketing') NOT NULL,
      MODIFY \`actionType\` ENUM('none','product','seller','direct_rfq','market_rfq','quote','payment','order','subscription','review','message','external') NOT NULL DEFAULT 'none'
    `);
  }

  private async addPermissions(queryRunner: QueryRunner): Promise<void> {
    const permissions: Array<[string, string, string, string]> = [
      [
        'disputes.view',
        'View Disputes',
        'Allows the Admin to view marketplace disputes.',
        'disputes',
      ],
      [
        'disputes.assign',
        'Assign Disputes',
        'Allows the Admin to assign marketplace disputes.',
        'disputes',
      ],
      [
        'disputes.manage',
        'Manage Disputes',
        'Allows the Admin to manage marketplace disputes.',
        'disputes',
      ],
      [
        'disputes.request_information',
        'Request Dispute Information',
        'Allows the Admin to request dispute information.',
        'disputes',
      ],
      [
        'disputes.resolve',
        'Resolve Disputes',
        'Allows the Admin to resolve marketplace disputes.',
        'disputes',
      ],
      [
        'disputes.close',
        'Close Disputes',
        'Allows the Admin to close marketplace disputes.',
        'disputes',
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
          'disputes.view',
          'disputes.assign',
          'disputes.manage',
          'disputes.request_information',
          'disputes.resolve',
          'disputes.close'
        )
      WHERE r.\`name\` = 'Administrator'
    `);

    await queryRunner.query(`
      INSERT IGNORE INTO \`admin_role_permissions\` (\`id\`, \`roleId\`, \`permissionId\`)
      SELECT UUID(), r.\`id\`, p.\`id\`
      FROM \`admin_roles\` r
      JOIN \`permissions\` p
        ON p.\`code\` IN ('disputes.view', 'disputes.request_information')
      WHERE r.\`name\` = 'Support Agent'
    `);
  }
}
