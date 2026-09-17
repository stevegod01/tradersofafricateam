import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { IncomingHttpHeaders } from 'http';
import { Brackets, EntityManager, In, Not } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import {
  B2BLogisticsQuote,
  B2BLogisticsQuoteStatus,
} from '../../database/entities/b2b-logistics-quote.entity';
import {
  B2BLogisticsRequest,
  B2BLogisticsRequestStatus,
} from '../../database/entities/b2b-logistics-request.entity';
import { DeliveryType } from '../../database/entities/checkout-session.entity';
import { DeliveryDraftQuote } from '../../database/entities/checkout-draft.entity';
import {
  LogisticsProvider,
  LogisticsProviderStatus,
  LogisticsProviderType,
} from '../../database/entities/logistics-provider.entity';
import {
  LogisticsAddressSnapshot,
  LogisticsQuote,
  LogisticsQuoteSourceType,
  LogisticsQuoteStatus,
} from '../../database/entities/logistics-quote.entity';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { OrderDelivery } from '../../database/entities/order-delivery.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { Product, ProductStatus, ProductType } from '../../database/entities/product.entity';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { Shipment, ShipmentStatus } from '../../database/entities/shipment.entity';
import { ShipmentStatusHistory } from '../../database/entities/shipment-status-history.entity';
import { User, UserStatus } from '../../database/entities/user.entity';
import { UserAddress } from '../../database/entities/user-address.entity';
import { createError } from '../../common/utils/http-error.util';
import { secureStringEqual } from '../../common/utils/secure-compare.util';
import {
  calculateFinalPrice,
  roundMoney,
  toNumber,
} from '../../common/utils/pricing.util';
import {
  B2BLogisticsRequestDto,
  CancelShipmentDto,
  CreateShipmentDto,
  LogisticsProviderStatusUpdateDto,
  LogisticsQuoteRequestDto,
  LogisticsShipmentQueryDto,
  LogisticsWebhookDto,
} from '../../common/utils/validation.schemas';
import {
  sendB2BQuoteAvailableEmail,
  sendDeliveryFailureEmail,
  sendIntegratedPickupEmail,
  sendIntegratedShipmentCreatedEmail,
  sendOutForDeliveryEmail,
} from '../../common/utils/email.service';
import type { CartLineItem, CartSummary } from '../cart/cart.service';
import { getLogisticsAdapter } from './logistics.adapters';
import {
  emitB2BQuoteEvent,
  emitB2BRequestEvent,
  emitLogisticsQuoteEvent,
  emitShipmentEvent,
  shipmentEventForStatus,
} from './logistics.events';

type QuoteBuildInput = {
  buyerId: string;
  seller: User;
  sourceType: LogisticsQuoteSourceType;
  sourceId: string | null;
  deliveryAddressSnapshot: LogisticsAddressSnapshot;
  itemsSnapshot: Record<string, unknown>[];
  productsSubtotal: number;
  currency: string;
};

const NON_CHECKOUT_PROVIDER_TYPES = [LogisticsProviderType.FREIGHT];

export class LogisticsService {
  private providerRepo = AppDataSource.getRepository(LogisticsProvider);
  private quoteRepo = AppDataSource.getRepository(LogisticsQuote);
  private shipmentRepo = AppDataSource.getRepository(Shipment);
  private shipmentHistoryRepo = AppDataSource.getRepository(ShipmentStatusHistory);
  private b2bRequestRepo = AppDataSource.getRepository(B2BLogisticsRequest);
  private b2bQuoteRepo = AppDataSource.getRepository(B2BLogisticsQuote);
  private userRepo = AppDataSource.getRepository(User);
  private addressRepo = AppDataSource.getRepository(UserAddress);
  private productRepo = AppDataSource.getRepository(Product);
  private variantRepo = AppDataSource.getRepository(ProductVariant);
  private orderRepo = AppDataSource.getRepository(Order);
  private orderDeliveryRepo = AppDataSource.getRepository(OrderDelivery);

  constructor(private readonly fastify?: FastifyInstance) {}

  async getCheckoutQuotes(
    buyerId: string,
    deliveryAddress: UserAddress,
    cart: CartSummary,
  ): Promise<DeliveryDraftQuote[]> {
    const sellerIds = cart.sellerGroups.map((group) => group.sellerId);
    const sellers = await this.userRepo.find({ where: { id: In(sellerIds) } });
    const sellersById = new Map(sellers.map((seller) => [seller.id, seller]));
    const quotes: DeliveryDraftQuote[] = [];

    for (const group of cart.sellerGroups) {
      const seller = sellersById.get(group.sellerId);
      if (!seller) continue;

      const createdQuotes = await this.createQuotes({
        buyerId,
        seller,
        sourceType: LogisticsQuoteSourceType.CART,
        sourceId: cart.cartId,
        deliveryAddressSnapshot: toAddressSnapshot(deliveryAddress),
        itemsSnapshot: group.items.map(toCartItemSnapshot),
        productsSubtotal: group.productsSubtotal,
        currency: cart.currency!,
      });

      quotes.push(...createdQuotes.map(toDeliveryDraftQuote));
    }

    return quotes;
  }

  async getQuotes(
    buyerId: string,
    dto: LogisticsQuoteRequestDto,
  ): Promise<{ success: true; data: { quotes: Record<string, unknown>[] } }> {
    const deliveryAddress = await this.requireOwnedAddress(buyerId, dto.deliveryAddressId);
    const seller = await this.requireEligibleSeller(dto.sellerId);
    const { itemsSnapshot, productsSubtotal, currency } = await this.buildProductItemSnapshots(
      buyerId,
      seller.id,
      dto.items,
    );

    const quotes = await this.createQuotes({
      buyerId,
      seller,
      sourceType: LogisticsQuoteSourceType.OTHER,
      sourceId: null,
      deliveryAddressSnapshot: toAddressSnapshot(deliveryAddress),
      itemsSnapshot,
      productsSubtotal,
      currency,
    });

    return {
      success: true,
      data: { quotes: quotes.map(serializeQuote) },
    };
  }

  async markQuotesSelected(quoteIds: string[]): Promise<void> {
    const uniqueQuoteIds = Array.from(new Set(quoteIds.filter(Boolean)));
    if (!uniqueQuoteIds.length) return;

    const quotes = await this.quoteRepo.find({
      where: { id: In(uniqueQuoteIds) },
      relations: ['provider'],
    });
    const now = Date.now();

    for (const quote of quotes) {
      if (quote.expiresAt.getTime() <= now) {
        if (quote.status !== LogisticsQuoteStatus.EXPIRED) {
          await this.quoteRepo.update(quote.id, { status: LogisticsQuoteStatus.EXPIRED });
          quote.status = LogisticsQuoteStatus.EXPIRED;
          emitLogisticsQuoteEvent('LOGISTICS_QUOTE_EXPIRED', quote);
        }
        throw createError.badRequest(
          'The selected delivery price has expired. Please refresh your delivery options.',
          'LOGISTICS_QUOTE_EXPIRED',
        );
      }

      if (quote.status === LogisticsQuoteStatus.ACTIVE) {
        await this.quoteRepo.update(quote.id, { status: LogisticsQuoteStatus.SELECTED });
        quote.status = LogisticsQuoteStatus.SELECTED;
        emitLogisticsQuoteEvent('LOGISTICS_QUOTE_SELECTED', quote);
      }
    }
  }

  async createShipmentForOrder(
    sellerId: string,
    orderId: string,
    _dto: CreateShipmentDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const order = await this.requireSellerOrder(orderId, sellerId);
    if (order.deliveryType !== DeliveryType.INTEGRATED_LOGISTICS) {
      throw createError.badRequest('This endpoint only creates integrated logistics shipments');
    }
    if (order.status !== OrderStatus.READY_FOR_SHIPMENT) {
      throw createError.conflict('Order must be ready for shipment before creating a provider shipment');
    }
    if (!order.delivery) throw createError.notFound('Order delivery record not found');
    const selectedQuote = order.delivery.logisticsQuoteId
      ? await this.quoteRepo.findOne({
          where: { id: order.delivery.logisticsQuoteId },
          relations: ['provider'],
        })
      : null;
    if (order.delivery.logisticsQuoteId && !selectedQuote) {
      throw createError.notFound('Selected logistics quote not found');
    }

    const existing = await this.shipmentRepo.findOne({
      where: { orderId: order.id, status: Not(ShipmentStatus.CANCELLED) },
      relations: ['provider', 'statusHistory'],
    });
    if (existing) {
      return {
        success: true,
        message: 'Provider shipment already exists for this order.',
        data: serializeShipment(existing),
      };
    }

    const provider = await this.requireActiveProvider(order.delivery.providerId);
    const adapter = getLogisticsAdapter(provider);
    const shipmentReference = await this.generateShipmentReference();
    const serviceName = selectedQuote?.serviceName || order.delivery.serviceNameSnapshot || provider.name;


    let shipment: Shipment | null = null;
    await AppDataSource.transaction(async (manager) => {
      const lockedOrder = await manager.findOne(Order, { where: { id: order.id }, lock: { mode: 'pessimistic_write' } });
      if (!lockedOrder || lockedOrder.status !== OrderStatus.READY_FOR_SHIPMENT) throw createError.conflict('Order is no longer ready for shipment');
      const existingShipment = await manager.findOne(Shipment, { where: { orderId: order.id, status: Not(ShipmentStatus.CANCELLED) } });
      if (existingShipment) throw createError.conflict('A shipment already exists for this order');
      const providerResponse = await adapter.createShipment({
      provider,
      shipmentReference,
      orderReference: order.orderReference,
      serviceName,
      pickupAddressSnapshot: order.delivery!.pickupAddressSnapshot,
      deliveryAddressSnapshot: order.delivery!.deliveryAddressSnapshot,
      itemsSnapshot: order.items.map(toOrderItemSnapshot),
    });
      shipment = await manager.save(
        Shipment,
        manager.create(Shipment, {
          shipmentReference,
          orderId: order.id,
          providerId: provider.id,
          providerNameSnapshot: provider.name,
          serviceNameSnapshot: serviceName,
          externalShipmentId: providerResponse.externalShipmentId,
          trackingId: providerResponse.trackingId,
          trackingUrl: providerResponse.trackingUrl,
          pickupAddressSnapshot: order.delivery!.pickupAddressSnapshot,
          deliveryAddressSnapshot: order.delivery!.deliveryAddressSnapshot,
          status: providerResponse.status,
          estimatedPickupAt: providerResponse.estimatedPickupAt,
          estimatedDeliveryAt: providerResponse.estimatedDeliveryAt,
        }),
      );

      await this.recordShipmentHistory(manager, {
        shipmentId: shipment.id,
        fromStatus: null,
        toStatus: providerResponse.status,
        idempotencyKey: `${provider.code}:${shipmentReference}:created`,
        description: 'Provider shipment created',
        rawPayload: {
          externalShipmentId: providerResponse.externalShipmentId,
          trackingId: providerResponse.trackingId,
        },
      });

      await manager.update(OrderDelivery, order.delivery!.id, {
        providerId: provider.id,
        providerNameSnapshot: provider.name,
        serviceNameSnapshot: serviceName,
        trackingId: providerResponse.trackingId,
        trackingUrl: providerResponse.trackingUrl,
      });
    });

    shipment!.provider = provider;
    this.emitShipmentStatusEvent(shipment!);
    this.sendShipmentCreatedEmail(order, shipment!).catch((err) =>
      console.error('[LogisticsService] Shipment created email failed:', err),
    );

    return {
      success: true,
      message: 'Provider shipment created successfully.',
      data: serializeShipment(shipment!),
    };
  }

  async getOrderDelivery(
    userId: string,
    orderId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const order = await this.requireParticipantOrder(orderId, userId);
    const shipment = await this.findShipmentByOrderId(order.id);

    return {
      success: true,
      data: {
        orderId: order.id,
        orderReference: order.orderReference,
        orderStatus: order.status,
        deliveryType: order.deliveryType,
        delivery: serializeOrderDelivery(order.delivery),
        shipment: shipment ? serializeShipment(shipment) : null,
      },
    };
  }

  async getOrderTracking(
    userId: string,
    orderId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const order = await this.requireParticipantOrder(orderId, userId);
    const shipment = await this.findShipmentByOrderId(order.id);
    if (shipment) {
      return {
        success: true,
        data: {
          orderId: order.id,
          orderReference: order.orderReference,
          deliveryType: order.deliveryType,
          tracking: serializeShipmentTracking(shipment),
        },
      };
    }

    return {
      success: true,
      data: {
        orderId: order.id,
        orderReference: order.orderReference,
        deliveryType: order.deliveryType,
        tracking: {
          trackingId: order.delivery?.trackingId ?? null,
          trackingUrl: order.delivery?.trackingUrl ?? null,
          providerName: order.delivery?.providerNameSnapshot ?? null,
          status: order.status,
          history: [],
        },
      },
    };
  }

  async getPublicTracking(
    trackingId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const shipment = await this.shipmentRepo.findOne({
      where: { trackingId },
      relations: ['provider', 'statusHistory'],
      order: { statusHistory: { createdAt: 'ASC' } },
    });
    if (!shipment) throw createError.notFound('Shipment tracking record not found');

    return {
      success: true,
      data: serializeShipmentTracking(shipment),
    };
  }

  async cancelShipmentForOrder(
    sellerId: string,
    orderId: string,
    dto: CancelShipmentDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const order = await this.requireSellerOrder(orderId, sellerId);
    if (order.deliveryType !== DeliveryType.INTEGRATED_LOGISTICS) {
      throw createError.badRequest('Only integrated logistics shipments can be cancelled here');
    }

    const shipment = await this.shipmentRepo.findOne({
      where: { orderId: order.id },
      relations: ['provider', 'statusHistory'],
    });
    if (!shipment) throw createError.notFound('Provider shipment not found');
    if (shipment.status === ShipmentStatus.CANCELLED) {
      return {
        success: true,
        message: 'Provider shipment is already cancelled.',
        data: serializeShipment(shipment),
      };
    }
    if (shipment.status === ShipmentStatus.DELIVERED) {
      throw createError.conflict('Delivered shipments cannot be cancelled');
    }
    if (!shipment.provider.supportsCancellation) {
      throw createError.conflict('This logistics provider does not support shipment cancellation');
    }
    if (!shipment.externalShipmentId) {
      throw createError.conflict('Provider shipment reference is missing');
    }

    const adapter = getLogisticsAdapter(shipment.provider);
    await adapter.cancelShipment(shipment.externalShipmentId);
    const updated = await this.updateShipmentStatus(shipment, ShipmentStatus.CANCELLED, {
      description: dto.reason || 'Provider shipment cancelled by seller',
      idempotencyKey: `${shipment.provider.code}:${shipment.shipmentReference}:cancelled`,
      rawPayload: { reason: dto.reason ?? null },
    });

    this.emitShipmentStatusEvent(updated);

    return {
      success: true,
      message: 'Provider shipment cancelled successfully. The order itself was not cancelled.',
      data: serializeShipment(updated),
    };
  }

  async handleWebhook(
    providerCode: string,
    dto: LogisticsWebhookDto,
    headers: IncomingHttpHeaders = {},
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    this.verifyWebhookSignature(headers);
    const provider = await this.providerRepo.findOne({
      where: { code: providerCode, status: LogisticsProviderStatus.ACTIVE },
    });
    if (!provider) throw createError.notFound('Logistics provider not found or inactive');

    const adapter = getLogisticsAdapter(provider);
    const normalized = await adapter.handleWebhook({
      payload: dto as unknown as Record<string, unknown>,
    });
    const shipment = await this.findShipmentForWebhook(provider.id, normalized);
    const idempotencyKey = normalized.providerEventId
      ? `${provider.code}:${normalized.providerEventId}`
      : null;

    if (idempotencyKey) {
      const existingHistory = await this.shipmentHistoryRepo.findOne({
        where: { idempotencyKey },
      });
      if (existingHistory) {
        return {
          success: true,
          message: 'Logistics webhook already processed.',
          data: serializeShipment(shipment),
        };
      }
    } else if (shipment.status === normalized.status) {
      return {
        success: true,
        message: 'Shipment status already applied.',
        data: serializeShipment(shipment),
      };
    }

    const updated = await this.updateShipmentStatus(shipment, normalized.status, {
      description: normalized.description || `Provider reported ${normalized.status}`,
      idempotencyKey,
      location: normalized.location,
      failureReason: normalized.failureReason,
      occurredAt: normalized.occurredAt,
      rawPayload: dto as unknown as Record<string, unknown>,
    });

    this.emitShipmentStatusEvent(updated);
    this.sendShipmentStatusEmail(updated).catch((err) =>
      console.error('[LogisticsService] Shipment status email failed:', err),
    );

    return {
      success: true,
      message: 'Logistics webhook processed successfully.',
      data: serializeShipment(updated),
    };
  }

  async createB2BRequest(
    requesterId: string,
    dto: B2BLogisticsRequestDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const requester = await this.userRepo.findOne({ where: { id: requesterId } });
    if (!requester) throw createError.notFound('Requester not found');

    const providers = (await this.findEligibleProviders('USD', dto.deliveryAddress.country, true))
      .filter((provider) => provider.type === LogisticsProviderType.FREIGHT);

    let request: B2BLogisticsRequest | null = null;
    let quotes: B2BLogisticsQuote[] = [];

    await AppDataSource.transaction(async (manager) => {
      request = await manager.save(
        B2BLogisticsRequest,
        manager.create(B2BLogisticsRequest, {
          requesterId,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId ?? null,
          cargoType: dto.cargoType,
          quantity: dto.quantity,
          unit: dto.unit,
          weight: dto.weight ?? null,
          weightUnit: dto.weightUnit ?? null,
          volume: dto.volume ?? null,
          volumeUnit: dto.volumeUnit ?? null,
          pickupAddressSnapshot: dto.pickupAddress,
          deliveryAddressSnapshot: dto.deliveryAddress,
          specialInstructions: dto.specialInstructions ?? null,
          status:
            providers.length > 0
              ? B2BLogisticsRequestStatus.QUOTED
              : B2BLogisticsRequestStatus.PENDING,
        }),
      );

      quotes = await manager.save(
        B2BLogisticsQuote,
        providers.map((provider) =>
          manager.create(B2BLogisticsQuote, {
            requestId: request!.id,
            providerId: provider.id,
            amount: estimateB2BAmount(dto, provider),
            currency: 'USD',
            estimatedTransitMin: 5,
            estimatedTransitMax: 12,
            estimatedTransitUnit: 'business_days',
            validUntil: addMinutes(7 * 24 * 60),
            status: B2BLogisticsQuoteStatus.ACTIVE,
          }),
        ),
      );
    });

    request!.requester = requester;
    request!.quotes = quotes.map((quote) => {
      const provider = providers.find((item) => item.id === quote.providerId);
      if (provider) quote.provider = provider;
      return quote;
    });

    emitB2BRequestEvent('B2B_LOGISTICS_REQUEST_CREATED', request!);
    for (const quote of request!.quotes) {
      emitB2BQuoteEvent('B2B_LOGISTICS_QUOTE_CREATED', quote);
    }
    if (request!.quotes.length > 0) {
      sendB2BQuoteAvailableEmail(requester.email, requester.firstName, {
        requestId: request!.id,
        cargoType: request!.cargoType,
        quotesCount: request!.quotes.length,
      }).catch((err) =>
        console.error('[LogisticsService] B2B quote email failed:', err),
      );
    }

    return {
      success: true,
      message:
        request!.quotes.length > 0
          ? 'B2B logistics request created and quotes are available.'
          : 'B2B logistics request created successfully.',
      data: serializeB2BRequest(request!),
    };
  }

  async listAdminProviders(): Promise<{ success: true; data: Record<string, unknown>[] }> {
    const providers = await this.providerRepo.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return { success: true, data: providers.map(serializeProvider) };
  }

  async updateProviderStatus(
    providerId: string,
    dto: LogisticsProviderStatusUpdateDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) throw createError.notFound('Logistics provider not found');

    await this.providerRepo.update(provider.id, {
      status: dto.status as LogisticsProviderStatus,
    });

    return {
      success: true,
      message: 'Logistics provider status updated successfully.',
      data: serializeProvider({
        ...provider,
        status: dto.status as LogisticsProviderStatus,
      } as LogisticsProvider),
    };
  }

  async listAdminShipments(
    query: LogisticsShipmentQueryDto,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
  }> {
    const qb = this.shipmentRepo
      .createQueryBuilder('shipment')
      .leftJoinAndSelect('shipment.provider', 'provider')
      .leftJoinAndSelect('shipment.order', 'order')
      .leftJoinAndSelect('order.buyer', 'buyer')
      .leftJoinAndSelect('order.seller', 'seller')
      .orderBy('shipment.createdAt', 'DESC');

    if (query.status) qb.andWhere('shipment.status = :status', { status: query.status });
    if (query.providerId) {
      qb.andWhere('shipment.providerId = :providerId', { providerId: query.providerId });
    }
    if (query.orderId) qb.andWhere('shipment.orderId = :orderId', { orderId: query.orderId });
    if (query.search) {
      qb.andWhere(
        new Brackets((searchQb) => {
          searchQb
            .where('shipment.shipmentReference LIKE :search', { search: `%${query.search}%` })
            .orWhere('shipment.trackingId LIKE :search', { search: `%${query.search}%` })
            .orWhere('shipment.externalShipmentId LIKE :search', { search: `%${query.search}%` })
            .orWhere('order.orderReference LIKE :search', { search: `%${query.search}%` });
        }),
      );
    }

    const [shipments, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      success: true,
      data: shipments.map(serializeShipment),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  private async createQuotes(input: QuoteBuildInput): Promise<LogisticsQuote[]> {
    const providers = await this.findEligibleProviders(
      input.currency,
      String(input.deliveryAddressSnapshot.country || ''),
      false,
    );
    const laneProviders = providers.filter((provider) =>
      this.providerSupportsLane(
        provider,
        String(input.seller.country || input.deliveryAddressSnapshot.country || ''),
        String(input.deliveryAddressSnapshot.country || ''),
      ),
    );
    const pickupAddressSnapshot = toPickupSnapshot(input.seller);
    const expiresAt = addMinutes(config.logistics.quoteTtlMinutes);
    const quotes: LogisticsQuote[] = [];

    for (const provider of laneProviders) {
      const adapter = getLogisticsAdapter(provider);
      const providerQuote = await adapter.getQuote({
        provider,
        sellerId: input.seller.id,
        buyerId: input.buyerId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        pickupAddressSnapshot,
        deliveryAddressSnapshot: input.deliveryAddressSnapshot,
        itemsSnapshot: input.itemsSnapshot,
        productsSubtotal: input.productsSubtotal,
        currency: input.currency,
      });

      const quote = await this.quoteRepo.save(
        this.quoteRepo.create({
          providerId: provider.id,
          sellerId: input.seller.id,
          buyerId: input.buyerId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          pickupAddressSnapshot,
          deliveryAddressSnapshot: input.deliveryAddressSnapshot,
          itemsSnapshot: input.itemsSnapshot,
          amount: providerQuote.amount,
          currency: providerQuote.currency,
          serviceName: providerQuote.serviceName,
          estimatedDeliveryMin: providerQuote.estimatedDeliveryMin,
          estimatedDeliveryMax: providerQuote.estimatedDeliveryMax,
          estimatedDeliveryUnit: providerQuote.estimatedDeliveryUnit,
          providerQuoteReference: providerQuote.providerQuoteReference,
          status: LogisticsQuoteStatus.ACTIVE,
          expiresAt,
        }),
      );
      quote.provider = provider;
      quotes.push(quote);
      emitLogisticsQuoteEvent('LOGISTICS_QUOTE_CREATED', quote);
    }

    return quotes;
  }

  private verifyWebhookSignature(headers: IncomingHttpHeaders): void {
    if (!config.logistics.webhooksEnabled) {
      throw createError.serviceUnavailable('Logistics webhooks are not enabled');
    }
    const expectedSecret = config.logistics.webhookSharedSecret;
    if (!expectedSecret) {
      throw createError.serviceUnavailable('Logistics webhook authentication is unavailable');
    }

    const providedSecret = headerString(headers['x-logistics-webhook-secret']);
    const providedSignature = headerString(headers['x-logistics-signature']);
    if (
      !secureStringEqual(providedSecret ?? '', expectedSecret)
      && !secureStringEqual(providedSignature ?? '', expectedSecret)
    ) {
      throw createError.unauthorized('Invalid logistics webhook signature');
    }
  }

  private async findEligibleProviders(
    currency: string,
    country: string,
    includeFreight: boolean,
  ): Promise<LogisticsProvider[]> {
    const normalizedCurrency = currency.toUpperCase();
    const normalizedCountry = normalizeCountry(country);
    const providers = await this.providerRepo.find({
      where: { status: LogisticsProviderStatus.ACTIVE },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    return providers.filter((provider) => {
      if (!includeFreight && NON_CHECKOUT_PROVIDER_TYPES.includes(provider.type)) return false;
      if (!arrayIncludesNormalized(provider.supportedCurrencies, normalizedCurrency)) return false;
      const supportedCountries = Array.isArray(provider.supportedCountries)
        ? provider.supportedCountries
        : [];
      if (!supportedCountries.length) return true;
      return supportedCountries.some((item) => normalizeCountry(item) === normalizedCountry);
    });
  }

  private providerSupportsLane(
    provider: LogisticsProvider,
    pickupCountry: string,
    deliveryCountry: string,
  ): boolean {
    const sameCountry = normalizeCountry(pickupCountry) === normalizeCountry(deliveryCountry);
    if (sameCountry) return provider.supportsDomestic;
    return provider.supportsInternational;
  }

  private async buildProductItemSnapshots(
    buyerId: string,
    sellerId: string,
    items: LogisticsQuoteRequestDto['items'],
  ): Promise<{
    itemsSnapshot: Record<string, unknown>[];
    productsSubtotal: number;
    currency: string;
  }> {
    const snapshots: Record<string, unknown>[] = [];
    let productsSubtotal = 0;
    let currency = '';

    for (const item of items) {
      const product = await this.productRepo.findOne({
        where: { id: item.productId, sellerId },
        relations: ['seller', 'variants'],
      });

      if (!product || product.status !== ProductStatus.ACTIVE || product.deletedAt) {
        throw createError.badRequest('Product is not available for logistics quote');
      }
      if (product.sellerId === buyerId) {
        throw createError.badRequest('You cannot request delivery quotes for your own product');
      }
      if (
        product.seller.status !== UserStatus.ACTIVE ||
        !product.seller.isCompanyVerified
      ) {
        throw createError.badRequest('Seller is not eligible to receive logistics quotes');
      }

      const variant = await this.resolveQuoteVariant(product, item.variantId ?? null);
      const unitPrice =
        product.productType === ProductType.SIMPLE
          ? product.price
          : variant?.price ?? null;
      if (unitPrice === null) {
        throw createError.badRequest('Product price is not available for logistics quote');
      }

      const discount =
        product.productType === ProductType.SIMPLE ? product.discount : variant?.discount ?? null;
      const finalUnitPrice = calculateFinalPrice(unitPrice, discount);
      const subtotal = roundMoney(finalUnitPrice * item.quantity);
      productsSubtotal = roundMoney(productsSubtotal + subtotal);

      if (!currency) currency = product.currency;
      if (currency !== product.currency) {
        throw createError.badRequest('All logistics quote items must use one currency');
      }

      snapshots.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        productNameSnapshot: product.productName,
        skuSnapshot: variant?.sku ?? product.barcode,
        quantity: item.quantity,
        unit: product.unitForMinOrder,
        subtotal,
        currency: product.currency,
        logistics: toPackageSnapshot(product, variant),
      });
    }

    return { itemsSnapshot: snapshots, productsSubtotal, currency };
  }

  private async resolveQuoteVariant(
    product: Product,
    variantId: string | null,
  ): Promise<ProductVariant | null> {
    if (product.productType === ProductType.SIMPLE) {
      if (variantId) throw createError.badRequest('Simple products cannot use a variant');
      return null;
    }

    if (!variantId) throw createError.badRequest('A valid variant is required for variable products');
    const variant =
      product.variants.find((item) => item.id === variantId) ||
      (await this.variantRepo.findOne({ where: { id: variantId, productId: product.id } }));
    if (!variant) throw createError.badRequest('Variant does not belong to product');
    return variant;
  }

  private async requireOwnedAddress(userId: string, addressId: string): Promise<UserAddress> {
    const address = await this.addressRepo.findOne({ where: { id: addressId, userId } });
    if (!address) throw createError.notFound('Delivery address not found');
    return address;
  }

  private async requireEligibleSeller(sellerId: string): Promise<User> {
    const seller = await this.userRepo.findOne({ where: { id: sellerId } });
    if (!seller || seller.status !== UserStatus.ACTIVE || !seller.isCompanyVerified) {
      throw createError.badRequest('Seller is not eligible for logistics');
    }
    return seller;
  }

  private async requireSellerOrder(orderId: string, sellerId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, sellerId },
      relations: [
        'buyer',
        'seller',
        'items',
        'items.product',
        'items.variant',
        'delivery',
        'statusHistory',
      ],
      order: { statusHistory: { createdAt: 'ASC' } },
    });
    if (!order) throw createError.notFound('Order not found');
    return order;
  }

  private async requireParticipantOrder(orderId: string, userId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['buyer', 'seller', 'items', 'delivery', 'statusHistory'],
      order: { statusHistory: { createdAt: 'ASC' } },
    });
    if (!order) throw createError.notFound('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw createError.forbidden('You do not have access to this order');
    }
    return order;
  }

  private async requireActiveProvider(providerIdOrCode: string | null): Promise<LogisticsProvider> {
    if (!providerIdOrCode) throw createError.notFound('Logistics provider not found');
    const provider = await this.providerRepo.findOne({
      where: [
        { id: providerIdOrCode, status: LogisticsProviderStatus.ACTIVE },
        { code: providerIdOrCode, status: LogisticsProviderStatus.ACTIVE },
      ],
    });
    if (!provider) throw createError.notFound('Logistics provider not found or inactive');
    return provider;
  }

  private async findShipmentByOrderId(orderId: string): Promise<Shipment | null> {
    return this.shipmentRepo.findOne({
      where: { orderId },
      relations: ['provider', 'statusHistory', 'order', 'order.buyer', 'order.seller'],
      order: { statusHistory: { createdAt: 'ASC' } },
    });
  }

  private async findShipmentForWebhook(
    providerId: string,
    normalized: {
      externalShipmentId: string | null;
      trackingId: string | null;
      shipmentReference: string | null;
    },
  ): Promise<Shipment> {
    if (!normalized.externalShipmentId && !normalized.trackingId && !normalized.shipmentReference) {
      throw createError.badRequest('Webhook must include a shipment identifier');
    }

    const shipment = await this.shipmentRepo
      .createQueryBuilder('shipment')
      .leftJoinAndSelect('shipment.provider', 'provider')
      .leftJoinAndSelect('shipment.order', 'order')
      .leftJoinAndSelect('order.buyer', 'buyer')
      .leftJoinAndSelect('order.seller', 'seller')
      .leftJoinAndSelect('shipment.statusHistory', 'history')
      .where('shipment.providerId = :providerId', { providerId })
      .andWhere(
        new Brackets((qb) => {
          let hasCondition = false;
          const addIdentifierCondition = (
            clause: string,
            params: Record<string, string>,
          ): void => {
            if (hasCondition) {
              qb.orWhere(clause, params);
            } else {
              qb.where(clause, params);
              hasCondition = true;
            }
          };

          if (normalized.externalShipmentId) {
            addIdentifierCondition('shipment.externalShipmentId = :externalShipmentId', {
              externalShipmentId: normalized.externalShipmentId,
            });
          }
          if (normalized.trackingId) {
            addIdentifierCondition('shipment.trackingId = :trackingId', {
              trackingId: normalized.trackingId,
            });
          }
          if (normalized.shipmentReference) {
            addIdentifierCondition('shipment.shipmentReference = :shipmentReference', {
              shipmentReference: normalized.shipmentReference,
            });
          }
        }),
      )
      .orderBy('history.createdAt', 'ASC')
      .getOne();

    if (!shipment) throw createError.notFound('Shipment not found for webhook');
    return shipment;
  }

  private async updateShipmentStatus(
    shipment: Shipment,
    status: ShipmentStatus,
    context: {
      description: string | null;
      idempotencyKey: string | null;
      location?: string | null;
      failureReason?: string | null;
      occurredAt?: Date;
      rawPayload?: Record<string, unknown> | null;
    },
  ): Promise<Shipment> {
    const occurredAt = context.occurredAt ?? new Date();
    const updates: QueryDeepPartialEntity<Shipment> = { status };
    if (status === ShipmentStatus.PICKED_UP && !shipment.pickedUpAt) {
      updates.pickedUpAt = occurredAt;
    }
    if (status === ShipmentStatus.DELIVERED && !shipment.deliveredAt) {
      updates.deliveredAt = occurredAt;
    }
    if (status === ShipmentStatus.DELIVERY_FAILED) {
      updates.failureReason = context.failureReason ?? context.description;
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.findOne(Order, { where: { id: shipment.orderId }, lock: { mode: 'pessimistic_write' } });
      const current = await manager.findOneByOrFail(Shipment, { id: shipment.id });
      if (current.status === ShipmentStatus.CANCELLED && status !== ShipmentStatus.CANCELLED) throw createError.conflict('Cancelled shipments require manual reconciliation before accepting new provider progress');
      if (current.status !== shipment.status) throw createError.conflict('Shipment state changed; reload before retrying');
      await manager.update(Shipment, shipment.id, updates);
      await this.recordShipmentHistory(manager, {
        shipmentId: shipment.id,
        fromStatus: shipment.status,
        toStatus: status,
        idempotencyKey: context.idempotencyKey,
        description: context.description,
        location: context.location ?? null,
        rawPayload: context.rawPayload ?? null,
      });
    });

    const updated = await this.findShipmentByOrderId(shipment.orderId);
    return updated!;
  }

  private async recordShipmentHistory(
    manager: EntityManager,
    input: {
      shipmentId: string;
      fromStatus: ShipmentStatus | null;
      toStatus: ShipmentStatus;
      idempotencyKey?: string | null;
      description?: string | null;
      location?: string | null;
      rawPayload?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    await manager.save(
      ShipmentStatusHistory,
      manager.create(ShipmentStatusHistory, {
        shipmentId: input.shipmentId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        idempotencyKey: input.idempotencyKey ?? null,
        description: input.description ?? null,
        location: input.location ?? null,
        rawPayload: input.rawPayload ?? null,
      }),
    );
  }

  private emitShipmentStatusEvent(shipment: Shipment): void {
    const event = shipmentEventForStatus(shipment.status);
    if (!event) return;
    emitShipmentEvent(event, shipment);
    this.fastify?.log.info(
      { event, shipmentId: shipment.id, orderId: shipment.orderId },
      `[LogisticsService] ${event}`,
    );
  }

  private async sendShipmentCreatedEmail(order: Order, shipment: Shipment): Promise<void> {
    await sendIntegratedShipmentCreatedEmail(order.buyer.email, order.buyer.firstName, {
      orderReference: order.orderReference,
      providerName: shipment.providerNameSnapshot,
      serviceName: shipment.serviceNameSnapshot,
      trackingId: shipment.trackingId,
      trackingUrl: shipment.trackingUrl,
      estimatedPickupAt: shipment.estimatedPickupAt,
      estimatedDeliveryAt: shipment.estimatedDeliveryAt,
    });
  }

  private async sendShipmentStatusEmail(shipment: Shipment): Promise<void> {
    const order = shipment.order;
    if (!order?.buyer) return;
    const payload = {
      orderReference: order.orderReference,
      providerName: shipment.providerNameSnapshot,
      trackingId: shipment.trackingId,
      trackingUrl: shipment.trackingUrl,
      failureReason: shipment.failureReason,
    };

    if (shipment.status === ShipmentStatus.PICKED_UP) {
      await sendIntegratedPickupEmail(order.buyer.email, order.buyer.firstName, payload);
    }
    if (shipment.status === ShipmentStatus.OUT_FOR_DELIVERY) {
      await sendOutForDeliveryEmail(order.buyer.email, order.buyer.firstName, payload);
    }
    if (shipment.status === ShipmentStatus.DELIVERY_FAILED) {
      await sendDeliveryFailureEmail(order.buyer.email, order.buyer.firstName, payload);
    }
  }

  private async generateShipmentReference(): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      const shipmentReference = `TOFA-SHP-${datePart}-${suffix}`;
      const existing = await this.shipmentRepo.findOne({
        where: { shipmentReference },
        select: ['id'],
      });
      if (!existing) return shipmentReference;
    }
    throw createError.conflict('Unable to generate a unique shipment reference');
  }
}

function toDeliveryDraftQuote(quote: LogisticsQuote): DeliveryDraftQuote {
  return {
    quoteId: quote.id,
    sellerId: quote.sellerId,
    type: DeliveryType.INTEGRATED_LOGISTICS,
    providerId: quote.providerId,
    providerName: quote.provider?.name || quote.providerId,
    serviceName: quote.serviceName,
    amount: Number(quote.amount),
    currency: quote.currency,
    estimatedDelivery: {
      min: quote.estimatedDeliveryMin,
      max: quote.estimatedDeliveryMax,
      unit: quote.estimatedDeliveryUnit,
    },
    expiresAt: quote.expiresAt.toISOString(),
  };
}

function serializeQuote(quote: LogisticsQuote): Record<string, unknown> {
  return {
    quoteId: quote.id,
    providerId: quote.providerId,
    providerCode: quote.provider?.code,
    providerName: quote.provider?.name,
    sellerId: quote.sellerId,
    buyerId: quote.buyerId,
    sourceType: quote.sourceType,
    sourceId: quote.sourceId,
    amount: Number(quote.amount),
    currency: quote.currency,
    serviceName: quote.serviceName,
    estimatedDelivery: {
      min: quote.estimatedDeliveryMin,
      max: quote.estimatedDeliveryMax,
      unit: quote.estimatedDeliveryUnit,
    },
    status: quote.status,
    expiresAt: quote.expiresAt,
    createdAt: quote.createdAt,
  };
}

function serializeProvider(provider: LogisticsProvider): Record<string, unknown> {
  return {
    providerId: provider.id,
    code: provider.code,
    name: provider.name,
    logo: provider.logo,
    type: provider.type,
    supportedCountries: provider.supportedCountries,
    supportedCurrencies: provider.supportedCurrencies,
    supportsDomestic: provider.supportsDomestic,
    supportsInternational: provider.supportsInternational,
    supportsTracking: provider.supportsTracking,
    supportsWebhook: provider.supportsWebhook,
    supportsCancellation: provider.supportsCancellation,
    status: provider.status,
    sortOrder: provider.sortOrder,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

function serializeShipment(shipment: Shipment): Record<string, unknown> {
  return {
    shipmentId: shipment.id,
    shipmentReference: shipment.shipmentReference,
    orderId: shipment.orderId,
    orderReference: shipment.order?.orderReference,
    providerId: shipment.providerId,
    providerCode: shipment.provider?.code,
    providerName: shipment.providerNameSnapshot,
    serviceName: shipment.serviceNameSnapshot,
    externalShipmentId: shipment.externalShipmentId,
    trackingId: shipment.trackingId,
    trackingUrl: shipment.trackingUrl,
    pickupAddress: shipment.pickupAddressSnapshot,
    deliveryAddress: shipment.deliveryAddressSnapshot,
    status: shipment.status,
    estimatedPickupAt: shipment.estimatedPickupAt,
    pickedUpAt: shipment.pickedUpAt,
    estimatedDeliveryAt: shipment.estimatedDeliveryAt,
    deliveredAt: shipment.deliveredAt,
    failureReason: shipment.failureReason,
    history: (shipment.statusHistory ?? []).map((history) => ({
      id: history.id,
      fromStatus: history.fromStatus,
      toStatus: history.toStatus,
      description: history.description,
      location: history.location,
      createdAt: history.createdAt,
    })),
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
  };
}

function serializeShipmentTracking(shipment: Shipment): Record<string, unknown> {
  return {
    shipmentId: shipment.id,
    shipmentReference: shipment.shipmentReference,
    providerName: shipment.providerNameSnapshot,
    status: shipment.status,
    trackingId: shipment.trackingId,
    trackingUrl: shipment.trackingUrl,
    estimatedPickupAt: shipment.estimatedPickupAt,
    pickedUpAt: shipment.pickedUpAt,
    estimatedDeliveryAt: shipment.estimatedDeliveryAt,
    deliveredAt: shipment.deliveredAt,
    failureReason: shipment.failureReason,
    history: (shipment.statusHistory ?? []).map((history) => ({
      fromStatus: history.fromStatus,
      toStatus: history.toStatus,
      description: history.description,
      location: history.location,
      createdAt: history.createdAt,
    })),
  };
}

function serializeOrderDelivery(delivery: OrderDelivery | null): Record<string, unknown> | null {
  if (!delivery) return null;
  return {
    type: delivery.deliveryType,
    providerId: delivery.providerId,
    providerName: delivery.providerNameSnapshot,
    serviceName: delivery.serviceNameSnapshot,
    logisticsQuoteId: delivery.logisticsQuoteId,
    logisticsAmount: delivery.logisticsAmount === null ? null : Number(delivery.logisticsAmount),
    logisticsCurrency: delivery.logisticsCurrency,
    trackingId: delivery.trackingId,
    trackingUrl: delivery.trackingUrl,
    pickupAddress: delivery.pickupAddressSnapshot,
    deliveryAddress: delivery.deliveryAddressSnapshot,
    estimatedDelivery: delivery.estimatedDelivery,
    shippedAt: delivery.shippedAt,
    deliveredAt: delivery.deliveredAt,
  };
}

function serializeB2BRequest(request: B2BLogisticsRequest): Record<string, unknown> {
  return {
    requestId: request.id,
    requesterId: request.requesterId,
    sourceType: request.sourceType,
    sourceId: request.sourceId,
    cargoType: request.cargoType,
    quantity: Number(request.quantity),
    unit: request.unit,
    weight: request.weight === null ? null : Number(request.weight),
    weightUnit: request.weightUnit,
    volume: request.volume === null ? null : Number(request.volume),
    volumeUnit: request.volumeUnit,
    pickupAddress: request.pickupAddressSnapshot,
    deliveryAddress: request.deliveryAddressSnapshot,
    status: request.status,
    quotes: (request.quotes ?? []).map((quote) => ({
      quoteId: quote.id,
      providerId: quote.providerId,
      providerName: quote.provider?.name,
      amount: Number(quote.amount),
      currency: quote.currency,
      estimatedTransit: {
        min: quote.estimatedTransitMin,
        max: quote.estimatedTransitMax,
        unit: quote.estimatedTransitUnit,
      },
      validUntil: quote.validUntil,
      status: quote.status,
    })),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

function toAddressSnapshot(address: UserAddress): LogisticsAddressSnapshot {
  return {
    recipientName: address.recipientName,
    phoneNumber: address.phoneNumber,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    state: address.state,
    country: address.country,
    postalCode: address.postalCode,
  };
}

function toPickupSnapshot(seller: User): LogisticsAddressSnapshot {
  return {
    sellerName: displayUserName(seller),
    storeName: seller.storeName,
    phoneNumber: seller.phoneNumber,
    pickupAddress: seller.pickupAddress || seller.companyAddress,
    country: seller.country,
  };
}

function toCartItemSnapshot(item: CartLineItem): Record<string, unknown> {
  return {
    cartItemId: item.cartItemId,
    productId: item.productId,
    variantId: item.variantId,
    productNameSnapshot: item.productName,
    skuSnapshot: item.sku,
    quantity: item.quantity,
    unit: item.minimumOrder.unit,
    subtotal: item.subtotal,
    currency: item.currency,
    logistics: item.logistics,
  };
}

function toOrderItemSnapshot(item: OrderItem): Record<string, unknown> {
  return {
    orderItemId: item.id,
    productId: item.productId,
    variantId: item.variantId,
    productNameSnapshot: item.productNameSnapshot,
    skuSnapshot: item.skuSnapshot,
    quantity: Number(item.quantity),
    unit: item.unit,
    subtotal: Number(item.subtotal),
    logistics: toPackageSnapshot(item.product, item.variant),
  };
}

function toPackageSnapshot(
  product: Product | null | undefined,
  variant: ProductVariant | null | undefined,
): Record<string, unknown> {
  return {
    weight: nullableNumber(variant?.weight ?? product?.weight),
    weightUnit: variant?.weightUnit ?? product?.weightUnit ?? null,
    length: nullableNumber(variant?.length ?? product?.length),
    width: nullableNumber(variant?.width ?? product?.width),
    height: nullableNumber(variant?.height ?? product?.height),
    dimensionUnit: variant?.dimensionUnit ?? product?.dimensionUnit ?? null,
  };
}

function estimateB2BAmount(
  dto: B2BLogisticsRequestDto,
  provider: LogisticsProvider,
): number {
  const quantityFactor = dto.weight ?? dto.volume ?? dto.quantity;
  const laneFactor = normalizeCountry(dto.pickupAddress.country) === normalizeCountry(dto.deliveryAddress.country)
    ? 1
    : 1.8;
  const providerFactor = provider.supportsInternational ? 1.1 : 1;
  return roundMoney(3500 + Number(quantityFactor) * 75 * laneFactor * providerFactor);
}

function arrayIncludesNormalized(values: string[] | null | undefined, needle: string): boolean {
  if (!Array.isArray(values) || values.length === 0) return true;
  return values.some((value) => value.toUpperCase() === needle.toUpperCase());
}

function normalizeCountry(country: string): string {
  return country.trim().toLowerCase();
}

function nullableNumber(value: number | string | null | undefined): number | null {
  return value === null || value === undefined ? null : toNumber(value);
}

function addMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function headerString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function displayUserName(user: User): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function pagination(page: number, limit: number, total: number): Record<string, number> {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
