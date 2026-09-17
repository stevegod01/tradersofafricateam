import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1710000000000 implements MigrationInterface {
  name = 'InitialSchema1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── users ──────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE \`users\` (
        \`id\`                       VARCHAR(36)   NOT NULL,
        \`firstName\`                VARCHAR(100)  NOT NULL,
        \`lastName\`                 VARCHAR(100)  NOT NULL,
        \`email\`                    VARCHAR(255)  NOT NULL,
        \`password\`                 VARCHAR(255)  NOT NULL,
        \`phone\`                    VARCHAR(20)   NULL,
        \`userType\`                 ENUM('buyer','seller','admin') NOT NULL DEFAULT 'buyer',
        \`status\`                   ENUM('active','suspended','banned') NOT NULL DEFAULT 'active',
        \`isEmailVerified\`          TINYINT(1)    NOT NULL DEFAULT 0,
        \`isCompanyVerified\`        TINYINT(1)    NOT NULL DEFAULT 0,

        -- seller fields (populated on upgrade)
        \`storeName\`                VARCHAR(255)  NULL,
        \`companyName\`              VARCHAR(255)  NULL,
        \`registrationNumber\`       VARCHAR(100)  NULL,
        \`businessType\`             VARCHAR(100)  NULL,
        \`yearsOfBusiness\`          INT           NULL,
        \`companyAddress\`           VARCHAR(500)  NULL,
        \`pickupAddress\`            VARCHAR(500)  NULL,
        \`country\`                  VARCHAR(100)  NULL,
        \`companyLogo\`              VARCHAR(500)  NULL,
        \`companyBio\`               TEXT          NULL,

        -- security fields
        \`emailVerificationToken\`   VARCHAR(255)  NULL,
        \`emailVerificationExpiry\`  TIMESTAMP     NULL,
        \`passwordResetToken\`       VARCHAR(255)  NULL,
        \`passwordResetExpiry\`      TIMESTAMP     NULL,
        \`failedLoginAttempts\`      INT           NOT NULL DEFAULT 0,
        \`lockedUntil\`              TIMESTAMP     NULL,

        \`createdAt\`                TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`                TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_users_email\` (\`email\`),
        INDEX \`IDX_users_userType\` (\`userType\`),
        INDEX \`IDX_users_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ── company_verifications ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE \`company_verifications\` (
        \`id\`                   VARCHAR(36)   NOT NULL,
        \`userId\`               VARCHAR(36)   NOT NULL,
        \`companyName\`          VARCHAR(255)  NOT NULL,
        \`registrationNumber\`   VARCHAR(100)  NULL,
        \`businessType\`         VARCHAR(100)  NULL,
        \`yearsOfBusiness\`      INT           NULL,
        \`companyAddress\`       VARCHAR(500)  NULL,
        \`pickupAddress\`        VARCHAR(500)  NULL,
        \`country\`              VARCHAR(100)  NULL,
        \`companyLogo\`          VARCHAR(500)  NULL,
        \`companyBio\`           TEXT          NULL,
        \`verificationStatus\`   ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        \`rejectionReason\`      TEXT          NULL,
        \`adminNotes\`           TEXT          NULL,
        \`submittedAt\`          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`reviewedAt\`           TIMESTAMP     NULL,
        \`reviewedBy\`           VARCHAR(36)   NULL,
        \`updatedAt\`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_cv_userId\` (\`userId\`),
        INDEX \`IDX_cv_status\` (\`verificationStatus\`),
        CONSTRAINT \`FK_cv_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_cv_reviewedBy\`
          FOREIGN KEY (\`reviewedBy\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ── refresh_tokens ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE \`refresh_tokens\` (
        \`id\`          VARCHAR(36)   NOT NULL,
        \`userId\`      VARCHAR(36)   NOT NULL,
        \`tokenHash\`   VARCHAR(500)  NOT NULL,
        \`userAgent\`   VARCHAR(255)  NULL,
        \`ipAddress\`   VARCHAR(45)   NULL,
        \`isRevoked\`   TINYINT(1)    NOT NULL DEFAULT 0,
        \`expiresAt\`   TIMESTAMP     NOT NULL,
        \`createdAt\`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_rt_tokenHash\` (\`tokenHash\`(100)),
        INDEX \`IDX_rt_userId\` (\`userId\`),
        CONSTRAINT \`FK_rt_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`refresh_tokens\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`company_verifications\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`users\``);
  }
}
