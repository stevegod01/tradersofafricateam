import { PaymentProviderType } from '../../database/entities/payment-provider.entity';

export type PaymentProviderDefinition = {
  code: string;
  name: string;
  type: PaymentProviderType;
  supportedCurrencies: string[];
  supportedCountries: string[] | null;
  supportedSourceTypes: string[] | null;
  supportedPurposes: string[] | null;
  minAmount: number | null;
  maxAmount: number | null;
  requiresProof: boolean;
  supportsAutoVerification: boolean;
  sortOrder: number;
};

export const PAYABLE_SOURCE_TYPES = [
  'checkout',
  'subscription',
  'featured_listing',
  'advertisement',
  'service_fee',
  'logistics',
  'account_upgrade',
  'wallet_funding',
  'direct_rfq',
  'market_rfq',
  'other',
];

export const STANDARD_PAYMENT_PURPOSES = [
  'marketplace_purchase',
  'subscription_purchase',
  'subscription_renewal',
  'featured_listing',
  'advertisement',
  'service_fee',
  'logistics',
  'account_upgrade',
  'wallet_funding',
  'service_payment',
  'other',
];

export const PAYMENT_PROVIDER_DEFINITIONS: PaymentProviderDefinition[] = [
  {
    code: 'paystack',
    name: 'Paystack',
    type: PaymentProviderType.GATEWAY,
    supportedCurrencies: ['NGN', 'USD'],
    supportedCountries: null,
    supportedSourceTypes: [...PAYABLE_SOURCE_TYPES],
    supportedPurposes: [...STANDARD_PAYMENT_PURPOSES],
    minAmount: null,
    maxAmount: null,
    requiresProof: false,
    supportsAutoVerification: true,
    sortOrder: 10,
  },
  {
    code: 'flutterwave',
    name: 'Flutterwave',
    type: PaymentProviderType.GATEWAY,
    supportedCurrencies: ['NGN', 'USD', 'GHS', 'KES', 'ZAR'],
    supportedCountries: null,
    supportedSourceTypes: [...PAYABLE_SOURCE_TYPES],
    supportedPurposes: [...STANDARD_PAYMENT_PURPOSES],
    minAmount: null,
    maxAmount: null,
    requiresProof: false,
    supportsAutoVerification: true,
    sortOrder: 20,
  },
  {
    code: 'transactworld',
    name: 'Transactworld',
    type: PaymentProviderType.GATEWAY,
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
    supportedCountries: null,
    supportedSourceTypes: null,
    supportedPurposes: null,
    minAmount: null,
    maxAmount: null,
    requiresProof: false,
    supportsAutoVerification: true,
    sortOrder: 30,
  },
  {
    code: 'papss',
    name: 'PAPSS',
    type: PaymentProviderType.BANK_RAIL,
    supportedCurrencies: ['NGN', 'GHS', 'KES', 'XOF', 'XAF', 'ZAR'],
    supportedCountries: null,
    supportedSourceTypes: [...PAYABLE_SOURCE_TYPES],
    supportedPurposes: [...STANDARD_PAYMENT_PURPOSES],
    minAmount: null,
    maxAmount: null,
    requiresProof: false,
    supportsAutoVerification: true,
    sortOrder: 40,
  },
  {
    code: 'direct_bank_transfer',
    name: 'Direct Bank Transfer',
    type: PaymentProviderType.MANUAL,
    supportedCurrencies: ['NGN', 'USD', 'EUR', 'GBP'],
    supportedCountries: null,
    supportedSourceTypes: [...PAYABLE_SOURCE_TYPES],
    supportedPurposes: [...STANDARD_PAYMENT_PURPOSES],
    minAmount: null,
    maxAmount: null,
    requiresProof: true,
    supportsAutoVerification: false,
    sortOrder: 50,
  },
  {
    code: 'telegraphic_transfer',
    name: 'Telegraphic Transfer (TT)',
    type: PaymentProviderType.MANUAL,
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
    supportedCountries: null,
    supportedSourceTypes: ['direct_rfq', 'market_rfq', 'service_fee', 'other'],
    supportedPurposes: ['service_payment', 'other'],
    minAmount: null,
    maxAmount: null,
    requiresProof: true,
    supportsAutoVerification: false,
    sortOrder: 60,
  },
  {
    code: 'letter_of_credit',
    name: 'Letter of Credit (LC)',
    type: PaymentProviderType.MANUAL,
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
    supportedCountries: null,
    supportedSourceTypes: ['direct_rfq', 'market_rfq', 'other'],
    supportedPurposes: ['service_payment', 'other'],
    minAmount: null,
    maxAmount: null,
    requiresProof: true,
    supportsAutoVerification: false,
    sortOrder: 70,
  },
];

export const PAYMENT_METHOD_CODES = PAYMENT_PROVIDER_DEFINITIONS.map(
  (provider) => provider.code,
);
