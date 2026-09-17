require('./after-sales-env.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { AppDataSource: ds } = require('../dist/database/data-source');
const { User } = require('../dist/database/entities/user.entity');
const { Order } = require('../dist/database/entities/order.entity');
const { OrderItem } = require('../dist/database/entities/order-item.entity');
const { OrderDelivery } = require('../dist/database/entities/order-delivery.entity');
const { Payment } = require('../dist/database/entities/payment.entity');
const { Refund } = require('../dist/database/entities/refunds.entity');
const { FinancialAdjustment } = require('../dist/database/entities/financial-adjustments.entity');
const { ReturnRequest } = require('../dist/database/entities/returns.entity');
const { AfterSalesService } = require('../dist/modules/after-sales/after-sales.service');
const { PaymentRefundService, registerRefundGateway } = require('../dist/modules/payment/payment.refunds');
const { OrderService } = require('../dist/modules/order/order.service');
const { DisputeService } = require('../dist/modules/dispute/dispute.service');
const { Dispute } = require('../dist/database/entities/dispute.entity');
const { afterSalesAnalytics } = require('../dist/modules/after-sales/after-sales.analytics');

const socket = process.env.AFTER_SALES_TEST_SOCKET;
test('MySQL migration and transactional after-sales workflows', { skip: !socket }, async t => {
  assert.ok(socket.startsWith('/tmp/tofa-after-sales-mysql-') || socket.startsWith('/private/tmp/tofa-after-sales-mysql-'), 'Only an isolated test socket is allowed');
  const dbName = `after_sales_test_${process.pid}_${Date.now()}`;
  const root = await require('mysql2/promise').createConnection({ socketPath: socket, user: 'root' });
  await root.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const options = { password: '', socketPath: socket, database: dbName, extra: { socketPath: socket, connectionLimit: 10 }, logging: false };
  ds.setOptions(options); Object.assign(ds.driver.options, options); ds.driver.database = dbName;
  const service = new AfterSalesService(); const paymentService = new PaymentRefundService();
  const admin = { id: crypto.randomUUID(), type: 'admin' };
  const checker = { id: crypto.randomUUID(), type: 'admin' };
  async function user() { return ds.manager.save(User, ds.manager.create(User, { firstName: 'Test', lastName: 'User', email: `${crypto.randomUUID()}@example.com`, status: 'active', userType: 'buyer' })); }
  async function fixture({ status = 'paid', products = '100.00', logistics = '0.00', paid = '100.00', currency = 'USD', orderCurrency = 'USD', deliveryType = 'seller_arranged', sharedPayment, buyer } = {}) {
    buyer ??= await user(); const seller = await user();
    const payment = sharedPayment ?? await ds.manager.save(Payment, ds.manager.create(Payment, { paymentReference: `PAY-${crypto.randomUUID()}`, payerId: buyer.id, sourceType: 'checkout', sourceId: crypto.randomUUID(), purpose: 'marketplace_purchase', description: 'Test payment', amount: paid, currency, paymentMethod: 'bank_transfer', status: 'confirmed' }));
    const order = await ds.manager.save(Order, ds.manager.create(Order, { orderReference: `ORD-${crypto.randomUUID()}`, paymentId: payment.id, buyerId: buyer.id, sellerId: seller.id, status, orderCurrency, productsSubtotal: products, logisticsAmount: logistics, orderTotal: (Number(products) + Number(logistics)).toFixed(2), paymentCurrency: currency, paymentAmount: paid, deliveryType, deliveryAddressSnapshot: {}, transactionFeeAmount: (Number(products) * .05).toFixed(2), transactionFeePercentage: '5.00' }));
    const item = await ds.manager.save(OrderItem, ds.manager.create(OrderItem, { orderId: order.id, productId: crypto.randomUUID(), productNameSnapshot: 'Test goods', unitPrice: (Number(products) / 10).toFixed(2), finalUnitPrice: (Number(products) / 10).toFixed(2), quantity: '10.000', subtotal: products }));
    if (['delivered', 'completed'].includes(status)) await ds.manager.save(OrderDelivery, ds.manager.create(OrderDelivery, { orderId: order.id, deliveryType, pickupAddressSnapshot: {}, deliveryAddressSnapshot: {}, deliveredAt: new Date() }));
    return { order, payment, item, buyer: { id: buyer.id, type: 'buyer' }, seller: { id: seller.id, type: 'seller' }, buyerUser: buyer };
  }
  async function refund(f, amount = '20.00') { return (await service.adminCreateRefund(admin, { sellerOrderId: f.order.id, sourceType: 'admin', refundType: 'partial', amount, reason: 'Authorized correction' })).data; }
  async function complete(id, reference = crypto.randomUUID()) { await service.approveRefund(checker, id); await paymentService.process(admin, id); return paymentService.confirmManual(admin, id, { reference, notes: 'Bank confirms funds transferred' }); }
  try {
    await ds.initialize();
    const migrations = await ds.runMigrations({ transaction: 'each' });
    assert.ok(migrations.some(m => m.name === 'AddAfterSales1787520017000'));
    assert.equal((await ds.runMigrations({ transaction: 'each' })).length, 0, 'Migrations are not replayed');
    await t.test('concurrent cancellation creates one request and approval creates a pending refund', async () => {
      const f = await fixture();
      const attempts = await Promise.allSettled([1, 2].map(() => service.cancellation(f.buyer, f.order.id, { reason: 'ordered_by_mistake' })));
      assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
      const cancellation = attempts.find(x => x.status === 'fulfilled').value.data;
      const approved = await service.reviewCancellation(admin, cancellation.id, 'approve', 'Reviewed locked order terms');
      assert.equal((await ds.manager.findOneByOrFail(Order, { id: f.order.id })).status, 'cancelled');
      assert.equal((await ds.manager.findOneByOrFail(Refund, { id: approved.data.refundId })).status, 'pending');
      assert.equal((await ds.manager.findOneByOrFail(Payment, { id: f.payment.id })).status, 'confirmed');
    });
    await t.test('legacy cancellation approval rechecks shipment state', async () => {
      const f = await fixture(); const orderService = new OrderService();
      const c = await orderService.requestCancellation(f.buyer.id, f.order.id, { reason: 'Legacy explanation' });
      await ds.manager.update(Order, f.order.id, { status: 'shipped' });
      await assert.rejects(() => orderService.approveCancellationRequest(f.order.id, c.data.id, admin.id, {}), /before shipment/);
      assert.equal(await ds.manager.countBy(Refund, { orderId: f.order.id }), 0);
    });
    await t.test('concurrent refunds cannot exceed seller allocation', async () => {
      const f = await fixture(); const results = await Promise.allSettled([refund(f, '70.00'), refund(f, '70.00')]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(await ds.manager.countBy(Refund, { orderId: f.order.id }), 1);
    });
    await t.test('multi-seller payment caps and sibling independence', async () => {
      const f = await fixture({ paid: '200.00', products: '200.00' });
      await ds.manager.update(Order, f.order.id, { paymentAmount: '100.00', orderTotal: '100.00', productsSubtotal: '100.00' });
      const sibling = await fixture({ sharedPayment: f.payment, buyer: f.buyerUser });
      const r = await refund(f, '100.00'); await complete(r.id);
      assert.equal((await ds.manager.findOneByOrFail(Order, { id: sibling.order.id })).status, 'paid');
      const second = await refund(sibling, '100.00'); await complete(second.id);
      await assert.rejects(() => refund(sibling, '0.01'));
      assert.equal(String((await ds.manager.findOneByOrFail(Payment, { id: f.payment.id })).amount), '200.00');
    });
    await t.test('confirmation is idempotent, preserves original FX/fee and derives reversals', async () => {
      const f = await fixture({ products: '1000.00', paid: '100.00', orderCurrency: 'NGN' });
      const r = await refund(f); const ref = crypto.randomUUID();
      await assert.rejects(() => paymentService.confirmManual(admin, r.id, { reference: ref, notes: 'Not processed' }));
      await assert.rejects(() => service.approveRefund(admin, r.id), /different administrators/);
      await service.approveRefund(checker, r.id);
      assert.equal((await ds.manager.findOneByOrFail(Refund, { id: r.id })).status, 'approved');
      await assert.rejects(() => paymentService.process(checker, r.id), /cannot perform financial processing/);
      await paymentService.process(admin, r.id);
      const confirmations = await Promise.all([1, 2].map(() => paymentService.confirmManual(admin, r.id, { reference: ref, notes: 'Confirmed bank transfer' })));
      assert.ok(confirmations.every(x => x.data.status === 'successful'));
      assert.equal(await ds.manager.countBy(FinancialAdjustment, { refundId: r.id, adjustmentType: 'refund' }), 1);
      assert.equal((await ds.manager.findOneByOrFail(FinancialAdjustment, { refundId: r.id, adjustmentType: 'transaction_fee_reversal' })).amount, '10.00');
      const original = await ds.manager.findOneByOrFail(Order, { id: f.order.id });
      assert.equal(String(original.transactionFeeAmount), '50.00'); assert.equal(String(original.orderTotal), '1000.00');
      const metrics = await afterSalesAnalytics(ds.getRepository(Order).createQueryBuilder('order').where('order.id = :id', { id: f.order.id }));
      assert.equal(metrics.refunds[0].currency, 'USD'); assert.equal(metrics.orderCurrencyRefunds[0].productAmount, '200.00');
    });
    await t.test('failed refunds continue reserving money and retry retains history', async () => {
      const f = await fixture(); const r = await refund(f, '80.00'); await service.approveRefund(checker, r.id); await paymentService.process(admin, r.id);
      await paymentService.failManual(admin, r.id, { reference: 'failure-check', notes: 'Bank confirms transfer failed without debit' });
      await assert.rejects(() => refund(f, '30.00'));
      await assert.rejects(() => service.cancelRefund(admin, r.id, 'Cannot release uncertain reservations'));
      await paymentService.process(admin, r.id, true);
      assert.equal((await ds.manager.findOneByOrFail(Refund, { id: r.id })).attemptCount, 2);
    });
    await t.test('return ownership, quantity, window and evidence references are enforced', async () => {
      const f = await fixture({ status: 'delivered' });
      const input = { sellerOrderId: f.order.id, reason: 'damaged_product', description: 'Cartons damaged', items: [{ orderItemId: f.item.id, quantity: '2.000' }], evidence: [] };
      await assert.rejects(() => service.createReturn({ id: crypto.randomUUID(), type: 'buyer' }, input));
      await assert.rejects(() => service.createReturn(f.buyer, { ...input, items: [{ orderItemId: f.item.id, quantity: '10.001' }] }));
      await assert.rejects(() => service.createReturn(f.buyer, { ...input, evidence: [crypto.randomUUID()] }));
      const ret = (await service.createReturn(f.buyer, input)).data;
      await assert.rejects(() => service.createReturn(f.buyer, input));
      await assert.rejects(() => service.updateReturn(f.buyer, ret.id, 'respond', { decision: 'approve' }));
      await service.updateReturn(f.seller, ret.id, 'respond', { decision: 'approve', notes: 'Send back' });
      await service.updateReturn(f.buyer, ret.id, 'shipment', { providerName: 'Carrier', trackingId: 'tracking-123' });
      const received = (await service.updateReturn(f.seller, ret.id, 'received')).data;
      const r = await ds.manager.findOneByOrFail(Refund, { id: received.refundId }); assert.equal(r.amount, '20.00');
      await complete(r.id); assert.equal((await ds.manager.findOneByOrFail(ReturnRequest, { id: ret.id })).status, 'completed');
      await assert.rejects(() => service.createReturn(f.buyer, { ...input, items: [{ orderItemId: f.item.id, quantity: '9.000' }] }));
      const old = await fixture({ status: 'delivered' });
      await ds.manager.update(OrderDelivery, { orderId: old.order.id }, { deliveredAt: new Date(Date.now() - 8 * 86400000) });
      await assert.rejects(() => service.createReturn(old.buyer, { ...input, sellerOrderId: old.order.id, items: [{ orderItemId: old.item.id, quantity: 1 }] }), /window/);
    });
    await t.test('buyer-arranged external delivery cannot be refunded', async () => {
      const f = await fixture({ products: '80.00', logistics: '20.00', deliveryType: 'buyer_arranged' });
      await assert.rejects(() => refund(f, '100.00'));
      const r = await refund(f, '80.00'); assert.equal(r.breakdown.logisticsAmount, '0.00');
    });
    await t.test('dispute resolution atomically creates a pending refund', async () => {
      const f = await fixture({ status: 'delivered' });
      const dispute = await ds.manager.save(Dispute, ds.manager.create(Dispute, { disputeNumber: `DSP-${crypto.randomBytes(8).toString('hex')}`, orderId: f.order.id, sellerOrderId: f.order.id, raisedBy: f.buyer.id, raisedByType: 'buyer', buyerId: f.buyer.id, sellerId: f.seller.id, reason: 'damaged_product', description: 'Items were damaged', status: 'open' }));
      const disputes = new DisputeService(); disputes.sendResolutionEmails = async () => {};
      await disputes.resolveDispute(dispute.id, admin.id, { resolutionType: 'partial_resolution', resolutionNotes: 'Authorized partial refund for damaged goods', financialAction: { type: 'partial_refund', amount: 20, currency: 'USD' } });
      assert.equal((await ds.manager.findOneByOrFail(Refund, { disputeId: dispute.id })).status, 'pending');
      await assert.rejects(() => disputes.resolveDispute(dispute.id, admin.id, { resolutionType: 'partial_resolution', resolutionNotes: 'Duplicate resolution', financialAction: { type: 'partial_refund', amount: 20, currency: 'USD' } }));
    });
    await t.test('provider timeout cannot cause resubmission or manual confirmation', async () => {
      let calls = 0;
      registerRefundGateway('test_gateway', { submit: async () => { calls++; throw new Error('Timeout after provider accepted'); }, verifyWebhook: async () => { throw new Error('Invalid signature'); } });
      const f = await fixture(); await ds.manager.update(Payment, f.payment.id, { paymentMethod: 'test_gateway', providerReference: 'provider-payment' });
      const r = await refund(f); await service.approveRefund(checker, r.id);
      await assert.rejects(() => paymentService.process(admin, r.id), /unconfirmed/);
      await paymentService.process(admin, r.id); assert.equal(calls, 1);
      await assert.rejects(() => paymentService.confirmManual(admin, r.id, { reference: 'fake', notes: 'No provider confirmation' }));
      await assert.rejects(() => paymentService.webhook('test_gateway', Buffer.from('{}'), {}));
      assert.equal((await ds.manager.findOneByOrFail(Refund, { id: r.id })).status, 'processing');
    });
    await t.test('verified gateway receipts complete once and cannot regress success', async () => {
      let currentReceipt;
      registerRefundGateway('verified_test', { submit: async () => ({ reference: 'provider-refund-123' }), verifyWebhook: async (_body, headers) => {
        if (headers['test-signature'] !== 'valid') throw new Error('Bad signature');
        return currentReceipt;
      } });
      const f = await fixture(); await ds.manager.update(Payment, f.payment.id, { paymentMethod: 'verified_test', providerReference: 'provider-payment' });
      const r = await refund(f); await service.approveRefund(checker, r.id); await paymentService.process(admin, r.id);
      currentReceipt = { refundId: r.id, reference: 'provider-refund-123', amount: '20.00', currency: 'USD', status: 'successful' };
      await assert.rejects(() => paymentService.webhook('verified_test', Buffer.from('{}'), {}));
      currentReceipt.amount = '21.00'; await assert.rejects(() => paymentService.webhook('verified_test', Buffer.from('{}'), { 'test-signature': 'valid' }));
      currentReceipt.amount = '20.00';
      await Promise.all([1, 2].map(() => paymentService.webhook('verified_test', Buffer.from('{}'), { 'test-signature': 'valid' })));
      currentReceipt.status = 'failed'; await paymentService.webhook('verified_test', Buffer.from('{}'), { 'test-signature': 'valid' });
      assert.equal((await ds.manager.findOneByOrFail(Refund, { id: r.id })).status, 'successful');
      assert.equal(await ds.manager.countBy(FinancialAdjustment, { refundId: r.id, adjustmentType: 'refund' }), 1);
    });
    await t.test('an authorized non-refund return completes without money movement', async () => {
      const f = await fixture({ status: 'delivered' });
      const ret = (await service.createReturn(f.buyer, { sellerOrderId: f.order.id, reason: 'wrong_product', description: 'Replacement agreed', items: [{ orderItemId: f.item.id, quantity: 1 }], evidence: [] })).data;
      await assert.rejects(() => service.updateReturn(f.seller, ret.id, 'respond', { decision: 'approve', refundRequired: false }));
      await service.updateReturn(admin, ret.id, 'respond', { decision: 'approve', refundRequired: false, notes: 'Buyer agreed to replacement' });
      await service.updateReturn(f.buyer, ret.id, 'shipment', { providerName: 'Carrier', trackingId: 'return-replacement' });
      assert.equal((await service.updateReturn(f.seller, ret.id, 'received')).data.status, 'completed');
      assert.equal(await ds.manager.countBy(Refund, { orderId: f.order.id }), 0);
    });
    await t.test('refund detail is buyer scoped and redacts settlement snapshots', async () => {
      const f = await fixture(); const r = await refund(f);
      await assert.rejects(() => service.detail('refunds', f.seller, r.id));
      const details = (await service.detail('refunds', f.buyer, r.id)).data;
      assert.equal(details.financialSnapshot, undefined); assert.equal(details.failureReason, undefined);
      const adminDetails = (await service.detail('refunds', admin, r.id)).data; assert.ok(adminDetails.financialSnapshot); assert.ok(adminDetails.originalPayment);
    });
    await t.test('HTTP enforces financial permissions and closes the legacy cancellation bypass', async () => {
      const { Admin } = require('../dist/database/entities/admin.entity');
      const { AdminRoleEntity } = require('../dist/database/entities/admin-role.entity');
      const { AdminRolePermission } = require('../dist/database/entities/admin-role-permission.entity');
      const { Permission } = require('../dist/database/entities/permission.entity');
      const role = await ds.manager.save(AdminRoleEntity, ds.manager.create(AdminRoleEntity, { name: crypto.randomUUID(), status: 'active' }));
      const permission = await ds.manager.findOneByOrFail(Permission, { code: 'orders.manage' });
      await ds.manager.save(AdminRolePermission, ds.manager.create(AdminRolePermission, { roleId: role.id, permissionId: permission.id }));
      const limited = await ds.manager.save(Admin, ds.manager.create(Admin, { firstName: 'Limited', lastName: 'Admin', email: `${crypto.randomUUID()}@example.com`, status: 'active', roleId: role.id, authVersion: 0 }));
      const { buildApp } = require('../dist/app'); const app = await buildApp();
      try {
        await app.ready();
        const token = app.jwt.sign({ sub: limited.id, tokenType: 'admin', authVersion: 0 });
        const f = await fixture();
        const denied = await app.inject({ method: 'PATCH', url: `/api/admin/orders/${f.order.id}/status`, headers: { authorization: `Bearer ${token}` }, payload: { status: 'cancelled', reason: 'Attempt without permission' } });
        assert.equal(denied.statusCode, 403, denied.body);
        const deniedRefunds = await app.inject({ method: 'GET', url: '/api/admin/refunds', headers: { authorization: `Bearer ${token}` } });
        assert.equal(deniedRefunds.statusCode, 403, deniedRefunds.body);
        const buyerToken = app.jwt.sign({ sub: f.buyer.id, tokenType: 'user' });
        const created = await app.inject({ method: 'POST', url: `/api/orders/${f.order.id}/cancellation`, headers: { authorization: `Bearer ${buyerToken}` }, payload: { reason: 'ordered_by_mistake' } });
        assert.equal(created.statusCode, 201, created.body); assert.ok(created.json().data.cancellationNumber);
        const list = await app.inject({ method: 'GET', url: '/api/cancellations', headers: { authorization: `Bearer ${buyerToken}` } });
        assert.equal(list.statusCode, 200, list.body); assert.equal(list.json().data.length, 1);
      } finally { await app.close(); }
    });
  } finally {
    if (ds.isInitialized) await ds.destroy();
    await root.query(`DROP DATABASE \`${dbName}\``); await root.end();
  }
});
