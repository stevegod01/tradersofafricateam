require('./after-sales-env.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { units, decimal, proportional, assertRefundCapacity, assertReturnQuantity } = require('../dist/modules/after-sales/after-sales.policy');
const { assertRefundApproverSeparated, assertRefundProcessorSeparated } = require('../dist/modules/after-sales/after-sales.service');

test('financial arithmetic retains cents beyond binary number precision', () => {
  assert.equal(decimal(units('9999999999999999.99')), '9999999999999999.99');
  assert.equal(decimal(units('0.10') + units('0.20')), '0.30');
  for (const value of ['-1', '1e2', 'NaN', '0.001', '', Infinity]) assert.throws(() => units(value));
});
test('refund and quantity caps reject excess reservations', () => {
  assertRefundCapacity(8000n, 2000n, 10000n);
  assert.throws(() => assertRefundCapacity(8001n, 2000n, 10000n));
  assert.throws(() => assertRefundCapacity(0n, 0n, 10000n));
  assertReturnQuantity(units('0.125', 3), units('0.875', 3), units('1.000', 3));
  assert.throws(() => assertReturnQuantity(126n, 875n, 1000n));
});
test('refund approval and processing require two administrators', () => {
  assert.throws(() => assertRefundApproverSeparated({ requestedBy: 'maker' }, 'maker'), /different administrators/);
  assert.doesNotThrow(() => assertRefundApproverSeparated({ requestedBy: 'maker' }, 'checker'));
  assert.throws(() => assertRefundProcessorSeparated({ approvedBy: 'checker' }, 'checker'), /cannot perform financial processing/);
  assert.doesNotThrow(() => assertRefundProcessorSeparated({ approvedBy: 'checker' }, 'maker'));
});
test('locked allocation and fee rounding remain deterministic', () => {
  assert.equal(proportional(20000n, 5000n, 100000n), 1000n);
  assert.equal(proportional(100n, 1n, 3n), 33n);
  assert.equal(proportional(100n, 3n, 3n), 100n);
  assert.throws(() => proportional(1n, 1n, 0n));
});
test('full app routes and OpenAPI compile; unauthenticated financial requests are rejected', async () => {
  const { buildApp } = require('../dist/app');
  const { config } = require('../dist/config');
  config.isDev = true;
  const app = await buildApp();
  try {
    await app.ready();
    const doc = app.swagger();
    for (const path of ['/api/returns', '/api/refunds', '/api/admin/refunds', '/api/orders/{sellerOrderId}/cancellation', '/api/seller/returns/{id}/received', '/api/admin/refunds/{id}/confirm']) assert.ok(doc.paths[path], path);
    for (const [method, url, payload] of [
      ['GET', '/api/refunds'], ['GET', '/api/admin/refunds'],
      ['POST', '/api/returns', { sellerOrderId: '00000000-0000-4000-8000-000000000001', reason: 'damaged_product', description: 'Damaged', items: [{ orderItemId: '00000000-0000-4000-8000-000000000002', quantity: 1 }] }],
      ['PATCH', '/api/admin/refunds/00000000-0000-4000-8000-000000000001/confirm', { reference: 'bank-123', notes: 'Confirmed' }],
    ]) {
      const r = await app.inject({ method, url, ...(payload ? { payload } : {}) });
      assert.equal(r.statusCode, 401, r.body);
    }
    const invalid = await app.inject({ method: 'POST', url: '/api/returns', payload: { sellerOrderId: 'invalid' } });
    assert.equal(invalid.statusCode, 400);
    const unconfigured = await app.inject({ method: 'POST', url: '/api/payments/refunds/webhooks/unconfigured', payload: { status: 'successful' } });
    assert.equal(unconfigured.statusCode, 404);
  } finally { await app.close(); config.isDev = false; }
});
test('all entities initialize independently of application import order', async () => {
  // Run in a fresh process so app imports cannot conceal circular enum definitions.
  const { execFileSync } = require('node:child_process');
  const output = execFileSync(process.execPath, ['-e', "require('./tests/after-sales-env.cjs'); const {AppDataSource}=require('./dist/database/data-source'); AppDataSource.buildMetadatas().then(()=>console.log('metadata-valid')).catch(e=>{console.error(e);process.exitCode=1;});"], { cwd: process.cwd(), encoding: 'utf8' });
  assert.match(output, /metadata-valid/);
});
test('Paystack uses minor units, original references and verified financial status', async () => {
  const crypto = require('node:crypto');
  const { PaystackRefundAdapter } = require('../dist/modules/payment/paystack.refunds');
  const id = crypto.randomUUID(); const calls = [];
  const adapter = new PaystackRefundAdapter('test-secret', async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') return { ok: true, json: async () => ({ status: true, data: { id: 123 } }) };
    return { ok: true, json: async () => ({ status: true, data: { id: 123, status: 'processed', amount: 2000, currency: 'NGN', merchant_note: `TOFA_REFUND:${id}`, transaction: { reference: 'original-payment' } } }) };
  });
  assert.equal(adapter.supportsRetry, false);
  assert.deepEqual(await adapter.submit({ idempotencyKey: id, paymentReference: 'original-payment', amount: '20.00', currency: 'NGN' }), { reference: '123' });
  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.amount, 2000); assert.equal(sent.transaction, 'original-payment'); assert.equal(sent.merchant_note, `TOFA_REFUND:${id}`);
  const raw = Buffer.from(JSON.stringify({ event: 'refund.processed', data: { id: 123 } }));
  const signature = crypto.createHmac('sha512', 'test-secret').update(raw).digest('hex');
  await assert.rejects(() => adapter.verifyWebhook(raw, { 'x-paystack-signature': '0'.repeat(128) }));
  const receipt = await adapter.verifyWebhook(raw, { 'x-paystack-signature': signature });
  assert.equal(receipt.refundId, id); assert.equal(receipt.status, 'successful'); assert.equal(receipt.amount, '20.00'); assert.equal(receipt.paymentReference, 'original-payment');
  assert.equal(calls[1].url, 'https://api.paystack.co/refund/123');
  await assert.rejects(() => adapter.submit({ idempotencyKey: id, paymentReference: 'original-payment', amount: '9999999999999999.99', currency: 'NGN' }));
  const pending = Buffer.from('{"event":"refund.pending","data":{"id":123}}');
  assert.equal(await adapter.verifyWebhook(pending, { 'x-paystack-signature': crypto.createHmac('sha512', 'test-secret').update(pending).digest('hex') }), null);
});
test('enabled Paystack webhook validates raw bytes on the existing payment URL', async () => {
  const { config } = require('../dist/config'); const { buildApp } = require('../dist/app');
  const crypto = require('node:crypto');
  config.refunds.paystackEnabled = true; config.refunds.paystackSecretKey = 'webhook-test-secret';
  config.payment.webhooksEnabled = true; config.payment.webhookSharedSecret = 'shared-webhook-secret';
  const app = await buildApp();
  try {
    await app.ready();
    const raw = '{ "event": "refund.pending", "data": { "id": 123 } }';
    const url = '/api/payments/webhooks/paystack';
    const denied = await app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: raw });
    assert.equal(denied.statusCode, 401, denied.body);
    const signature = crypto.createHmac('sha512', 'webhook-test-secret').update(raw).digest('hex');
    const valid = await app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json', 'x-payment-webhook-secret': 'shared-webhook-secret', 'x-paystack-signature': signature }, payload: raw });
    assert.equal(valid.statusCode, 200, valid.body);
    const modified = await app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json', 'x-payment-webhook-secret': 'shared-webhook-secret', 'x-paystack-signature': signature }, payload: raw + ' ' });
    assert.equal(modified.statusCode, 401, modified.body);
  } finally { await app.close(); config.refunds.paystackEnabled = false; config.refunds.paystackSecretKey = ''; config.payment.webhooksEnabled = false; config.payment.webhookSharedSecret = ''; }
});
