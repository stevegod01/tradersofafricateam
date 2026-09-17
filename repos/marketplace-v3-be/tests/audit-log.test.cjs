require('./after-sales-env.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const {safeAuditValue,safeAuditReason,auditContext,writeAudit}=require('../dist/modules/audit-log/audit-log.writer');
const {csvCell,auditFilters}=require('../dist/modules/audit-log/audit-log.service');
const {AuditLogSubscriber}=require('../dist/modules/audit-log/audit-log.subscriber');

test('audit allowlist excludes credentials, attachments, messages and provider payloads',()=>{
 const input={amount:'125.50',currency:'NGN',passwordHash:'sensitive',otp:'123456',accessToken:'secret',rawPayload:{amount:123,token:'secret'},message:'private',fileUrl:'https://private',fileId:'file-reference',nested:{password:'secret'}};
 assert.deepEqual(safeAuditValue(input),{amount:'125.50',currency:'NGN',fileId:'file-reference'});
 assert.equal(safeAuditValue(null),null);
 assert.equal(safeAuditValue({amount:Infinity}),null);
 assert.ok(!safeAuditReason('token=top-secret reason').includes('top-secret'));
});
test('CSV neutralizes spreadsheet formula injection and escapes quoted multiline data',()=>{
 for(const input of ['=SUM(A1:A2)',' +cmd','\t@foo','-cmd'])assert.ok(csvCell(input).startsWith('"\''));
 assert.equal(csvCell('a"b\nc'),'"a""b\nc"');
});
test('filters reject invalid dates, reversed ranges, unbounded limits and unknown fields',()=>{
 for(const filters of [{limit:100000},{page:0},{dateFrom:'not-date'},{dateFrom:'2026-09-08',dateTo:'2026-09-01'},{password:'x'}]) assert.equal(auditFilters.safeParse(filters).success,false);
 assert.equal(auditFilters.parse({limit:'20'}).limit,20);
});
test('request audit context is isolated across concurrent requests',async()=>{
 const saved=[];const manager={create:(_,value)=>value,save:async(_,value)=>saved.push(value)};
 await Promise.all(['first','second'].map(actorId=>auditContext.run({actorId,actorType:'admin',actorEmail:`${actorId}@example.com`,requestId:actorId},async()=>{
  await new Promise(resolve=>setTimeout(resolve,actorId==='first'?10:1));
  await writeAudit(manager,{module:'test',eventCode:'TEST_UPDATED'});
 })));
 assert.deepEqual(saved.map(v=>[v.actorId,v.requestId]).sort(),[['first','first'],['second','second']]);
});
test('audit entity update, delete and soft-delete operations are rejected',()=>{
 const subscriber=new AuditLogSubscriber(),event={metadata:{tableName:'audit_logs'}};
 for(const method of ['beforeUpdate','beforeRemove','beforeSoftRemove'])assert.throws(()=>subscriber[method](event),/append-only/);
});
test('bridge uses transaction manager, stable source event ID and sanitized snapshots',async()=>{
 const rows=[];const manager={create:(_,v)=>v,save:async(_,v)=>rows.push(v)};
 await new AuditLogSubscriber().afterInsert({manager,metadata:{tableName:'after_sales_events'},entity:{id:'event-id',eventType:'REFUND_SUCCESSFUL',entityId:'refund-id',actorId:'system-id',actorType:'system',payload:{amount:'5.00',currency:'USD',password:'no'}}});
 assert.equal(rows[0].eventId,'after_sales_events:event-id');assert.equal(rows[0].actorId,null);assert.equal(rows[0].metadata.password,undefined);
});
test('audit routes appear in OpenAPI and reject unauthenticated readers and exporters',async()=>{
 const {config}=require('../dist/config');config.isDev=true;
 const app=await require('../dist/app').buildApp();
 try {await app.ready();const paths=app.swagger().paths;
  for(const path of ['/api/admin/audit-logs','/api/admin/audit-logs/{auditLogId}','/api/admin/audit-logs/entity/{entityType}/{entityId}','/api/admin/audit-logs/admin/{adminId}','/api/admin/audit-logs/export'])assert.ok(paths[path],path);
  assert.equal((await app.inject('/api/admin/audit-logs')).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/audit-logs/export',payload:{format:'csv',filters:{}}})).statusCode,401);
  assert.equal((await app.inject({method:'DELETE',url:'/api/admin/audit-logs/00000000-0000-4000-8000-000000000001'})).statusCode,404);
 }finally{await app.close();}
});
