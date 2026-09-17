import { MigrationInterface, QueryRunner } from 'typeorm';
const rewardPermissions = ['referrals.view', 'referrals.manage', 'referrals.analytics.view', 'rewards.view', 'rewards.adjust', 'rewards.rules.view', 'rewards.rules.manage'];
export class AddReferralRewards1787520020000 implements MigrationInterface {
    name = 'AddReferralRewards1787520020000';
    async up(q: QueryRunner): Promise<void> {
        // MySQL DDL commits implicitly: validate legacy balances before any schema mutation.
        const mismatch = await q.query('SELECT u.id FROM users u LEFT JOIN points_transactions p ON p.userId=u.id GROUP BY u.id,u.totalPoints HAVING u.totalPoints <> COALESCE(SUM(p.points),0) LIMIT 1');
        if (mismatch.length)
            throw new Error('Reward migration requires reconciliation of existing totalPoints with points_transactions before deployment');
        await q.query(`CREATE TABLE referrals (
   id VARCHAR(36) PRIMARY KEY, referrerId VARCHAR(36) NOT NULL, referredUserId VARCHAR(36) NOT NULL,
   referralCode VARCHAR(50) NOT NULL, status ENUM('pending','qualified','rewarded','invalid') NOT NULL DEFAULT 'pending',
   qualifiedAt TIMESTAMP NULL, rewardedAt TIMESTAMP NULL, createdAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updatedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
   UNIQUE KEY UQ_referrals_referred (referredUserId), KEY IDX_referrals_owner_status (referrerId,status),
   CONSTRAINT FK_referrals_referrer FOREIGN KEY(referrerId) REFERENCES users(id) ON DELETE RESTRICT,
   CONSTRAINT FK_referrals_referred FOREIGN KEY(referredUserId) REFERENCES users(id) ON DELETE RESTRICT,
   CONSTRAINT CHK_referrals_not_self CHECK(referrerId <> referredUserId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await q.query(`CREATE TABLE reward_rules (
   id VARCHAR(36) PRIMARY KEY,eventCode VARCHAR(80) NOT NULL UNIQUE,name VARCHAR(150) NOT NULL,description TEXT NULL,
   points INT NOT NULL,status ENUM('active','inactive') NOT NULL DEFAULT 'active',maxPerUser INT NULL,maxPerPeriod INT NULL,
   periodType ENUM('day','week','month','lifetime') NULL,createdBy VARCHAR(36) NULL,
   createdAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),updatedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
   CONSTRAINT CHK_reward_rule_points CHECK(points >= 0),CONSTRAINT CHK_reward_rule_caps CHECK((maxPerUser IS NULL OR maxPerUser>0) AND (maxPerPeriod IS NULL OR (maxPerPeriod>0 AND periodType IS NOT NULL)))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await q.query('RENAME TABLE points_transactions TO reward_transactions');
        await q.query(`ALTER TABLE reward_transactions MODIFY sourceType ENUM('product_review','seller_review','admin_adjustment','referral','order') NOT NULL,
   ADD eventCode VARCHAR(80) NULL,ADD transactionType VARCHAR(6) NULL,ADD balanceBefore INT NULL,ADD idempotencyKey VARCHAR(191) NULL,ADD createdBy VARCHAR(36) NULL,ADD orderId VARCHAR(36) NULL`);
        await q.query(`UPDATE reward_transactions SET eventCode=CASE WHEN rewardType='review_submission' THEN 'REVIEW_SUBMITTED' WHEN rewardType='review_reversal' THEN 'REVIEW_REWARD_REVERSED' ELSE 'ADMIN_REWARD_ADJUSTMENT' END,transactionType=IF(points>0,'credit','debit'),balanceBefore=balanceAfter-points`);
        await q.query(`UPDATE reward_transactions SET idempotencyKey=CONCAT(eventCode,':',sourceId,':',userId)`);
        await q.query(`ALTER TABLE reward_transactions MODIFY eventCode VARCHAR(80) NOT NULL,MODIFY transactionType VARCHAR(6) NOT NULL,MODIFY balanceBefore INT NOT NULL,MODIFY idempotencyKey VARCHAR(191) NOT NULL,ADD UNIQUE KEY UQ_reward_idempotency(idempotencyKey),ADD KEY IDX_reward_user_event(userId,eventCode,createdAt)`);
        await q.query(`UPDATE reward_transactions t JOIN product_reviews r ON t.sourceType='product_review' AND t.sourceId=r.id SET t.orderId=r.orderId`);
        await q.query(`UPDATE reward_transactions t JOIN seller_reviews r ON t.sourceType='seller_review' AND t.sourceId=r.id SET t.orderId=r.orderId`);
        await q.query('ALTER TABLE reward_transactions ADD KEY IDX_reward_order(userId,orderId,eventCode)');
        await q.query(`CREATE TRIGGER reward_transactions_no_update BEFORE UPDATE ON reward_transactions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Reward transactions are append-only'`);
        await q.query(`CREATE TRIGGER reward_transactions_no_delete BEFORE DELETE ON reward_transactions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Reward transactions are append-only'`);
        // Retain history even if account deletion code attempts a hard delete.
        const fks = await q.query(`SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reward_transactions' AND REFERENCED_TABLE_NAME='users'`);
        for (const fk of fks)
            await q.query('ALTER TABLE reward_transactions DROP FOREIGN KEY `' + String(fk.CONSTRAINT_NAME).replace(/`/g, '``') + '`');
        await q.query('ALTER TABLE reward_transactions ADD CONSTRAINT FK_reward_user FOREIGN KEY(userId) REFERENCES users(id) ON DELETE RESTRICT');
        await q.query(`CREATE TABLE reward_notification_outbox (transactionId VARCHAR(36) PRIMARY KEY,createdAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),deliveredAt TIMESTAMP NULL,KEY IDX_reward_outbox_delivery(deliveredAt,createdAt),CONSTRAINT FK_reward_outbox_transaction FOREIGN KEY(transactionId) REFERENCES reward_transactions(id) ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await q.query(`UPDATE users SET referralCode=UPPER(HEX(RANDOM_BYTES(8))) WHERE referralCode IS NULL OR TRIM(referralCode)=''`);
        await q.query(`INSERT INTO referrals (id,referrerId,referredUserId,referralCode,status,createdAt) SELECT UUID(),r.id,u.id,r.referralCode,'pending',u.createdAt FROM users u JOIN users r ON UPPER(TRIM(u.referral))=UPPER(r.referralCode) WHERE u.id<>r.id`);
        await q.query(`INSERT INTO reward_rules (id,eventCode,name,points,status) VALUES (UUID(),'REVIEW_SUBMITTED','Eligible review',10,'active'),(UUID(),'SUCCESSFUL_TRADE','Successful trade',20,'inactive'),(UUID(),'REFERRAL_QUALIFIED','Qualified referral',30,'active')`);
        // Keep the existing configured review base when moving ownership to reward rules.
        await q.query(`UPDATE reward_rules SET points=COALESCE((SELECT CAST(JSON_UNQUOTE(settingValue) AS UNSIGNED) FROM reward_settings WHERE settingKey='product_review_points'),10) WHERE eventCode='REVIEW_SUBMITTED'`);
        await q.query(`INSERT INTO reward_settings (id,settingKey,settingValue) VALUES (UUID(),'referral_reward_policy',JSON_OBJECT('referralQualificationEvent','company_verified','tradeRewardBeneficiary','buyer','reverseTradeRewardsOnRefund',CAST('false' AS JSON)))`);
        for (const code of rewardPermissions)
            await q.query(`INSERT IGNORE INTO permissions (id,code,name,description,module,status) VALUES (UUID(),?,?,?,?, 'active')`, [code, code, code, code.split('.')[0]]);
    }
    async down(_q: QueryRunner): Promise<void> {
        throw new Error('Referral rewards migration is irreversible: restore a verified backup to preserve immutable reward history.');
    }
}
