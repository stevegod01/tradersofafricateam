import crypto from 'crypto';
import { config } from '../../config';
import { createError } from '../../common/utils/http-error.util';
import { decimal, units } from '../after-sales/after-sales.policy';
import { RefundGatewayAdapter, RefundReceipt, registerRefundGateway } from './payment.refunds';
type PaystackRefundData = Record<string, unknown> & {
  id?: unknown; status?: string; merchant_note?: string; amount?: number; currency?: string;
  transaction?: unknown;
};
/** Real Paystack API integration. No automatic retry of non-idempotent POST /refund. */
export class PaystackRefundAdapter implements RefundGatewayAdapter {
  readonly supportsRetry = false;
  constructor(private readonly secret: string, private readonly request: typeof fetch = fetch) {
    if (!secret)
      throw new Error('PAYSTACK_SECRET_KEY is required when Paystack refunds are enabled');
  }
  async submit(input: {
    idempotencyKey: string;
    paymentReference: string;
    amount: string;
    currency: string;
  }): Promise<{
    reference: string;
  }> {
    const amount = units(input.amount);
    if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER))
      throw createError.badRequest('Amount cannot be represented safely by the Paystack API');
    const data = await this.api('/refund', {
      transaction: input.paymentReference,
      amount: Number(amount),
      currency: input.currency,
      merchant_note: `TOFA_REFUND:${input.idempotencyKey}`,
    });
    const reference = this.providerId(data.id);
    return { reference };
  }
  verifyEvent(rawBody: Buffer, headers: Record<string, unknown>): {
    event?: string;
    data?: PaystackRefundData;
  } {
    const signature = headers['x-paystack-signature'];
    if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature))
      throw createError.unauthorized('Invalid Paystack signature');
    const expected = crypto.createHmac('sha512', this.secret).update(rawBody).digest();
    if (!crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw createError.unauthorized('Invalid Paystack signature');
    return JSON.parse(rawBody.toString('utf8'));
  }
  async verifyWebhook(rawBody: Buffer, headers: Record<string, unknown>): Promise<RefundReceipt | null> {
    const event = this.verifyEvent(rawBody, headers);
    if (!['refund.processed', 'refund.failed'].includes(event.event ?? ''))
      return null;
    // Refetch financial status from Paystack rather than trusting a callback's claimed outcome.
    return this.fetchReceipt(this.providerId(event.data?.id));
  }
  async fetchReceipt(reference: string): Promise<RefundReceipt | null> {
    const data = await this.api(`/refund/${this.providerId(reference)}`);
    if (this.providerId(data.id) !== reference)
      throw createError.conflict('Paystack refund reference mismatch');
    if (typeof data.status !== 'string' || !['processed', 'failed'].includes(data.status))
      return null;
    const match = /^TOFA_REFUND:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(String(data.merchant_note));
    if (!match || typeof data.amount !== 'number' || !Number.isSafeInteger(data.amount) || data.amount <= 0 || typeof data.currency !== 'string' || !/^[A-Z]{3}$/.test(data.currency))
      throw createError.conflict('Invalid Paystack refund data');
    const transaction: PaystackRefundData = typeof data.transaction === 'object' && data.transaction !== null
      ? data.transaction as PaystackRefundData : await this.api(`/transaction/${this.providerId(data.transaction)}`);
    if (typeof transaction.reference !== 'string')
      throw createError.conflict('Paystack original transaction reference is unavailable');
    return {
      refundId: match[1], reference, amount: decimal(BigInt(data.amount)), currency: data.currency,
      paymentReference: transaction.reference, status: data.status === 'processed' ? 'successful' : 'failed',
      ...(data.status === 'failed' ? { failureReason: 'Paystack confirmed refund failure' } : {}),
    };
  }
  private providerId(value: unknown): string {
    if (typeof value === 'number' && !Number.isSafeInteger(value))
      throw createError.conflict('Unsafe provider refund identifier');
    const id = String(value);
    if (!/^[1-9][0-9]{0,19}$/.test(id))
      throw createError.conflict('Invalid provider refund identifier');
    return id;
  }
  private async api(path: string, body?: Record<string, unknown>): Promise<PaystackRefundData> {
    const response = await this.request(`https://api.paystack.co${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw createError.conflict('Paystack refund request requires reconciliation');
    const payload = await response.json() as {
      status?: boolean;
      data?: PaystackRefundData;
    };
    if (payload.status !== true || !payload.data)
      throw createError.conflict('Paystack returned an invalid refund response');
    return payload.data;
  }
}
export function registerConfiguredRefundGateways(): void {
  if (config.refunds.paystackEnabled)
    registerRefundGateway('paystack', new PaystackRefundAdapter(config.refunds.paystackSecretKey));
}
