import { z } from 'zod';

export interface SettingDefinition {
 category:string; value:unknown; schema:z.ZodTypeAny; description:string;
 isPublic?:boolean; isEditable?:boolean; permission?:string;
}
const days=z.number().int().min(1).max(90);
const money=z.record(z.string().regex(/^[A-Z]{3}$/),z.number().finite().min(0).max(1e12).multipleOf(0.01)).refine(v=>Object.keys(v).length<=50);
const flag=z.boolean();
const unavailable='Reserved for the owning module; cannot enable unsupported processing.';
export const settingDefinitions:Record<string,SettingDefinition>={
 marketplaceName:{category:'general',value:'Traders of Africa',schema:z.string().trim().min(1).max(120),description:'Marketplace display name.',isPublic:true},
 defaultLanguage:{category:'localization',permission:'settings.languages.manage',value:'en',schema:z.string().regex(/^[a-z]{2}(?:-[a-z]{2})?$/),description:'Default active marketplace language.',isPublic:true},
 defaultCountry:{category:'country',permission:'settings.countries.manage',value:'NG',schema:z.string().regex(/^[A-Z]{2}$/),description:'Default active country.',isPublic:true},
 defaultCurrency:{category:'currency',permission:'settings.currencies.manage',value:'NGN',schema:z.string().regex(/^[A-Z]{3}$/),description:'Default currency for new selections.',isPublic:true},
 returnWindowDays:{category:'return',value:7,schema:days,description:'Window for newly requested returns. Existing return policy snapshots remain unchanged.',isPublic:true},
 maximumReturnEvidenceFiles:{category:'return',value:10,schema:z.number().int().min(1).max(10),description:'Maximum evidence files per return.'},
 disputeWindowDays:{category:'dispute',value:7,schema:days,description:'Window for new dispute requests.',isPublic:true},
 maximumDisputeEvidenceFiles:{category:'dispute',value:10,schema:z.number().int().min(1).max(50),description:'Maximum evidence files per dispute.'},
 disputeAutoCloseDays:{category:'dispute',value:0,schema:z.literal(0),isEditable:false,description:unavailable},
 defaultQuoteValidityDays:{category:'rfq',value:14,schema:days,description:'Default validity for newly created direct RFQs.'},
 maximumRFQAttachments:{category:'rfq',isEditable:false,value:5,schema:z.number().int().min(1).max(20),description:'Global RFQ attachment cap.'},
 RFQExpiryReminderEnabled:{category:'rfq',value:false,schema:z.literal(false),isEditable:false,description:unavailable},
 maximumMarketRFQResponses:{category:'rfq',value:0,schema:z.number().int().min(0).max(10000),description:'Global response cap; zero disables this cap. Subscription entitlements still apply.'},
 integratedLogisticsEnabled:{category:'delivery',value:true,schema:flag,description:'Allow integrated delivery for new selections.'},
 sellerArrangedLogisticsEnabled:{category:'delivery',value:true,schema:flag,description:'Allow seller-arranged delivery for new selections.'},
 buyerArrangedLogisticsEnabled:{category:'delivery',value:true,schema:flag,description:'Allow buyer-arranged delivery for new selections.'},
 manualRefundRequiresApproval:{category:'refund',value:true,schema:z.literal(true),isEditable:false,description:'Mandatory approval cannot be bypassed.'},
 refundNotificationEnabled:{category:'refund',value:true,schema:flag,description:'Deliver refund notifications; does not disable durable audit history.'},
 automaticRefundEnabled:{category:'refund',value:false,schema:z.literal(false),isEditable:false,description:unavailable},
 maximumAutomaticRefundAmount:{category:'refund',value:{},schema:money,isEditable:false,description:unavailable},
 defaultFreePlanId:{category:'subscription',value:null,schema:z.string().uuid().nullable(),description:'Optional active free plan for future default subscription selection.'},
 subscriptionExpiryReminderDays:{category:'subscription',value:[7,1],schema:z.array(z.number().int().min(1).max(90)).max(10),isEditable:false,description:'Reserved until a subscription reminder worker consumes this policy.'},
 settlementHoldDays:{category:'settlement',value:2,schema:z.number().int().min(0).max(30),description:'Hold days snapshotted at settlement creation; never rewrites stored eligibleAt.'},
 automaticSettlementEnabled:{category:'settlement',value:false,schema:flag,description:'Dispatch already approved Paystack payouts only when server opt-in and currency maximum also permit it.'},
 settlementProcessingEnabled:{category:'settlement',value:true,schema:flag,description:'Module 25 master switch for initiating new payouts; does not reverse history.'},
 settlementRequiresVerifiedSeller:{category:'settlement',value:true,schema:z.literal(true),isEditable:false,description:'Core seller verification safety requirement.'},
 settlementRequiresVerifiedPayoutAccount:{category:'payout',value:true,schema:z.literal(true),isEditable:false,description:'Core payout-account verification safety requirement.'},
 minimumPayoutAmounts:{category:'payout',value:{},schema:money,description:'Optional currency-specific minimums for Module 25; empty disables thresholds.'},
 maximumAutomaticPayoutAmount:{category:'payout',value:{},schema:money,description:'Currency-specific ceilings for automatic dispatch of approved Paystack payouts. Missing currency disables automatic dispatch.'},
 payoutApprovalMode:{category:'payout',value:'maker_checker',schema:z.literal('maker_checker'),isEditable:false,description:'Approver must differ from processor and adjustment creator.'},
 payoutRetryEnabled:{category:'payout',value:true,schema:flag,description:'Module 25 retry policy; never authorizes duplicate transfers.'},
 manualPayoutRequiresApproval:{category:'payout',value:true,schema:z.literal(true),isEditable:false,description:'Mandatory financial approval.'},
 settlementProcessingDays:{category:'settlement',value:[],schema:z.array(z.enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])).max(7),isEditable:false,description:'Scheduling is reserved until Module 25 implements a timezone-aware worker.'},
 maxImageSizeMb:{category:'file_upload',value:5,schema:z.number().int().min(1).max(10),description:'Image upload ceiling; module and subscription limits still apply.'},
 maxDocumentSizeMb:{category:'file_upload',value:20,schema:z.number().int().min(1).max(20),description:'Document upload ceiling; module-specific limits still apply.'},
 allowedImageTypes:{category:'file_upload',value:['image/jpeg','image/png','image/webp'],schema:z.array(z.enum(['image/jpeg','image/jpg','image/png','image/webp'])).min(1).max(4),description:'Safe image MIME types.'},
 allowedDocumentTypes:{category:'file_upload',value:['application/pdf'],schema:z.array(z.literal('application/pdf')).length(1),description:'Safe document MIME types.'},
 maximumFilesPerUpload:{category:'file_upload',value:1,schema:z.literal(1),isEditable:false,description:'The upload API accepts one file per request.'},
 userOtpExpiryMinutes:{category:'security',value:10,schema:z.number().int().min(5).max(15),description:'Expiry for newly issued user verification OTPs.'},
 passwordResetOtpExpiryMinutes:{category:'security',value:10,schema:z.number().int().min(5).max(15),description:'Expiry for newly issued password reset OTPs.'},
 adminOtpExpiryMinutes:{category:'security',value:10,schema:z.number().int().min(5).max(15),description:'Expiry for newly issued admin password reset OTPs.'},
 maxLoginAttempts:{category:'security',value:5,schema:z.number().int().min(3).max(10),description:'Maximum user/admin login attempts before lockout.'},
 loginLockMinutes:{category:'security',value:15,schema:z.number().int().min(15).max(1440),description:'Duration of newly imposed login lockouts.'},
 adminSetupTokenExpiryHours:{category:'security',value:24,schema:z.number().int().min(1).max(48),description:'Lifetime of new admin invitations.'},
 auditLogRetentionDays:{category:'audit',value:0,schema:z.number().int().min(0).max(36500),description:'Archive eligibility policy; zero retains indefinitely. No automatic audit deletion.'},
 auditExportExpiryMinutes:{category:'audit',value:1440,schema:z.number().int().min(5).max(10080),description:'Lifetime of newly requested audit exports.'},
};
Object.setPrototypeOf(settingDefinitions,null);
Object.freeze(settingDefinitions);

export function settingPermission(key:string):string {
 const d=settingDefinitions[key];
 return d?.permission ?? (d?.category==='settlement'?'settings.settlement.manage':d?.category==='payout'?'settings.payout.manage':'settings.update');
}
export function validateSetting(key:string,value:unknown):unknown {
 const d=settingDefinitions[key];
 if(!d)throw new Error('Unknown setting');
 return d.schema.parse(value);
}
