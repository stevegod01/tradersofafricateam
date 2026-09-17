import { settingDefinitions } from '../system-settings/settings.registry';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

export interface AuditContext { actorId?: string; actorType?: 'user'|'admin'|'system'; actorEmail?: string; ipAddress?: string; userAgent?: string; requestId?: string }
export const auditContext = new AsyncLocalStorage<AuditContext>();
// Explicit allowlist: arbitrary provider payloads, messages, URLs and credentials never enter the central log.
const safeKeys = new Set(('settlementId payoutId holdCode accountVersion points balanceBefore balanceAfter referrerId referredUserId previousReferrerId transactionId originalTransactionId maxPerUser maxPerPeriod periodType referralQualificationEvent tradeRewardBeneficiary reverseTradeRewardsOnRefund id settingKey code displayName phoneCode symbol decimalPlaces sortOrder previousRoleId newRoleId permissionCount permissionsChanged verificationId failedLoginAttempts stage deliveryType logisticsQuoteId logisticsProviderId paymentMethod totalStock inventoryStatus isSuperAdmin firstName lastName email name title price parentId visibility status currentStatus fromStatus toStatus previousStatus newStatus userType isEmailVerified isCompanyVerified isActive amount currency sourceType sourceId orderId sellerOrderId paymentId refundId returnId cancellationId disputeId buyerId sellerId adminId userId actorId targetAdminId targetUserId targetRoleId planId subscriptionId productId categoryId rfqId quoteId reviewId shipmentId fileId reportId roleId permissionId requiredPermission resolutionType resolvedBy financialAction refundType adjustmentType direction transactionFee transactionFeeRate feePercentage quantity count attemptCount gateway processingMode format module eventCode dateFrom dateTo total statusCode method route').split(' '));
export function safeAuditValue(value: unknown): Record<string,unknown>|null {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const result: Record<string,unknown> = {};
 for (const [key,item] of Object.entries(value)) {
  if(Object.prototype.hasOwnProperty.call(settingDefinitions,key)) {
   const parsed=settingDefinitions[key].schema.safeParse(item);if(parsed.success)result[key]=parsed.data;continue;
  }
  if(['supportedCurrencies','paymentContext'].includes(key) && Array.isArray(item)) {result[key]=item.filter(v=>typeof v==='string' && /^[A-Za-z_]{2,40}$/.test(v)).slice(0,50);continue;}
  if(['changedFields','permissionIds'].includes(key) && Array.isArray(item)) {
   result[key]=item.filter(v=>typeof v==='string' && (key==='changedFields'?/^[A-Za-z][A-Za-z0-9_]{0,79}$/:/^[0-9a-f-]{36}$/i).test(v)).slice(0,100);continue;
  }
  if (!safeKeys.has(key)) continue;
  if (typeof item === 'string') result[key] = item.slice(0,256);
  else if (typeof item === 'boolean' || item === null || (typeof item === 'number' && Number.isFinite(item))) result[key] = item;
 }
 return Object.keys(result).length ? result : null;
}
export async function writeAudit(manager: EntityManager, input: Partial<AuditLog> & {eventCode:string;module:string}): Promise<void> {
 const context = auditContext.getStore() ?? {};
 const actorType = input.actorType ?? context.actorType ?? 'system';
 const actorId = actorType === 'system' ? null : input.actorId ?? context.actorId ?? null;
 let actorEmail=input.actorEmail ?? (actorId===context.actorId ? context.actorEmail : null) ?? null;
 if(actorId && !actorEmail) {
  const rows=await manager.query(`SELECT email FROM ${actorType==='admin'?'admins':'users'} WHERE id = ? LIMIT 1`,[actorId]);
  actorEmail=rows[0]?.email ?? null;
 }
 const log = manager.create(AuditLog, {
  eventId:input.eventId ?? randomUUID(),eventCode:input.eventCode,action:input.action ?? input.eventCode,
  module:input.module,actorId,actorType,actorEmail,
  ...(input.createdAt ? {createdAt:input.createdAt}: {}),
  entityType:input.entityType ?? null,entityId:input.entityId ?? null,
  description:input.eventCode.toLowerCase().replace(/_/g,' '),reason:safeAuditReason(input.reason),
  oldValue:safeAuditValue(input.oldValue),newValue:safeAuditValue(input.newValue),metadata:safeAuditValue(input.metadata),
  ipAddress:context.ipAddress?.slice(0,64) ?? null,userAgent:context.userAgent?.slice(0,512) ?? null,requestId:context.requestId?.slice(0,128) ?? null,
 });
 try { await manager.save(AuditLog, log); } catch(error) {
  if((error as {driverError?:{errno?:number}}).driverError?.errno===1062 && await manager.existsBy(AuditLog,{eventId:log.eventId})) return;
  console.error('[AuditLog] Durable audit write failed', {eventCode:input.eventCode, module:input.module});
  throw error;
 }
}

export function safeAuditReason(value:unknown):string|null {
 if(typeof value!=='string')return null;
 return value.slice(0,2000)
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED]')
  .replace(/(?:password|token|secret|api[_ -]?key|otp|authorization)\s*[:=]\s*\S+/gi,'[REDACTED]')
  .replace(/\b[A-Fa-f0-9]{32,}\b/g,'[REDACTED]');
}
