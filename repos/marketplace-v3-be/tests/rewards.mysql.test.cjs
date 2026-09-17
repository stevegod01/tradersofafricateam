require('./after-sales-env.cjs');
const test=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {AppDataSource:ds}=require('../dist/database/data-source');
const {User}=require('../dist/database/entities/user.entity');
const {Referral}=require('../dist/database/entities/referral.entity');
const {RewardRule}=require('../dist/database/entities/reward-rule.entity');
const {RewardSetting}=require('../dist/database/entities/reward-setting.entity');
const {PointsTransaction}=require('../dist/database/entities/points-transaction.entity');
const {RewardService}=require('../dist/modules/reward/reward.service');
const socket=process.env.REWARDS_TEST_SOCKET;
test('isolated MySQL referral lifecycle, concurrency and ledger migration',{skip:!socket},async t=>{
 assert.match(socket,/^\/(?:private\/)?tmp\/tofa-rewards-mysql-[A-Za-z0-9]+\/mysql.sock$/);
 const root=await require('mysql2/promise').createConnection({socketPath:socket,user:'root'});
 const database=`rewards_test_${process.pid}_${Date.now()}`;
 await root.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
 const options={password:'',socketPath:socket,database,extra:{socketPath:socket,connectionLimit:10},logging:false};ds.setOptions(options);Object.assign(ds.driver.options,options);ds.driver.database=database;
 const service=new RewardService();
 const user=async()=>ds.manager.save(User,ds.manager.create(User,{email:`${randomUUID()}@example.com`,firstName:'Test',lastName:'User',status:'active',referralCode:randomUUID().replace(/-/g,'').slice(0,12).toUpperCase(),termsOfUse:true,isEmailVerified:true}));
 const attribute=async(referrer)=>ds.transaction(async m=>{const u=await m.save(User,m.create(User,{email:`${randomUUID()}@example.com`,firstName:'Referred',lastName:'User',status:'active',referralCode:randomUUID().slice(0,8),referral:referrer.referralCode}));await service.attribute(m,u);return u;});
 try{
  await ds.initialize();
  const migrations=ds.migrations;
  ds.migrations=migrations.filter(m=>m.name!=='AddReferralRewards1787520020000');
  await ds.runMigrations({transaction:'each'});
  const legacyOwner=await user(),legacyReferred=await user();
  await ds.manager.update(User,legacyOwner.id,{totalPoints:20});
  await ds.manager.update(User,legacyReferred.id,{referral:legacyOwner.referralCode.toLowerCase()});
  ds.migrations=migrations;
  await assert.rejects(ds.runMigrations({transaction:'each'}),/requires reconciliation/);
  assert.equal((await ds.manager.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='referrals'"))[0].n,'0');
  const legacyId=randomUUID();
  await ds.manager.query("INSERT INTO points_transactions (id,userId,type,points,sourceType,sourceId,rewardType,description,balanceAfter) VALUES (?,?,'adjusted',20,'admin_adjustment',?,'admin_adjustment','Legacy test credit',20)",[legacyId,legacyOwner.id,randomUUID()]);
  ds.migrations=migrations;
  await ds.runMigrations({transaction:'each'});
  const migrated=await ds.manager.findOneByOrFail(PointsTransaction,{id:legacyId});
  assert.equal(migrated.points,20);assert.equal(migrated.balanceBefore,0);assert.equal(migrated.transactionType,'credit');
  assert.equal((await ds.manager.findOneByOrFail(Referral,{referredUserId:legacyReferred.id})).status,'pending');
  assert.equal((await ds.runMigrations({transaction:'each'})).length,0);
  const referrer=await user();const referred=await attribute(referrer);
  await t.test('attribution is unique and wrong event cannot qualify',async()=>{
   await ds.transaction(m=>service.attribute(m,referred));assert.equal(await ds.manager.countBy(Referral,{referredUserId:referred.id}),1);
   await ds.transaction(m=>service.qualify(m,referred.id,'email_verified'));
   assert.equal((await ds.manager.findOneByOrFail(Referral,{referredUserId:referred.id})).status,'pending');
  });
  await t.test('concurrent qualification awards once with atomic balance and notification',async()=>{
   await Promise.all([1,2,3].map(()=>ds.transaction(m=>service.qualify(m,referred.id,'company_verified'))));
   assert.equal(await ds.manager.countBy(PointsTransaction,{userId:referrer.id}),1);
   assert.equal((await ds.manager.findOneByOrFail(User,{id:referrer.id})).totalPoints,30);
   assert.equal((await ds.manager.findOneByOrFail(Referral,{referredUserId:referred.id})).status,'rewarded');
   const tx=await ds.manager.findOneByOrFail(PointsTransaction,{userId:referrer.id});assert.equal(tx.balanceBefore,0);assert.equal(tx.balanceAfter,30);
   assert.equal(Number((await ds.manager.query('SELECT COUNT(*) AS n FROM reward_notification_outbox WHERE transactionId=?',[tx.id]))[0].n),1);
  });
  await t.test('invalidation creates one debit and cannot requalify',async()=>{
   const r=await ds.manager.findOneByOrFail(Referral,{referredUserId:referred.id});
   await service.invalidate(r.id,'Confirmed duplicate business',undefined);await service.invalidate(r.id,'Confirmed duplicate business',undefined);
   assert.equal((await ds.manager.findOneByOrFail(User,{id:referrer.id})).totalPoints,0);
   assert.equal(await ds.manager.countBy(PointsTransaction,{userId:referrer.id}),2);
   await ds.transaction(m=>service.qualify(m,referred.id,'company_verified'));
   assert.equal(await ds.manager.countBy(PointsTransaction,{userId:referrer.id}),2);
  });
  await t.test('per-owner cap survives concurrent different referrals',async()=>{
   const owner=await user(),a=await attribute(owner),b=await attribute(owner);
   await ds.manager.update(RewardRule,{eventCode:'REFERRAL_QUALIFIED'},{maxPerUser:1});
   await Promise.all([a,b].map(u=>ds.transaction(m=>service.qualify(m,u.id,'company_verified'))));
   assert.equal(await ds.manager.countBy(PointsTransaction,{userId:owner.id}),1);
   assert.equal((await ds.manager.findOneByOrFail(User,{id:owner.id})).totalPoints,30);
  });
  await t.test('duplicate business does not receive referral points',async()=>{
   const owner=await user(),u=await attribute(owner);
   await ds.manager.update(User,owner.id,{registrationNumber:' SAME '});await ds.manager.update(User,u.id,{registrationNumber:'same'});
   await ds.transaction(m=>service.qualify(m,u.id,'company_verified'));
   assert.equal((await ds.manager.findOneByOrFail(Referral,{referredUserId:u.id})).status,'invalid');
  });
  await t.test('trade awards both parties once and refund creates compensating debits',async()=>{
   await ds.manager.update(RewardRule,{eventCode:'SUCCESSFUL_TRADE'},{status:'active'});
   await ds.manager.update(RewardSetting,{settingKey:'referral_reward_policy'},{settingValue:{referralQualificationEvent:'company_verified',tradeRewardBeneficiary:'both',reverseTradeRewardsOnRefund:true}});
   const buyer=await user(),seller=await user(),order={id:randomUUID(),buyerId:buyer.id,sellerId:seller.id};
   await ds.transaction(m=>service.completedTrade(m,order));await ds.transaction(m=>service.completedTrade(m,order));
   assert.equal(await ds.manager.countBy(PointsTransaction,{sourceId:order.id}),2);
   await ds.transaction(m=>service.refundedTrade(m,order));await ds.transaction(m=>service.refundedTrade(m,order));
   assert.equal(await ds.manager.countBy(PointsTransaction,{sourceId:order.id}),4);
   assert.equal((await ds.manager.findOneByOrFail(User,{id:buyer.id})).totalPoints,0);
  });
  await t.test('failed debit rolls back and ledger cannot be changed',async()=>{
   const u=await user();
   await assert.rejects(ds.transaction(m=>service.move(m,u,-10,'ADMIN_REWARD_ADJUSTMENT','admin_adjustment',randomUUID(),randomUUID(),'Invalid debit')));
   assert.equal(await ds.manager.countBy(PointsTransaction,{userId:u.id}),0);
   const tx=await ds.manager.findOneByOrFail(PointsTransaction,{userId:referrer.id});
   await assert.rejects(ds.manager.update(PointsTransaction,tx.id,{points:999}));
   await assert.rejects(ds.manager.delete(PointsTransaction,tx.id));
  });
  await t.test('review rewards preserve eligibility, image bonus, order cap and reversal',async()=>{
   const {ReviewService}=require('../dist/modules/review/review.service');const reviews=new ReviewService({});
   const owner=await user(),orderId=randomUUID();
   const base={buyerId:owner.id,orderId,reviewType:'product',reviewId:randomUUID(),comment:'A useful and detailed review of the product.',status:'published',basePoints:10,bonusPoints:5,settings:{minimumReviewCharacters:25,maxReviewRewardPerOrder:20}};
   assert.equal((await ds.transaction(m=>reviews.awardReviewPoints(m,{...base,comment:'short'}))).pointsAwarded,0);
   const results=await Promise.all([base,{...base,reviewId:randomUUID()}].map(input=>ds.transaction(m=>reviews.awardReviewPoints(m,input))));
   assert.equal(results.reduce((n,r)=>n+r.pointsAwarded,0),20);
   assert.equal((await ds.transaction(m=>reviews.awardReviewPoints(m,base))).pointsAwarded,0);
   await ds.transaction(m=>reviews.reverseReviewPoints(m,'product',base.reviewId,undefined,'Review was invalidated'));
   assert.equal(await ds.manager.countBy(PointsTransaction,{sourceId:base.reviewId}),2);
  });
  await t.test('manual adjustments are idempotent and key reuse is bound to payload',async()=>{
   const {Admin}=require('../dist/database/entities/admin.entity');const admin=await ds.manager.save(Admin,ds.manager.create(Admin,{email:`${randomUUID()}@example.com`,firstName:'Test',lastName:'Admin',status:'active'}));
   const owner=await user(),input={userId:owner.id,transactionType:'credit',points:50,reason:'Customer support adjustment'},key=randomUUID();
   await Promise.all([1,2].map(()=>service.adjust(admin.id,input,key)));
   assert.equal((await ds.manager.findOneByOrFail(User,{id:owner.id})).totalPoints,50);
   assert.equal((await ds.manager.findOneByOrFail(PointsTransaction,{userId:owner.id})).type,'adjusted');
   await assert.rejects(service.adjust(admin.id,{...input,points:51},key));
   await assert.rejects(service.adjust(admin.id,{...input,transactionType:'debit',points:51},randomUUID()));
  });
  await t.test('authenticated endpoints isolate owners and enforce admin permissions',async()=>{
   const {config}=require('../dist/config');config.isDev=true;
   const app=await require('../dist/app').buildApp();await app.ready();
   try {
    const token=app.jwt.sign({sub:referrer.id});
    const response=await app.inject({url:'/api/rewards/history',headers:{authorization:`Bearer ${token}`}});
    assert.equal(response.statusCode,200);assert.ok(response.json().data.every(r=>r.points>0 && !('userId' in r)));
    const forged=await app.inject({url:`/api/rewards/history?userId=${referred.id}`,headers:{authorization:`Bearer ${token}`}});assert.equal(forged.statusCode,200);assert.deepEqual(forged.json().data,response.json().data);
    const {Admin}=require('../dist/database/entities/admin.entity');const admin=await ds.manager.findOneByOrFail(Admin,{status:'active'});
    const denied=await app.inject({url:'/api/admin/reward-rules',headers:{authorization:`Bearer ${app.jwt.sign({sub:admin.id,tokenType:'admin',authVersion:0})}`}});assert.equal(denied.statusCode,403);
   }finally{await app.close();}
  });
  await t.test('notification outbox drains committed credits and deduplicates delivery',async()=>{
   const {registerRewardOutbox}=require('../dist/modules/reward/reward.outbox');let close;
   const drain=registerRewardOutbox({log:{error:err=>{throw err;}},addHook:(_name,fn)=>{close=fn;}});
   try {
    await drain();await drain();
    const rows=await ds.manager.query("SELECT transactionId FROM reward_notification_outbox WHERE deliveredAt IS NULL");assert.equal(rows.length,0);
    const duplicates=await ds.manager.query("SELECT deduplicationKey FROM notifications WHERE type='REWARD_POINTS_EARNED' GROUP BY deduplicationKey HAVING COUNT(*)>1");assert.equal(duplicates.length,0);
   }finally{await close();}
  });
  await t.test('failed business transaction cannot leave an award or notification',async()=>{
   const owner=await user(),sourceId=randomUUID();
   await assert.rejects(ds.transaction(async m=>{await service.award(m,owner.id,'SUCCESSFUL_TRADE','order',sourceId);throw new Error('Business event failed');}));
   assert.equal(await ds.manager.countBy(PointsTransaction,{userId:owner.id}),0);
   assert.equal((await ds.manager.findOneByOrFail(User,{id:owner.id})).totalPoints,0);
  });
  await t.test('raw SQL cannot edit or delete immutable history',async()=>{
   await assert.rejects(ds.manager.query('UPDATE reward_transactions SET points=100 WHERE id=?',[legacyId]));
   await assert.rejects(ds.manager.query('DELETE FROM reward_transactions WHERE id=?',[legacyId]));
  });
  await t.test('all balances reconcile with the single ledger',async()=>{
   const rows=await ds.manager.query('SELECT u.id FROM users u LEFT JOIN reward_transactions t ON t.userId=u.id GROUP BY u.id,u.totalPoints HAVING u.totalPoints <> COALESCE(SUM(t.points),0)');assert.equal(rows.length,0);
  });
 }finally{if(ds.isInitialized)await ds.destroy();await root.query(`DROP DATABASE \`${database}\``);await root.end();}
});
