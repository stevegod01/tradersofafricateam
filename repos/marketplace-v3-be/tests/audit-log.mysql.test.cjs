require('./after-sales-env.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {AppDataSource:ds}=require('../dist/database/data-source');
const {AuditLog}=require('../dist/database/entities/audit-log.entity');
const {AuditExport}=require('../dist/database/entities/audit-export.entity');
const {AdminAuditEvent}=require('../dist/database/entities/admin-audit-event.entity');
const {User}=require('../dist/database/entities/user.entity');
const {Payment}=require('../dist/database/entities/payment.entity');
const {writeAudit,auditContext}=require('../dist/modules/audit-log/audit-log.writer');
const {auditedUpdate}=require('../dist/modules/audit-log/audit-log.mutations');
const {auditFilters,listAudit,processAuditExport,ownedExport}=require('../dist/modules/audit-log/audit-log.service');
const socket=process.env.AFTER_SALES_TEST_SOCKET;
test('MySQL audit migration, atomic writes, authorization and protected exports',{skip:!socket},async t=>{
 assert.ok(/^\/(?:private\/)?tmp\/tofa-after-sales-mysql-/.test(socket));
 const dbName=`audit_test_${process.pid}_${Date.now()}`;
 const root=await require('mysql2/promise').createConnection({socketPath:socket,user:'root'});
 await root.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
 const options={password:'',socketPath:socket,database:dbName,extra:{socketPath:socket,connectionLimit:10},logging:false};
 ds.setOptions(options);Object.assign(ds.driver.options,options);ds.driver.database=dbName;
 try{
  await ds.initialize();await ds.runMigrations({transaction:'each'});
  assert.equal((await ds.runMigrations({transaction:'each'})).length,0);
  const user=await ds.manager.save(User,ds.manager.create(User,{email:`${randomUUID()}@example.com`,firstName:'Test',lastName:'User',status:'active',userType:'buyer'}));
  await t.test('signup records actor snapshot and account deletion preserves history',async()=>{
   const log=await ds.manager.findOneByOrFail(AuditLog,{eventCode:'USER_SIGNUP',entityId:user.id});assert.equal(log.actorEmail,user.email);
   await auditedUpdate(ds.getRepository(User),user.id,{status:'deleted'});
   assert.equal(await ds.manager.countBy(AuditLog,{id:log.id}),1);
   assert.equal(await ds.manager.countBy(AuditLog,{eventCode:'USER_ACCOUNT_DELETED',entityId:user.id}),1);
  });
  await t.test('business and source audit roll back together',async()=>{
   const id=randomUUID();
   await assert.rejects(ds.transaction(async tx=>{
    await tx.save(AdminAuditEvent,tx.create(AdminAuditEvent,{id,eventType:'ADMIN_CREATED',metadata:{passwordHash:'never-log'}}));throw new Error('rollback');
   }),/rollback/);
   assert.equal(await ds.manager.countBy(AuditLog,{eventId:`admin_audit_events:${id}`}),0);
   assert.equal(await ds.manager.countBy(AdminAuditEvent,{id}),0);
  });
  await t.test('audit write failure prevents payment state commit',async()=>{
   const payment=await ds.manager.save(Payment,ds.manager.create(Payment,{paymentReference:`PAY-${randomUUID()}`,payerId:user.id,sourceType:'checkout',sourceId:randomUUID(),purpose:'marketplace_purchase',description:'Test',amount:'15.00',currency:'USD',paymentMethod:'bank_transfer',status:'pending'}));
   const subscriber={beforeInsert(event){if(event.metadata.tableName==='audit_logs')throw new Error('injected audit failure');}};
   ds.subscribers.push(subscriber);
   try {await assert.rejects(auditedUpdate(ds.getRepository(Payment),payment.id,{status:'confirmed'}),/injected audit failure/);}finally{ds.subscribers.splice(ds.subscribers.indexOf(subscriber),1);}
   assert.equal((await ds.manager.findOneByOrFail(Payment,{id:payment.id})).status,'pending');
   await auditedUpdate(ds.getRepository(Payment),payment.id,{status:'confirmed'});
   assert.equal(await ds.manager.countBy(AuditLog,{entityId:payment.id,eventCode:'PAYMENT_SUCCESSFUL'}),1);
  });
  await t.test('event IDs are idempotent and audit updates and deletes fail',async()=>{
   const input={eventId:randomUUID(),eventCode:'TEST_EVENT',module:'test'};await writeAudit(ds.manager,input);await writeAudit(ds.manager,input);
   const log=await ds.manager.findOneByOrFail(AuditLog,{eventId:input.eventId});assert.equal(await ds.manager.countBy(AuditLog,{eventId:input.eventId}),1);
   await assert.rejects(ds.manager.update(AuditLog,log.id,{description:'tamper'}),/append-only/);
   await assert.rejects(ds.manager.delete(AuditLog,log.id),/append-only/);
  });
  await t.test('filtered pagination and chronological entity history',async()=>{
   const result=await listAudit(ds.manager,auditFilters.parse({entityId:user.id,limit:1}),true);
   assert.equal(result.data.length,1);assert.ok(result.pagination.total>=2);assert.equal(result.data[0].eventCode,'USER_SIGNUP');
   const literal=await listAudit(ds.manager,auditFilters.parse({search:'%'}));assert.equal(literal.pagination.total,0);
  });
  await t.test('export is durable, owner-only, expiring and audited',async()=>{
   const adminId=randomUUID();const job=await ds.manager.save(AuditExport,ds.manager.create(AuditExport,{adminId,status:'processing',filters:{module:'test'},expiresAt:new Date(Date.now()+60000)}));
   await ds.transaction(tx=>processAuditExport(tx,job));
   const done=await ownedExport(ds.manager,job.id,adminId,true);assert.equal(done.status,'completed');assert.ok(done.content.includes('TEST_EVENT'));
   assert.equal(await ds.manager.countBy(AuditLog,{eventCode:'AUDIT_LOG_EXPORTED',entityId:job.id}),1);
   await assert.rejects(ownedExport(ds.manager,job.id,randomUUID()),/not found/);
   await ds.manager.update(AuditExport,job.id,{expiresAt:new Date(Date.now()-3600000)});
   await assert.rejects(ownedExport(ds.manager,job.id,adminId),/expired/);
  });
  await t.test('HTTP permissions are separate and denied access is recorded',async()=>{
   const {Admin}=require('../dist/database/entities/admin.entity');
   const admin=await ds.manager.save(Admin,ds.manager.create(Admin,{email:`${randomUUID()}@example.com`,firstName:'Audit',lastName:'Admin',status:'active',isSuperAdmin:false,authVersion:0}));
   const app=await require('../dist/app').buildApp();
   try{
    const token=app.jwt.sign({sub:admin.id,tokenType:'admin',authVersion:0});
    const headers={authorization:`Bearer ${token}`};
    assert.equal((await app.inject({url:'/api/admin/audit-logs',headers})).statusCode,403);
    const denied=await ds.manager.findOneByOrFail(AuditLog,{eventCode:'ADMIN_PERMISSION_DENIED',actorId:admin.id});assert.equal(denied.metadata.requiredPermission,'audit_logs.view');assert.ok(denied.requestId);
    const {AdminRoleEntity}=require('../dist/database/entities/admin-role.entity');
    const {AdminRolePermission}=require('../dist/database/entities/admin-role-permission.entity');
    const {Permission}=require('../dist/database/entities/permission.entity');
    const role=await ds.manager.save(AdminRoleEntity,ds.manager.create(AdminRoleEntity,{name:`Auditor-${randomUUID()}`,status:'active'}));
    const permission=await ds.manager.findOneByOrFail(Permission,{code:'audit_logs.view'});
    await ds.manager.save(AdminRolePermission,ds.manager.create(AdminRolePermission,{roleId:role.id,permissionId:permission.id}));
    await ds.manager.update(Admin,admin.id,{roleId:role.id});
    assert.equal((await app.inject({url:'/api/admin/audit-logs?limit=1',headers})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:'/api/admin/audit-logs/export',headers,payload:{format:'csv',filters:{}}})).statusCode,403);
    await ds.manager.update(Admin,admin.id,{isSuperAdmin:true});
    assert.equal((await app.inject({url:'/api/admin/audit-logs?limit=1',headers})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:'/api/admin/audit-logs/export',headers,payload:{format:'csv',filters:{module:'test'}}})).statusCode,202);
   }finally{await app.close();}
  });
 }finally{if(ds.isInitialized)await ds.destroy();await root.query(`DROP DATABASE \`${dbName}\``);await root.end();}
});
