import { EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent, RemoveEvent, SoftRemoveEvent, ObjectLiteral } from 'typeorm';
import { auditContext, writeAudit, safeAuditValue } from './audit-log.writer';

export const auditSources: Record<string,[string,string,string]> = {
 admin_audit_events:['admins','admin','targetAdminId'], payment_audit_logs:['payments','payment','paymentId'],
 dispute_audit_events:['disputes','dispute','disputeId'], review_audit_events:['reviews','review','reviewId'],
 subscription_audit_events:['subscriptions','subscription','subscriptionId'], direct_rfq_audit_events:['direct_rfqs','direct_rfq','rfqId'],
 market_rfq_audit_events:['market_rfqs','market_rfq','rfqId'], after_sales_events:['after_sales','','entityId'],
 order_status_histories:['orders','order','orderId'], shipment_status_histories:['logistics','shipment','shipmentId'],
};
const entities: Record<string,[string,string]> = {
 languages:['system_settings','LANGUAGE'],admins:['admins','ADMIN_STATE'],admin_roles:['admins','ADMIN_ROLE'],admin_role_permissions:['admins','ADMIN_ROLE_PERMISSION'],
 order_deliveries:['logistics','DELIVERY'],checkout_seller_groups:['logistics','DELIVERY_SELECTION'],
 search_settings:['settings','SYSTEM_SETTING'],message_settings:['settings','SYSTEM_SETTING'],reward_settings:['settings','SYSTEM_SETTING'],
 payments:['payments','PAYMENT'],users:['users','USER'],products:['products','PRODUCT'],categories:['categories','CATEGORY'],
 company_verifications:['seller_verification','SELLER_VERIFICATION'],message_reports:['messages','MESSAGE_REPORT'],
 financial_adjustments:['after_sales','FINANCIAL_ADJUSTMENT'],analytics_reports:['analytics','ANALYTICS_REPORT'],
 analytics_rebuild_jobs:['analytics','ANALYTICS_REBUILD'],payment_providers:['settings','PAYMENT_METHOD'],
 after_sales_settings:['settings','SYSTEM_SETTING'],
};
const aliases:Record<string,string> = {SELLER_VERIFIED_BY_ADMIN:'SELLER_VERIFIED',SELLER_REJECTED_BY_ADMIN:'SELLER_VERIFICATION_REJECTED',USER_DISABLED_BY_ADMIN:'USER_DISABLED',USER_REACTIVATED_BY_ADMIN:'USER_REACTIVATED'};
@EventSubscriber()
export class AuditLogSubscriber implements EntitySubscriberInterface<ObjectLiteral> {
 async afterInsert(event:InsertEvent<ObjectLiteral>):Promise<void> {
  const table=event.metadata.tableName, row=event.entity;
  if (!row || !row.id) return;
  const source=auditSources[table];
  if (source) {
   let code=String(row.eventType ?? row.action ?? (table==='order_status_histories' ? `ORDER_${row.toStatus}` : 'TRACKING_UPDATED')).toUpperCase();
   code=aliases[code] ?? code;
   if(table==='direct_rfq_audit_events') code=code==='QUOTE_ACCEPTED'?'DIRECT_RFQ_ACCEPTED':code.startsWith('RFQ_')?code.replace(/^RFQ_/,'DIRECT_RFQ_'):`DIRECT_RFQ_${code}`;
   if(table==='market_rfq_audit_events') code=({QUOTE_SUBMITTED:'MARKET_RFQ_RESPONSE_SUBMITTED',QUOTE_UPDATED:'MARKET_RFQ_RESPONSE_UPDATED',QUOTE_AWARDED:'MARKET_RFQ_RESPONSE_ACCEPTED',RFQ_CANCELLED:'MARKET_RFQ_CLOSED'} as Record<string,string>)[code] ?? (code.startsWith('RFQ_')?code.replace(/^RFQ_/,'MARKET_RFQ_'):`MARKET_RFQ_${code}`);
   if(table==='order_status_histories' && !row.fromStatus) code='ORDER_CREATED';
   if(table==='shipment_status_histories' && !row.fromStatus) code='SHIPMENT_CREATED';
   if(code==='PAYMENT_INITIALIZED') code='PAYMENT_PROCESSING_STARTED';
   if(code==='PAYMENT_CONFIRMED') code='PAYMENT_VERIFIED';
   if(['PRODUCT_REVIEW_SUBMITTED','SELLER_REVIEW_SUBMITTED'].includes(code)) code='REVIEW_CREATED';
   if(code==='RFQ_VIEWED' || code==='DIRECT_RFQ_VIEWED') return;
   // After-sales already publishes the authoritative event for every actor.
   if(table==='admin_audit_events' && /^(CANCELLATION|RETURN|REFUND|TRANSACTION_FEE|FINANCIAL_ADJUSTMENT)_/.test(code)) return;
   const actorType=row.actorType ?? row.changedByType ?? (row.actorAdminId || row.adminId ? 'admin' : undefined);
   await writeAudit(event.manager,{createdAt:row.createdAt,eventId:`${table}:${row.id}`,eventCode:code,module:table==='admin_audit_events' ? (/LOGIN|PASSWORD|LOCKED/.test(code)?'auth':code.startsWith('USER_')?'users':code.startsWith('SELLER_')?'seller_verification':'admins') : source[0],
    entityType:table==='admin_audit_events' ? (row.targetUserId?'user':row.targetRoleId?'admin_role':'admin') : (table==='subscription_audit_events' && !row.subscriptionId && row.planId ? 'subscription_plan' : source[1]) || code.split('_')[0].toLowerCase(),entityId:row[source[2]] ?? row.targetUserId ?? row.targetRoleId ?? row.planId ?? null,
    actorId:row.actorId ?? row.changedById ?? row.actorAdminId ?? row.adminId,
    actorType:actorType === 'buyer' || actorType === 'seller' ? 'user' : actorType,
    oldValue:row.previousValue ?? row.metadata?.oldValue ?? row.metadata?.previousValue ?? (row.fromStatus ? {status:row.fromStatus}:null),newValue:row.newValue ?? row.metadata?.newValue ?? (row.toStatus ? {status:row.toStatus}:null),
    reason:row.reason ?? row.metadata?.reason ?? row.payload?.reason ?? null,
    metadata:{...row,...row.metadata,...row.payload},
   });
  } else if(entities[table]) {
   const [module,prefix]=entities[table];
   await writeAudit(event.manager,{eventId:`${table}:${row.id}:created`,eventCode:table==='users'?'USER_SIGNUP':table==='company_verifications'?'SELLER_VERIFICATION_SUBMITTED':table==='analytics_reports'?'ANALYTICS_REPORT_EXPORT_REQUESTED':table==='analytics_rebuild_jobs'?'ANALYTICS_REBUILD_STARTED':table==='message_reports'?'MESSAGE_REPORTED':`${prefix}_CREATED`,module,entityType:table==='admins'?'admin':prefix.toLowerCase(),entityId:row.id,newValue:row,...(table==='users' && !auditContext.getStore()?.actorId ? {actorId:row.id,actorType:'user' as const,actorEmail:row.email}: {})});
  }
 }
 beforeUpdate(event:UpdateEvent<ObjectLiteral>):void { this.immutable(event.metadata.tableName); }
 beforeRemove(event:RemoveEvent<ObjectLiteral>):void { this.immutable(event.metadata.tableName); }
 beforeSoftRemove(event:SoftRemoveEvent<ObjectLiteral>):void { this.immutable(event.metadata.tableName); }
 async afterRemove(event:RemoveEvent<ObjectLiteral>):Promise<void> {
  const definition=entities[event.metadata.tableName];
  if(!definition)return;
  await writeAudit(event.manager,{eventCode:`${definition[1]}_DELETED`,module:definition[0],entityType:event.metadata.tableName==='admins'?'admin':definition[1].toLowerCase(),entityId:event.entityId ?? event.databaseEntity?.id ?? null});
 }
 private immutable(table:string):void { if(table==='audit_logs') throw new Error('Audit logs are append-only'); }
 async afterUpdate(event:UpdateEvent<ObjectLiteral>):Promise<void> {
  const definition=entities[event.metadata.tableName];
  if(!definition || !event.entity) return;
  const row=event.entity, before=event.databaseEntity;
  const changed:Record<string,unknown>={}, old:Record<string,unknown>={};
  for(const [key,value] of Object.entries(safeAuditValue(row) ?? {})) {
   if(key==='id' || (before && before[key]===value)) continue;
   changed[key]=value; if(before && before[key]!==undefined) old[key]=before[key];
  }
  let code=`${definition[1]}_UPDATED`;
  if(event.metadata.tableName==='users') {
   if(row.passwordHash && event.updatedColumns.some(c=>c.propertyName==='passwordHash')) code=row.passwordResetToken===null?'USER_PASSWORD_RESET':'USER_PASSWORD_CHANGED';
   else if(changed.isEmailVerified===true) code='USER_EMAIL_VERIFIED';
   else if(changed.status==='deleted') code='USER_ACCOUNT_DELETED';
   else if(changed.status==='disabled') code='USER_DISABLED';
   else if(changed.status==='active') code='USER_REACTIVATED';
   else if(changed.userType) code='USER_TYPE_CHANGED';
   else code='USER_PROFILE_UPDATED';
  }
  if(event.metadata.tableName==='company_verifications' && changed.status) code=changed.status==='approved'?'SELLER_VERIFIED':changed.status==='rejected'?'SELLER_VERIFICATION_REJECTED':'SELLER_VERIFICATION_RESUBMITTED';
  if(event.metadata.tableName==='analytics_reports' && changed.status) code=changed.status==='completed'?'ANALYTICS_REPORT_EXPORT_GENERATED':`ANALYTICS_REPORT_EXPORT_${String(changed.status).toUpperCase()}`;
  if(event.metadata.tableName==='analytics_rebuild_jobs' && changed.status) code=`ANALYTICS_REBUILD_${String(changed.status).toUpperCase()}`;
  if(event.metadata.tableName==='payments' && changed.status) code=changed.status==='confirmed'?'PAYMENT_SUCCESSFUL':changed.status==='failed'?'PAYMENT_FAILED':'PAYMENT_STATUS_CHANGED';
  if(['products','categories'].includes(event.metadata.tableName) && changed.status) code=`${definition[1]}_${({active:'ACTIVATED',inactive:'DEACTIVATED',archived:'ARCHIVED',deleted:'DELETED'} as Record<string,string>)[String(changed.status)] ?? 'UPDATED'}`;
  const changedFields=event.updatedColumns.map(column=>column.propertyName).filter(key=>!['updatedAt','lastLoginAt','failedLoginAttempts','lockedUntil','authVersion','emailVerificationToken','emailVerificationExpiry','passwordResetToken','passwordResetExpiry','passwordHash','setupToken','setupTokenExpiry','totalReviewCount','totalAverageReviews','totalPoints'].includes(key));
  if(!Object.keys(changed).length && !changedFields.length && !code.includes('PASSWORD')) return;
  await writeAudit(event.manager,{eventCode:code,module:definition[0],entityType:event.metadata.tableName==='admins'?'admin':definition[1].toLowerCase(),entityId:row.id ?? before?.id ?? null,oldValue:old,newValue:changed,metadata:{changedFields,paymentId:row.paymentId,orderId:row.orderId,refundId:row.refundId,sourceType:row.sourceType,sourceId:row.sourceId,amount:row.amount,currency:row.currency,roleId:row.roleId,permissionId:row.permissionId},...(event.metadata.tableName==='payments' && row.verifiedBy && !auditContext.getStore()?.actorId ? {actorType:'admin' as const,actorId:row.verifiedBy}: {})});
 }
}
