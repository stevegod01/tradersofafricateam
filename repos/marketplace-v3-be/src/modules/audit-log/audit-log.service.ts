import { auditConfig } from './audit-log.config';
import { z } from 'zod';
import { EntityManager } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AuditExport } from '../../database/entities/audit-export.entity';
import { createError } from '../../common/utils/http-error.util';
import { writeAudit } from './audit-log.writer';

const date=z.string().max(30).refine(v=>/^\d{4}-\d{2}-\d{2}(T.*Z)?$/.test(v)&&Number.isFinite(Date.parse(v)),'Invalid ISO date');
export const auditFilters=z.object({search:z.string().trim().max(120).optional(),eventCode:z.string().max(120).optional(),actorId:z.string().uuid().optional(),actorType:z.enum(['user','admin','system']).optional(),module:z.string().max(80).optional(),action:z.string().max(120).optional(),entityType:z.string().max(80).optional(),entityId:z.string().uuid().optional(),dateFrom:date.optional(),dateTo:date.optional(),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict().refine(v=>!v.dateFrom||!v.dateTo||Date.parse(v.dateFrom)<=Date.parse(v.dateTo),'dateFrom must precede dateTo');
export type AuditFilters=z.infer<typeof auditFilters>;
export function auditQuery(manager:EntityManager,filters:AuditFilters) {
 const q=manager.getRepository(AuditLog).createQueryBuilder('audit');
 for(const key of ['eventCode','actorId','actorType','module','action','entityType','entityId'] as const) if(filters[key]) q.andWhere(`audit.${key} = :${key}`,{[key]:filters[key]});
 if(filters.dateFrom) q.andWhere('audit.createdAt >= :dateFrom',{dateFrom:new Date(filters.dateFrom)});
 if(filters.dateTo) {
  const end=new Date(filters.dateTo); if(filters.dateTo.length===10) end.setUTCDate(end.getUTCDate()+1);
  q.andWhere(`audit.createdAt ${filters.dateTo.length===10?'<':'<='} :dateTo`,{dateTo:end});
 }
 if(filters.search) q.andWhere("(audit.eventCode LIKE :search ESCAPE '!' OR audit.description LIKE :search ESCAPE '!' OR audit.actorEmail LIKE :search ESCAPE '!')",{search:`%${filters.search.replace(/[!%_]/g,'!$&')}%`});
 return q;
}
export function auditResponse(log:AuditLog,detail=false) {
 const {id,eventCode,module,action,description,metadata,ipAddress,createdAt}=log;
 return {id,eventCode,actor:{id:log.actorId,type:log.actorType,email:log.actorEmail},module,action,entity:{type:log.entityType,id:log.entityId},description,metadata,ipAddress,createdAt,...(detail?{reason:log.reason,oldValue:log.oldValue,newValue:log.newValue,userAgent:log.userAgent,requestId:log.requestId}:{})};
}
export async function listAudit(manager:EntityManager,filters:AuditFilters,chronological=false) {
 const [rows,total]=await auditQuery(manager,filters).orderBy('audit.createdAt',chronological?'ASC':'DESC').addOrderBy('audit.id',chronological?'ASC':'DESC').skip((filters.page-1)*filters.limit).take(filters.limit).getManyAndCount();
 return {success:true,data:rows.map(row=>auditResponse(row)),pagination:{page:filters.page,limit:filters.limit,total,totalPages:Math.ceil(total/filters.limit)}};
}
export function csvCell(value:unknown):string {
 let text=value==null?'':value instanceof Date?value.toISOString():typeof value==='object'?JSON.stringify(value):String(value);
 let first=0; while(first<text.length && (/\s/u.test(text[first]) || text.charCodeAt(first)<=31)) first++;
 if('=+@-'.includes(text[first] ?? '')) text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export async function processAuditExport(manager:EntityManager,job:AuditExport):Promise<void> {
 const filters=auditFilters.parse(job.filters);
 const rows=await auditQuery(manager,filters).andWhere('audit.createdAt <= (SELECT createdAt FROM audit_exports WHERE id = :jobId)',{jobId:job.id}).orderBy('audit.createdAt','ASC').addOrderBy('audit.id','ASC').take(auditConfig.exportMaxRows+1).getMany();
 if(rows.length>auditConfig.exportMaxRows) { await manager.update(AuditExport,job.id,{status:'failed',error:`Export exceeds ${auditConfig.exportMaxRows} rows. Narrow the date range.`}); return; }
 const keys=['id','eventCode','actorId','actorType','actorEmail','module','action','entityType','entityId','description','oldValue','newValue','metadata','ipAddress','requestId','createdAt'] as const;
 const content='\uFEFF'+[keys.map(csvCell).join(','),...rows.map(row=>keys.map(key=>csvCell(row[key])).join(','))].join('\r\n');
 await writeAudit(manager,{eventId:`audit-export:${job.id}`,eventCode:'AUDIT_LOG_EXPORTED',module:'audit_logs',actorType:'admin',actorId:job.adminId,entityType:'audit_export',entityId:job.id,metadata:{reportId:job.id,format:'csv',count:rows.length}});
 await manager.update(AuditExport,job.id,{status:'completed',content});
}
export async function ownedExport(manager:EntityManager,id:string,adminId:string,content=false) {
 const q=manager.getRepository(AuditExport).createQueryBuilder('job').where('job.id = :id AND job.adminId = :adminId',{id,adminId});
 if(content) q.addSelect('job.content');
 const job=await q.getOne();
 if(!job) throw createError.notFound('Audit export not found');
 if(job.expiresAt<=new Date()) throw createError.notFound('Audit export expired');
 return job;
}
