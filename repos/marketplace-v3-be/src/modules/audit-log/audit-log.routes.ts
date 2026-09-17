import { CsvDownloadResponse } from '../../common/utils/swagger-contracts';
import { getSetting } from '../system-settings/settings.reader';
import { auditListResponse,auditDetailResponse } from './audit-log.schemas';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AuditExport } from '../../database/entities/audit-export.entity';
import { requirePermission } from '../../common/middleware/auth.middleware';
import { createError } from '../../common/utils/http-error.util';
import { auditFilters,auditResponse,listAudit,ownedExport,processAuditExport } from './audit-log.service';
import { auditContext,writeAudit } from './audit-log.writer';

const filterProperties={search:{type:'string',maxLength:120},eventCode:{type:'string',maxLength:120},actorId:{type:'string',format:'uuid'},actorType:{type:'string',enum:['user','admin','system']},module:{type:'string',maxLength:80},action:{type:'string',maxLength:120},entityType:{type:'string',maxLength:80},entityId:{type:'string',format:'uuid'},dateFrom:{type:'string',description:'Inclusive ISO date or UTC timestamp'},dateTo:{type:'string',description:'Inclusive date or UTC timestamp'},page:{type:'integer',minimum:1,maximum:10000,default:1},limit:{type:'integer',minimum:1,maximum:100,default:25}};
const querystring={type:'object',additionalProperties:false,properties:filterProperties};
const base={tags:['Audit Logs'],security:[{bearerAuth:[]}]};
const params=(properties:Record<string,unknown>)=>({type:'object',required:Object.keys(properties),properties});
const uuid={type:'string',format:'uuid'};
const exportResponse = { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' }, data: { type: 'object', properties: { reportId: uuid, status: { type: 'string', enum: ['processing', 'completed', 'failed'] }, error: { type: 'string', nullable: true }, expiresAt: { type: 'string', format: 'date-time' } } } } };

export function registerAuditContext(app:FastifyInstance):void {
 app.addHook('onRequest',(request,_reply,done)=>auditContext.run({requestId:request.id,ipAddress:request.ip,userAgent:request.headers['user-agent']},done));
 app.addHook('preHandler',async request=>{
  const context=auditContext.getStore();
  if(context && (request.dbAdmin || request.dbUser)) Object.assign(context,{actorId:request.dbAdmin?.id ?? request.dbUser?.id,actorType:request.dbAdmin?'admin':'user',actorEmail:request.dbAdmin?.email ?? request.dbUser?.email});
 });
}
export async function auditLogRoutes(app:FastifyInstance):Promise<void> {
 const manager=()=>AppDataSource.manager;
 app.get('/admin/audit-logs',{preHandler:requirePermission('audit_logs.view'),schema:{...base,summary:'Search central audit history (audit_logs.view)',response:auditListResponse,querystring}},async request=>listAudit(manager(),auditFilters.parse(request.query)));
 app.get<{Params:{entityType:string;entityId:string}}>('/admin/audit-logs/entity/:entityType/:entityId',{preHandler:requirePermission('audit_logs.view'),schema:{...base,summary:'Chronological entity history',response:auditListResponse,querystring,params:params({entityType:{type:'string',maxLength:80},entityId:uuid})}},async request=>listAudit(manager(),auditFilters.parse({...request.query as object,...request.params}),true));
 app.get<{Params:{adminId:string}}>('/admin/audit-logs/admin/:adminId',{preHandler:requirePermission('audit_logs.view'),schema:{...base,summary:'Admin activity history',response:auditListResponse,querystring,params:params({adminId:uuid})}},async request=>listAudit(manager(),auditFilters.parse({...request.query as object,actorId:request.params.adminId,actorType:'admin'})));
 app.get<{Params:{auditLogId:string}}>('/admin/audit-logs/:auditLogId',{preHandler:requirePermission('audit_logs.view'),schema:{...base,summary:'Audit event details',response:auditDetailResponse,params:params({auditLogId:uuid})}},async request=>{
  const row=await manager().findOneBy(AuditLog,{id:request.params.auditLogId});if(!row)throw createError.notFound('Audit log not found');return {success:true,data:auditResponse(row,true)};
 });
 app.post('/admin/audit-logs/export',{preHandler:requirePermission('audit_logs.export'),schema:{...base,summary:'Queue protected CSV export (audit_logs.export)',response:{202:exportResponse},body:{type:'object',additionalProperties:false,required:['format','filters'],properties:{format:{type:'string',enum:['csv']},filters:querystring}}}},async(request,reply)=>{
  const body=z.object({format:z.literal('csv'),filters:auditFilters}).strict().parse(request.body);
  const job=await manager().transaction(async tx=>{
   const pending=await tx.countBy(AuditExport,{adminId:request.dbAdmin!.id,status:'processing'});
   if(pending>=3)throw createError.tooManyRequests('Wait for pending audit exports to finish');
   const result=await tx.save(AuditExport,tx.create(AuditExport,{adminId:request.dbAdmin!.id,filters:body.filters,status:'processing',expiresAt:new Date(Date.now()+(await getSetting<number>('auditExportExpiryMinutes',tx))*60000)}));
   await writeAudit(tx,{eventCode:'AUDIT_LOG_EXPORT_REQUESTED',module:'audit_logs',actorType:'admin',actorId:request.dbAdmin!.id,entityType:'audit_export',entityId:result.id,metadata:{format:'csv'}});return result;
  });
  return reply.code(202).send({success:true,message:'Audit log export is being prepared.',data:{reportId:job.id,status:job.status}});
 });
 for(const download of [false,true]) app.get<{Params:{reportId:string}}>(`/admin/audit-logs/exports/:reportId${download?'/download':''}`,{preHandler:requirePermission('audit_logs.export'),schema:{...base,summary:download?'Download owned, unexpired audit export':'Get audit export status',response:download?CsvDownloadResponse:{200:exportResponse},params:params({reportId:uuid})}},async(request,reply)=>{
  const job=await ownedExport(manager(),request.params.reportId,request.dbAdmin!.id,download);
  reply.header('Cache-Control','no-store');
  if(!download)return {success:true,data:{reportId:job.id,status:job.status,error:job.error,expiresAt:job.expiresAt}};
  if(job.status!=='completed')throw createError.conflict('Audit export is not ready');
  return reply.header('Content-Disposition',`attachment; filename="audit-${job.id}.csv"`).type('text/csv; charset=utf-8').send(job.content);
 });
 let running=false;
 const timer=setInterval(async()=>{
  if(running || !AppDataSource.isInitialized)return;running=true;
  let attemptedJobId:string|undefined;
  try {
   await manager().transaction(async tx=>{
    const job=await tx.getRepository(AuditExport).createQueryBuilder('job').where('job.status = :status AND job.expiresAt > :now',{status:'processing',now:new Date()}).orderBy('job.createdAt','ASC').setLock('pessimistic_write').setOnLocked('skip_locked').getOne();
    if(job){attemptedJobId=job.id;await processAuditExport(tx,job);}
   });
   await manager().createQueryBuilder().delete().from(AuditExport).where('expiresAt < :now',{now:new Date()}).execute();
  }catch {
   app.log.error({code:'AUDIT_EXPORT_FAILED'},'Audit export worker failed');
   if(attemptedJobId)try {await manager().transaction(async tx=>{
    const job=await tx.findOne(AuditExport,{where:{id:attemptedJobId,status:'processing'},lock:{mode:'pessimistic_write'}});
    if(job)await tx.update(AuditExport,job.id,{attempts:job.attempts+1,...(job.attempts>=2?{status:'failed',error:'Export failed after three attempts. Request a new export.'}:{})});
   });}catch{app.log.error({code:'AUDIT_EXPORT_RETRY_FAILED'},'Unable to record export retry');}
  }finally{running=false;}
 },5000);timer.unref();
 app.addHook('onClose',async()=>{clearInterval(timer);});
}
