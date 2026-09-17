import { PayoutService } from '../settlement/payout.service';
import { auditPaymentWebhook } from '../audit-log/audit-log.webhooks';
import { config } from '../../config';
import { PaystackRefundAdapter } from './paystack.refunds';
import { PaymentRefundService } from './payment.refunds';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { createError } from '../../common/utils/http-error.util';
import { UploadedFile } from '../../common/utils/file-upload.util';
import {
  CancelPaymentSchema,
  CreatePaymentSchema,
  PaymentMethodsQuerySchema,
  PaymentProofFieldsSchema,
  PaymentQuerySchema,
  PaymentWebhookSchema,
} from '../../common/utils/validation.schemas';
import {
  CancelPaymentSwaggerSchema,
  ChangePaymentMethodSchema,
  CreatePaymentSwaggerSchema,
  GetAvailablePaymentMethodsSchema,
  GetPaymentByIdSchema,
  GetPaymentsSchema,
  PaymentWebhookSwaggerSchema,
  RetryPaymentSchema,
  UploadPaymentProofSchema,
} from '../../common/utils/swagger.schemas';
import { PaymentService } from './payment.service';
import { secureStringEqual } from '../../common/utils/secure-compare.util';

const WEBHOOK_PROVIDER_CODES = [
  'paystack',
  'flutterwave',
  'transactworld',
  'papss',
] as const;

export async function paymentRoutes(fastify: FastifyInstance): Promise<void> {
  // Preserve exact provider bytes for HMAC validation; ordinary payment bodies remain parsed JSON.
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    (request as FastifyRequest & { paymentRawBody?: Buffer }).paymentRawBody = body as Buffer;
    try { done(null, JSON.parse((body as Buffer).toString('utf8'))); }
    catch { done(createError.badRequest('Invalid JSON payload'), undefined); }
  });

  const paymentService = new PaymentService(fastify);

  fastify.get(
    '/methods',
    { schema: GetAvailablePaymentMethodsSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = PaymentMethodsQuerySchema.parse(request.query);
      const result = await paymentService.getPaymentMethods(
        request.dbUser!.id,
        query.sourceType,
        query.sourceId,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/',
    { schema: CreatePaymentSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = CreatePaymentSchema.parse(request.body);
      const result = await paymentService.createPayment(request.dbUser!.id, body);
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/change-method',
    { schema: ChangePaymentMethodSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = CreatePaymentSchema.parse(request.body);
      const result = await paymentService.changePaymentMethod(
        request.dbUser!.id,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/webhooks/:providerCode',
    { schema: (config.refunds.paystackEnabled || process.env.PAYOUT_PAYSTACK_ENABLED === 'true') ? { ...PaymentWebhookSwaggerSchema, body: { anyOf: [PaymentWebhookSwaggerSchema.body, { type: 'object', required: ['event', 'data'], properties: { event: { type: 'string' }, data: { type: 'object', additionalProperties: true } } }] } } : PaymentWebhookSwaggerSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!config.payment.webhooksEnabled || !config.payment.webhookSharedSecret) {
        throw createError.serviceUnavailable('Payment webhooks are not enabled');
      }
      const providedSecret = request.headers['x-payment-webhook-secret'];
      if (
        typeof providedSecret !== 'string'
        || !secureStringEqual(providedSecret, config.payment.webhookSharedSecret)
      ) {
        throw createError.unauthorized('Invalid payment webhook signature');
      }

      const { providerCode } = request.params as { providerCode: string };
      if (!WEBHOOK_PROVIDER_CODES.includes(providerCode as typeof WEBHOOK_PROVIDER_CODES[number])) {
        throw createError.badRequest('Unsupported payment webhook provider');
      }

      const webhookBody = request.body as { event?: unknown };
      if (providerCode === 'paystack' && process.env.PAYOUT_PAYSTACK_ENABLED === 'true' && typeof webhookBody.event === 'string' && webhookBody.event.startsWith('transfer.')) {
        const raw = (request as FastifyRequest & {paymentRawBody?:Buffer}).paymentRawBody;
        if (!raw) throw createError.badRequest('Raw provider payload is required');
        return reply.send(await new PayoutService().webhook(raw,request.headers));
      }
      if (providerCode === 'paystack' && config.refunds.paystackEnabled) {
        const raw = (request as FastifyRequest & { paymentRawBody?: Buffer }).paymentRawBody;
        if (!raw) throw createError.badRequest('Raw provider payload is required');
        const adapter = new PaystackRefundAdapter(config.refunds.paystackSecretKey);
        let event;
        try {event = adapter.verifyEvent(raw, request.headers);} catch(error) {await auditPaymentWebhook(providerCode,true);throw error;}
        await auditPaymentWebhook(providerCode);
        if (event.event?.startsWith('refund.')) return reply.send(await new PaymentRefundService().webhook('paystack', raw, request.headers));
        if (event.event !== 'charge.success') return reply.send({ success: true, message: 'Verified provider event acknowledged.' });
        const eventData = event.data, amount = eventData?.amount;
        if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 || eventData?.status !== 'success') throw createError.badRequest('Invalid Paystack payment confirmation');
        const verified = PaymentWebhookSchema.parse({ providerReference: eventData.reference, amount: amount / 100, currency: eventData.currency, status: 'success', eventId: String(eventData.id) });
        return reply.send(await paymentService.handleGatewayWebhook(providerCode, verified));
      }
      const body = PaymentWebhookSchema.parse(request.body);
      const result = await paymentService.handleGatewayWebhook(providerCode, body);
      return reply.send(result);
    },
  );

  fastify.get(
    '/',
    { schema: GetPaymentsSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = PaymentQuerySchema.parse(request.query);
      const result = await paymentService.listUserPayments(
        request.dbUser!.id,
        query,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/:paymentId',
    { schema: GetPaymentByIdSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { paymentId } = request.params as { paymentId: string };
      const result = await paymentService.getPaymentById(
        request.dbUser!.id,
        paymentId,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:paymentId/retry',
    { schema: RetryPaymentSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { paymentId } = request.params as { paymentId: string };
      const result = await paymentService.retryPayment(request.dbUser!.id, paymentId);
      return reply.send(result);
    },
  );

  fastify.post(
    '/:paymentId/proof',
    { schema: UploadPaymentProofSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { paymentId } = request.params as { paymentId: string };
      const { file, fields } = await readMultipartProof(request);
      const proofFields = PaymentProofFieldsSchema.parse(fields);
      const result = await paymentService.uploadPaymentProof(
        request.dbUser!.id,
        paymentId,
        file,
        proofFields,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/:paymentId/cancel',
    { schema: CancelPaymentSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { paymentId } = request.params as { paymentId: string };
      const body = CancelPaymentSchema.parse(request.body ?? {});
      const result = await paymentService.cancelPayment(
        request.dbUser!.id,
        paymentId,
        body,
      );
      return reply.send(result);
    },
  );
}

async function readMultipartProof(
  request: FastifyRequest,
): Promise<{ file: UploadedFile; fields: Record<string, string> }> {
  const fields: Record<string, string> = {};
  let file: UploadedFile | undefined;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (file) {
        for await (const _chunk of part.file) {
          // Drain ignored extra files so the multipart parser can finish cleanly.
        }
        continue;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        chunks.push(chunk);
      }
      file = {
        filename: part.filename,
        mimetype: part.mimetype,
        buffer: Buffer.concat(chunks),
      };
      continue;
    }

    fields[part.fieldname] = String(part.value);
  }

  if (!file) {
    throw createError.badRequest('Payment proof file is required');
  }

  return { file, fields };
}
