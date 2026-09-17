require('./after-sales-env.cjs');
const test=require('node:test');const assert=require('node:assert/strict');
const {settingDefinitions,settingPermission,validateSetting}=require('../dist/modules/system-settings/settings.registry');
const {countryInput,currencyInput,methodInput}=require('../dist/modules/system-settings/settings.routes');
const {safeAuditValue}=require('../dist/modules/audit-log/audit-log.writer');
test('settings reject weakening security, invalid numeric types and unsafe money maps',()=>{
 for(const [key,value] of [['maxLoginAttempts',2],['maxLoginAttempts',11],['returnWindowDays',0],['settlementHoldDays',31],['loginLockMinutes',1],['automaticSettlementEnabled','true'],['minimumPayoutAmounts',{USD:-1}],['minimumPayoutAmounts',{USD:1.001}],['returnWindowDays','7']])assert.throws(()=>validateSetting(key,value),key);
 assert.equal(validateSetting('settlementHoldDays',0),0);
 assert.equal(settingDefinitions.__proto__,undefined);
});
test('sensitive categories have dedicated permissions and no public exposure',()=>{
 assert.equal(settingPermission('settlementHoldDays'),'settings.settlement.manage');
 assert.equal(settingPermission('minimumPayoutAmounts'),'settings.payout.manage');
 for(const d of Object.values(settingDefinitions))if(['settlement','payout','security','refund'].includes(d.category))assert.ok(!d.isPublic);
 for(const key of Object.keys(settingDefinitions))assert.ok(!/secret|passwordHash|apiKey|connectionString/i.test(key));
});
test('catalog validation rejects credentials and unsupported ledger precision',()=>{
 assert.equal(countryInput.safeParse({code:'NG',name:'Nigeria',secret:'x'}).success,false);
 assert.equal(currencyInput.safeParse({code:'USD',name:'Dollar',decimalPlaces:3}).success,false);
 assert.equal(methodInput.safeParse({code:'paystack',displayName:'Paystack',supportedCurrencies:['USD'],secretKey:'x'}).success,false);
});
test('central audit preserves validated configuration snapshots including currency maps',()=>{
 assert.deepEqual(safeAuditValue({settlementHoldDays:2,minimumPayoutAmounts:{USD:10},passwordHash:'secret'}),{settlementHoldDays:2,minimumPayoutAmounts:{USD:10}});
 assert.equal(safeAuditValue({minimumPayoutAmounts:{secretKey:10}}),null);
});
test('all registry defaults satisfy their declared validation',()=>{
 for(const [key,d] of Object.entries(settingDefinitions))assert.doesNotThrow(()=>validateSetting(key,d.value),key);
});
test('settings and catalogue routes appear in Swagger and require authentication',async()=>{
 const {config}=require('../dist/config');config.isDev=true;
 const app=await require('../dist/app').buildApp();
 try{await app.ready();const paths=app.swagger().paths;
  for(const path of ['/api/config','/api/countries','/api/currencies','/api/admin/settings','/api/admin/settings/{key}','/api/admin/countries','/api/admin/currencies','/api/admin/payment-methods'])assert.ok(paths[path],path);
  assert.equal((await app.inject('/api/admin/settings')).statusCode,401);
  assert.equal((await app.inject({method:'PATCH',url:'/api/admin/settings/returnWindowDays',payload:{value:14}})).statusCode,401);
 }finally{await app.close();}
});
