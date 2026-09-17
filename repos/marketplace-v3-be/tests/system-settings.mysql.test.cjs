require('./after-sales-env.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {AppDataSource:ds}=require('../dist/database/data-source');
const {SystemSetting}=require('../dist/database/entities/system-setting.entity');
const {MarketplaceCountry}=require('../dist/database/entities/marketplace-country.entity');
const {MarketplaceCurrency}=require('../dist/database/entities/marketplace-currency.entity');
const {PaymentMethodConfig}=require('../dist/database/entities/payment-method-config.entity');
const {AuditLog}=require('../dist/database/entities/audit-log.entity');
const {Language}=require('../dist/database/entities/language.entity');
const {getSetting,requireActiveCurrency,requireDeliveryType}=require('../dist/modules/system-settings/settings.reader');
const {updateSetting,mutateCatalog}=require('../dist/modules/system-settings/settings.service');
const {AfterSalesService}=require('../dist/modules/after-sales/after-sales.service');
const {I18nService}=require('../dist/modules/i18n/i18n.service');
const socket=process.env.AFTER_SALES_TEST_SOCKET;
test('MySQL system settings and prospective marketplace integration',{skip:!socket},async t=>{
 assert.ok(/^\/(?:private\/)?tmp\/tofa-after-sales-mysql-/.test(socket));
 const dbName=`settings_test_${process.pid}_${Date.now()}`,root=await require('mysql2/promise').createConnection({socketPath:socket,user:'root'});
 await root.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
 const options={password:'',socketPath:socket,database:dbName,extra:{socketPath:socket,connectionLimit:10},logging:false};ds.setOptions(options);Object.assign(ds.driver.options,options);ds.driver.database=dbName;
 let app;
 try{
  await ds.initialize();const migrations=await ds.runMigrations({transaction:'each'});assert.ok(migrations.some(m=>m.name==='AddSystemSettings1787520019000'));assert.equal((await ds.runMigrations({transaction:'each'})).length,0);
  const {Admin}=require('../dist/database/entities/admin.entity');
  const admin=await ds.manager.save(Admin,ds.manager.create(Admin,{email:`${randomUUID()}@example.com`,firstName:'Config',lastName:'Admin',status:'active',isSuperAdmin:true,authVersion:0}));
  const change=(key,value)=>ds.transaction(manager=>updateSetting(manager,admin.id,key,value));
  app=await require('../dist/app').buildApp();const headers={authorization:`Bearer ${app.jwt.sign({sub:admin.id,tokenType:'admin',authVersion:0})}`};
  await t.test('public config excludes security and financial switches, even if database public flag is altered',async()=>{
   await ds.manager.update(SystemSetting,{key:'maxLoginAttempts'},{isPublic:true});
   const response=await app.inject('/api/config');assert.equal(response.statusCode,200);
   const data=response.json().data;assert.equal(data.marketplace.defaultLanguage,'en');assert.ok(data.countries.some(c=>c.code==='NG'));assert.ok(!JSON.stringify(data).includes('maxLoginAttempts'));assert.ok(!JSON.stringify(data).includes('settlementHoldDays'));
  });
  await t.test('return policy uses central settings immediately and legacy writes share that source',async()=>{
   await change('returnWindowDays',14);const service=new AfterSalesService();assert.equal((await service.settings()).returnWindowDays,14);
   await service.updateSettings({type:'admin',id:admin.id},{returnWindowDays:9});assert.equal(await getSetting('returnWindowDays'),9);
   const logs=await ds.manager.find(AuditLog,{where:{eventCode:'SYSTEM_SETTING_UPDATED'},order:{createdAt:'DESC'}});
   assert.ok(logs.some(log=>log.oldValue?.returnWindowDays===14 && log.newValue?.returnWindowDays===9));
  });
  await t.test('settings and audit roll back atomically',async()=>{
   const subscriber={beforeInsert(event){if(event.metadata.tableName==='audit_logs')throw new Error('injected audit failure');}};ds.subscribers.push(subscriber);
   try{await assert.rejects(change('settlementHoldDays',0),/injected audit failure/);}finally{ds.subscribers.splice(ds.subscribers.indexOf(subscriber),1);}
   assert.equal(await getSetting('settlementHoldDays'),2);
  });
  await t.test('defaults cannot be deactivated and currency status only blocks new selection',async()=>{
   const ng=await ds.manager.findOneByOrFail(MarketplaceCountry,{code:'NG'}),ngn=await ds.manager.findOneByOrFail(MarketplaceCurrency,{code:'NGN'});
   await assert.rejects(mutateCatalog('countries',admin.id,ng.id,{status:'inactive'}),/default/);
   await assert.rejects(mutateCatalog('currencies',admin.id,ngn.id,{status:'inactive'}),/default/);
   const usd=await ds.manager.findOneByOrFail(MarketplaceCurrency,{code:'USD'});
   await mutateCatalog('currencies',admin.id,usd.id,{status:'inactive'});await assert.rejects(requireActiveCurrency('USD'),/unavailable/);
   await assert.rejects(change('defaultCurrency','USD'),/active/);
   await mutateCatalog('currencies',admin.id,usd.id,{status:'active'});await requireActiveCurrency('USD');
  });
  await t.test('language default updates stay synchronized and cannot be deactivated',async()=>{
   const fr=await ds.manager.findOneByOrFail(Language,{code:'fr'});const service=new I18nService();
   await service.updateLanguageStatus(admin.id,fr.id,{status:'active'});await service.setDefaultLanguage(admin.id,fr.id);
   assert.equal(await getSetting('defaultLanguage'),'fr');assert.equal(await ds.manager.countBy(Language,{isDefault:true}),1);
   await assert.rejects(service.updateLanguageStatus(admin.id,fr.id,{status:'inactive'}),/default/);
   await change('defaultLanguage','en');
  });
  await t.test('invalid settings and non-boolean financial switches are rejected',async()=>{
   for(const [key,value] of [['returnWindowDays',0],['maxLoginAttempts',99],['automaticSettlementEnabled','true'],['minimumPayoutAmounts',{XYZ:5}]]) {
    const r=await app.inject({method:'PATCH',url:`/api/admin/settings/${key}`,headers,payload:{value}});assert.ok([400,403].includes(r.statusCode),r.body);
   }
   assert.equal((await app.inject({method:'PATCH',url:'/api/admin/settings/providerSecret',headers,payload:{value:'secret'}})).statusCode,404);
  });
  await t.test('payment configuration narrows provider availability and cannot create unsupported integrations',async()=>{
   const {PaymentService}=require('../dist/modules/payment/payment.service');const service=new PaymentService();
   const providers=await ds.manager.find(PaymentMethodConfig);assert.ok(providers.length>0);
   await assert.rejects(mutateCatalog('payment-methods',admin.id,undefined,{code:'invented_provider',displayName:'Invalid',supportedCurrencies:['USD']}),/existing provider/);
   const config=providers.find(p=>p.code==='paystack') ?? providers[0];
   await mutateCatalog('payment-methods',admin.id,config.id,{status:'inactive'});
   const available=await service.getEligibleProviders({currency:'NGN',amount:1000,sourceType:'checkout',purpose:'marketplace_purchase'},{country:'NG'});
   assert.ok(!available.some(p=>p.code===config.code));
  });
  await t.test('checkout method discovery and selection honor the same provider configuration',async()=>{
   const {User}=require('../dist/database/entities/user.entity');
   const buyer=await ds.manager.save(User,ds.manager.create(User,{email:`${randomUUID()}@example.com`,firstName:'Buyer',lastName:'Test',status:'active',userType:'buyer',country:'NG'}));
   const {CheckoutService}=require('../dist/modules/checkout/checkout.service');const checkout=new CheckoutService();
   checkout.cartService={buildCartSummary:async()=>({cartId:randomUUID(),totalCount:1,currency:'NGN',productsSubtotal:1000,sellerGroups:[]})};
   const method=await ds.manager.findOneByOrFail(PaymentMethodConfig,{code:'paystack'});
   await mutateCatalog('payment-methods',admin.id,method.id,{status:'active'});
   assert.ok((await checkout.getPaymentMethods(buyer.id)).data.some(item=>item.code==='paystack'));
   await mutateCatalog('payment-methods',admin.id,method.id,{status:'inactive'});
   assert.ok(!(await checkout.getPaymentMethods(buyer.id)).data.some(item=>item.code==='paystack'));
   await assert.rejects(checkout.selectPaymentMethod(buyer.id,'paystack'),/not available/);
  });
  await t.test('new addresses use active supported countries without changing existing addresses',async()=>{
   const {requireActiveCountry}=require('../dist/modules/system-settings/settings.reader');
   assert.equal(await requireActiveCountry('Nigeria'),'NG');
   const gh=await ds.manager.findOneByOrFail(MarketplaceCountry,{code:'GH'});
   await mutateCatalog('countries',admin.id,gh.id,{status:'inactive'});
   await assert.rejects(requireActiveCountry('Ghana'),/unavailable/);
  });
  await t.test('delivery switches are enforced and upload limits use live settings',async()=>{
   await change('buyerArrangedLogisticsEnabled',false);await assert.rejects(requireDeliveryType('buyer_arranged'),/unavailable/);await change('buyerArrangedLogisticsEnabled',true);
   const {processUpload}=require('../dist/common/utils/file-upload.util');
   await change('maxImageSizeMb',1);
   await assert.rejects(processUpload({filename:'test.jpg',mimetype:'image/jpeg',buffer:Buffer.alloc(2*1024*1024)},{maxFileSizeMb:5}),/maximum size/);
  });
  await t.test('general settings permission cannot mutate settlement or security policies',async()=>{
   const {AdminRoleEntity}=require('../dist/database/entities/admin-role.entity'),{AdminRolePermission}=require('../dist/database/entities/admin-role-permission.entity'),{Permission}=require('../dist/database/entities/permission.entity');
   const role=await ds.manager.save(AdminRoleEntity,ds.manager.create(AdminRoleEntity,{name:'Settings editor',status:'active'})),permission=await ds.manager.findOneByOrFail(Permission,{code:'settings.update'});
   await ds.manager.save(AdminRolePermission,ds.manager.create(AdminRolePermission,{roleId:role.id,permissionId:permission.id}));await ds.manager.update(Admin,admin.id,{isSuperAdmin:false,roleId:role.id});
   for(const [key,value] of [['settlementHoldDays',3],['minimumPayoutAmounts',{USD:10}],['maxLoginAttempts',6]])assert.equal((await app.inject({method:'PATCH',url:`/api/admin/settings/${key}`,headers,payload:{value}})).statusCode,403);
   assert.equal((await app.inject({method:'PATCH',url:'/api/admin/settings/returnWindowDays',headers,payload:{value:12}})).statusCode,200);
  });
 }finally{if(app)await app.close();if(ds.isInitialized)await ds.destroy();await root.query(`DROP DATABASE \`${dbName}\``);await root.end();}
});
