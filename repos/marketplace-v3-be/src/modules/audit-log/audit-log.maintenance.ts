import { AppDataSource } from '../../database/data-source';
import { AuditLogSubscriber, auditSources } from './audit-log.subscriber';
import { InsertEvent, ObjectLiteral } from 'typeorm';

/** Explicit operator command. Never runs automatically or changes legacy history. */
async function main():Promise<void> {
 const backfill=process.argv.includes('--backfill');
 await AppDataSource.initialize();
 try {
  const subscriber=new AuditLogSubscriber();
  for(const table of Object.keys(auditSources)) {
   let cursor='';let missing=0;
   while(true) {
    // Table names come exclusively from the fixed source registry, never user input.
    const rows=await AppDataSource.query(`SELECT source.* FROM \`${table}\` source LEFT JOIN audit_logs audit ON audit.eventId = CONCAT(?,source.id) WHERE source.id > ? AND audit.id IS NULL ORDER BY source.id LIMIT 250`,[`${table}:`,cursor]);
    if(!rows.length)break;
    for(const row of rows) {
     cursor=row.id;
     const code=row.eventType ?? row.action ?? '';
     if((table==='admin_audit_events' && /^(CANCELLATION|RETURN|REFUND|TRANSACTION_FEE|FINANCIAL_ADJUSTMENT)_/.test(code)) || (table==='direct_rfq_audit_events' && code==='RFQ_VIEWED'))continue;
     missing++;
     if(backfill)await AppDataSource.transaction(async manager=>subscriber.afterInsert({manager,metadata:AppDataSource.getMetadata(table),entity:row} as InsertEvent<ObjectLiteral>));
    }
   }
   console.log(JSON.stringify({table,missing,backfilled:backfill?missing:0}));
  }
 }finally{await AppDataSource.destroy();}
}
main().catch(()=>{console.error('Audit maintenance failed; inspect database connectivity and audit table permissions.');process.exitCode=1;});
