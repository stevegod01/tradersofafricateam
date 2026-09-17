import { FastifyInstance, FastifyRequest, HTTPMethods } from 'fastify';
import { requireAuth, requirePermission } from '../../common/middleware/auth.middleware';
import { AfterSalesService, Actor, RefundInput, result } from './after-sales.service';
import { AfterSalesSetting } from '../../database/entities/after-sales-settings.entity';
import { PaymentRefundService } from '../payment/payment.refunds';
import * as S from './after-sales.schemas';
import { createError } from '../../common/utils/http-error.util';
export async function afterSalesRoutes(app: FastifyInstance): Promise<void> {
  const service = new AfterSalesService();
  const payments = new PaymentRefundService();
  const actor = (r: FastifyRequest, type: Actor['type']): Actor => ({ id: type === 'admin' ? r.dbAdmin!.id : r.dbUser!.id, type });
  type RouteBody = RefundInput & {
    decision: 'approve' | 'reject'; notes: string; description: string;
    items: Array<{ orderItemId: string; quantity: number | string; reason?: string }>;
    evidence: string[]; refundRequired?: boolean; providerName: string; trackingId: string;
    trackingUrl?: string; deliveryContact?: string; reference: string;
  };
  function route(method: HTTPMethods, url: string, summary: string, permission: string | undefined, handler: (r: FastifyRequest, params: Record<string, string>, body: RouteBody) => Promise<unknown>, body?: unknown, query?: unknown) {
    app.route({
      method, url, schema: S.schema(summary, url, body, query, permission),
      preHandler: permission ? requirePermission(permission) : requireAuth,
      handler: async (r, reply) => {
        const output = await handler(r, r.params as Record<string, string>, (r.body ?? {}) as RouteBody);
        if (method === 'POST' && (url.endsWith('/cancellation') || url === '/returns' || url === '/admin/refunds'))
          reply.code(201);
        return output;
      },
    });
  }
  route('GET', '/admin/after-sales/analytics', 'Cancellation and refund rates, gross/net GMV and fee adjustments by currency', 'analytics.view_revenue', async (r) => {
    const { AppDataSource } = await import('../../database/data-source');
    const { Order } = await import('../../database/entities/order.entity');
    const { afterSalesAnalytics } = await import('./after-sales.analytics');
    const q = r.query as Record<string, string>;
    const orders = AppDataSource.getRepository(Order).createQueryBuilder('order');
    if (q.dateFrom)
      orders.andWhere('order.createdAt >= :dateFrom', { dateFrom: q.dateFrom });
    if (q.dateTo)
      orders.andWhere('order.createdAt <= :dateTo', { dateTo: q.dateTo });
    if (q.currency)
      orders.andWhere('order.orderCurrency = :currency', { currency: q.currency });
    return result(await afterSalesAnalytics(orders));
  }, undefined, S.object({
    dateFrom: { type: 'string', format: 'date-time' }, dateTo: { type: 'string', format: 'date-time' }, currency: { type: 'string', pattern: '^[A-Z]{3}$' }
  }));
  route('GET', '/orders/:id/after-sales-eligibility', 'Get server-derived cancellation and item return eligibility', undefined, (r, p) => service.eligibility(actor(r, 'buyer'), p.id));
  for (const type of ['buyer', 'seller', 'admin'] as const) {
    const prefix = type === 'buyer' ? '' : `/${type}`;
    route('POST', `${prefix}/orders/:sellerOrderId/cancellation`, `${type} requests seller-order cancellation`, type === 'admin' ? 'orders.cancel' : undefined, (r, p, b) => service.cancellation(actor(r, type), p.sellerOrderId, b), S.cancellationBody(type));
  }
  for (const kind of ['cancellations', 'returns', 'refunds'] as const) {
    const permission = kind === 'cancellations' ? 'orders.view' : `${kind}.view`;
    for (const admin of [false, true]) {
      const prefix = admin ? '/admin' : '';
      route('GET', `${prefix}/${kind}`, `List ${kind}`, admin ? permission : undefined, r => service.list(kind, actor(r, admin ? 'admin' : 'buyer'), r.query as Record<string, string | number | undefined>), undefined, S.queryFor(kind));
      route('GET', `${prefix}/${kind}/:id`, `Get ${kind} details and timeline`, admin ? permission : undefined, (r, p) => service.detail(kind, actor(r, admin ? 'admin' : 'buyer'), p.id));
    }
  }
  route('PATCH', '/admin/cancellations/:id/respond', 'Approve or reject a pending cancellation', 'orders.cancel', (r, p, b) => service.reviewCancellation(actor(r, 'admin'), p.id, b.decision, b.notes), S.reviewBody);
  route('POST', '/returns', 'Request a return for purchased item quantities', undefined, (r, _p, b) => service.createReturn(actor(r, 'buyer'), b), S.returnBody);
  app.post('/returns/evidence-uploads', { schema: { ...S.schema('Upload return evidence; use returned fileId in a return request', '/returns/evidence-uploads'), consumes: ['multipart/form-data'], body: S.object({ file: { type: 'string', format: 'binary' } }, ['file']) }, preHandler: requireAuth }, async (r) => {
    const file = await r.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
    if (!file)
      throw createError.badRequest('Evidence file is required');
    const buffer = await file.toBuffer();
    if (file.file.truncated)
      throw createError.badRequest('Evidence file exceeds 10 MB');
    return service.uploadEvidence(r.dbUser!.id, {
      filename: file.filename, mimetype: file.mimetype, buffer
    });
  });
  for (const type of ['seller', 'admin'] as const) {
    route('PATCH', `/${type}/returns/:id/respond`, 'Approve or reject return; rejection permits dispute escalation', type === 'admin' ? 'returns.manage' : undefined, (r, p, b) => service.updateReturn(actor(r, type), p.id, 'respond', b), type === 'admin' ? S.adminReturnReviewBody : S.reviewBody);
    route('PATCH', `/${type}/returns/:id/received`, 'Confirm return receipt and request applicable refund', type === 'admin' ? 'returns.manage' : undefined, (r, p) => service.updateReturn(actor(r, type), p.id, 'received'));
  }
  route('PATCH', '/returns/:id/shipment', 'Record buyer return shipment tracking', undefined, (r, p, b) => service.updateReturn(actor(r, 'buyer'), p.id, 'shipment', b), S.shipmentBody);
  route('PATCH', '/returns/:id/cancel', 'Withdraw return before shipment', undefined, (r, p) => service.updateReturn(actor(r, 'buyer'), p.id, 'cancel'));
  route('POST', '/admin/refunds', 'Create an authorized refund using original transaction allocation', 'refunds.create', (r, _p, b) => service.adminCreateRefund(actor(r, 'admin'), b), S.refundBody);
  route('PATCH', '/admin/refunds/:id/approve', 'Approve refund without confirming money movement', 'refunds.approve', (r, p) => service.approveRefund(actor(r, 'admin'), p.id));
  route('PATCH', '/admin/refunds/:id/cancel', 'Cancel refund before any financial processing', 'refunds.approve', (r, p, b) => service.cancelRefund(actor(r, 'admin'), p.id, b.notes), S.notesBody);
  route('POST', '/admin/refunds/:id/process', 'Begin idempotent provider or manual refund processing', 'refunds.process', (r, p) => payments.process(actor(r, 'admin'), p.id));
  route('POST', '/admin/refunds/:id/retry', 'Retry a confirmed failed refund using its original idempotency key', 'refunds.process', (r, p) => payments.process(actor(r, 'admin'), p.id, true));
  route('POST', '/admin/refunds/:id/reconcile', 'Fetch and apply actual provider refund status without resubmitting money movement', 'refunds.process', (r, p, b) => payments.reconcile(actor(r, 'admin'), p.id, b.reference), S.object({ reference: {
      type: 'string', minLength: 1, maxLength: 160
    } }));
  route('PATCH', '/admin/refunds/:id/confirm', 'Confirm actual manual refund transfer with bank reference', 'refunds.confirm', (r, p, b) => payments.confirmManual(actor(r, 'admin'), p.id, b), S.confirmBody);
  route('PATCH', '/admin/refunds/:id/fail', 'Record reconciled manual refund failure; funds remain reserved', 'refunds.confirm', (r, p, b) => payments.failManual(actor(r, 'admin'), p.id, b), S.confirmBody);
  route('GET', '/admin/returns/settings', 'Get database-backed after-sales policy', 'returns.view', async () => result(await service.settings()));
  route('PATCH', '/admin/returns/settings', 'Update after-sales policy for future requests', 'settings.update', (r, _p, b) => service.updateSettings(actor(r, 'admin'), b as unknown as Partial<AfterSalesSetting>), S.settingsBody);
  await app.register(async (webhookApp) => {
    webhookApp.removeContentTypeParser('application/json');
    webhookApp.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 1024 * 1024 }, (_req, body, done) => done(null, body));
    webhookApp.post('/payments/refunds/webhooks/:gateway', { schema: {
        ...{ 'x-streaming-body': { type: 'object', additionalProperties: true, description: 'Provider-specific signed JSON event. The raw bytes are validated by the configured refund adapter.' } }, response: { 200: { type: 'object', additionalProperties: true, properties: { success: { type: 'boolean' }, message: { type: 'string' }, data: S.RefundRecordSchema } } }, tags: ['Cancellation, Returns & Refunds'], description: 'Send the exact provider JSON and signature headers required by the configured adapter. This endpoint verifies raw bytes before processing.', summary: 'Verified refund provider callback (requires a configured real adapter)', params: S.object({ gateway: { type: 'string', pattern: '^[a-z0-9_-]{1,80}$' } }, ['gateway'])
      } }, async (r) => {
      if (!Buffer.isBuffer(r.body))
        throw createError.badRequest('Raw JSON provider payload required');
      return payments.webhook((r.params as {
        gateway: string;
      }).gateway, r.body, r.headers);
    });
  });
}
