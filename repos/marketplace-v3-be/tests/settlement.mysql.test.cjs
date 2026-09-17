require('./after-sales-env.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {AppDataSource:ds}=require('../dist/database/data-source');
const {User}=require('../dist/database/entities/user.entity');
const {Order}=require('../dist/database/entities/order.entity');
const {Payment}=require('../dist/database/entities/payment.entity');
const {Refund}=require('../dist/database/entities/refunds.entity');
const {FinancialAdjustment}=require('../dist/database/entities/financial-adjustments.entity');
const {SystemSetting}=require('../dist/database/entities/system-setting.entity');
const E=require('../dist/database/entities/settlement.entities');
const {SettlementService}=require('../dist/modules/settlement/settlement.service');
const {PayoutService,registerPayoutGateway}=require('../dist/modules/settlement/payout.service');
const {PayoutAccountService}=require('../dist/modules/settlement/settlement.accounts');
const {accountSchema}=require('../dist/modules/settlement/settlement.schemas');
const socket=process.env.SETTLEMENT_TEST_SOCKET;
test('MySQL seller settlement and payout workflows',{skip:!socket},async t=>{
 assert.match(socket,/^\/(?:private\/)?tmp\/tofa-rewards-mysql-[^/]+\/mysql.sock$/);
 const root=await require('mysql2/promise').createConnection({socketPath:socket,user:'root'});
 const database=`settlement_test_${process.pid}_${Date.now()}`;await root.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
 const opts={password:'',socketPath:socket,database,extra:{socketPath:socket,connectionLimit:10},logging:false};ds.setOptions(opts);Object.assign(ds.driver.options,opts);ds.driver.database=database;
 process.env.PAYOUT_ENCRYPTION_KEYS=JSON.stringify({test:crypto.randomBytes(32).toString('base64')});process.env.PAYOUT_ENCRYPTION_KEY_ID='test';
 const s=new SettlementService(),p=new PayoutService(),accounts=new PayoutAccountService(),maker=crypto.randomUUID(),checker=crypto.randomUUID();
 async function user(seller=false){return ds.manager.save(User,ds.manager.create(User,{firstName:'Test',lastName:'Finance',email:crypto.randomUUID()+'@example.com',userType:seller?'seller':'buyer',status:'active',isCompanyVerified:seller}));}
 async function account(seller,currency='NGN'){
  const a=(await accounts.create(seller.id,accountSchema.parse({accountName:'Test Seller',accountNumber:'0123456789',bankCode:'058',bankName:'Test Bank',country:'NG',currency,isDefault:true}))).data;
  await accounts.verify(a.id,maker,{status:'verified',version:1,reason:'Bank ownership evidence verified'});return a;
 }
 async function fixture({seller,products='100.00',logistics='20.00',deliveryType='seller_arranged',currency='NGN',paymentCurrency=currency,status='completed',fee='5.00',fx=false}={}){
  seller??=await user(true);const buyer=await user();
  const payment=await ds.manager.save(Payment,ds.manager.create(Payment,{paymentReference:'PAY-'+crypto.randomUUID(),payerId:buyer.id,sourceType:'checkout',sourceId:crypto.randomUUID(),purpose:'marketplace_purchase',description:'Isolated test',amount:fx?'240.00':(Number(products)+Number(logistics)).toFixed(2),currency:paymentCurrency,paymentMethod:'bank_transfer',status:'confirmed'}));
  const order=await ds.manager.save(Order,ds.manager.create(Order,{orderReference:'ORD-'+crypto.randomUUID(),paymentId:payment.id,buyerId:buyer.id,sellerId:seller.id,status,orderCurrency:currency,productsSubtotal:products,logisticsAmount:logistics,orderTotal:(Number(products)+Number(logistics)).toFixed(2),paymentCurrency,paymentAmount:payment.amount,deliveryType,deliveryAddressSnapshot:{},transactionFeeAmount:fee,transactionFeePercentage:'5.00',feeBaseAmount:products,sellerNetProductAmount:(Number(products)-Number(fee)).toFixed(2),completedAt:status==='completed'?new Date(Date.now()-86400000*3):null,fxApplied:fx,fxRateSnapshot:fx?'2.00000000':null,fxSourceAmount:fx?'120.00':null,fxConvertedAmount:fx?'240.00':null}));
  return {seller,buyer,order,payment};
 }
 async function ready(options={}){const f=await fixture(options);await account(f.seller,options.currency??'NGN');const st=await s.refreshOrder(f.order.id);return {...f,st,payout:await ds.manager.findOneBy(E.SellerPayout,{settlementId:st.id})};}
 async function paid(f){await p.approve(f.payout.id,maker);await p.process(f.payout.id,checker);await p.confirm(f.payout.id,checker,{reference:'BANK-'+crypto.randomUUID(),notes:'Bank has confirmed the transfer'});}
 async function refund(f,product='20.00',logistics='0.00',reversal='1.00'){
  const fx=f.order.paymentCurrency!==f.order.orderCurrency;
  const r=await ds.manager.save(Refund,ds.manager.create(Refund,{refundNumber:'RF-'+crypto.randomUUID(),orderId:f.order.id,paymentId:f.payment.id,buyerId:f.buyer.id,sellerId:f.seller.id,sourceType:'admin',requestedBy:maker,gateway:'manual',refundType:'partial',amount:(Number(product)+Number(logistics)).toFixed(2),currency:f.order.paymentCurrency,status:'successful',reason:'Bank confirmed refund',breakdown:{productAmount:product,logisticsAmount:logistics,otherAmount:'0.00',totalRefundAmount:(Number(product)+Number(logistics)).toFixed(2)},financialSnapshot:{productPaymentAllocation:fx?'200.00':f.order.productsSubtotal,logisticsPaymentAllocation:fx?'40.00':f.order.logisticsAmount},completedAt:new Date()}));
  if(reversal!=='0.00')await ds.manager.save(FinancialAdjustment,ds.manager.create(FinancialAdjustment,{orderId:f.order.id,paymentId:f.payment.id,refundId:r.id,adjustmentType:'transaction_fee_reversal',amount:reversal,currency:f.order.orderCurrency,direction:'credit',reason:'Historical fee reversal'}));
  await s.refreshOrder(f.order.id);return r;
 }
 try{
  await ds.initialize();await ds.runMigrations({transaction:'each'});
  await t.test('completion migration rolls back and reapplies cleanly',async()=>{await ds.undoLastMigration({transaction:'each'});await ds.runMigrations({transaction:'each'});});
  await t.test('paid orders create held settlement without account; hold period is snapshotted',async()=>{
   const f=await fixture({status:'paid'});const st=await s.refreshOrder(f.order.id);assert.equal(st.status,'on_hold');assert.equal(st.holdDays,2);assert.equal(st.payoutId,null);
   await account(f.seller);await ds.manager.update(Order,f.order.id,{status:'completed',completedAt:new Date()});await ds.manager.update(SystemSetting,{key:'settlementHoldDays'},{value:0});
   assert.equal((await s.refreshOrder(f.order.id)).status,'pending');await ds.manager.update(SystemSetting,{key:'settlementHoldDays'},{value:2});
  });
  await t.test('one order has one payout; excludes non-seller logistics and uses original fee',async()=>{
   for(const deliveryType of ['seller_arranged','integrated_logistics','buyer_arranged']){
    const f=await ready({deliveryType});assert.equal(f.st.netSettlementAmount,deliveryType==='seller_arranged'?'115.00':'95.00');
    await Promise.all([s.refreshOrder(f.order.id),s.refreshOrder(f.order.id)]);assert.equal(await ds.manager.countBy(E.SellerPayout,{settlementId:f.st.id}),1);
   }
  });
  await t.test('maker-checker, concurrent processing, masked destination, immutable success',async()=>{
   const f=await ready();await p.approve(f.payout.id,maker);await assert.rejects(p.process(f.payout.id,maker),/Approver/);
   const attempts=await Promise.allSettled([p.process(f.payout.id,checker),p.process(f.payout.id,checker)]);assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
   const dest=await p.destination(f.payout.id,checker,'Execute approved bank transfer');assert.equal(dest.data.accountNumber,'0123456789');
   assert.ok(!JSON.stringify(await s.statement(f.payout.id,f.seller.id)).includes('0123456789'));
   await assert.rejects(s.statement(f.payout.id,crypto.randomUUID()),/not found/);
   const receipt={reference:'BANK-'+crypto.randomUUID(),notes:'Confirmed bank transfer evidence'};await p.confirm(f.payout.id,checker,receipt);await p.confirm(f.payout.id,checker,receipt);
   await assert.rejects(ds.manager.update(E.SellerPayout,f.payout.id,{amount:'1.00'}),/immutable/);
   await assert.rejects(ds.manager.update(E.SellerSettlement,f.st.id,{netSettlementAmount:'1.00'}),/immutable/);
   await assert.rejects(p.retry(f.payout.id,checker,'Retry requested'),/definitively failed/);
  });
  await t.test('account updates revoke approval; processing destination stays frozen',async()=>{
   const f=await ready();await p.approve(f.payout.id,maker);await accounts.update(f.seller.id,f.payout.payoutAccountId,{accountNumber:'9876543210'});
   await assert.rejects(p.process(f.payout.id,checker),/approval|eligible/);
   const a=await ds.manager.findOneBy(E.SellerPayoutAccount,{id:f.payout.payoutAccountId});assert.equal(a.status,'pending');assert.equal(a.isDefault,false);
   await accounts.verify(a.id,maker,{version:2,status:'verified',reason:'Updated bank account verified'});await accounts.setDefault(f.seller.id,a.id);await p.approve(f.payout.id,maker);await p.process(f.payout.id,checker);
   await accounts.update(f.seller.id,a.id,{accountNumber:'1111111111'});assert.equal((await p.destination(f.payout.id,checker,'Read frozen payout destination')).data.accountNumber,'9876543210');
  });
  await t.test('multiple holds cannot be bypassed by releasing one',async()=>{
   const f=await ready();await s.hold(f.st.id,maker,'Compliance review');await s.hold(f.st.id,checker,'Separate financial review');await s.hold(f.st.id,maker,'Compliance resolved',true);
   assert.equal((await s.detail(f.st.id)).data.status,'on_hold');await assert.rejects(p.approve(f.payout.id,maker),/eligible/);await s.hold(f.st.id,checker,'Financial review resolved',true);assert.equal((await s.detail(f.st.id)).data.status,'eligible');
  });
  await t.test('active disputes and returns block approval until each underlying issue resolves',async()=>{
   const {Dispute}=require('../dist/database/entities/dispute.entity');const {ReturnRequest}=require('../dist/database/entities/returns.entity');
   const f=await ready();await p.approve(f.payout.id,maker);
   const dispute=await ds.manager.save(Dispute,ds.manager.create(Dispute,{disputeNumber:'D-'+crypto.randomUUID(),orderId:f.order.id,sellerOrderId:f.order.id,buyerId:f.buyer.id,sellerId:f.seller.id,raisedBy:f.buyer.id,raisedByType:'buyer',reason:'Quality issue',description:'Inspect the goods',status:'open'}));
   const ret=await ds.manager.save(ReturnRequest,ds.manager.create(ReturnRequest,{returnNumber:'R-'+crypto.randomUUID(),orderId:f.order.id,buyerId:f.buyer.id,sellerId:f.seller.id,reason:'Quality issue',description:'Inspect return',status:'approved',policySnapshot:{},refundRequired:false}));
   await assert.rejects(p.process(f.payout.id,checker),/approval|eligible/);await s.refreshOrder(f.order.id);
   await ds.manager.update(Dispute,dispute.id,{status:'resolved'});await assert.rejects(p.approve(f.payout.id,maker),/eligible/);
   await ds.manager.update(ReturnRequest,ret.id,{status:'cancelled'});await p.approve(f.payout.id,maker);
  });
  await t.test('unresolved refunds and incomplete snapshots fail closed',async()=>{
   const f=await ready();const r=await refund(f);await ds.manager.update(Refund,r.id,{status:'failed'});await assert.rejects(p.approve(f.payout.id,maker),/eligible/);
   const fx=await ready({paymentCurrency:'USD'});assert.equal(fx.st.status,'on_hold');assert.equal(fx.payout,null);
  });
  await t.test('processing switch and automatic currency ceilings are enforced',async()=>{
   const f=await ready();await ds.manager.update(E.SellerPayoutAccount,f.payout.payoutAccountId,{providerRecipientId:'RCP_test'});
   registerPayoutGateway('paystack',{createRecipient:async()=> 'RCP_test',submit:async()=>{throw new Error('timeout');},receipt:async()=>{throw new Error('pending');},verifyEvent:()=>({})});
   await p.approve(f.payout.id,maker,'paystack');await ds.manager.update(SystemSetting,{key:'settlementProcessingEnabled'},{value:false});await assert.rejects(p.process(f.payout.id,checker),/disabled/);await ds.manager.update(SystemSetting,{key:'settlementProcessingEnabled'},{value:true});
   await assert.rejects(p.process(f.payout.id,null),/not authorized/);process.env.PAYOUT_AUTOMATIC_PROCESSING_ENABLED='true';await ds.manager.update(SystemSetting,{key:'automaticSettlementEnabled'},{value:true});await ds.manager.update(SystemSetting,{key:'maximumAutomaticPayoutAmount'},{value:{NGN:100}});await assert.rejects(p.process(f.payout.id,null),/not authorized/);
   await ds.manager.update(SystemSetting,{key:'automaticSettlementEnabled'},{value:false});process.env.PAYOUT_AUTOMATIC_PROCESSING_ENABLED='false';
  });
  await t.test('seller scopes and finance permissions are enforced through HTTP',async()=>{
   const app=await require('../dist/app').buildApp();
   try{const f=await ready(),other=await user(true);const headers={authorization:'Bearer '+app.jwt.sign({sub:other.id,tokenType:'user'})};
    for(const url of [`/seller/settlements/${f.st.id}`,`/seller/payouts/${f.payout.id}/statement`])assert.equal((await app.inject({url,headers})).statusCode,404);
    assert.equal((await app.inject({url:`/api/seller/payout-accounts/${f.payout.payoutAccountId}`,method:'PATCH',headers,payload:{accountName:'Attacker account'}})).statusCode,404);
    const {Admin}=require('../dist/database/entities/admin.entity');const admin=await ds.manager.save(Admin,ds.manager.create(Admin,{email:crypto.randomUUID()+'@example.com',firstName:'Read',lastName:'Only',status:'active',isSuperAdmin:false,authVersion:0}));const auth={authorization:'Bearer '+app.jwt.sign({sub:admin.id,tokenType:'admin',authVersion:0})};
    assert.equal((await app.inject({url:`/api/admin/payouts/${f.payout.id}/process`,method:'POST',headers:auth})).statusCode,403);
    await ds.manager.update(Admin,admin.id,{isSuperAdmin:true});
    const exported=await app.inject({url:'/api/reports/export',method:'POST',headers:auth,payload:{reportType:'admin_settlements',format:'csv',filters:{sellerId:f.seller.id}}});assert.equal(exported.statusCode,202,exported.body);assert.equal(exported.json().data.status,'completed');
    const reportId=exported.json().data.reportId;const downloaded=await app.inject({url:`/api/reports/${reportId}/download`,headers:auth});assert.equal(downloaded.statusCode,200,downloaded.body);assert.ok(downloaded.body.includes(f.st.id));
    const exceptions=await app.inject({url:'/api/admin/settlements/reconciliation',headers:auth});assert.equal(exceptions.statusCode,200,exceptions.body);

   }finally{await app.close();}
  });
  await t.test('pre-payout FX refund uses historical allocations and reverses only original fee',async()=>{
   const f=await ready({currency:'NGN',paymentCurrency:'USD',fx:true});await refund(f,'40.00','8.00','1.00');const st=(await s.detail(f.st.id)).data;assert.equal(st.refundAmount,'24.00');assert.equal(st.netSettlementAmount,'92.00');
  });
  await t.test('a fully refunded unpaid order carries unreversed fees as future debt without negative transfer',async()=>{
   const f=await ready({logistics:'0.00'});await refund(f,'100.00','0.00','0.00');assert.equal((await s.detail(f.st.id)).data.status,'eligible');
   await p.approve(f.payout.id,maker);const approved=(await s.statement(f.payout.id)).data;assert.equal(approved.amount,'0.00');assert.equal(approved.financialSnapshot.carriedDebit,'5.00');
   await p.process(f.payout.id,checker);assert.equal((await s.statement(f.payout.id)).data.status,'successful');
   const debit=await ds.manager.findOneBy(E.SellerSettlementAdjustment,{sellerOrderId:f.order.id,sourceType:'negative_settlement'});assert.equal(debit.amount,'5.00');
  });
  await t.test('post-payout refund liability carries partially across future settlements without rewriting history',async()=>{
   const f=await ready();await paid(f);const before=await ds.manager.findOneBy(E.SellerPayout,{id:f.payout.id});await refund(f,'100.00','20.00','5.00');await s.refreshOrder(f.order.id);
   assert.deepEqual(await ds.manager.findOneBy(E.SellerPayout,{id:f.payout.id}),before);
   const liability=await ds.manager.findOneBy(E.SellerSettlementAdjustment,{sellerOrderId:f.order.id,sourceType:'post_payout_refund'});assert.equal(liability.amount,'115.00');assert.equal(await ds.manager.countBy(E.SellerSettlementAdjustment,{sellerOrderId:f.order.id}),1);
   const next=await fixture({seller:f.seller,products:'50.00',logistics:'0.00',fee:'2.50'});next.st=await s.refreshOrder(next.order.id);next.payout=await ds.manager.findOneBy(E.SellerPayout,{settlementId:next.st.id});await p.approve(next.payout.id,maker);assert.equal((await s.statement(next.payout.id)).data.amount,'0.00');await p.process(next.payout.id,checker);assert.equal((await s.statement(next.payout.id)).data.status,'successful');
   const last=await fixture({seller:f.seller});last.st=await s.refreshOrder(last.order.id);last.payout=await ds.manager.findOneBy(E.SellerPayout,{settlementId:last.st.id});await p.approve(last.payout.id,maker);assert.equal((await s.statement(last.payout.id)).data.amount,'47.50');
  });
  await t.test('manual adjustments are idempotent, append only, currency bound, and independently approved',async()=>{
   const f=await ready(),dto={adjustmentType:'manual_credit',amount:'3.00',currency:'NGN',reason:'Approved historical fee correction',idempotencyKey:crypto.randomUUID()};
   const a=(await s.adjust(f.st.id,checker,dto)).data;assert.equal((await s.adjust(f.st.id,checker,dto)).data.id,a.id);await assert.rejects(s.adjust(f.st.id,checker,{...dto,amount:'4.00'}),/Idempotency/);
   await assert.rejects(ds.manager.update(E.SellerSettlementAdjustment,a.id,{amount:'4.00'}),/append only/);await assert.rejects(p.approve(f.payout.id,checker),/creator/);await p.approve(f.payout.id,maker);
   await s.adjust(f.st.id,checker,{...dto,idempotencyKey:crypto.randomUUID(),amount:'1.00'});await assert.rejects(p.process(f.payout.id,checker),/approval/);
  });
  await t.test('failed manual attempt is preserved; retry requires another approval',async()=>{
   const f=await ready();await p.approve(f.payout.id,maker);await p.process(f.payout.id,checker);await p.confirm(f.payout.id,checker,{reference:'FAIL-'+crypto.randomUUID(),notes:'Bank confirmed no money was transferred'},true);await p.retry(f.payout.id,checker,'Bank destination now available');await assert.rejects(p.process(f.payout.id,checker),/approval/);await p.approve(f.payout.id,maker);await p.process(f.payout.id,checker);assert.equal(await ds.manager.countBy(E.PayoutAttempt,{payoutId:f.payout.id}),2);
  });
  await t.test('provider timeout is processing; mismatched receipt rejected; verified callback is idempotent',async()=>{
   const f=await ready();await ds.manager.update(E.SellerPayoutAccount,f.payout.payoutAccountId,{providerRecipientId:'RCP_test'});let submitted=0,receipt;
   registerPayoutGateway('paystack',{createRecipient:async()=> 'RCP_test',submit:async a=>{submitted++;receipt={reference:a.reference,providerReference:'TRF_test',recipientId:'RCP_test',amount:a.amount,currency:a.currency,status:'successful'};throw new Error('timeout');},receipt:async()=>receipt,verifyEvent:()=>({event:'transfer.success',data:{reference:receipt.reference}})});
   await p.approve(f.payout.id,maker,'paystack');await assert.rejects(p.process(f.payout.id,checker),/unconfirmed/);assert.equal((await s.statement(f.payout.id)).data.status,'processing');await assert.rejects(p.retry(f.payout.id,checker,'Unexpected timeout'),/definitively/);
   receipt.amount='1.00';await assert.rejects(p.reconcile(f.payout.id),/do not match/);receipt.amount='115.00';await p.reconcile(f.payout.id);await p.webhook(Buffer.from('{}'),{});assert.equal(submitted,1);assert.equal((await s.statement(f.payout.id)).data.status,'successful');
   receipt.status='failed';await p.webhook(Buffer.from('{}'),{});await p.webhook(Buffer.from('{}'),{});assert.equal(await ds.manager.countBy(E.SettlementEvent,{payoutId:f.payout.id,eventCode:'PAYOUT_PROVIDER_REVERSAL_REVIEW_REQUIRED'}),1);assert.equal((await s.statement(f.payout.id)).data.status,'successful');
  });
  await t.test('summary never mixes currency; report content is owned and stable',async()=>{
   await ready({currency:'USD'});const totals=(await s.summary()).data;assert.ok(totals.some(x=>x.currency==='USD'));assert.ok(totals.some(x=>x.currency==='NGN'));
   const {AnalyticsReport}=require('../dist/database/entities/analytics-report.entity');const {generateFinancialReport,downloadFinancialReport}=require('../dist/modules/settlement/settlement.reports');
   const f=await ready();const report=await ds.manager.save(AnalyticsReport,ds.manager.create(AnalyticsReport,{requestedBy:f.seller.id,requestedByType:'user',reportType:'seller_payouts',format:'csv',filters:{},expiresAt:new Date(Date.now()+100000),status:'processing'}));await generateFinancialReport(report);
   const result=await downloadFinancialReport('user',f.seller.id,report.id);assert.ok(result.content.includes(f.payout.id));assert.ok(!result.content.includes('0123456789'));await assert.rejects(downloadFinancialReport('user',crypto.randomUUID(),report.id),/not found/);
  });
 }finally{if(ds.isInitialized)await ds.destroy();await root.query(`DROP DATABASE \`${database}\``);await root.end();}
});
