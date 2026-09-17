import crypto from 'crypto';
import { config } from '../../config';
import { LogisticsProvider } from '../../database/entities/logistics-provider.entity';
import { LogisticsAddressSnapshot } from '../../database/entities/logistics-quote.entity';
import { ShipmentStatus } from '../../database/entities/shipment.entity';
import { roundMoney } from '../../common/utils/pricing.util';
import { findLogisticsProviderDefinition } from './logistics.providers';

export type LogisticsQuoteAdapterRequest = {
  provider: LogisticsProvider;
  sellerId: string;
  buyerId: string;
  sourceType: string;
  sourceId: string | null;
  pickupAddressSnapshot: LogisticsAddressSnapshot;
  deliveryAddressSnapshot: LogisticsAddressSnapshot;
  itemsSnapshot: Record<string, unknown>[];
  productsSubtotal: number;
  currency: string;
};

export type LogisticsQuoteAdapterResponse = {
  amount: number;
  currency: string;
  serviceName: string;
  estimatedDeliveryMin: number;
  estimatedDeliveryMax: number;
  estimatedDeliveryUnit: string;
  providerQuoteReference: string;
};

export type LogisticsShipmentAdapterRequest = {
  provider: LogisticsProvider;
  shipmentReference: string;
  orderReference: string;
  serviceName: string;
  pickupAddressSnapshot: LogisticsAddressSnapshot;
  deliveryAddressSnapshot: LogisticsAddressSnapshot;
  itemsSnapshot: Record<string, unknown>[];
};

export type LogisticsShipmentAdapterResponse = {
  externalShipmentId: string;
  trackingId: string;
  trackingUrl: string;
  status: ShipmentStatus;
  estimatedPickupAt: Date;
  estimatedDeliveryAt: Date;
};

export type LogisticsTrackingAdapterResponse = {
  status: ShipmentStatus;
  trackingId: string | null;
  trackingUrl: string | null;
  lastUpdatedAt: Date;
};

export type LogisticsWebhookAdapterRequest = {
  payload: Record<string, unknown>;
};

export type LogisticsWebhookAdapterResponse = {
  providerEventId: string | null;
  externalShipmentId: string | null;
  trackingId: string | null;
  shipmentReference: string | null;
  status: ShipmentStatus;
  description: string | null;
  location: string | null;
  failureReason: string | null;
  occurredAt: Date;
};

export interface LogisticsProviderAdapter {
  getQuote(input: LogisticsQuoteAdapterRequest): Promise<LogisticsQuoteAdapterResponse>;
  createShipment(input: LogisticsShipmentAdapterRequest): Promise<LogisticsShipmentAdapterResponse>;
  getShipment(externalShipmentId: string): Promise<LogisticsTrackingAdapterResponse>;
  trackShipment(trackingId: string): Promise<LogisticsTrackingAdapterResponse>;
  cancelShipment(externalShipmentId: string): Promise<{ status: ShipmentStatus }>;
  handleWebhook(input: LogisticsWebhookAdapterRequest): Promise<LogisticsWebhookAdapterResponse>;
}

class MockLogisticsAdapter implements LogisticsProviderAdapter {
  async getQuote(input: LogisticsQuoteAdapterRequest): Promise<LogisticsQuoteAdapterResponse> {
    const definition = findLogisticsProviderDefinition(input.provider.code);
    const totalQuantity = input.itemsSnapshot.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );
    const baseRate = definition?.baseRate ?? 3000;
    const percentageRate = definition?.percentageRate ?? 0.04;
    const packageSurcharge = Math.max(totalQuantity - 1, 0) * 500;

    return {
      amount: roundMoney(baseRate + input.productsSubtotal * percentageRate + packageSurcharge),
      currency: input.currency,
      serviceName: definition?.serviceName ?? `${input.provider.name} Delivery`,
      estimatedDeliveryMin: definition?.estimatedDeliveryMin ?? 3,
      estimatedDeliveryMax: definition?.estimatedDeliveryMax ?? 5,
      estimatedDeliveryUnit: definition?.estimatedDeliveryUnit ?? 'business_days',
      providerQuoteReference: `LQ-${input.provider.code.toUpperCase()}-${crypto.randomUUID()}`,
    };
  }

  async createShipment(
    input: LogisticsShipmentAdapterRequest,
  ): Promise<LogisticsShipmentAdapterResponse> {
    const externalShipmentId = `SHP-${input.provider.code.toUpperCase()}-${crypto.randomUUID()}`;
    const trackingId = `TRK-${crypto.randomInt(100000000, 999999999)}`;
    const estimatedPickupAt = addDays(1);
    const estimatedDeliveryAt = addDays(4);

    return {
      externalShipmentId,
      trackingId,
      trackingUrl: `${config.logistics.trackingBaseUrl}/${trackingId}`,
      status: ShipmentStatus.SHIPMENT_CREATED,
      estimatedPickupAt,
      estimatedDeliveryAt,
    };
  }

  async getShipment(externalShipmentId: string): Promise<LogisticsTrackingAdapterResponse> {
    return {
      status: ShipmentStatus.SHIPMENT_CREATED,
      trackingId: externalShipmentId,
      trackingUrl: `${config.logistics.trackingBaseUrl}/${externalShipmentId}`,
      lastUpdatedAt: new Date(),
    };
  }

  async trackShipment(trackingId: string): Promise<LogisticsTrackingAdapterResponse> {
    return {
      status: ShipmentStatus.IN_TRANSIT,
      trackingId,
      trackingUrl: `${config.logistics.trackingBaseUrl}/${trackingId}`,
      lastUpdatedAt: new Date(),
    };
  }

  async cancelShipment(): Promise<{ status: ShipmentStatus }> {
    return { status: ShipmentStatus.CANCELLED };
  }

  async handleWebhook(
    input: LogisticsWebhookAdapterRequest,
  ): Promise<LogisticsWebhookAdapterResponse> {
    const payload = input.payload;
    return {
      providerEventId: stringValue(payload.providerEventId) ?? stringValue(payload.eventId),
      externalShipmentId: stringValue(payload.externalShipmentId),
      trackingId: stringValue(payload.trackingId),
      shipmentReference: stringValue(payload.shipmentReference),
      status: normalizeShipmentStatus(stringValue(payload.status)),
      description: stringValue(payload.description),
      location: stringValue(payload.location),
      failureReason: stringValue(payload.failureReason),
      occurredAt: payload.occurredAt ? new Date(String(payload.occurredAt)) : new Date(),
    };
  }
}

const mockAdapter = new MockLogisticsAdapter();

export function getLogisticsAdapter(_provider: LogisticsProvider): LogisticsProviderAdapter {
  return mockAdapter;
}

export function normalizeShipmentStatus(status: string | null | undefined): ShipmentStatus {
  const normalized = (status || '').toLowerCase().trim();
  const aliases: Record<string, ShipmentStatus> = {
    pending: ShipmentStatus.PENDING,
    shipment_created: ShipmentStatus.SHIPMENT_CREATED,
    created: ShipmentStatus.SHIPMENT_CREATED,
    awaiting_pickup: ShipmentStatus.AWAITING_PICKUP,
    ready_for_pickup: ShipmentStatus.AWAITING_PICKUP,
    picked_up: ShipmentStatus.PICKED_UP,
    pickup: ShipmentStatus.PICKED_UP,
    in_transit: ShipmentStatus.IN_TRANSIT,
    transit: ShipmentStatus.IN_TRANSIT,
    out_for_delivery: ShipmentStatus.OUT_FOR_DELIVERY,
    delivered: ShipmentStatus.DELIVERED,
    failed: ShipmentStatus.DELIVERY_FAILED,
    delivery_failed: ShipmentStatus.DELIVERY_FAILED,
    cancelled: ShipmentStatus.CANCELLED,
    canceled: ShipmentStatus.CANCELLED,
  };
  return aliases[normalized] ?? ShipmentStatus.PENDING;
}

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
