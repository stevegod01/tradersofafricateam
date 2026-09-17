import { AppDataSource } from '../../database/data-source';
export async function settlementReconciliation() {
  const m = AppDataSource.manager;
  const checks: Record<string, string> = {
    paymentAllocationMismatch: "SELECT p.id AS paymentId,p.amount AS paymentAmount,SUM(o.paymentAmount) AS orderAllocation FROM payments p JOIN orders o ON o.paymentId=p.id WHERE p.status='confirmed' GROUP BY p.id,p.amount HAVING SUM(o.paymentAmount)<>p.amount LIMIT 100",
    missingSettlements: "SELECT o.id AS orderId FROM orders o JOIN payments p ON p.id=o.paymentId LEFT JOIN seller_settlements s ON s.orderId=o.id WHERE p.status='confirmed' AND s.id IS NULL LIMIT 100",
    missingPayouts: "SELECT s.id AS settlementId FROM seller_settlements s LEFT JOIN seller_payouts p ON p.settlementId=s.id WHERE s.status IN ('eligible','processing','settled') AND p.id IS NULL LIMIT 100",
    mismatchedPayouts: "SELECT s.id AS settlementId,p.id AS payoutId FROM seller_settlements s JOIN seller_payouts p ON p.settlementId=s.id WHERE s.sellerId<>p.sellerId OR s.settlementCurrency<>p.currency OR (s.status='settled' AND (p.status<>'successful' OR s.netSettlementAmount<>p.amount)) OR (p.status='successful' AND s.status<>'settled') OR (s.status='processing' AND p.status<>'processing') LIMIT 100",
    unresolvedTransfers: "SELECT id AS payoutId,method,processingAt FROM seller_payouts WHERE status='processing' AND processingAt < DATE_SUB(NOW(), INTERVAL 1 HOUR) LIMIT 100",
    overAllocatedAdjustments: "SELECT a.id AS adjustmentId,a.amount,SUM(l.amount) AS allocated FROM seller_settlement_adjustments a JOIN settlement_adjustment_allocations l ON l.adjustmentId=a.id AND l.status IN ('reserved','applied') GROUP BY a.id,a.amount HAVING SUM(l.amount)>a.amount LIMIT 100",
    refundsAwaitingRecovery: "SELECT DISTINCT s.id AS settlementId,p.id AS payoutId,r.id AS refundId FROM refunds r JOIN seller_settlements s ON s.orderId=r.orderId JOIN seller_payouts p ON p.settlementId=s.id WHERE p.status='successful' AND r.status='successful' AND r.completedAt>p.completedAt AND NOT EXISTS (SELECT 1 FROM seller_settlement_adjustments a WHERE a.sellerOrderId=s.orderId AND a.sourceType='post_payout_refund' AND a.createdAt>=r.completedAt) LIMIT 100",
    providerExceptions: "SELECT payoutId,eventCode,createdAt FROM settlement_events WHERE eventCode='PAYOUT_PROVIDER_REVERSAL_REVIEW_REQUIRED' ORDER BY createdAt DESC LIMIT 100",
  };
  const results = await Promise.all(Object.entries(checks).map(async ([key, sql]) => [key, await m.query(sql)]));
  return { success: true, data: { checkedAt: new Date(), limitPerCheck: 100, ...Object.fromEntries(results) } };
}
