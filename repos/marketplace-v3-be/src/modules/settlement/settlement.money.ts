import { units, decimal, proportional } from '../after-sales/after-sales.policy';
import { createError } from '../../common/utils/http-error.util';
export { units, decimal, proportional };
export function signedDecimal(value: bigint): string { return value < 0n ? '-' + decimal(-value) : decimal(value); }
export function signedUnits(value: string): bigint { return value.startsWith('-') ? -units(value.slice(1)) : units(value); }
export function checkedMoney(value: bigint): string {
  if (value < 0n || value > 999999999999999999n)
    throw createError.conflict('Settlement amount is outside supported bounds');
  return decimal(value);
}
export function refundImpact(snapshot: {
  gross: string;
  logistics: string;
}, refunds: Array<{
  breakdown: { productAmount: string; logisticsAmount: string };
  financialSnapshot: { productPaymentAllocation: string; logisticsPaymentAllocation: string };
}>, feeReversal: string): {
  refund: bigint;
  liability: bigint;
} {
  let product = 0n, logistics = 0n, productAllocation: bigint | null = null, logisticsAllocation: bigint | null = null;
  for (const refund of refunds) {
    const pa = units(refund.financialSnapshot.productPaymentAllocation), la = units(refund.financialSnapshot.logisticsPaymentAllocation);
    if (productAllocation !== null && (productAllocation !== pa || logisticsAllocation !== la))
      throw createError.conflict('Inconsistent historical refund allocations');
    productAllocation = pa;
    logisticsAllocation = la;
    product += units(refund.breakdown.productAmount);
    logistics += units(refund.breakdown.logisticsAmount);
  }
  if ((productAllocation !== null && product > productAllocation) || (logisticsAllocation !== null && logistics > logisticsAllocation))
    throw createError.conflict('Refund exceeds original seller allocation');
  const refund = (product > 0n ? proportional(units(snapshot.gross), product, productAllocation!) : 0n) + (logistics > 0n && units(snapshot.logistics) > 0n ? proportional(units(snapshot.logistics), logistics, logisticsAllocation!) : 0n);
  return { refund, liability: refund - units(feeReversal) };
}
