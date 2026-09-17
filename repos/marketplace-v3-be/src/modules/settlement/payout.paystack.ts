import { createHmac, timingSafeEqual } from 'crypto';
import { SellerPayoutAccount, PayoutAttempt } from '../../database/entities/settlement.entities';
import { createError } from '../../common/utils/http-error.util';
import { units, decimal } from './settlement.money';
import { PayoutGateway, TransferReceipt, registerPayoutGateway } from './payout.service';
type PaystackTransferData = Record<string, unknown> & {
  active?: boolean; currency?: string; recipient_code?: string; reference?: string; amount?: number;
  transfer_code?: string; status?: string; details?: { account_number?: string; bank_code?: string };
  recipient?: { recipient_code?: string };
};
/** Transfers are opt-in. A failed HTTP request is never interpreted as a failed bank transfer. */
export class PaystackPayoutGateway implements PayoutGateway {
  constructor(private secret: string, private request: typeof fetch = fetch) { if (!secret)
    throw new Error('PAYOUT_PAYSTACK_SECRET_KEY is required'); }
  private async api(path: string, body?: Record<string, unknown>): Promise<PaystackTransferData> {
    const response = await this.request('https://api.paystack.co' + path, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + this.secret, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok)
      throw createError.conflict('Paystack request requires reconciliation');
    const result = await response.json() as { status?: boolean; data?: PaystackTransferData };
    if (result.status !== true || !result.data)
      throw createError.conflict('Invalid Paystack response');
    return result.data;
  }
  async createRecipient(a: SellerPayoutAccount, number: string): Promise<string> {
    if (a.currency !== 'NGN' || a.country !== 'NG' || !/^\d{10}$/.test(number) || !a.bankCode)
      throw createError.badRequest('Paystack payouts require a Nigerian bank code and ten-digit NGN account');
    const data = await this.api('/transferrecipient', { type: 'nuban', name: a.accountName, account_number: number, bank_code: a.bankCode, currency: 'NGN' });
    if (data.active !== true || data.currency !== a.currency || data.details?.account_number !== number || data.details?.bank_code !== a.bankCode || !/^RCP_[a-zA-Z0-9]+$/.test(data.recipient_code ?? ''))
      throw createError.conflict('Paystack recipient does not match verified bank account');
    return data.recipient_code!;
  }
  async submit(a: PayoutAttempt): Promise<void> {
    const amount = units(a.amount);
    if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER) || a.currency !== 'NGN' || !/^RCP_[a-zA-Z0-9]+$/.test(a.recipientId ?? ''))
      throw createError.badRequest('Unsupported Paystack transfer details');
    await this.api('/transfer', {
      source: 'balance', amount: Number(amount), currency: a.currency, recipient: a.recipientId, reference: a.reference, reason: 'TOFA seller payout'
    });
  }
  async receipt(reference: string): Promise<TransferReceipt> {
    if (!/^[a-z0-9_-]{16,50}$/.test(reference))
      throw createError.badRequest('Invalid transfer reference');
    const d = await this.api('/transfer/verify/' + encodeURIComponent(reference));
    if (d.reference !== reference || typeof d.amount !== 'number' || !Number.isSafeInteger(d.amount) || d.amount <= 0 || typeof d.currency !== 'string' || !/^TRF_[a-zA-Z0-9]+$/.test(d.transfer_code ?? '') || !/^RCP_[a-zA-Z0-9]+$/.test(d.recipient?.recipient_code ?? ''))
      throw createError.conflict('Invalid transfer verification details');
    return {
      reference, providerReference: d.transfer_code!, amount: decimal(BigInt(d.amount)), currency: d.currency, recipientId: d.recipient!.recipient_code!, status: d.status === 'success' ? 'successful' : ['failed', 'reversed'].includes(d.status ?? '') ? 'failed' : 'processing'
    };
  }
  verifyEvent(raw: Buffer, headers: Record<string, unknown>) {
    const signature = headers['x-paystack-signature'];
    if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature) || !timingSafeEqual(createHmac('sha512', this.secret).update(raw).digest(), Buffer.from(signature, 'hex')))
      throw createError.unauthorized('Invalid Paystack signature');
    try {
      return JSON.parse(raw.toString('utf8'));
    }
    catch {
      throw createError.badRequest('Invalid webhook payload');
    }
  }
}
export function registerConfiguredPayoutGateway() {
  if (process.env.PAYOUT_PAYSTACK_ENABLED === 'true')
    registerPayoutGateway('paystack', new PaystackPayoutGateway(process.env.PAYOUT_PAYSTACK_SECRET_KEY ?? ''));
}
