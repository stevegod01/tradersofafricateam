import { MigrationInterface,QueryRunner } from 'typeorm';
export class CompleteSellerPayouts1787520023000 implements MigrationInterface {
 name='CompleteSellerPayouts1787520023000';
 async up(q:QueryRunner):Promise<void>{
  await q.query("CREATE TABLE analytics_report_contents (reportId VARCHAR(36) NOT NULL PRIMARY KEY, content LONGTEXT NOT NULL, CONSTRAINT FK_report_content_report FOREIGN KEY(reportId) REFERENCES analytics_reports(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  await q.query("ALTER TABLE seller_settlement_adjustments ADD KEY IDX_settlement_adjustment_seller_currency(sellerId,currency,settlementId), ADD KEY IDX_settlement_adjustment_source(sellerOrderId,sourceType)");
  await q.query("ALTER TABLE seller_settlements ADD CONSTRAINT CK_settlement_order CHECK (orderId=sellerOrderId), ADD CONSTRAINT CK_settlement_net CHECK (netSettlementAmount>=0), ADD CONSTRAINT CK_settlement_status CHECK (status IN ('pending','on_hold','eligible','processing','settled','cancelled'))");
  await q.query("ALTER TABLE seller_payouts ADD CONSTRAINT CK_payout_status CHECK (status IN ('pending','approved','processing','successful','failed','cancelled'))");
  await q.query("ALTER TABLE seller_payout_accounts ADD CONSTRAINT CK_payout_account_status CHECK (status IN ('pending','verified','invalid','inactive'))");
  await q.query("ALTER TABLE seller_settlement_adjustments ADD CONSTRAINT CK_adjustment_direction CHECK (direction IN ('credit','debit'))");
  await q.query("ALTER TABLE settlement_adjustment_allocations ADD CONSTRAINT CK_allocation_status CHECK (status IN ('reserved','applied','released'))");
  await q.query("CREATE TRIGGER settlement_settled_immutable BEFORE UPDATE ON seller_settlements FOR EACH ROW BEGIN IF OLD.status='settled' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Settled history is immutable'; END IF; END");
  await q.query("CREATE TRIGGER settlement_no_delete BEFORE DELETE ON seller_settlements FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Settlement history cannot be deleted'");
  await q.query("CREATE TRIGGER allocation_applied_immutable BEFORE UPDATE ON settlement_adjustment_allocations FOR EACH ROW BEGIN IF OLD.status='applied' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Applied allocations are immutable'; END IF; END");
  await q.query("CREATE TRIGGER allocation_no_delete BEFORE DELETE ON settlement_adjustment_allocations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Allocation history cannot be deleted'");
  await q.query("DROP TRIGGER payout_attempts_immutable");
  await q.query("CREATE TRIGGER payout_attempts_immutable BEFORE UPDATE ON payout_attempts FOR EACH ROW BEGIN IF OLD.status IN ('successful','failed') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Terminal attempt history is immutable'; END IF; END");
  await q.query("UPDATE system_settings SET description='Days after order completion before payout eligibility. Snapshotted at settlement creation.' WHERE `key`='settlementHoldDays'");
  await q.query("UPDATE system_settings SET isEditable=true, description='Automatically dispatch already approved Paystack payouts subject to server opt-in and currency ceiling.' WHERE `key`='automaticSettlementEnabled'");
  await q.query("UPDATE system_settings SET description='Payout approval and processing require different administrators.' WHERE `key`='payoutApprovalMode'");
 }
 async down(q:QueryRunner):Promise<void>{
  await q.query('DROP TABLE analytics_report_contents');
  for(const name of ['settlement_settled_immutable','settlement_no_delete','allocation_applied_immutable','allocation_no_delete','payout_attempts_immutable'])await q.query(`DROP TRIGGER ${name}`);
  await q.query("CREATE TRIGGER payout_attempts_immutable BEFORE UPDATE ON payout_attempts FOR EACH ROW BEGIN IF OLD.status='successful' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Successful payout history is immutable'; END IF; END");
  await q.query('ALTER TABLE seller_settlements DROP CHECK CK_settlement_order, DROP CHECK CK_settlement_net, DROP CHECK CK_settlement_status');
  await q.query('ALTER TABLE seller_payouts DROP CHECK CK_payout_status');
  await q.query('ALTER TABLE seller_payout_accounts DROP CHECK CK_payout_account_status');
  // MySQL may replace implicit FK indexes with the new covering indexes. Restore
  // independent FK support before removing those covering indexes on rollback.
  const indexes=await q.query('SHOW INDEX FROM seller_settlement_adjustments');
  for(const column of ['sellerId','sellerOrderId']){
   if(!indexes.some((i:{Column_name:string;Seq_in_index:number|string;Key_name:string})=>i.Column_name===column&&Number(i.Seq_in_index)===1&&!['IDX_settlement_adjustment_seller_currency','IDX_settlement_adjustment_source'].includes(i.Key_name)))await q.query(`ALTER TABLE seller_settlement_adjustments ADD KEY IDX_adjustment_fk_${column} (${column})`);
  }
  await q.query('ALTER TABLE seller_settlement_adjustments DROP CHECK CK_adjustment_direction, DROP INDEX IDX_settlement_adjustment_seller_currency, DROP INDEX IDX_settlement_adjustment_source');
  await q.query('ALTER TABLE settlement_adjustment_allocations DROP CHECK CK_allocation_status');
  await q.query("UPDATE system_settings SET value=CAST('false' AS JSON),isEditable=false WHERE `key`='automaticSettlementEnabled'");
 }
}
