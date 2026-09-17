import {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {AppDataSource} from '../../database/data-source';
import {SystemSetting} from '../../database/entities/system-setting.entity';
import {MarketplaceCountry} from '../../database/entities/marketplace-country.entity';
import {MarketplaceCurrency} from '../../database/entities/marketplace-currency.entity';
import {PaymentMethodConfig} from '../../database/entities/payment-method-config.entity';
import {requirePermission,enforceAdminPermission} from '../../common/middleware/auth.middleware';
import {createError} from '../../common/utils/http-error.util';
import {settingDefinitions,settingPermission} from './settings.registry';
import {describeSetting,mutateCatalog,publicConfiguration,updateSetting} from './settings.service';
const base={tags:['System Settings'],security:[{bearerAuth:[]}]};
const jsonValue={description:'Native JSON value validated against the selected setting. Send numbers and booleans without quotes; currency limits are objects such as {USD:10}.'};
const dataResponse={200:{type:'object',properties:{success:{type:'boolean'},message:{type:'string'},data:{},pagination:{type:'object',additionalProperties:true}}}};
const pageSchema=z.object({category:z.string().max(40).optional(),search:z.string().max(120).optional(),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict();
const status=z.enum(['active','inactive']);
export const countryInput=z.object({code:z.string().regex(/^[A-Z]{2}$/),name:z.string().trim().min(1).max(120),phoneCode:z.string().regex(/^\+\d{1,4}$/).nullable().optional(),status:status.optional()}).strict();
// All current financial ledgers store two decimal places. Unsupported precision cannot be configured.
export const currencyInput=z.object({code:z.string().regex(/^[A-Z]{3}$/),name:z.string().trim().min(1).max(120),symbol:z.string().max(8).nullable().optional(),decimalPlaces:z.literal(2).optional(),status:status.optional()}).strict();
export const methodInput=z.object({code:z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),displayName:z.string().trim().min(1).max(120),status:status.optional(),supportedCurrencies:z.array(z.string().regex(/^[A-Z]{3}$/)).min(1).max(50),paymentContext:z.array(z.enum(['checkout','direct_rfq','market_rfq','subscription','featured_listing','advertisement','service_fee','logistics','account_upgrade','wallet_funding','other'])).max(11).nullable().optional(),sortOrder:z.number().int().min(0).max(10000).optional()}).strict();
export async function systemSettingsRoutes(app:FastifyInstance):Promise<void> {
 app.get('/config',{schema:{tags:['System Settings'],summary:'Safe public marketplace configuration',response:dataResponse}},publicConfiguration);
 for(const kind of ['countries','currencies'] as const)app.get(`/${kind}`,{schema:{tags:['System Settings'],summary:`Active supported ${kind}`,response:dataResponse}},async()=>{
  const config=await publicConfiguration();return {success:true,data:config.data[kind]};
 });
 app.get('/admin/settings',{preHandler:requirePermission('settings.view'),schema:{...base,summary:'List settings with edit permissions and impact',querystring:{type:'object',properties:{category:{type:'string',maxLength:40},search:{type:'string',maxLength:120},page:{type:'integer',minimum:1,maximum:10000},limit:{type:'integer',minimum:1,maximum:100}}},response:dataResponse}},async request=>{
  const filters=pageSchema.parse(request.query),q=AppDataSource.getRepository(SystemSetting).createQueryBuilder('s');
  q.where('s.key IN (:...keys)',{keys:Object.keys(settingDefinitions)});
  if(filters.category)q.andWhere('s.category=:category',{category:filters.category});
  if(filters.search)q.andWhere("(s.key LIKE :search ESCAPE '!' OR s.description LIKE :search ESCAPE '!')",{search:`%${filters.search.replace(/[!%_]/g,'!$&')}%`});
  const [rows,total]=await q.orderBy('s.category','ASC').addOrderBy('s.key','ASC').skip((filters.page-1)*filters.limit).take(filters.limit).getManyAndCount();
  return {success:true,data:rows.map(describeSetting),pagination:{page:filters.page,limit:filters.limit,total,totalPages:Math.ceil(total/filters.limit)}};
 });
 const keyParams={type:'object',required:['key'],properties:{key:{type:'string',maxLength:120}}};
 app.get<{Params:{key:string}}>('/admin/settings/:key',{preHandler:requirePermission('settings.view'),schema:{...base,summary:'Setting details',params:keyParams,response:dataResponse}},async request=>{
  if(!settingDefinitions[request.params.key])throw createError.notFound('Setting not found');
  const row=await AppDataSource.manager.findOneBy(SystemSetting,{key:request.params.key});if(!row)throw createError.notFound('Setting not found');return {success:true,data:describeSetting(row)};
 });
 app.patch<{Params:{key:string}}>('/admin/settings/:key',{preHandler:async(request,reply)=>{await enforceAdminPermission(request,reply,settingPermission(request.params.key));},schema:{...base,summary:'Update validated operational policy; category-specific permission required',description:'Settlement and payout settings require their dedicated settings permission. Security and refund settings additionally require Super Admin. Changes preserve stored financial snapshots.',params:keyParams,body:{type:'object',additionalProperties:false,required:['value'],properties:{value:jsonValue}},response:dataResponse}},async request=>{
  const key=request.params.key;
  if(['security','refund'].includes(settingDefinitions[key]?.category) && !request.dbAdmin!.isSuperAdmin)throw createError.forbidden('Super Admin is required for security and refund policies');
  const {value}=z.object({value:z.unknown()}).strict().parse(request.body);
  return {success:true,message:'System setting updated successfully.',data:await AppDataSource.transaction(manager=>updateSetting(manager,request.dbAdmin!.id,key,value))};
 });
 for(const kind of ['countries','currencies','payment-methods'] as const) {
  const permission=`settings.${kind==='payment-methods'?'payment_methods':kind}.manage`;
  const schema=kind==='countries'?countryInput:kind==='currencies'?currencyInput:methodInput;
  const properties:Record<string,unknown>=kind==='countries'?{code:{type:'string',pattern:'^[A-Z]{2}$'},name:{type:'string',maxLength:120},phoneCode:{type:'string',nullable:true}}:kind==='currencies'?{code:{type:'string',pattern:'^[A-Z]{3}$'},name:{type:'string',maxLength:120},symbol:{type:'string',nullable:true},decimalPlaces:{type:'integer',enum:[2]}}:{code:{type:'string',maxLength:80},displayName:{type:'string',maxLength:120},supportedCurrencies:{type:'array',items:{type:'string'},maxItems:50},paymentContext:{type:'array',nullable:true,items:{type:'string'}},sortOrder:{type:'integer'}};
  properties.status={type:'string',enum:['active','inactive']};
  app.get(`/admin/${kind}`,{preHandler:requirePermission(permission),schema:{...base,summary:`List configured ${kind}`,response:dataResponse}},async()=>({success:true,data:kind==='countries'
   ? await AppDataSource.manager.find(MarketplaceCountry,{order:{code:'ASC'}})
   : kind==='currencies' ? await AppDataSource.manager.find(MarketplaceCurrency,{order:{code:'ASC'}})
    : await AppDataSource.manager.find(PaymentMethodConfig,{order:{code:'ASC'}})}));
  app.post(`/admin/${kind}`,{preHandler:requirePermission(permission),schema:{...base,summary:`Create ${kind} configuration`,response:{201:dataResponse[200]},body:{type:'object',additionalProperties:false,required:kind==='payment-methods'?['code','displayName','supportedCurrencies']:['code','name'],properties}}},async(request,reply)=>reply.code(201).send(await mutateCatalog(kind,request.dbAdmin!.id,undefined,schema.parse(request.body))));
  for(const statusOnly of [false,true])app.patch<{Params:{id:string}}>(`/admin/${kind}/:id${statusOnly?'/status':''}`,{preHandler:requirePermission(permission),schema:{...base,summary:`Update ${kind}${statusOnly?' status':''}`,params:{type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}},body:{type:'object',additionalProperties:false,...(statusOnly?{required:['status']}:{}),properties:statusOnly?{status:properties.status}:properties},response:dataResponse}},async request=>mutateCatalog(kind,request.dbAdmin!.id,request.params.id,statusOnly?z.object({status}).strict().parse(request.body):schema.partial().parse(request.body)));
 }
}
