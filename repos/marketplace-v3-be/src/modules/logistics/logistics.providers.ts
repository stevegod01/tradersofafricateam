import {
  LogisticsProviderType,
} from '../../database/entities/logistics-provider.entity';

export type LogisticsProviderDefinition = {
  code: string;
  name: string;
  logo: string | null;
  type: LogisticsProviderType;
  supportedCountries: string[];
  supportedCurrencies: string[];
  supportsDomestic: boolean;
  supportsInternational: boolean;
  supportsTracking: boolean;
  supportsWebhook: boolean;
  supportsCancellation: boolean;
  sortOrder: number;
  baseRate: number;
  percentageRate: number;
  serviceName: string;
  estimatedDeliveryMin: number;
  estimatedDeliveryMax: number;
  estimatedDeliveryUnit: string;
};

const COMMON_COUNTRIES = [
  'Nigeria',
  'NG',
  'Ghana',
  'GH',
  'Kenya',
  'KE',
  'South Africa',
  'ZA',
  'United States',
  'USA',
  'US',
  'United Kingdom',
  'GB',
];

const COMMON_CURRENCIES = ['NGN', 'USD', 'GHS', 'KES', 'ZAR', 'EUR', 'GBP'];

export const LOGISTICS_PROVIDER_DEFINITIONS: LogisticsProviderDefinition[] = [
  {
    code: 'gig_logistics',
    name: 'GIG Logistics',
    logo: null,
    type: LogisticsProviderType.DOMESTIC,
    supportedCountries: COMMON_COUNTRIES,
    supportedCurrencies: COMMON_CURRENCIES,
    supportsDomestic: true,
    supportsInternational: false,
    supportsTracking: true,
    supportsWebhook: true,
    supportsCancellation: true,
    sortOrder: 10,
    baseRate: 2500,
    percentageRate: 0.035,
    serviceName: 'Standard Delivery',
    estimatedDeliveryMin: 2,
    estimatedDeliveryMax: 3,
    estimatedDeliveryUnit: 'business_days',
  },
  {
    code: 'dhl_express',
    name: 'DHL Express',
    logo: null,
    type: LogisticsProviderType.INTERNATIONAL,
    supportedCountries: COMMON_COUNTRIES,
    supportedCurrencies: COMMON_CURRENCIES,
    supportsDomestic: true,
    supportsInternational: true,
    supportsTracking: true,
    supportsWebhook: true,
    supportsCancellation: true,
    sortOrder: 20,
    baseRate: 5000,
    percentageRate: 0.055,
    serviceName: 'Express',
    estimatedDeliveryMin: 1,
    estimatedDeliveryMax: 2,
    estimatedDeliveryUnit: 'business_days',
  },
  {
    code: 'freight_partner',
    name: 'TOFA Freight Partner',
    logo: null,
    type: LogisticsProviderType.FREIGHT,
    supportedCountries: COMMON_COUNTRIES,
    supportedCurrencies: COMMON_CURRENCIES,
    supportsDomestic: true,
    supportsInternational: true,
    supportsTracking: true,
    supportsWebhook: false,
    supportsCancellation: false,
    sortOrder: 30,
    baseRate: 7500,
    percentageRate: 0.045,
    serviceName: 'Freight Quote',
    estimatedDeliveryMin: 5,
    estimatedDeliveryMax: 10,
    estimatedDeliveryUnit: 'business_days',
  },
];

export function findLogisticsProviderDefinition(
  code: string,
): LogisticsProviderDefinition | undefined {
  return LOGISTICS_PROVIDER_DEFINITIONS.find((provider) => provider.code === code);
}
