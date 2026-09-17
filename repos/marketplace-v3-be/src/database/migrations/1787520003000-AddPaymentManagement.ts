import { MigrationInterface, QueryRunner } from 'typeorm';
import { PAYMENT_PROVIDER_DEFINITIONS } from '../../modules/payment/payment.providers';

export class AddPaymentManagement1787520003000 implements MigrationInterface {
  name = 'AddPaymentManagement1787520003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`payment_providers\` (
        \`id\`                       VARCHAR(36) NOT NULL,
        \`code\`                     VARCHAR(80) NOT NULL,
        \`name\`                     VARCHAR(120) NOT NULL,
        \`type\`                     ENUM('gateway','manual','bank_rail') NOT NULL,
        \`supportedCurrencies\`      JSON NOT NULL,
        \`supportedCountries\`       JSON NULL,
        \`supportedSourceTypes\`     JSON NULL,
        \`supportedPurposes\`        JSON NULL,
        \`minAmount\`                DECIMAL(18,2) NULL,
        \`maxAmount\`                DECIMAL(18,2) NULL,
        \`requiresProof\`            TINYINT(1) NOT NULL DEFAULT 0,
        \`supportsAutoVerification\` TINYINT(1) NOT NULL DEFAULT 0,
        \`status\`                   ENUM('active','inactive') NOT NULL DEFAULT 'active',
        \`sortOrder\`                INT NOT NULL DEFAULT 0,
        \`createdAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_payment_providers_code\` (\`code\`),
        INDEX \`IDX_payment_providers_status\` (\`status\`),
        INDEX \`IDX_payment_providers_sortOrder\` (\`sortOrder\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`payment_accounts\` (
        \`id\`            VARCHAR(36) NOT NULL,
        \`paymentMethod\` VARCHAR(80) NOT NULL,
        \`currency\`      VARCHAR(3) NOT NULL,
        \`bankName\`      VARCHAR(160) NOT NULL,
        \`accountName\`   VARCHAR(160) NOT NULL,
        \`accountNumber\` VARCHAR(80) NOT NULL,
        \`swiftCode\`     VARCHAR(80) NULL,
        \`iban\`          VARCHAR(80) NULL,
        \`bankAddress\`   VARCHAR(500) NULL,
        \`country\`       VARCHAR(100) NOT NULL,
        \`status\`        ENUM('active','inactive') NOT NULL DEFAULT 'active',
        \`createdAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_payment_accounts_method_currency\` (\`paymentMethod\`, \`currency\`),
        INDEX \`IDX_payment_accounts_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`payments\` (
        \`id\`                        VARCHAR(36) NOT NULL,
        \`paymentReference\`          VARCHAR(40) NOT NULL,
        \`payerId\`                   VARCHAR(36) NOT NULL,
        \`sourceType\`                VARCHAR(80) NOT NULL,
        \`sourceId\`                  VARCHAR(80) NOT NULL,
        \`purpose\`                   VARCHAR(80) NOT NULL,
        \`description\`               VARCHAR(255) NOT NULL,
        \`amount\`                    DECIMAL(18,2) NOT NULL,
        \`currency\`                  VARCHAR(3) NOT NULL,
        \`paymentMethod\`             VARCHAR(80) NOT NULL,
        \`providerId\`                VARCHAR(36) NULL,
        \`providerReference\`         VARCHAR(160) NULL,
        \`status\`                    ENUM('pending','awaiting_payment','processing','proof_uploaded','under_review','confirmed','failed','rejected','expired','cancelled') NOT NULL DEFAULT 'pending',
        \`paymentProofUrl\`           VARCHAR(500) NULL,
        \`payerTransactionReference\` VARCHAR(160) NULL,
        \`payerNotes\`                TEXT NULL,
        \`adminNotes\`                TEXT NULL,
        \`failureReason\`             TEXT NULL,
        \`rejectionReason\`           TEXT NULL,
        \`canResubmitProof\`          TINYINT(1) NOT NULL DEFAULT 1,
        \`expiresAt\`                 TIMESTAMP NULL,
        \`proofUploadedAt\`           TIMESTAMP NULL,
        \`verifiedAt\`                TIMESTAMP NULL,
        \`verifiedBy\`                VARCHAR(36) NULL,
        \`paidAt\`                    TIMESTAMP NULL,
        \`metadata\`                  JSON NULL,
        \`createdAt\`                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_payments_paymentReference\` (\`paymentReference\`),
        INDEX \`IDX_payments_payerId\` (\`payerId\`),
        INDEX \`IDX_payments_source\` (\`sourceType\`, \`sourceId\`),
        INDEX \`IDX_payments_providerReference\` (\`providerReference\`),
        INDEX \`IDX_payments_status\` (\`status\`),
        INDEX \`IDX_payments_createdAt\` (\`createdAt\`),
        CONSTRAINT \`FK_payments_payerId\`
          FOREIGN KEY (\`payerId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`payment_attempts\` (
        \`id\`                VARCHAR(36) NOT NULL,
        \`paymentId\`         VARCHAR(36) NOT NULL,
        \`providerId\`        VARCHAR(36) NULL,
        \`paymentMethod\`     VARCHAR(80) NOT NULL,
        \`providerReference\` VARCHAR(160) NULL,
        \`status\`            VARCHAR(80) NOT NULL,
        \`failureReason\`     TEXT NULL,
        \`initiatedAt\`       TIMESTAMP NOT NULL,
        \`completedAt\`       TIMESTAMP NULL,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_payment_attempts_paymentId\` (\`paymentId\`),
        INDEX \`IDX_payment_attempts_providerReference\` (\`providerReference\`),
        CONSTRAINT \`FK_payment_attempts_paymentId\`
          FOREIGN KEY (\`paymentId\`) REFERENCES \`payments\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`payment_audit_logs\` (
        \`id\`             VARCHAR(36) NOT NULL,
        \`action\`         VARCHAR(120) NOT NULL,
        \`paymentId\`      VARCHAR(36) NOT NULL,
        \`sourceType\`     VARCHAR(80) NOT NULL,
        \`sourceId\`       VARCHAR(80) NOT NULL,
        \`payerId\`        VARCHAR(36) NULL,
        \`adminId\`        VARCHAR(36) NULL,
        \`idempotencyKey\` VARCHAR(160) NULL,
        \`metadata\`       JSON NULL,
        \`createdAt\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_payment_audit_logs_payment_action\` (\`paymentId\`, \`action\`),
        INDEX \`IDX_payment_audit_logs_adminId\` (\`adminId\`),
        INDEX \`IDX_payment_audit_logs_createdAt\` (\`createdAt\`),
        UNIQUE KEY \`UQ_payment_audit_logs_idempotencyKey\` (\`idempotencyKey\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE \`letter_of_credit_details\` (
        \`id\`           VARCHAR(36) NOT NULL,
        \`paymentId\`    VARCHAR(36) NOT NULL,
        \`issuingBank\`  VARCHAR(160) NOT NULL,
        \`advisingBank\` VARCHAR(160) NULL,
        \`lcReference\`  VARCHAR(160) NOT NULL,
        \`lcType\`       VARCHAR(80) NOT NULL,
        \`issueDate\`    DATE NOT NULL,
        \`expiryDate\`   DATE NOT NULL,
        \`documentUrl\`  VARCHAR(500) NOT NULL,
        \`status\`       VARCHAR(80) NOT NULL,
        \`reviewNotes\`  TEXT NULL,
        \`updatedAt\`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_letter_of_credit_details_paymentId\` (\`paymentId\`),
        CONSTRAINT \`FK_letter_of_credit_details_paymentId\`
          FOREIGN KEY (\`paymentId\`) REFERENCES \`payments\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    for (const provider of PAYMENT_PROVIDER_DEFINITIONS) {
      await queryRunner.query(
        `
          INSERT IGNORE INTO \`payment_providers\`
            (
              \`id\`,
              \`code\`,
              \`name\`,
              \`type\`,
              \`supportedCurrencies\`,
              \`supportedCountries\`,
              \`supportedSourceTypes\`,
              \`supportedPurposes\`,
              \`minAmount\`,
              \`maxAmount\`,
              \`requiresProof\`,
              \`supportsAutoVerification\`,
              \`status\`,
              \`sortOrder\`
            )
          VALUES (
            UUID(),
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'active',
            ?
          )
        `,
        [
          provider.code,
          provider.name,
          provider.type,
          JSON.stringify(provider.supportedCurrencies),
          provider.supportedCountries
            ? JSON.stringify(provider.supportedCountries)
            : null,
          provider.supportedSourceTypes
            ? JSON.stringify(provider.supportedSourceTypes)
            : null,
          provider.supportedPurposes
            ? JSON.stringify(provider.supportedPurposes)
            : null,
          provider.minAmount,
          provider.maxAmount,
          provider.requiresProof,
          provider.supportsAutoVerification,
          provider.sortOrder,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`letter_of_credit_details\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`payment_audit_logs\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`payment_attempts\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`payments\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`payment_accounts\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`payment_providers\``);
  }
}
