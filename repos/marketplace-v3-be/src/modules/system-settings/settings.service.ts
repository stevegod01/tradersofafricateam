import {EntityManager,EntityTarget} from 'typeorm';
import {AppDataSource} from '../../database/data-source';
import {SystemSetting} from '../../database/entities/system-setting.entity';
import {MarketplaceCountry} from '../../database/entities/marketplace-country.entity';
import {MarketplaceCurrency} from '../../database/entities/marketplace-currency.entity';
import {Language,LanguageStatus} from '../../database/entities/language.entity';
import {PaymentMethodConfig} from '../../database/entities/payment-method-config.entity';
import {PaymentProvider} from '../../database/entities/payment-provider.entity';
import {SubscriptionPlan} from '../../database/entities/subscription-plan.entity';
import {settingDefinitions,settingPermission} from './settings.registry';
import {writeAudit} from '../audit-log/audit-log.writer';
import {createError} from '../../common/utils/http-error.util';
import {getSetting} from './settings.reader';

export async function lockConfiguration(manager:EntityManager):Promise<void> {
 await manager.findOneOrFail(SystemSetting,{where:{key:'marketplaceName'},lock:{mode:'pessimistic_write'}});
}
export async function updateSetting(manager:EntityManager,adminId:string,key:string,value:unknown) {
 const definition=settingDefinitions[key];
 if(!definition)throw createError.notFound('Setting not found');
 if(definition.isEditable===false)throw createError.forbidden('This safety policy is not editable');
 const next=definition.schema.parse(value);
 await lockConfiguration(manager);
 const row=await manager.findOneByOrFail(SystemSetting,{key});
 if(!row.isEditable)throw createError.forbidden('Setting is not editable');
 if(key==='defaultCountry' && !await manager.existsBy(MarketplaceCountry,{code:next,status:'active'}))throw createError.badRequest('Default country must be active');
 if(key==='defaultCurrency' && !await manager.existsBy(MarketplaceCurrency,{code:next,status:'active'}))throw createError.badRequest('Default currency must be active');
 if(key==='defaultLanguage') {
  const language=await manager.findOneBy(Language,{code:next,status:LanguageStatus.ACTIVE});
  if(!language)throw createError.badRequest('Default language must be active');
  await manager.update(Language,{isDefault:true},{isDefault:false});
  await manager.update(Language,language.id,{isDefault:true});
 }
 if(key==='defaultFreePlanId' && next!==null) {
  const plan=await manager.findOneBy(SubscriptionPlan,{id:next});
  if(!plan || plan.status!=='active' || !plan.isFree)throw createError.badRequest('Default plan must be an active free plan');
 }
 if(['minimumPayoutAmounts','maximumAutomaticPayoutAmount'].includes(key))for(const code of Object.keys(next)) {
  if(!await manager.existsBy(MarketplaceCurrency,{code,status:'active'}))throw createError.badRequest('Payout limits must use active supported currencies');
 }
 if(key.endsWith('LogisticsEnabled') && next===false) {
  const alternatives=['integratedLogisticsEnabled','sellerArrangedLogisticsEnabled','buyerArrangedLogisticsEnabled'].filter(item=>item!==key);
  if(!(await Promise.all(alternatives.map(item=>getSetting<boolean>(item,manager)))).some(Boolean))throw createError.conflict('At least one delivery method must remain enabled');
 }
 const oldValue=row.value;
 row.value=next;row.updatedBy=adminId;
 await manager.save(row);
 await writeAudit(manager,{eventCode:definition.category==='settlement'?'SETTLEMENT_CONFIGURATION_UPDATED':definition.category==='payout'?'PAYOUT_CONFIGURATION_UPDATED':'SYSTEM_SETTING_UPDATED',module:'system_settings',action:'update',actorType:'admin',actorId:adminId,entityType:'system_setting',entityId:row.id,oldValue:{[key]:oldValue},newValue:{[key]:next},metadata:{settingKey:key}});
 return describeSetting(row);
}
export function describeSetting(row:SystemSetting) {
 const definition=settingDefinitions[row.key];
 const checks:Array<{kind?:string;value?:unknown}>=definition?.schema._def.checks ?? [];
 const validation={minimumValue:checks.find(c=>c.kind==='min')?.value,maximumValue:checks.find(c=>c.kind==='max')?.value,allowedValues:definition?.schema._def.values ?? (definition?.schema._def.typeName==='ZodLiteral'?[definition.schema._def.value]:undefined)};
 return {...row,validation,isPublic:Boolean(definition?.isPublic && row.isPublic),isEditable:definition?.isEditable!==false && row.isEditable,requiredPermission:settingPermission(row.key),scope:['settlementProcessingEnabled','payoutRetryEnabled'].includes(row.key)?'future processing attempts':'prospective; existing financial snapshots remain unchanged'};
}
export async function publicConfiguration() {
 const manager=AppDataSource.manager;
 const [name,defaultLanguage,countries,currencies,languages,returnWindowDays,disputeWindowDays,defaultCountry,defaultCurrency]=await Promise.all([
  getSetting<string>('marketplaceName'),getSetting<string>('defaultLanguage'),
  manager.find(MarketplaceCountry,{where:{status:'active'},order:{name:'ASC'}}),manager.find(MarketplaceCurrency,{where:{status:'active'},order:{code:'ASC'}}),manager.find(Language,{where:{status:LanguageStatus.ACTIVE},order:{sortOrder:'ASC'}}),getSetting<number>('returnWindowDays'),getSetting<number>('disputeWindowDays'),getSetting<string>('defaultCountry'),getSetting<string>('defaultCurrency')]);
 return {success:true,data:{marketplace:{name,defaultLanguage,defaultCountry,defaultCurrency},countries:countries.map(({code,name,phoneCode})=>({code,name,phoneCode})),currencies:currencies.map(({code,name,symbol,decimalPlaces})=>({code,name,symbol,decimalPlaces})),languages:languages.map(({code,name,nativeName,direction})=>({code,name,nativeName,direction})),policies:{returnWindowDays,disputeWindowDays}}};
}
type CatalogRecord=MarketplaceCountry|MarketplaceCurrency|PaymentMethodConfig;
type CatalogInput=Record<string,unknown>&{code?:string;status?:'active'|'inactive';supportedCurrencies?:string[]};
export async function mutateCatalog(kind:'countries'|'currencies'|'payment-methods',adminId:string,id:string|undefined,input:CatalogInput) {
 return AppDataSource.transaction(async manager=>{
  await lockConfiguration(manager);
  const target:EntityTarget<CatalogRecord>=kind==='countries'?MarketplaceCountry:kind==='currencies'?MarketplaceCurrency:PaymentMethodConfig;
  const repo=manager.getRepository<CatalogRecord>(target);
  const row=id?await repo.findOneBy({id}):repo.create();
  if(!row)throw createError.notFound('Configuration record not found');
  const before={...row};
  if(input.code && id && input.code!==row.code)throw createError.badRequest('Codes are immutable; create a new entry');
  if(input.status==='inactive' && kind!=='payment-methods') {
   const defaultCode=await getSetting<string>(kind==='countries'?'defaultCountry':'defaultCurrency',manager);
   if(row.code===defaultCode)throw createError.conflict('Choose another active default before deactivation');
  }
  if(kind==='payment-methods') {
   const code=input.code ?? row.code;
   const provider=await manager.findOneBy(PaymentProvider,{code});
   if(!provider)throw createError.badRequest('Payment method must reference an existing provider');
    const paymentRow=row as PaymentMethodConfig;
    for(const currency of (input.supportedCurrencies || input.status==='active') ? (input.supportedCurrencies ?? paymentRow.supportedCurrencies ?? []) : []) {
    if(!provider.supportedCurrencies.includes(currency) || !await manager.existsBy(MarketplaceCurrency,{code:currency,status:'active'}))throw createError.badRequest('Currency must be active and supported by the provider');
   }
  }
  Object.assign(row,input);
  const saved=await repo.save(row);
  const prefix=kind==='countries'?'COUNTRY':kind==='currencies'?'CURRENCY':'PAYMENT_METHOD';
  const suffix=!id?'CREATED':input.status && input.status!==before.status?(input.status==='active'?'ACTIVATED':'DEACTIVATED'):'UPDATED';
   await writeAudit(manager,{eventCode:`${prefix}_${suffix}`,module:'system_settings',actorType:'admin',actorId:adminId,entityType:prefix.toLowerCase(),entityId:saved.id,oldValue:before,newValue:{...saved} as Record<string,unknown>});
  return {success:true,data:saved};
 });
}
