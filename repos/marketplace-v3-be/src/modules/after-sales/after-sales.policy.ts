import { createError } from '../../common/utils/http-error.util';
export const cancellationReasons = {
  buyer: ['ordered_by_mistake', 'no_longer_needed', 'incorrect_delivery_information', 'duplicate_order', 'seller_delay', 'other'],
  seller: ['out_of_stock', 'unable_to_fulfil', 'pricing_error', 'buyer_requirement_cannot_be_met', 'operational_issue', 'other'],
  admin: ['fraud_risk', 'policy_violation', 'payment_issue', 'compliance_issue', 'dispute_resolution', 'other'],
};
export const returnReasons = ['wrong_product', 'damaged_product', 'significantly_not_as_described', 'incorrect_quantity', 'missing_items', 'defective_product', 'other', 'changed_mind'] as const;
export const refundStatuses = ['pending', 'approved', 'processing', 'successful', 'failed', 'cancelled'] as const;
export const returnStatuses = ['requested', 'approved', 'rejected', 'awaiting_return', 'in_transit', 'received', 'completed', 'cancelled'] as const;
// Failed attempts reserve money until explicitly cancelled after reconciliation.
export const reservedRefundStatuses = ['pending', 'approved', 'processing', 'successful', 'failed'];
export const activeReturnStatuses = ['requested', 'approved', 'awaiting_return', 'in_transit', 'received', 'completed'];
/** Exact decimal arithmetic. Never use binary floating point for ledger limits. */
export function units(value: string | number, scale = 2): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match || (match[2]?.length ?? 0) > scale)
    throw createError.badRequest(`Amount must be non-negative with at most ${scale} decimal places`);
  return BigInt(match[1]) * 10n ** BigInt(scale) + BigInt((match[2] ?? '').padEnd(scale, '0'));
}
export function decimal(value: bigint, scale = 2): string {
  if (value < 0n)
    throw createError.conflict('Invalid negative financial balance');
  const base = 10n ** BigInt(scale);
  return `${value / base}.${String(value % base).padStart(scale, '0')}`;
}
export function proportional(amount: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n)
    throw createError.conflict('Original financial allocation is unavailable');
  return (amount * numerator + denominator / 2n) / denominator;
}
export function assertRefundCapacity(amount: bigint, reserved: bigint, maximum: bigint): void {
  if (amount <= 0n || amount + reserved > maximum) {
    throw createError.conflict('Refund exceeds the remaining eligible amount', 'REFUND_AMOUNT_EXCEEDED');
  }
}
export function assertReturnQuantity(quantity: bigint, reserved: bigint, purchased: bigint): void {
  if (quantity <= 0n || quantity + reserved > purchased) {
    throw createError.conflict('Return quantity exceeds the remaining purchased quantity', 'RETURN_QUANTITY_EXCEEDED');
  }
}
