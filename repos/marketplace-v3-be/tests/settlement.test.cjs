require('./after-sales-env.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {encryptAccount,decryptAccount,maskAccount}=require('../dist/modules/settlement/settlement.crypto');
const {refundImpact,checkedMoney}=require('../dist/modules/settlement/settlement.money');
const schemas=require('../dist/modules/settlement/settlement.schemas');
const {PaystackPayoutGateway}=require('../dist/modules/settlement/payout.paystack');
test('bank encryption is randomized, authenticated, owner-bound and supports key rotation',()=>{
 process.env.PAYOUT_ENCRYPTION_KEYS=JSON.stringify({a:crypto.randomBytes(32).toString('base64'),b:crypto.randomBytes(32).toString('base64')});process.env.PAYOUT_ENCRYPTION_KEY_ID='a';
 const id=crypto.randomUUID(),seller=crypto.randomUUID(),cipher=encryptAccount('0123456789',id,seller);assert.notEqual(cipher,encryptAccount('0123456789',id,seller));assert.ok(!cipher.includes('0123456789'));assert.equal(decryptAccount(cipher,id,seller),'0123456789');
 assert.throws(()=>decryptAccount(cipher,id,crypto.randomUUID()),/could not be decrypted/);const tampered=JSON.parse(cipher);tampered.tag=crypto.randomBytes(16).toString('base64');assert.throws(()=>decryptAccount(JSON.stringify(tampered),id,seller));
 process.env.PAYOUT_ENCRYPTION_KEY_ID='b';assert.equal(decryptAccount(cipher,id,seller),'0123456789');assert.equal(maskAccount('0123456789'),'******6789');
 process.env.PAYOUT_ENCRYPTION_KEYS='{}';assert.throws(()=>encryptAccount('0123456789',id,seller),/unavailable/);
});
test('refund math uses cumulative original allocations, excludes integrated logistics, and rejects over refunds',()=>{
 const snapshot={gross:'100.00',logistics:'20.00'},r={financialSnapshot:{productPaymentAllocation:'200.00',logisticsPaymentAllocation:'40.00'},breakdown:{productAmount:'40.00',logisticsAmount:'8.00'}};
 assert.deepEqual(refundImpact(snapshot,[r],'1.00'),{refund:2400n,liability:2300n});assert.equal(refundImpact({...snapshot,logistics:'0.00'},[r],'1.00').liability,1900n);
 assert.throws(()=>refundImpact(snapshot,[{...r,breakdown:{productAmount:'201.00',logisticsAmount:'0.00'}}],'0.00'),/exceeds/);
 assert.throws(()=>checkedMoney(-1n));assert.equal(checkedMoney(999999999999999999n),'9999999999999999.99');
 const tiny={financialSnapshot:{productPaymentAllocation:'0.03',logisticsPaymentAllocation:'0.00'},breakdown:{productAmount:'0.01',logisticsAmount:'0.00'}};
 assert.equal(refundImpact({gross:'0.01',logistics:'0.00'},[tiny,tiny,tiny],'0.00').refund,1n);
});
test('payout inputs reject mass assignment, unsafe amounts and unbounded filters',()=>{
 const data={accountName:'Test account',accountNumber:'0123456789',bankName:'Test bank',country:'NG',currency:'NGN'};
 assert.equal(schemas.accountSchema.safeParse({...data,status:'verified'}).success,false);assert.equal(schemas.accountSchema.safeParse({...data,sellerId:crypto.randomUUID()}).success,false);
 for(const amount of ['-1.00','1.001','1e3','0.00','10000000000000000.00'])assert.equal(schemas.adjustmentSchema.safeParse({amount,currency:'NGN',reason:'Valid reason',adjustmentType:'manual_credit',idempotencyKey:crypto.randomUUID()}).success,false);
 assert.equal(schemas.listSchema.safeParse({limit:101}).success,false);assert.equal(schemas.accountUpdateSchema.safeParse({}).success,false);
});
test('Paystack webhooks require an HMAC over original bytes',()=>{
 const gateway=new PaystackPayoutGateway('test-secret',async()=>{throw new Error('No IO expected');}),raw=Buffer.from('{"event":"transfer.success","data":{}}');const sig=crypto.createHmac('sha512','test-secret').update(raw).digest('hex');
 assert.equal(gateway.verifyEvent(raw,{'x-paystack-signature':sig}).event,'transfer.success');assert.throws(()=>gateway.verifyEvent(raw,{}),/signature/);assert.throws(()=>gateway.verifyEvent(Buffer.from('{}'),{'x-paystack-signature':sig}),/signature/);
});
test('Paystack transfer request uses minor units and verification requires exact provider records',async()=>{
 const calls=[];const gateway=new PaystackPayoutGateway('test-secret',async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({status:true,data:{reference:'tofa_1234567890123456',amount:11500,currency:'NGN',transfer_code:'TRF_test',recipient:{recipient_code:'RCP_test'},status:'success'}})};});
 await gateway.submit({amount:'115.00',currency:'NGN',recipientId:'RCP_test',reference:'tofa_1234567890123456'});const body=JSON.parse(calls[0].opts.body);assert.equal(body.amount,11500);assert.equal(body.reference,'tofa_1234567890123456');assert.equal(calls[0].opts.redirect,'error');
 assert.equal((await gateway.receipt(body.reference)).amount,'115.00');await assert.rejects(gateway.receipt('tofa_different_reference'),/Invalid transfer verification/);await assert.rejects(gateway.submit({amount:'90071992547409.92',currency:'NGN',recipientId:'RCP_test'}),/Unsupported/);
});
test('financial CSV neutralizes spreadsheet formulas',()=>{const {csvCell}=require('../dist/modules/settlement/settlement.reports');assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell('a"b'),'"a""b"');});
test('all settlement endpoints have Swagger and authentication; unsigned provider callbacks fail',async()=>{
 const {config}=require('../dist/config');config.isDev=true;
 const app=await require('../dist/app').buildApp();
 try{await app.ready();const paths=app.swagger().paths;
  for(const path of ['/api/seller/payout-accounts','/api/seller/settlements','/api/seller/payouts','/api/seller/payouts/{payoutId}/statement','/api/admin/settlements/summary','/api/admin/settlements/reconciliation','/api/admin/payouts/{payoutId}/approve','/api/admin/payouts/{payoutId}/process','/api/admin/payouts/{payoutId}/confirm','/api/admin/payouts/{payoutId}/retry','/api/admin/settlements/{settlementId}/adjustments','/api/reports/{reportId}/download'])assert.ok(paths[path],path);
  for(const url of ['/api/seller/settlements','/api/seller/payout-accounts','/api/admin/payouts','/api/admin/settlements/reconciliation']){const response=await app.inject({url});assert.equal(response.statusCode,401);assert.equal(response.headers['cache-control'],'private, no-store');}
  const {registerPayoutGateway}=require('../dist/modules/settlement/payout.service');registerPayoutGateway('paystack',new PaystackPayoutGateway('test-secret'));
  const response=await app.inject({url:'/api/payouts/webhooks/paystack',method:'POST',payload:{event:'transfer.success',data:{}}});assert.equal(response.statusCode,401);
 }finally{await app.close();}
});
