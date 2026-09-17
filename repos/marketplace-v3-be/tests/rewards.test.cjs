require('./after-sales-env.cjs');
const test=require('node:test');const assert=require('node:assert/strict');
const {periodStart,checkedBalance,normalizeReferralCode,rewardPermissions}=require('../dist/modules/reward/reward.policy');
const {adjustment,ruleCreate,historyQuery}=require('../dist/modules/reward/reward.routes');
const {RewardLedgerSubscriber}=require('../dist/modules/reward/reward.subscriber');
const {RewardService,isUnsafeEmailReferralPolicy}=require('../dist/modules/reward/reward.service');
const {User}=require('../dist/database/entities/user.entity');
const {RewardRule}=require('../dist/database/entities/reward-rule.entity');
const {RewardSetting}=require('../dist/database/entities/reward-setting.entity');
const {PointsTransaction}=require('../dist/database/entities/points-transaction.entity');
test('UTC reward periods and balance bounds',()=>{
 const now=new Date('2026-09-09T23:59:59Z');
 assert.equal(periodStart('week',now).toISOString(),'2026-09-07T00:00:00.000Z');
 assert.equal(periodStart('month',now).toISOString(),'2026-09-01T00:00:00.000Z');
 assert.equal(periodStart('lifetime',now),null);
 assert.equal(checkedBalance(30,-30),0);
 for(const pair of [[0,-1],[2147483647,1],[10,1.2]])assert.throws(()=>checkedBalance(...pair));
 assert.equal(normalizeReferralCode(' abc123 '),'ABC123');
});
test('adjustments reject fractional, zero, oversized and extra privilege fields',()=>{
 const good={userId:'00000000-0000-4000-8000-000000000001',transactionType:'credit',points:30,reason:'Support adjustment'};
 assert.equal(adjustment.safeParse(good).success,true);
 for(const patch of [{points:0},{points:-1},{points:1.2},{points:1000001},{createdBy:good.userId},{transactionType:'earned'}])assert.equal(adjustment.safeParse({...good,...patch}).success,false);
 assert.equal(ruleCreate.safeParse({eventCode:'SIGNUP',name:'Signup',points:10}).success,false);
 assert.equal(historyQuery.safeParse({limit:101}).success,false);
});
test('email-verification referral rewards require a lifetime owner cap',()=>{
 const policy={referralQualificationEvent:'email_verified',tradeRewardBeneficiary:'buyer',reverseTradeRewardsOnRefund:false};
 const rule={eventCode:'REFERRAL_QUALIFIED',status:'active',points:30,maxPerUser:null};
 assert.equal(isUnsafeEmailReferralPolicy(policy,rule),true);
 assert.equal(isUnsafeEmailReferralPolicy(policy,{...rule,maxPerUser:5}),false);
 assert.equal(isUnsafeEmailReferralPolicy({...policy,referralQualificationEvent:'company_verified'},rule),false);
 assert.equal(isUnsafeEmailReferralPolicy(policy,{...rule,status:'inactive'}),false);
});
test('legacy signed ledger writes receive canonical fields and remain immutable',()=>{
 const subscriber=new RewardLedgerSubscriber();
 const row={points:-10,balanceAfter:20,userId:'u',sourceId:'r',rewardType:'review_reversal'};
 subscriber.beforeInsert({entity:row});
 assert.equal(row.balanceBefore,30);assert.equal(row.transactionType,'debit');assert.equal(row.eventCode,'REVIEW_REWARD_REVERSED');
 assert.throws(()=>subscriber.beforeUpdate({}));assert.throws(()=>subscriber.beforeRemove({}));assert.throws(()=>subscriber.beforeSoftRemove({}));
});
test('duplicate event returns existing award before evaluating changed rule',async()=>{
 const previous={id:'original',points:30};let ruleRead=false;
 const manager={findOne:async(type,options)=>{if(type===PointsTransaction)return previous;assert.equal(type,User);assert.equal(options.lock.mode,'pessimistic_write');return {id:'u',status:'active'};},findOneBy:async(type)=>{if(type===PointsTransaction)return previous;if(type===RewardRule)ruleRead=true;}};
 assert.equal(await new RewardService().award(manager,'u','REFERRAL_QUALIFIED','referral','r'),previous);
 assert.equal(ruleRead,false);
});
test('cap exhaustion prevents a points movement',async()=>{
 const query={where(){return this;},setLock(){return this;},clone(){return this;},async getCount(){return 2;}};
 const manager={findOne:async type=>type===User?({id:'u',status:'active'}):type===RewardRule?{eventCode:'REFERRAL_QUALIFIED',status:'active',points:30,maxPerUser:2,maxPerPeriod:null}:null,findOneBy:async()=>null,getRepository:()=>({createQueryBuilder:()=>query})};
 assert.equal(await new RewardService().award(manager,'u','REFERRAL_QUALIFIED','referral','r'),null);
});
test('unsafe legacy email referral configuration fails closed without throwing',async()=>{
 const manager={findOne:async type=>{
  if(type===User)return {id:'u',status:'active'};
  if(type===PointsTransaction)return null;
  if(type===RewardSetting)return {settingValue:{referralQualificationEvent:'email_verified',tradeRewardBeneficiary:'buyer',reverseTradeRewardsOnRefund:false}};
  if(type===RewardRule)return {eventCode:'REFERRAL_QUALIFIED',status:'active',points:30,maxPerUser:null,maxPerPeriod:null};
 }};
 assert.equal(await new RewardService().award(manager,'u','REFERRAL_QUALIFIED','referral','new-referral'),null);
});
test('reward endpoints are documented and protected',async()=>{
 const {config}=require('../dist/config');config.isDev=true;
 const app=await require('../dist/app').buildApp();
 try{
  await app.ready();const paths=app.swagger().paths;
  for(const url of ['/api/referrals/me','/api/referrals','/api/rewards/balance','/api/rewards/history','/api/admin/referrals','/api/admin/referrals/analytics','/api/admin/rewards/transactions','/api/admin/reward-rules','/api/admin/rewards/policy','/api/admin/rewards/reconciliation']){
   assert.ok(paths[url],url);assert.equal((await app.inject(url)).statusCode,401,url);
  }
  assert.ok(paths['/api/admin/rewards/adjust'].post.parameters.some(p=>p.in==='header'&&p.name==='idempotency-key'&&p.required));
  const registry=require('../dist/modules/admin/admin.permissions').ADMIN_PERMISSION_DEFINITIONS;
  for(const code of rewardPermissions)assert.ok(registry.some(p=>p.code===code));
 }finally{await app.close();}
});
