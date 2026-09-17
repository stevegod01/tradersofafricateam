import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSeller, requirePermission } from '../../common/middleware/auth.middleware';
import { PayoutAccountService } from './settlement.accounts';
import { PayoutService } from './payout.service';
import { SettlementService } from './settlement.service';
import { accountSchema, accountUpdateSchema, accountVerifySchema, adjustmentSchema, confirmSchema, idSchema, listSchema, reasonSchema } from './settlement.schemas';
import { settlementSwagger as swagger } from './settlement.swagger';
import { settlementReconciliation } from './settlement.reconciliation';
const approveSchema = z.object({ method: z.enum(['manual', 'paystack']).default('manual') }).strict();
const id = (params: unknown, key: string) => idSchema.parse((params as Record<string, unknown>)[key]);
export async function settlementRoutes(app: FastifyInstance) {
  const accounts = new PayoutAccountService(), s = new SettlementService(), p = new PayoutService();
  app.addHook('onRequest', async (_req, reply) => { reply.header('Cache-Control', 'private, no-store'); });
  app.post('/seller/payout-accounts', {
    preHandler: requireSeller, schema: swagger('Add payout account', 'Creates an encrypted pending account. Verification is required before payout.', { body: accountSchema })
  }, r => accounts.create(r.dbUser!.id, accountSchema.parse(r.body)));
  app.get('/seller/payout-accounts', {
    preHandler: requireSeller, schema: swagger('List payout accounts', 'Returns only the authenticated seller’s masked accounts.')
  }, r => accounts.list(r.dbUser!.id));
  app.patch('/seller/payout-accounts/:payoutAccountId', {
    preHandler: requireSeller, schema: swagger('Update payout account', 'Sensitive changes revoke verification and default status. Existing processing destinations remain frozen.', { param: 'payoutAccountId', body: accountUpdateSchema })
  }, r => accounts.update(r.dbUser!.id, id(r.params, 'payoutAccountId'), accountUpdateSchema.parse(r.body)));
  app.patch('/seller/payout-accounts/:payoutAccountId/default', {
    preHandler: requireSeller, schema: swagger('Set default payout account', 'One verified default per seller and currency.', { param: 'payoutAccountId' })
  }, r => accounts.setDefault(r.dbUser!.id, id(r.params, 'payoutAccountId')));
  for (const scope of ['seller', 'admin'] as const) {
    const seller = scope === 'seller';
    app.get(`/${scope}/settlements`, {
      preHandler: seller ? requireSeller : requirePermission('settlements.view'), schema: swagger('List ' + scope + ' settlements', 'Filters are scoped to the seller when using a seller token.', { query: listSchema })
    }, r => s.list('settlement', listSchema.parse(r.query), seller ? r.dbUser!.id : undefined));
    app.get(`/${scope}/settlements/summary`, {
      preHandler: seller ? requireSeller : requirePermission('settlements.view'), schema: swagger('Settlement summary', 'Totals grouped by currency and status; currencies are never added together.')
    }, r => s.summary(seller ? r.dbUser!.id : undefined));
    app.get(`/${scope}/settlements/:settlementId`, {
      preHandler: seller ? requireSeller : requirePermission('settlements.view'), schema: swagger('Settlement detail', 'Historical fees, holds, adjustments and associated payout.', { param: 'settlementId' })
    }, r => s.detail(id(r.params, 'settlementId'), seller ? r.dbUser!.id : undefined));
    app.get(`/${scope}/payouts`, {
      preHandler: seller ? requireSeller : requirePermission('payouts.view'), schema: swagger('List ' + scope + ' payouts', 'One payout per seller order. Retry attempts preserve history.', { query: listSchema })
    }, r => s.list('payout', listSchema.parse(r.query), seller ? r.dbUser!.id : undefined));
    app.get(`/${scope}/payouts/:payoutId/statement`, {
      preHandler: seller ? requireSeller : requirePermission('payouts.view'), schema: swagger('Payout statement', 'Frozen financial breakdown, masked destination and attempt history. Successful statements are immutable.', { param: 'payoutId' })
    }, r => s.statement(id(r.params, 'payoutId'), seller ? r.dbUser!.id : undefined));
  }
  app.get('/admin/payouts/:payoutId', {
    preHandler: requirePermission('payouts.view'), schema: swagger('Payout detail', 'Includes transfer attempt history.', { param: 'payoutId' })
  }, r => s.statement(id(r.params, 'payoutId')));
  app.get('/admin/payout-accounts', {
    preHandler: requirePermission('payout_accounts.view'), schema: swagger('Seller payout accounts', 'A seller ID is required; only masked details are returned.', { query: z.object({ sellerId: z.string().uuid() }).strict() })
  }, r => accounts.list(z.object({ sellerId: z.string().uuid() }).parse(r.query).sellerId));
  app.post('/admin/payout-accounts/:payoutAccountId/verification-details', {
    preHandler: requirePermission('payout_accounts.verify'), schema: swagger('Retrieve bank verification details', 'Sensitive audited access for independent bank verification. Never cache or body-log this response.', { param: 'payoutAccountId', body: reasonSchema })
  }, r => accounts.verificationDetails(id(r.params, 'payoutAccountId'), r.dbAdmin!.id, reasonSchema.parse(r.body).reason));
  app.patch('/admin/payout-accounts/:payoutAccountId/verify', {
    preHandler: requirePermission('payout_accounts.verify'), schema: swagger('Verify bank ownership', 'Record independent bank ownership verification and evidence reference in reason. Version protects against concurrent account edits.', { param: 'payoutAccountId', body: accountVerifySchema })
  }, r => accounts.verify(id(r.params, 'payoutAccountId'), r.dbAdmin!.id, accountVerifySchema.parse(r.body)));
  app.post('/admin/payout-accounts/:payoutAccountId/link-paystack', {
    preHandler: requirePermission('payout_accounts.verify'), schema: swagger('Link verified account to Paystack', 'Requires configured gateway and a verified Nigerian NGN bank account. Does not transfer money.', { param: 'payoutAccountId', body: reasonSchema })
  }, r => p.linkAccount(id(r.params, 'payoutAccountId'), r.dbAdmin!.id, reasonSchema.parse(r.body).reason));
  for (const action of ['hold', 'release'] as const)
    app.post(`/admin/settlements/:settlementId/${action}`, {
      preHandler: requirePermission('settlements.hold'), schema: swagger(action + ' settlement', 'Each administrator owns a separate manual hold. Release removes only their own hold and rechecks all system holds.', { param: 'settlementId', body: reasonSchema })
    }, r => s.hold(id(r.params, 'settlementId'), r.dbAdmin!.id, reasonSchema.parse(r.body).reason, action === 'release'));
  app.post('/admin/settlements/:settlementId/adjustments', {
    preHandler: requirePermission('settlements.adjust'), schema: swagger('Append settlement adjustment', 'Positive decimal amount, same currency, reason and UUID idempotency key required. Settled adjustments become future credits/debits. Creator cannot approve the affected payout.', { param: 'settlementId', body: adjustmentSchema })
  }, r => s.adjust(id(r.params, 'settlementId'), r.dbAdmin!.id, adjustmentSchema.parse(r.body)));
  app.post('/admin/payouts/:payoutId/approve', {
    preHandler: requirePermission('payouts.approve'), schema: swagger('Approve payout', 'Rechecks eligibility, snapshots account and finances, and reserves future ledger offsets. Default method is manual.', { param: 'payoutId', body: approveSchema })
  }, r => p.approve(id(r.params, 'payoutId'), r.dbAdmin!.id, approveSchema.parse(r.body ?? {}).method));
  app.post('/admin/payouts/:payoutId/process', {
    preHandler: requirePermission('payouts.process'), schema: swagger('Process approved payout', 'Processor must differ from approver. Manual starts bank processing; Paystack submits one durable attempt. Unknown outcome requires reconciliation.', { param: 'payoutId' })
  }, r => p.process(id(r.params, 'payoutId'), r.dbAdmin!.id));
  for (const action of ['confirm', 'fail'] as const)
    app.patch(`/admin/payouts/:payoutId/${action}`, {
      preHandler: requirePermission('payouts.confirm'), schema: swagger(action + ' manual payout', 'Requires definitive bank evidence reference and notes. Never report an uncertain timeout as failure.', { param: 'payoutId', body: confirmSchema })
    }, r => p.confirm(id(r.params, 'payoutId'), r.dbAdmin!.id, confirmSchema.parse(r.body), action === 'fail'));
  app.post('/admin/payouts/:payoutId/retry', {
    preHandler: requirePermission('payouts.process'), schema: swagger('Retry failed payout', 'Only definitive failure can return to pending. Fresh approval is required before another attempt.', { param: 'payoutId', body: reasonSchema })
  }, r => p.retry(id(r.params, 'payoutId'), r.dbAdmin!.id, reasonSchema.parse(r.body).reason));
  app.post('/admin/payouts/:payoutId/destination', {
    preHandler: requirePermission('payouts.process'), schema: swagger('Retrieve frozen bank destination', 'Sensitive audited endpoint available only to this processing manual payout’s processor. Responses must not be logged or cached.', { param: 'payoutId', body: reasonSchema })
  }, r => p.destination(id(r.params, 'payoutId'), r.dbAdmin!.id, reasonSchema.parse(r.body).reason));
  app.post('/admin/payouts/:payoutId/reconcile', {
    preHandler: requirePermission('payouts.confirm'), schema: swagger('Reconcile Paystack transfer', 'Fetches financial status for the recorded reference; never submits another transfer.', { param: 'payoutId' })
  }, r => p.reconcile(id(r.params, 'payoutId')));
  app.get('/admin/settlements/reconciliation', {
    preHandler: requirePermission('settlements.view'), schema: swagger('Settlement reconciliation exceptions', 'Finds missing settlements, inconsistent payout totals, unsettled bank outcomes and unmatched recovery balances.')
  }, () => settlementReconciliation());
  await app.register(async (hook) => {
    hook.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 1048576 }, (_r, body, done) => done(null, body));
    hook.post('/payouts/webhooks/paystack', {
      schema: {
        ...{ 'x-streaming-body': { type: 'object', additionalProperties: true, properties: { event: { type: 'string' }, data: { type: 'object', additionalProperties: true } } } }, headers: { type: 'object', properties: { 'x-paystack-signature': { type: 'string', description: 'HMAC-SHA512 signature of the exact request bytes' } } }, tags: ['Seller settlements & payouts'], summary: 'Signed Paystack transfer callback', description: 'HMAC-SHA512 over exact request bytes; verified status is fetched from Paystack.', security: [], response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } }
      }
    }, r => p.webhook(r.body as Buffer, r.headers));
  });
}
