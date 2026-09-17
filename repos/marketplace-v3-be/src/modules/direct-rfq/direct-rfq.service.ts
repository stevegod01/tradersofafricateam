import { getSetting, requireActiveCurrency } from '../system-settings/settings.reader';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { Brackets, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import {
  CheckoutSourceType,
  DeliveryType,
  AddressSnapshot,
} from '../../database/entities/checkout-session.entity';
import { CheckoutSession } from '../../database/entities/checkout-session.entity';
import { DirectRFQAuditEvent } from '../../database/entities/direct-rfq-audit-event.entity';
import {
  DirectRFQ,
  DirectRFQProductSnapshot,
  DirectRFQStatus,
} from '../../database/entities/direct-rfq.entity';
import {
  DirectRFQQuote,
  DirectRFQQuoteStatus,
} from '../../database/entities/direct-rfq-quote.entity';
import {
  DirectRFQActorType,
  DirectRFQQuoteVersion,
} from '../../database/entities/direct-rfq-quote-version.entity';
import { Order, OrderSourceType } from '../../database/entities/order.entity';
import {
  InventoryStatus,
  Product,
  ProductStatus,
  ProductType,
} from '../../database/entities/product.entity';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { User, UserStatus } from '../../database/entities/user.entity';
import { UserAddress } from '../../database/entities/user-address.entity';
import { Payment } from '../../database/entities/payment.entity';
import { TranslationMap } from '../../database/entities/category.entity';
import { TranslatableEntityType } from '../../database/entities/translation-metadata.entity';
import { createError } from '../../common/utils/http-error.util';
import { roundMoney } from '../../common/utils/pricing.util';
import {
  normalizeLanguageCode,
  resolveTranslation,
  toTranslationMap,
} from '../../common/utils/i18n.util';
import { addDays, addHours } from '../../common/utils/token.util';
import {
  AdminDirectRFQQueryDto,
  DirectRFQAcceptQuoteDto,
  DirectRFQCancelDto,
  DirectRFQCounterOfferDto,
  DirectRFQCreateDto,
  DirectRFQQueryDto,
  DirectRFQQuoteTermsDto,
  DirectRFQRejectQuoteDto,
} from '../../common/utils/validation.schemas';
import {
  sendDirectRFQCancelledEmail,
  sendDirectRFQCounterOfferEmail,
  sendDirectRFQCreatedEmail,
  sendDirectRFQQuoteAcceptedEmail,
  sendDirectRFQQuoteReceivedEmail,
  sendDirectRFQQuoteRejectedEmail,
} from '../../common/utils/email.service';
import { CheckoutService } from '../checkout/checkout.service';
import { I18nService } from '../i18n/i18n.service';
import { emitDirectRFQEvent } from './direct-rfq.events';

type QuoteTerms = {
  quantity: number;
  unit: string;
  pricePerUnit: number;
  productsTotal: number;
  currency: string;
  deliveryType: DeliveryType;
  logisticsAmount: number | null;
  quoteTotal: number;
  estimatedDeliveryDate: string | null;
  validUntil: Date;
  message: string | null;
};

const FINAL_RFQ_STATUSES = [
  DirectRFQStatus.ACCEPTED,
  DirectRFQStatus.CANCELLED,
  DirectRFQStatus.EXPIRED,
];

export class DirectRFQService {
  private rfqRepo = AppDataSource.getRepository(DirectRFQ);
  private quoteRepo = AppDataSource.getRepository(DirectRFQQuote);
  private auditRepo = AppDataSource.getRepository(DirectRFQAuditEvent);
  private productRepo = AppDataSource.getRepository(Product);
  private variantRepo = AppDataSource.getRepository(ProductVariant);
  private addressRepo = AppDataSource.getRepository(UserAddress);
  private userRepo = AppDataSource.getRepository(User);
  private checkoutRepo = AppDataSource.getRepository(CheckoutSession);
  private paymentRepo = AppDataSource.getRepository(Payment);
  private orderRepo = AppDataSource.getRepository(Order);
  private checkoutService = new CheckoutService();
  private i18nService = new I18nService();

  constructor(private readonly fastify?: FastifyInstance) {}

  async createDirectRFQ(
    buyerId: string,
    dto: DirectRFQCreateDto,
    language: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const buyer = await this.requireUser(buyerId);
    const product = await this.requireRfqProduct(dto.productId);
    if (product.sellerId === buyerId) {
      throw createError.badRequest('You cannot request a quotation for your own product');
    }
    const variant = await this.resolveVariant(product, dto.variantId ?? null);
    const deliveryAddress = await this.requireOwnedAddress(buyerId, dto.deliveryAddressId);
    const snapshot = this.createProductSnapshot(product, variant, language);
    const rfqReference = await this.generateRfqReference();
    const sourceLanguage = normalizeLanguageCode(dto.sourceLanguage ?? language);
    await this.i18nService.ensureSelectableLanguage(sourceLanguage);
    const description = toTranslationMap(
      dto.description as string | TranslationMap,
      sourceLanguage,
    );
    const buyerNotes = dto.buyerNotes
      ? toTranslationMap(dto.buyerNotes as string | TranslationMap, sourceLanguage)
      : null;

    let rfq: DirectRFQ | null = null;
    await AppDataSource.transaction(async (manager) => {
      rfq = await manager.save(
        DirectRFQ,
        manager.create(DirectRFQ, {
          rfqReference,
          buyerId,
          sellerId: product.sellerId,
          productId: product.id,
          variantId: variant?.id ?? null,
          status: DirectRFQStatus.OPEN,
          quantity: dto.quantity,
          unit: dto.unit,
          description,
          sourceLanguage,
          expectedDeliveryDate: dto.expectedDeliveryDate ?? null,
          deliveryAddressId: deliveryAddress.id,
          deliveryAddressSnapshot: toAddressSnapshot(deliveryAddress),
          deliveryType: dto.deliveryType as DeliveryType,
          currencyPreference: dto.currencyPreference ?? null,
          buyerNotes,
          productSnapshot: snapshot,
          currentQuoteId: null,
          acceptedQuoteId: null,
          acceptedQuoteVersionId: null,
          viewedAt: null,
          acceptedAt: null,
          rejectedAt: null,
          rejectionReason: null,
          cancelledAt: null,
          cancellationReason: null,
          expiresAt:
            (await getSetting<number>('defaultQuoteValidityDays',manager)) > 0
              ? addDays((await getSetting<number>('defaultQuoteValidityDays',manager)))
              : null,
        }),
      );
      await this.recordAudit(manager, rfq.id, 'RFQ_CREATED', DirectRFQActorType.BUYER, buyerId, {
        deliveryType: dto.deliveryType,
        sourceLanguage,
      });
      await this.i18nService.trackEntityTranslations(
        {
          entityType: TranslatableEntityType.DIRECT_RFQ,
          entityId: rfq.id,
          sourceLanguage,
          fields: {
            description,
            buyerNotes,
          },
        },
        manager,
      );
    });

    rfq!.buyer = buyer;
    rfq!.seller = product.seller;
    rfq!.product = product;
    this.emit('DIRECT_RFQ_CREATED', rfq!);
    this.sendRfqCreatedEmail(rfq!).catch((err) =>
      console.error('[DirectRFQService] RFQ created email failed:', err),
    );

    return {
      success: true,
      message: 'Request for quotation submitted successfully.',
      data: serializeRfqListItem(rfq!, 'outgoing', language),
    };
  }

  async listDirectRFQs(
    userId: string,
    query: DirectRFQQueryDto,
    language: string,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
    language: string;
  }> {
    const qb = this.baseRfqQuery();

    if (query.type === 'incoming') {
      qb.where('rfq.sellerId = :userId', { userId });
    } else if (query.type === 'outgoing') {
      qb.where('rfq.buyerId = :userId', { userId });
    } else {
      qb.where('(rfq.buyerId = :userId OR rfq.sellerId = :userId)', { userId });
    }

    this.applyUserFilters(qb, query);
    const [rfqs, total] = await qb
      .orderBy('rfq.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      success: true,
      data: rfqs.map((rfq) =>
        serializeRfqListItem(
          rfq,
          rfq.buyerId === userId ? 'outgoing' : 'incoming',
          language,
        ),
      ),
      pagination: pagination(query.page, query.limit, total),
      language,
    };
  }

  async getDirectRFQById(
    userId: string,
    rfqId: string,
    language: string,
  ): Promise<{ success: true; data: Record<string, unknown>; language: string }> {
    let rfq = await this.requireRfqDetail(rfqId);
    if (rfq.buyerId !== userId && rfq.sellerId !== userId) {
      throw createError.forbidden('You do not have access to this RFQ');
    }

    rfq = await this.expireRfqIfNeeded(rfq);
    if (rfq.sellerId === userId && rfq.status === DirectRFQStatus.OPEN) {
      await this.rfqRepo.update(rfq.id, {
        status: DirectRFQStatus.VIEWED,
        viewedAt: rfq.viewedAt ?? new Date(),
      });
      await this.auditRepo.save(
        this.auditRepo.create({
          rfqId: rfq.id,
          eventType: 'RFQ_VIEWED',
          actorType: DirectRFQActorType.SELLER,
          actorId: userId,
          metadata: null,
        }),
      );
      rfq = await this.requireRfqDetail(rfq.id);
      this.emit('DIRECT_RFQ_VIEWED', rfq);
    }

    return { success: true, data: serializeRfqDetail(rfq, language), language };
  }

  async submitQuote(
    sellerId: string,
    rfqId: string,
    dto: DirectRFQQuoteTermsDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const rfq = await this.requireSellerRfq(rfqId, sellerId);
    await this.assertRfqCommerciallyOpen(rfq);
    const terms = this.validateAndBuildTerms(rfq, dto);

    let quote: DirectRFQQuote | null = null;
    let version: DirectRFQQuoteVersion | null = null;
    await AppDataSource.transaction(async (manager) => {
      quote = rfq.currentQuoteId
        ? await manager.findOne(DirectRFQQuote, {
            where: { id: rfq.currentQuoteId, rfqId: rfq.id },
            relations: ['versions'],
          })
        : null;

      if (!quote) {
        quote = await manager.save(
          DirectRFQQuote,
          manager.create(DirectRFQQuote, {
            rfqId: rfq.id,
            sellerId,
            currentVersionId: null,
            status: DirectRFQQuoteStatus.ACTIVE,
          }),
        );
      }

      version = await this.createQuoteVersion(
        manager,
        quote,
        DirectRFQActorType.SELLER,
        sellerId,
        terms,
      );

      await manager.update(DirectRFQQuote, quote.id, {
        currentVersionId: version.id,
        status: DirectRFQQuoteStatus.ACTIVE,
      });
      await manager.update(DirectRFQ, rfq.id, {
        currentQuoteId: quote.id,
        status: DirectRFQStatus.QUOTED,
        rejectedAt: null,
        rejectionReason: null,
      });
      await this.recordAudit(
        manager,
        rfq.id,
        'QUOTE_SUBMITTED',
        DirectRFQActorType.SELLER,
        sellerId,
        { quoteId: quote.id, quoteVersionId: version.id, version: version.version },
      );
    });

    const updated = await this.requireRfqDetail(rfq.id);
    this.emit('DIRECT_RFQ_QUOTE_CREATED', updated, version);
    this.sendQuoteReceivedEmail(updated, version!).catch((err) =>
      console.error('[DirectRFQService] Quote received email failed:', err),
    );

    return {
      success: true,
      message: 'Quotation submitted successfully.',
      data: {
        rfqId: updated.id,
        status: updated.status,
        quote: serializeQuoteSummary(quote!, version!),
      },
    };
  }

  async submitCounterOffer(
    userId: string,
    rfqId: string,
    quoteId: string,
    dto: DirectRFQCounterOfferDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const rfq = await this.requireRfqDetail(rfqId);
    if (rfq.buyerId !== userId && rfq.sellerId !== userId) {
      throw createError.forbidden('You do not have access to this RFQ');
    }
    await this.assertRfqCommerciallyOpen(rfq);

    const quote = await this.requireQuote(rfq.id, quoteId);
    const currentVersion = currentVersionForQuote(quote);
    if (!currentVersion) throw createError.badRequest('Quotation has no active version');
    await this.assertCurrentVersionStillValid(quote, currentVersion);

    const actorType = rfq.buyerId === userId ? DirectRFQActorType.BUYER : DirectRFQActorType.SELLER;
    const terms = this.validateAndBuildTerms(rfq, dto);
    let version: DirectRFQQuoteVersion | null = null;

    await AppDataSource.transaction(async (manager) => {
      version = await this.createQuoteVersion(manager, quote, actorType, userId, terms);
      await manager.update(DirectRFQQuote, quote.id, {
        currentVersionId: version.id,
        status: DirectRFQQuoteStatus.ACTIVE,
      });
      await manager.update(DirectRFQ, rfq.id, {
        currentQuoteId: quote.id,
        status: DirectRFQStatus.NEGOTIATING,
        rejectedAt: null,
        rejectionReason: null,
      });
      await this.recordAudit(
        manager,
        rfq.id,
        'COUNTER_OFFER_SUBMITTED',
        actorType,
        userId,
        { quoteId: quote.id, quoteVersionId: version.id, version: version.version },
      );
    });

    const updated = await this.requireRfqDetail(rfq.id);
    this.emit('DIRECT_RFQ_COUNTER_OFFER_CREATED', updated, version);
    this.sendCounterOfferEmail(updated, version!, actorType).catch((err) =>
      console.error('[DirectRFQService] Counter-offer email failed:', err),
    );

    return {
      success: true,
      message: 'Counter-offer submitted successfully.',
      data: {
        rfqId: updated.id,
        status: updated.status,
        currentQuote: serializeVersion(version!, quote.id),
      },
    };
  }

  async getQuoteDetails(
    userId: string,
    rfqId: string,
    quoteId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const rfq = await this.requireRfqDetail(rfqId);
    if (rfq.buyerId !== userId && rfq.sellerId !== userId) {
      throw createError.forbidden('You do not have access to this RFQ');
    }
    const quote = await this.requireQuote(rfq.id, quoteId);

    return {
      success: true,
      data: serializeQuoteDetail(rfq, quote),
    };
  }

  async acceptQuote(
    buyerId: string,
    rfqId: string,
    quoteId: string,
    dto: DirectRFQAcceptQuoteDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const rfq = await this.requireBuyerRfq(rfqId, buyerId);
    const quote = await this.requireQuote(rfq.id, quoteId);
    const version = currentVersionForQuote(quote);
    if (!version || version.id !== dto.quoteVersionId) {
      throw createError.badRequest('Only the current quote version can be accepted');
    }
    if (rfq.acceptedQuoteId || rfq.acceptedQuoteVersionId) {
      if (rfq.acceptedQuoteId === quote.id && rfq.acceptedQuoteVersionId === version.id) {
        return this.acceptedQuoteResponse(await this.requireRfqDetail(rfq.id), quote, version);
      }
      throw createError.conflict('Another quote has already been accepted for this RFQ');
    }

    await this.assertRfqCommerciallyOpen(rfq);
    if (version.createdByType !== DirectRFQActorType.SELLER) {
      throw createError.badRequest('Only seller-generated quote versions can be accepted');
    }
    await this.assertCurrentVersionStillValid(quote, version);

    await AppDataSource.transaction(async (manager) => {
      await manager.update(DirectRFQQuote, quote.id, {
        status: DirectRFQQuoteStatus.ACCEPTED,
      });
      await manager.update(DirectRFQ, rfq.id, {
        status: DirectRFQStatus.ACCEPTED,
        acceptedQuoteId: quote.id,
        acceptedQuoteVersionId: version.id,
        acceptedAt: new Date(),
      });
      await this.recordAudit(
        manager,
        rfq.id,
        'QUOTE_ACCEPTED',
        DirectRFQActorType.BUYER,
        buyerId,
        { quoteId: quote.id, quoteVersionId: version.id },
      );
    });

    const updated = await this.requireRfqDetail(rfq.id);
    this.emit('DIRECT_RFQ_QUOTE_ACCEPTED', updated, version);
    this.sendQuoteAcceptedEmail(updated, version).catch((err) =>
      console.error('[DirectRFQService] Quote accepted email failed:', err),
    );

    return this.acceptedQuoteResponse(updated, quote, version);
  }

  async rejectQuote(
    buyerId: string,
    rfqId: string,
    quoteId: string,
    dto: DirectRFQRejectQuoteDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const rfq = await this.requireBuyerRfq(rfqId, buyerId);
    if (FINAL_RFQ_STATUSES.includes(rfq.status)) {
      throw createError.conflict('This RFQ cannot be rejected in its current status');
    }
    const quote = await this.requireQuote(rfq.id, quoteId);

    await AppDataSource.transaction(async (manager) => {
      await manager.update(DirectRFQQuote, quote.id, {
        status: DirectRFQQuoteStatus.REJECTED,
      });
      await manager.update(DirectRFQ, rfq.id, {
        status: DirectRFQStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
      });
      await this.recordAudit(
        manager,
        rfq.id,
        'QUOTE_REJECTED',
        DirectRFQActorType.BUYER,
        buyerId,
        { quoteId: quote.id, reason: dto.reason },
      );
    });

    const updated = await this.requireRfqDetail(rfq.id);
    this.emit('DIRECT_RFQ_QUOTE_REJECTED', updated);
    this.sendQuoteRejectedEmail(updated, dto.reason).catch((err) =>
      console.error('[DirectRFQService] Quote rejected email failed:', err),
    );

    return {
      success: true,
      message: 'Quotation rejected.',
      data: { rfqId: updated.id, status: updated.status },
    };
  }

  async cancelRfq(
    buyerId: string,
    rfqId: string,
    dto: DirectRFQCancelDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const rfq = await this.requireBuyerRfq(rfqId, buyerId);
    if (rfq.status === DirectRFQStatus.ACCEPTED) {
      throw createError.conflict(
        'Accepted RFQs must use the checkout, payment, or order cancellation flow',
      );
    }
    if (rfq.status === DirectRFQStatus.CANCELLED) {
      return {
        success: true,
        message: 'RFQ is already cancelled.',
        data: { rfqId: rfq.id, status: rfq.status },
      };
    }
    if (rfq.status === DirectRFQStatus.EXPIRED) {
      throw createError.conflict('Expired RFQs cannot be cancelled');
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.update(DirectRFQ, rfq.id, {
        status: DirectRFQStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      });
      await this.recordAudit(
        manager,
        rfq.id,
        'RFQ_CANCELLED',
        DirectRFQActorType.BUYER,
        buyerId,
        { reason: dto.reason },
      );
    });

    const updated = await this.requireRfqDetail(rfq.id);
    this.emit('DIRECT_RFQ_CANCELLED', updated);
    this.sendRfqCancelledEmail(updated, dto.reason).catch((err) =>
      console.error('[DirectRFQService] RFQ cancelled email failed:', err),
    );

    return {
      success: true,
      message: 'RFQ cancelled successfully.',
      data: { rfqId: updated.id, status: updated.status },
    };
  }

  async listAdminDirectRFQs(
    query: AdminDirectRFQQueryDto,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
  }> {
    const qb = this.baseRfqQuery();
    this.applyAdminFilters(qb, query);
    const [rfqs, total] = await qb
      .orderBy('rfq.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      success: true,
      data: rfqs.map((rfq) => serializeAdminRfqListItem(rfq)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async getAdminDirectRFQById(
    rfqId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const rfq = await this.requireRfqDetail(rfqId, true);
    const transactionRefs = await this.findTransactionRefs(rfq.id);
    return {
      success: true,
      data: {
        ...serializeRfqDetail(rfq, 'en', true),
        transactionRefs,
        auditHistory: (rfq as DirectRFQ & { auditEvents?: DirectRFQAuditEvent[] }).auditEvents?.map(
          (event) => ({
            eventId: event.id,
            eventType: event.eventType,
            actorType: event.actorType,
            actorId: event.actorId,
            metadata: event.metadata,
            createdAt: event.createdAt,
          }),
        ) ?? [],
      },
    };
  }

  private async acceptedQuoteResponse(
    rfq: DirectRFQ,
    quote: DirectRFQQuote,
    version: DirectRFQQuoteVersion,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const canPrepareCheckout = [
      DeliveryType.SELLER_ARRANGED,
      DeliveryType.BUYER_ARRANGED,
    ].includes(version.deliveryType);
    const checkout = canPrepareCheckout
      ? await this.checkoutService.prepareDirectRfqCheckout({
          buyerId: rfq.buyerId,
          sellerId: rfq.sellerId,
          rfqId: rfq.id,
          quoteId: quote.id,
          quoteVersionId: version.id,
          deliveryAddressId: rfq.deliveryAddressId!,
          deliveryAddressSnapshot: rfq.deliveryAddressSnapshot,
          product: {
            productId: rfq.productSnapshot.productId,
            variantId: rfq.productSnapshot.variant?.variantId ?? null,
            productName: rfq.productSnapshot.productName,
            productImage: rfq.productSnapshot.productImage,
            sku: rfq.productSnapshot.variant?.sku ?? null,
            attributes: rfq.productSnapshot.variant?.attributes ?? null,
          },
          quantity: Number(version.quantity),
          unit: version.unit,
          pricePerUnit: Number(version.pricePerUnit),
          productsTotal: Number(version.productsTotal),
          delivery: {
            type: version.deliveryType,
            logisticsAmount: version.logisticsAmount === null ? null : Number(version.logisticsAmount),
            logisticsCurrency:
              version.logisticsAmount === null ? null : version.currency,
          },
          quoteTotal: Number(version.quoteTotal),
          currency: version.currency,
          notes: resolveTranslation(rfq.buyerNotes, 'en', rfq.sourceLanguage),
          expiresAt: addHours(config.directRfq.checkoutExpiryHours),
        })
      : null;

    return {
      success: true,
      message: 'Quotation accepted successfully.',
      data: {
        rfqId: rfq.id,
        status: DirectRFQStatus.ACCEPTED,
        acceptedQuote: {
          quoteId: quote.id,
          quoteVersionId: version.id,
        },
        checkout: checkout?.data ?? null,
        nextStep: nextStepForDelivery(version.deliveryType),
      },
    };
  }

  private validateAndBuildTerms(
    rfq: DirectRFQ,
    dto: DirectRFQQuoteTermsDto | DirectRFQCounterOfferDto,
  ): QuoteTerms {
    const deliveryType = dto.delivery.type as DeliveryType;
    if (deliveryType !== rfq.deliveryType) {
      throw createError.badRequest('Quotation delivery type must match the buyer RFQ selection');
    }
    if (dto.validUntil.getTime() <= Date.now()) {
      throw createError.badRequest('Quote validity must be in the future');
    }

    const rawLogisticsAmount = dto.delivery.logisticsAmount;
    if (deliveryType === DeliveryType.SELLER_ARRANGED) {
      if (rawLogisticsAmount === undefined || rawLogisticsAmount === null) {
        throw createError.badRequest('logisticsAmount is required for seller-arranged delivery');
      }
    } else if (rawLogisticsAmount !== undefined && rawLogisticsAmount !== null) {
      throw createError.badRequest(
        'logisticsAmount is not allowed for buyer-arranged, integrated, or B2B logistics',
      );
    }

    const productsTotal = roundMoney(dto.quantity * dto.pricePerUnit);
    const logisticsAmount =
      deliveryType === DeliveryType.SELLER_ARRANGED ? roundMoney(rawLogisticsAmount ?? 0) : null;

    return {
      quantity: dto.quantity,
      unit: dto.unit,
      pricePerUnit: roundMoney(dto.pricePerUnit),
      productsTotal,
      currency: dto.currency,
      deliveryType,
      logisticsAmount,
      quoteTotal: roundMoney(productsTotal + (logisticsAmount ?? 0)),
      estimatedDeliveryDate: dto.estimatedDeliveryDate ?? dto.expectedDeliveryDate ?? null,
      validUntil: dto.validUntil,
      message: dto.message ?? null,
    };
  }

  private async createQuoteVersion(
    manager: EntityManager,
    quote: DirectRFQQuote,
    actorType: DirectRFQActorType,
    actorId: string,
    terms: QuoteTerms,
  ): Promise<DirectRFQQuoteVersion> {
    await requireActiveCurrency(terms.currency,manager);
    const currentVersions = quote.versions ?? [];
    const versionNumber =
      currentVersions.reduce((max, version) => Math.max(max, version.version), 0) + 1;

    return manager.save(
      DirectRFQQuoteVersion,
      manager.create(DirectRFQQuoteVersion, {
        quoteId: quote.id,
        version: versionNumber,
        createdByType: actorType,
        createdById: actorId,
        quantity: terms.quantity,
        unit: terms.unit,
        pricePerUnit: terms.pricePerUnit,
        productsTotal: terms.productsTotal,
        currency: terms.currency,
        deliveryType: terms.deliveryType,
        logisticsAmount: terms.logisticsAmount,
        quoteTotal: terms.quoteTotal,
        estimatedDeliveryDate: terms.estimatedDeliveryDate,
        message: terms.message,
        validUntil: terms.validUntil,
      }),
    );
  }

  private async assertRfqCommerciallyOpen(rfq: DirectRFQ): Promise<void> {
    const fresh = await this.expireRfqIfNeeded(rfq);
    if (FINAL_RFQ_STATUSES.includes(fresh.status)) {
      throw createError.conflict('This RFQ is no longer open for commercial changes');
    }
  }

  private async assertCurrentVersionStillValid(
    quote: DirectRFQQuote,
    version: DirectRFQQuoteVersion,
  ): Promise<void> {
    if (version.validUntil.getTime() > Date.now()) return;

    await this.quoteRepo.update(quote.id, { status: DirectRFQQuoteStatus.EXPIRED });
    throw createError.badRequest(
      'This quotation has expired. Please request updated terms from the seller.',
      'QUOTE_EXPIRED',
    );
  }

  private async expireRfqIfNeeded(rfq: DirectRFQ): Promise<DirectRFQ> {
    if (
      rfq.expiresAt &&
      rfq.expiresAt.getTime() <= Date.now() &&
      ![DirectRFQStatus.ACCEPTED, DirectRFQStatus.CANCELLED, DirectRFQStatus.EXPIRED].includes(rfq.status)
    ) {
      await this.rfqRepo.update(rfq.id, { status: DirectRFQStatus.EXPIRED });
      const updated = await this.requireRfqDetail(rfq.id);
      this.emit('DIRECT_RFQ_QUOTE_EXPIRED', updated);
      return updated;
    }
    return rfq;
  }

  private async requireBuyerRfq(rfqId: string, buyerId: string): Promise<DirectRFQ> {
    const rfq = await this.requireRfqDetail(rfqId);
    if (rfq.buyerId !== buyerId) {
      throw createError.forbidden('Only the buyer can perform this RFQ action');
    }
    return rfq;
  }

  private async requireSellerRfq(rfqId: string, sellerId: string): Promise<DirectRFQ> {
    const rfq = await this.requireRfqDetail(rfqId);
    if (rfq.sellerId !== sellerId) {
      throw createError.forbidden('Only the selected seller can respond to this RFQ');
    }
    return rfq;
  }

  private async requireRfqDetail(
    rfqId: string,
    includeAudit = false,
  ): Promise<DirectRFQ> {
    const qb = this.baseRfqQuery()
      .where('rfq.id = :rfqId', { rfqId })
      .orderBy('quoteVersions.version', 'ASC');

    if (includeAudit) {
      qb.leftJoinAndMapMany(
        'rfq.auditEvents',
        DirectRFQAuditEvent,
        'auditEvents',
        'auditEvents.rfqId = rfq.id',
      ).addOrderBy('auditEvents.createdAt', 'ASC');
    }

    const rfq = await qb.getOne();
    if (!rfq) throw createError.notFound('Direct RFQ not found');
    return sortRfqVersions(rfq);
  }

  private async requireQuote(rfqId: string, quoteId: string): Promise<DirectRFQQuote> {
    const quote = await this.quoteRepo.findOne({
      where: { id: quoteId, rfqId },
      relations: ['versions'],
      order: { versions: { version: 'ASC' } },
    });
    if (!quote) throw createError.notFound('RFQ quote not found');
    return sortQuoteVersions(quote);
  }

  private baseRfqQuery(): SelectQueryBuilder<DirectRFQ> {
    return this.rfqRepo
      .createQueryBuilder('rfq')
      .distinct(true)
      .leftJoinAndSelect('rfq.buyer', 'buyer')
      .leftJoinAndSelect('rfq.seller', 'seller')
      .leftJoinAndSelect('rfq.product', 'product')
      .leftJoinAndSelect('rfq.variant', 'variant')
      .leftJoinAndSelect('rfq.quotes', 'quotes')
      .leftJoinAndSelect('quotes.versions', 'quoteVersions');
  }

  private applyUserFilters(
    qb: SelectQueryBuilder<DirectRFQ>,
    query: DirectRFQQueryDto,
  ): void {
    if (query.status) qb.andWhere('rfq.status = :status', { status: query.status });
    if (query.dateFrom) qb.andWhere('rfq.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('rfq.createdAt <= :dateTo', { dateTo: query.dateTo });
    if (query.search) {
      qb.andWhere(
        new Brackets((searchQb) => {
          searchQb
            .where('rfq.rfqReference LIKE :search', { search: `%${query.search}%` })
            .orWhere('CAST(rfq.description AS CHAR) LIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('buyer.email LIKE :search', { search: `%${query.search}%` })
            .orWhere('seller.email LIKE :search', { search: `%${query.search}%` });
        }),
      );
    }
  }

  private applyAdminFilters(
    qb: SelectQueryBuilder<DirectRFQ>,
    query: AdminDirectRFQQueryDto,
  ): void {
    if (query.status) qb.andWhere('rfq.status = :status', { status: query.status });
    if (query.buyerId) qb.andWhere('rfq.buyerId = :buyerId', { buyerId: query.buyerId });
    if (query.sellerId) qb.andWhere('rfq.sellerId = :sellerId', { sellerId: query.sellerId });
    if (query.productId) qb.andWhere('rfq.productId = :productId', { productId: query.productId });
    if (query.deliveryType) {
      qb.andWhere('rfq.deliveryType = :deliveryType', { deliveryType: query.deliveryType });
    }
    if (query.currency) {
      qb.andWhere(
        new Brackets((currencyQb) => {
          currencyQb
            .where('rfq.currencyPreference = :currency', { currency: query.currency })
            .orWhere('quoteVersions.currency = :currency', { currency: query.currency });
        }),
      );
    }
    this.applyUserFilters(qb, query);
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');
    return user;
  }

  private async requireOwnedAddress(userId: string, addressId: string): Promise<UserAddress> {
    const address = await this.addressRepo.findOne({ where: { id: addressId, userId } });
    if (!address) throw createError.notFound('Delivery address not found');
    return address;
  }

  private async requireRfqProduct(productId: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['seller', 'images', 'variants'],
      order: { images: { sortOrder: 'ASC' } },
    });
    if (!product || product.status !== ProductStatus.ACTIVE || product.deletedAt) {
      throw createError.badRequest('Product is not eligible for Direct RFQ');
    }
    if (product.inventoryStatus !== InventoryStatus.IN_STOCK) {
      throw createError.badRequest('Product is out of stock');
    }
    if (
      product.seller.status !== UserStatus.ACTIVE ||
      !product.seller.isCompanyVerified
    ) {
      throw createError.badRequest('Seller is not eligible to receive RFQs');
    }
    return product;
  }

  private async resolveVariant(
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

  private createProductSnapshot(
    product: Product,
    variant: ProductVariant | null,
    language: string,
  ): DirectRFQProductSnapshot {
    const primaryImage = (product.images || []).find((image) => image.isPrimary);
    const fallbackImage = (product.images || [])[0];
    return {
      productId: product.id,
      productName: resolveTranslation(product.productName, language, product.sourceLanguage),
      productImage: variant?.image || primaryImage?.url || fallbackImage?.url || null,
      sellerId: product.sellerId,
      sellerStoreName: product.seller.storeName || product.seller.companyName,
      variant: variant
        ? {
            variantId: variant.id,
            sku: variant.sku,
            attributes: variant.attributes,
          }
        : null,
    };
  }

  private async findTransactionRefs(rfqId: string): Promise<Record<string, unknown>> {
    const checkouts = await this.checkoutRepo.find({
      where: { sourceType: CheckoutSourceType.DIRECT_RFQ, sourceId: rfqId },
      order: { createdAt: 'DESC' },
    });
    const checkoutIds = checkouts.map((checkout) => checkout.id);
    const payments = checkoutIds.length
      ? await this.paymentRepo.find({
          where: { sourceType: 'checkout', sourceId: In(checkoutIds) },
          order: { createdAt: 'DESC' },
        })
      : [];
    const orders = await this.orderRepo.find({
      where: { sourceType: OrderSourceType.DIRECT_RFQ, sourceId: rfqId },
      order: { createdAt: 'DESC' },
    });

    return {
      checkouts: checkouts.map((checkout) => ({
        checkoutId: checkout.id,
        status: checkout.status,
        totalAmount: Number(checkout.totalAmount),
        currency: checkout.currency,
        createdAt: checkout.createdAt,
      })),
      payments: payments.map((payment) => ({
        paymentId: payment.id,
        paymentReference: payment.paymentReference,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        createdAt: payment.createdAt,
      })),
      orders: orders.map((order) => ({
        orderId: order.id,
        orderReference: order.orderReference,
        status: order.status,
        createdAt: order.createdAt,
      })),
    };
  }

  private async generateRfqReference(): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      const rfqReference = `TOFA-RFQ-${datePart}-${suffix}`;
      const existing = await this.rfqRepo.findOne({
        where: { rfqReference },
        select: ['id'],
      });
      if (!existing) return rfqReference;
    }
    throw createError.conflict('Unable to generate a unique RFQ reference');
  }

  private async recordAudit(
    manager: EntityManager,
    rfqId: string,
    eventType: string,
    actorType: DirectRFQActorType,
    actorId: string | null,
    metadata: Record<string, unknown> | null,
  ): Promise<void> {
    await manager.save(
      DirectRFQAuditEvent,
      manager.create(DirectRFQAuditEvent, {
        rfqId,
        eventType,
        actorType,
        actorId,
        metadata,
      }),
    );
  }

  private emit(
    eventName: Parameters<typeof emitDirectRFQEvent>[0],
    rfq: DirectRFQ,
    version?: DirectRFQQuoteVersion | null,
  ): void {
    emitDirectRFQEvent(eventName, rfq, version);
    this.fastify?.log.info(
      { event: eventName, rfqId: rfq.id, rfqReference: rfq.rfqReference },
      `[DirectRFQService] ${eventName}`,
    );
  }

  private async sendRfqCreatedEmail(rfq: DirectRFQ): Promise<void> {
    await sendDirectRFQCreatedEmail(
      rfq.seller.email,
      rfq.seller.firstName,
      emailDetails(rfq),
    );
  }

  private async sendQuoteReceivedEmail(
    rfq: DirectRFQ,
    version: DirectRFQQuoteVersion,
  ): Promise<void> {
    await sendDirectRFQQuoteReceivedEmail(
      rfq.buyer.email,
      rfq.buyer.firstName,
      emailDetails(rfq, version),
    );
  }

  private async sendCounterOfferEmail(
    rfq: DirectRFQ,
    version: DirectRFQQuoteVersion,
    actorType: DirectRFQActorType,
  ): Promise<void> {
    const recipient = actorType === DirectRFQActorType.BUYER ? rfq.seller : rfq.buyer;
    await sendDirectRFQCounterOfferEmail(
      recipient.email,
      recipient.firstName,
      emailDetails(rfq, version),
    );
  }

  private async sendQuoteAcceptedEmail(
    rfq: DirectRFQ,
    version: DirectRFQQuoteVersion,
  ): Promise<void> {
    await sendDirectRFQQuoteAcceptedEmail(
      rfq.seller.email,
      rfq.seller.firstName,
      emailDetails(rfq, version),
    );
  }

  private async sendQuoteRejectedEmail(rfq: DirectRFQ, reason: string): Promise<void> {
    await sendDirectRFQQuoteRejectedEmail(
      rfq.seller.email,
      rfq.seller.firstName,
      emailDetails(rfq, currentVersionForRfq(rfq), reason),
    );
  }

  private async sendRfqCancelledEmail(rfq: DirectRFQ, reason: string): Promise<void> {
    await sendDirectRFQCancelledEmail(
      rfq.seller.email,
      rfq.seller.firstName,
      emailDetails(rfq, currentVersionForRfq(rfq), reason),
    );
  }
}

function sortRfqVersions(rfq: DirectRFQ): DirectRFQ {
  rfq.quotes = (rfq.quotes ?? []).map(sortQuoteVersions);
  return rfq;
}

function sortQuoteVersions(quote: DirectRFQQuote): DirectRFQQuote {
  quote.versions = (quote.versions ?? []).sort((a, b) => a.version - b.version);
  return quote;
}

function currentQuoteForRfq(rfq: DirectRFQ): DirectRFQQuote | null {
  return (
    (rfq.quotes ?? []).find((quote) => quote.id === rfq.currentQuoteId) ||
    (rfq.quotes ?? [])[0] ||
    null
  );
}

function currentVersionForRfq(rfq: DirectRFQ): DirectRFQQuoteVersion | null {
  const quote = currentQuoteForRfq(rfq);
  return quote ? currentVersionForQuote(quote) : null;
}

function currentVersionForQuote(quote: DirectRFQQuote): DirectRFQQuoteVersion | null {
  return (
    (quote.versions ?? []).find((version) => version.id === quote.currentVersionId) ||
    (quote.versions ?? [])[quote.versions.length - 1] ||
    null
  );
}

function serializeRfqListItem(
  rfq: DirectRFQ,
  perspective: 'incoming' | 'outgoing',
  language: string,
): Record<string, unknown> {
  const currentVersion = currentVersionForRfq(rfq);
  return {
    rfqId: rfq.id,
    rfqReference: rfq.rfqReference,
    buyer: perspective === 'incoming' ? serializeUser(rfq.buyer) : undefined,
    seller: perspective === 'outgoing' ? serializeSeller(rfq.seller) : undefined,
    product: serializeProductSnapshot(rfq.productSnapshot),
    description: resolveTranslation(rfq.description, language, rfq.sourceLanguage),
    quantity: Number(rfq.quantity),
    unit: rfq.unit,
    deliveryType: rfq.deliveryType,
    status: rfq.status,
    currentQuote: currentVersion
      ? {
          currency: currentVersion.currency,
          quoteTotal: Number(currentVersion.quoteTotal),
          validUntil: currentVersion.validUntil,
          version: currentVersion.version,
        }
      : null,
    createdAt: rfq.createdAt,
  };
}

function serializeAdminRfqListItem(rfq: DirectRFQ): Record<string, unknown> {
  const currentVersion = currentVersionForRfq(rfq);
  return {
    rfqId: rfq.id,
    rfqReference: rfq.rfqReference,
    buyer: serializeUser(rfq.buyer),
    seller: serializeSeller(rfq.seller),
    product: serializeProductSnapshot(rfq.productSnapshot),
    description: resolveTranslation(rfq.description, 'en', rfq.sourceLanguage),
    descriptionTranslations: rfq.description,
    sourceLanguage: rfq.sourceLanguage,
    status: rfq.status,
    deliveryType: rfq.deliveryType,
    currentQuote: currentVersion
      ? {
          currency: currentVersion.currency,
          quoteTotal: Number(currentVersion.quoteTotal),
          version: currentVersion.version,
        }
      : null,
    createdAt: rfq.createdAt,
  };
}

function serializeRfqDetail(
  rfq: DirectRFQ,
  language: string,
  includeTranslations = false,
): Record<string, unknown> {
  const quote = currentQuoteForRfq(rfq);
  const currentVersion = quote ? currentVersionForQuote(quote) : null;
  return {
    rfqId: rfq.id,
    rfqReference: rfq.rfqReference,
    status: rfq.status,
    buyer: serializeUser(rfq.buyer),
    seller: serializeSeller(rfq.seller),
    product: serializeProductSnapshot(rfq.productSnapshot),
    request: {
      quantity: Number(rfq.quantity),
      unit: rfq.unit,
      description: includeTranslations
        ? rfq.description
        : resolveTranslation(rfq.description, language, rfq.sourceLanguage),
      descriptionTranslations: includeTranslations ? rfq.description : undefined,
      sourceLanguage: rfq.sourceLanguage,
      expectedDeliveryDate: rfq.expectedDeliveryDate,
      deliveryType: rfq.deliveryType,
      deliveryAddress: rfq.deliveryAddressSnapshot,
      currencyPreference: rfq.currencyPreference,
      buyerNotes: includeTranslations
        ? rfq.buyerNotes
        : resolveTranslation(rfq.buyerNotes, language, rfq.sourceLanguage),
      buyerNotesTranslations: includeTranslations ? rfq.buyerNotes : undefined,
    },
    currentQuote:
      quote && currentVersion ? serializeVersion(currentVersion, quote.id) : null,
    quoteHistory: quote
      ? quote.versions.map((version) => serializeVersion(version, quote.id))
      : [],
    acceptedQuoteId: rfq.acceptedQuoteId,
    acceptedQuoteVersionId: rfq.acceptedQuoteVersionId,
    viewedAt: rfq.viewedAt,
    acceptedAt: rfq.acceptedAt,
    rejectedAt: rfq.rejectedAt,
    rejectionReason: rfq.rejectionReason,
    cancelledAt: rfq.cancelledAt,
    cancellationReason: rfq.cancellationReason,
    expiresAt: rfq.expiresAt,
    createdAt: rfq.createdAt,
    updatedAt: rfq.updatedAt,
  };
}

function serializeQuoteDetail(rfq: DirectRFQ, quote: DirectRFQQuote): Record<string, unknown> {
  const currentVersion = currentVersionForQuote(quote);
  return {
    rfqId: rfq.id,
    rfqReference: rfq.rfqReference,
    quoteId: quote.id,
    status: quote.status,
    currentVersion: currentVersion ? serializeVersion(currentVersion, quote.id) : null,
    history: quote.versions.map((version) => serializeVersion(version, quote.id)),
  };
}

function serializeQuoteSummary(
  quote: DirectRFQQuote,
  version: DirectRFQQuoteVersion,
): Record<string, unknown> {
  return {
    quoteId: quote.id,
    versionId: version.id,
    version: version.version,
    pricePerUnit: Number(version.pricePerUnit),
    quantity: Number(version.quantity),
    unit: version.unit,
    productsTotal: Number(version.productsTotal),
    logisticsAmount: version.logisticsAmount === null ? null : Number(version.logisticsAmount),
    quoteTotal: Number(version.quoteTotal),
    currency: version.currency,
    validUntil: version.validUntil,
  };
}

function serializeVersion(
  version: DirectRFQQuoteVersion,
  quoteId: string,
): Record<string, unknown> {
  return {
    quoteId,
    versionId: version.id,
    version: version.version,
    createdBy: version.createdByType,
    createdById: version.createdById,
    quantity: Number(version.quantity),
    unit: version.unit,
    pricePerUnit: Number(version.pricePerUnit),
    currency: version.currency,
    productsTotal: Number(version.productsTotal),
    delivery: {
      type: version.deliveryType,
      logisticsAmount:
        version.logisticsAmount === null ? null : Number(version.logisticsAmount),
    },
    quoteTotal: Number(version.quoteTotal),
    estimatedDeliveryDate: version.estimatedDeliveryDate,
    validUntil: version.validUntil,
    message: version.message,
    createdAt: version.createdAt,
  };
}

function serializeProductSnapshot(snapshot: DirectRFQProductSnapshot): Record<string, unknown> {
  return {
    id: snapshot.productId,
    name: snapshot.productName,
    image: snapshot.productImage,
    sellerId: snapshot.sellerId,
    sellerStoreName: snapshot.sellerStoreName,
    variant: snapshot.variant,
  };
}

function serializeUser(user: User | undefined): Record<string, unknown> | null {
  if (!user) return null;
  return {
    id: user.id,
    name: displayUserName(user),
  };
}

function serializeSeller(user: User | undefined): Record<string, unknown> | null {
  if (!user) return null;
  return {
    id: user.id,
    name: displayUserName(user),
    storeName: user.storeName ?? user.companyName,
  };
}

function emailDetails(
  rfq: DirectRFQ,
  version?: DirectRFQQuoteVersion | null,
  reason?: string,
): Parameters<typeof sendDirectRFQCreatedEmail>[2] {
  return {
    rfqReference: rfq.rfqReference,
    buyerName: displayUserName(rfq.buyer),
    sellerName: displayUserName(rfq.seller),
    productName: rfq.productSnapshot.productName,
    variantDetails: rfq.productSnapshot.variant
      ? Object.entries(rfq.productSnapshot.variant.attributes ?? {})
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(', ')
      : null,
    quantity: version ? Number(version.quantity) : Number(rfq.quantity),
    unit: version ? version.unit : rfq.unit,
    deliveryMethod: deliveryLabel(version?.deliveryType ?? rfq.deliveryType),
    deliveryAddress: formatAddress(rfq.deliveryAddressSnapshot),
    expectedDeliveryDate: version?.estimatedDeliveryDate ?? rfq.expectedDeliveryDate,
    description: resolveTranslation(rfq.description, 'en', rfq.sourceLanguage),
    buyerNotes: resolveTranslation(rfq.buyerNotes, 'en', rfq.sourceLanguage),
    currency: version?.currency ?? rfq.currencyPreference,
    pricePerUnit: version ? Number(version.pricePerUnit) : null,
    productsTotal: version ? Number(version.productsTotal) : null,
    logisticsDisplay: version ? logisticsDisplay(version) : null,
    quoteTotal: version ? Number(version.quoteTotal) : null,
    validUntil: version?.validUntil ?? null,
    message: version?.message ?? null,
    reason,
  };
}

function toAddressSnapshot(address: UserAddress): AddressSnapshot {
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

function logisticsDisplay(version: DirectRFQQuoteVersion): string {
  if (version.deliveryType === DeliveryType.SELLER_ARRANGED) {
    return `${version.currency} ${Number(version.logisticsAmount ?? 0)}`;
  }
  if (version.deliveryType === DeliveryType.BUYER_ARRANGED) return 'Buyer arranged separately';
  if (version.deliveryType === DeliveryType.INTEGRATED_LOGISTICS) return 'Calculated during checkout';
  return 'Handled through B2B logistics';
}

function nextStepForDelivery(deliveryType: DeliveryType): string {
  if (deliveryType === DeliveryType.INTEGRATED_LOGISTICS) return 'select_integrated_logistics';
  if (deliveryType === DeliveryType.B2B_LOGISTICS) return 'b2b_logistics_quote_required';
  return 'checkout';
}

function deliveryLabel(deliveryType: DeliveryType): string {
  const labels: Record<DeliveryType, string> = {
    [DeliveryType.INTEGRATED_LOGISTICS]: 'Integrated Logistics',
    [DeliveryType.SELLER_ARRANGED]: 'Seller-Arranged Delivery',
    [DeliveryType.BUYER_ARRANGED]: 'Buyer-Arranged Delivery',
    [DeliveryType.B2B_LOGISTICS]: 'B2B Logistics',
  };
  return labels[deliveryType];
}

function formatAddress(address: AddressSnapshot): string {
  return [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.state,
    address.country,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(', ');
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
