import crypto from 'crypto';
import { PaymentProvider } from '../../database/entities/payment-provider.entity';

export type PaymentGatewayInitializeInput = {
  paymentId: string;
  paymentReference: string;
  amount: number;
  currency: string;
  payerEmail: string;
  description: string;
  provider: PaymentProvider;
};

export type PaymentGatewayInitializeResult = {
  providerReference: string;
  authorizationUrl: string | null;
  rawResponse: Record<string, unknown>;
};

export interface PaymentGatewayAdapter {
  initializePayment(
    input: PaymentGatewayInitializeInput,
  ): Promise<PaymentGatewayInitializeResult>;
}

class PlaceholderGatewayAdapter implements PaymentGatewayAdapter {
  constructor(private readonly providerCode: string) {}

  async initializePayment(
    input: PaymentGatewayInitializeInput,
  ): Promise<PaymentGatewayInitializeResult> {
    const reference = `${this.providerCode.toUpperCase()}-${crypto.randomUUID()}`;
    return {
      providerReference: reference,
      authorizationUrl: `/payments/${input.paymentId}/gateway/${this.providerCode}/continue`,
      rawResponse: {
        adapter: this.providerCode,
        paymentReference: input.paymentReference,
        providerReference: reference,
        sandbox: true,
      },
    };
  }
}

export function getGatewayAdapter(providerCode: string): PaymentGatewayAdapter {
  return new PlaceholderGatewayAdapter(providerCode);
}
