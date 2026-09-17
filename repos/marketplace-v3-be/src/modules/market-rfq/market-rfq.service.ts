import { getSetting, requireActiveCurrency } from '../system-settings/settings.reader';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { Brackets, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import {
  AddressSnapshot,
  CheckoutSession,
  CheckoutSourceType,
  DeliveryType,
} from '../../database/entities/checkout-session.entity';
import { Category, CategoryStatus, TranslationMap } from '../../database/entities/category.entity';
import { MarketRFQAuditEvent } from '../../database/entities/market-rfq-audit-event.entity';
import {
  MarketRFQ,
  MarketRFQCategorySnapshot,
  MarketRFQProductSnapshot,
  MarketRFQStatus,
} from '../../database/entities/market-rfq.entity';
import {
  MarketRFQQuote,
  MarketRFQQuoteStatus,
} from '../../database/entities/market-rfq-quote.entity';
import {
  MarketRFQActorType,
  MarketRFQQuoteVersion,
} from '../../database/entities/market-rfq-quote-version.entity';
import { MarketRFQSellerView } from '../../database/entities/market-rfq-seller-view.entity';
import { MarketRFQSellerVisibility } from '../../database/entities/market-rfq-seller-visibility.entity';
import { Order, OrderSourceType } from '../../database/entities/order.entity';
import { Payment } from '../../database/entities/payment.entity';
import { ProductCategory } from '../../database/entities/product-category.entity';
import {
  InventoryStatus,
  Product,
  ProductStatus,
  ProductType,
} from '../../database/entities/product.entity';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { User, UserStatus, UserType } from '../../database/entities/user.entity';
import { UserAddress } from '../../database/entities/user-address.entity';
import { createError } from '../../common/utils/http-error.util';
import {
  normalizeLanguageCode,
  resolveTranslation,
  toTranslationMap,
} from '../../common/utils/i18n.util';
import { roundMoney } from '../../common/utils/pricing.util';
import { addHours } from '../../common/utils/token.util';
import {
  AdminMarketRFQQueryDto,
  MarketRFQAcceptQuoteDto,
  MarketRFQAvailableQueryDto,
  MarketRFQCancelDto,
  MarketRFQCounterOfferDto,
  MarketRFQCreateDto,
  MarketRFQMyResponsesQueryDto,
  MarketRFQQueryDto,
  MarketRFQQuoteQueryDto,
  MarketRFQQuoteTermsDto,
  MarketRFQRejectQuoteDto,
} from '../../common/utils/validation.schemas';
import {
  sendMarketRFQCancelledEmail,
  sendMarketRFQCounterOfferEmail,
  sendMarketRFQCreatedEmail,
  sendMarketRFQQuoteAcceptedEmail,
  sendMarketRFQQuoteClosedEmail,
  sendMarketRFQQuoteReceivedEmail,
  sendMarketRFQQuoteRejectedEmail,
} from '../../common/utils/email.service';
import { CheckoutService } from '../checkout/checkout.service';
import { I18nService } from '../i18n/i18n.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { emitMarketRFQEvent } from './market-rfq.events';
import { TranslatableEntityType } from '../../database/entities/translation-metadata.entity';

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

type EligibleSeller = {
  seller: User;
  matchedCategoryIds: string[];
};

type RfqDetailOptions = {
  includeAudit?: boolean;
  includeVisibility?: boolean;
};

const FINAL_MARKET_RFQ_STATUSES = [
  MarketRFQStatus.AWARDED,
  MarketRFQStatus.CANCELLED,
  MarketRFQStatus.EXPIRED,
];

const SELLER_VISIBLE_RFQ_STATUSES = [
  MarketRFQStatus.OPEN,
  MarketRFQStatus.QUOTED,
  MarketRFQStatus.NEGOTIATING,
];

export class MarketRFQService {
  private rfqRepo = AppDataSource.getRepository(MarketRFQ);
  private quoteRepo = AppDataSource.getRepository(MarketRFQQuote);
  private visibilityRepo = AppDataSource.getRepository(MarketRFQSellerVisibility);
  private sellerViewRepo = AppDataSource.getRepository(MarketRFQSellerView);
  private categoryRepo = AppDataSource.getRepository(Category);
  private productCategoryRepo = AppDataSource.getRepository(ProductCategory);
  private productRepo = AppDataSource.getRepository(Product);
  private variantRepo = AppDataSource.getRepository(ProductVariant);
  private addressRepo = AppDataSource.getRepository(UserAddress);
  private userRepo = AppDataSource.getRepository(User);
  private checkoutRepo = AppDataSource.getRepository(CheckoutSession);
  private paymentRepo = AppDataSource.getRepository(Payment);
  private orderRepo = AppDataSource.getRepository(Order);
  private checkoutService = new CheckoutService();
  private i18nService = new I18nService();
  private subscriptionService = new SubscriptionService();

  constructor(private readonly fastify?: FastifyInstance) {}

  async createMarketRFQ(
    buyerId: string,
    dto: MarketRFQCreateDto,
    language: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const buyer = await this.requireUser(buyerId);
    const categories = await this.validateActiveCategories(dto.categoryIds);
    const { product, variant } = await this.resolveProductContext(
      dto.productId ?? null,
      dto.variantId ?? null,
    );
    if (product && product.sellerId === buyerId) {
      throw createError.badRequest('You cannot use your own product as a Market RFQ context');
    }
    if (dto.submissionDeadline.getTime() <= Date.now()) {
      throw createError.badRequest('Submission deadline must be in the future');
    }

    const deliveryAddress = await this.requireOwnedAddress(buyerId, dto.deliveryAddressId);
    const eligibleSellers = await this.findEligibleSellers(
      categories.map((category) => category.id),
      buyerId,
    );
    const rfqReference = await this.generateRfqReference();
    const sourceLanguage = normalizeLanguageCode(dto.sourceLanguage ?? language);
    await this.i18nService.ensureSelectableLanguage(sourceLanguage);
    const requirementTitle = toTranslationMap(
      dto.requirementTitle as string | TranslationMap,
      sourceLanguage,
    );
    const description = toTranslationMap(
      dto.description as string | TranslationMap,
      sourceLanguage,
    );
    const buyerNotes = dto.buyerNotes
      ? toTranslationMap(dto.buyerNotes as string | TranslationMap, sourceLanguage)
      : null;

    let rfq: MarketRFQ | null = null;
    await AppDataSource.transaction(async (manager) => {
      rfq = await manager.save(
        MarketRFQ,
        manager.create(MarketRFQ, {
          rfqReference,
          buyerId,
          productId: product?.id ?? null,
          variantId: variant?.id ?? null,
          categoryIds: categories.map((category) => category.id),
          categorySnapshots: categories.map((category) =>
            toCategorySnapshot(category, language),
          ),
          requirementTitle,
          description,
          sourceLanguage,
          quantity: dto.quantity,
          unit: dto.unit,
          expectedDeliveryDate: dto.expectedDeliveryDate ?? null,
          deliveryAddressId: deliveryAddress.id,
          deliveryAddressSnapshot: toAddressSnapshot(deliveryAddress),
          deliveryType: dto.deliveryType as DeliveryType,
          currencyPreference: dto.currencyPreference ?? null,
          buyerNotes,
          productSnapshot: product ? createProductSnapshot(product, variant, language) : null,
          status: MarketRFQStatus.OPEN,
          quotesCount: 0,
          awardedSellerId: null,
          acceptedQuoteId: null,
          acceptedQuoteVersionId: null,
          submissionDeadline: dto.submissionDeadline,
          awardedAt: null,
          cancelledAt: null,
          cancellationReason: null,
        }),
      );

      if (eligibleSellers.length > 0) {
        await manager.save(
          MarketRFQSellerVisibility,
          eligibleSellers.map((eligible) =>
            manager.create(MarketRFQSellerVisibility, {
              rfqId: rfq!.id,
              sellerId: eligible.seller.id,
              matchedCategoryIds: eligible.matchedCategoryIds,
              eligibilityReason: 'category_match',
              notifiedAt: new Date(),
            }),
          ),
        );
      }

      await this.recordAudit(
        manager,
        rfq.id,
        'RFQ_CREATED',
        MarketRFQActorType.BUYER,
        buyerId,
        {
          categoryIds: categories.map((category) => category.id),
          deliveryType: dto.deliveryType,
          eligibleSellerCount: eligibleSellers.length,
          sourceLanguage,
        },
      );
      await this.i18nService.trackEntityTranslations(
        {
          entityType: TranslatableEntityType.MARKET_RFQ,
          entityId: rfq.id,
          sourceLanguage,
          fields: {
            requirementTitle,
            description,
            buyerNotes,
          },
        },
        manager,
      );
    });

    rfq!.buyer = buyer;
    rfq!.product = product;
    rfq!.variant = variant;
    rfq!.awardedSeller = null;
    rfq!.quotes = [];
    rfq!.sellerVisibilities = eligibleSellers.map((eligible) =>
      this.visibilityRepo.create({
        rfqId: rfq!.id,
        sellerId: eligible.seller.id,
        seller: eligible.seller,
        matchedCategoryIds: eligible.matchedCategoryIds,
        eligibilityReason: 'category_match',
        notifiedAt: new Date(),
      }),
    );

    this.emit('MARKET_RFQ_CREATED', rfq!);
    this.sendMarketRfqCreatedEmails(rfq!, eligibleSellers).catch((err) =>
      console.error('[MarketRFQService] Market RFQ seller notifications failed:', err),
    );

    return {
      success: true,
      message: 'Market RFQ published successfully.',
      data: serializeRfqListItem(rfq!, language),
    };
  }

  async listBuyerMarketRFQs(
    buyerId: string,
    query: MarketRFQQueryDto,
    language: string,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
  }> {
    const qb = this.baseRfqQuery()
      .where('rfq.buyerId = :buyerId', { buyerId });

    this.applyRfqFilters(qb, query);
    const [rfqs, total] = await qb
      .orderBy('rfq.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      success: true,
      data: rfqs.map((rfq) => serializeRfqListItem(rfq, language)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async listAvailableMarketRFQs(
    sellerId: string,
    query: MarketRFQAvailableQueryDto,
    language: string,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
  }> {
    await this.requireVerifiedSeller(sellerId);
    await this.subscriptionService.assertMarketRfqAccess(sellerId);
    const qb = this.baseRfqQuery()
      .innerJoin(
        'rfq.sellerVisibilities',
        'availableVisibility',
        'availableVisibility.sellerId = :sellerId',
        { sellerId },
      )
      .where('rfq.status IN (:...statuses)', {
        statuses: SELLER_VISIBLE_RFQ_STATUSES,
      })
      .andWhere('rfq.submissionDeadline > :now', { now: new Date() });

    this.applyAvailableFilters(qb, query);
    applyAvailableRfqSort(qb, query);
    const [rfqs, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      success: true,
      data: rfqs.map((rfq) => serializeAvailableRfqListItem(rfq, language)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async listMyResponses(
    sellerId: string,
    query: MarketRFQMyResponsesQueryDto,
    language: string,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
  }> {
    await this.requireVerifiedSeller(sellerId);
    const qb = this.quoteRepo
      .createQueryBuilder('quote')
      .distinct(true)
      .leftJoinAndSelect('quote.rfq', 'rfq')
      .leftJoinAndSelect('quote.versions', 'versions')
      .where('quote.sellerId = :sellerId', { sellerId });

    if (query.quoteStatus) qb.andWhere('quote.status = :quoteStatus', { quoteStatus: query.quoteStatus });
    if (query.rfqStatus) qb.andWhere('rfq.status = :rfqStatus', { rfqStatus: query.rfqStatus });
    if (query.search) {
      qb.andWhere(
        new Brackets((searchQb) => {
          searchQb
            .where('rfq.rfqReference LIKE :search', { search: `%${query.search}%` })
            .orWhere('CAST(rfq.requirementTitle AS CHAR) LIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('CAST(rfq.description AS CHAR) LIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('CAST(rfq.buyerNotes AS CHAR) LIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }

    const [quotes, total] = await qb
      .orderBy('rfq.createdAt', 'DESC')
      .addOrderBy('versions.version', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      success: true,
      data: quotes.map((quote) => serializeSellerResponseListItem(quote, language)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async getMarketRFQById(
    userId: string,
    rfqId: string,
    language: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    let rfq = await this.requireRfqDetail(rfqId);
    rfq = await this.expireRfqIfNeeded(rfq);

    if (rfq.buyerId === userId) {
      return { success: true, data: serializeBuyerRfqDetail(rfq, language) };
    }

    await this.requireVerifiedSeller(userId);
    const ownQuote = (rfq.quotes ?? []).find((quote) => quote.sellerId === userId) ?? null;
    if (!ownQuote) {
      await this.subscriptionService.assertMarketRfqAccess(userId);
    }
    const hasVisibility = ownQuote ? true : await this.isSellerVisible(rfq.id, userId);
    if (!hasVisibility) {
      throw createError.forbidden('You do not have access to this Market RFQ');
    }

    await this.recordSellerView(rfq, userId);
    const updated = await this.requireRfqDetail(rfq.id);
    return {
      success: true,
      data: serializeSellerRfqDetail(updated, userId, language),
    };
  }

  async submitQuote(
    sellerId: string,
    rfqId: string,
    dto: MarketRFQQuoteTermsDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const seller = await this.requireVerifiedSeller(sellerId);
    let rfq = await this.requireRfqDetail(rfqId);
    if (rfq.buyerId === sellerId) {
      throw createError.badRequest('You cannot quote your own Market RFQ');
    }
    await this.ensureSellerEligibleForRfq(rfq, seller);
    rfq = await this.assertRfqCommerciallyOpen(rfq);

    const existingQuote = await this.findSellerQuote(rfq.id, sellerId);
    await this.subscriptionService.assertMarketRfqAccess(sellerId);
    if (!existingQuote) {
      await this.subscriptionService.assertMarketRfqResponseAllowed(sellerId);
    }
    if (!existingQuote && rfq.submissionDeadline.getTime() <= Date.now()) {
      throw createError.conflict('Market RFQ submission deadline has passed');
    }
    if (existingQuote && existingQuote.status !== MarketRFQQuoteStatus.ACTIVE) {
      throw createError.conflict('This seller quotation is no longer open for updates');
    }

    const terms = this.validateAndBuildTerms(rfq, dto);
    let quote: MarketRFQQuote | null = null;
    let version: MarketRFQQuoteVersion | null = null;
    let createdNewQuote = false;

    await AppDataSource.transaction(async (manager) => {
      const lockedRfq=await manager.findOneOrFail(MarketRFQ,{where:{id:rfq.id},lock:{mode:'pessimistic_write'}});
      rfq.quotesCount=lockedRfq.quotesCount;
      quote = await manager.findOne(MarketRFQQuote, {
        where: { rfqId: rfq.id, sellerId },
        relations: ['versions'],
      });

      if (quote && quote.status !== MarketRFQQuoteStatus.ACTIVE) {
        throw createError.conflict('This seller quotation is no longer open for updates');
      }

      if (!quote) {
        const cap=await getSetting<number>('maximumMarketRFQResponses',manager);
        if(cap>0 && await manager.countBy(MarketRFQQuote,{rfqId:rfq.id})>=cap)throw createError.conflict('Market RFQ response limit reached');
        createdNewQuote = true;
        quote = await manager.save(
          MarketRFQQuote,
          manager.create(MarketRFQQuote, {
            rfqId: rfq.id,
            sellerId,
            currentVersionId: null,
            status: MarketRFQQuoteStatus.ACTIVE,
            acceptedAt: null,
            rejectedAt: null,
            rejectionReason: null,
            closedAt: null,
            closedReason: null,
          }),
        );
      }

      version = await this.createQuoteVersion(
        manager,
        quote,
        MarketRFQActorType.SELLER,
        sellerId,
        terms,
      );

      await manager.update(MarketRFQQuote, quote.id, {
        currentVersionId: version.id,
        status: MarketRFQQuoteStatus.ACTIVE,
        rejectedAt: null,
        rejectionReason: null,
        closedAt: null,
        closedReason: null,
      });
      await manager.update(MarketRFQ, rfq.id, {
        status:
          rfq.status === MarketRFQStatus.NEGOTIATING
            ? MarketRFQStatus.NEGOTIATING
            : MarketRFQStatus.QUOTED,
        quotesCount: createdNewQuote ? rfq.quotesCount + 1 : rfq.quotesCount,
      });
      await this.recordAudit(
        manager,
        rfq.id,
        createdNewQuote ? 'QUOTE_SUBMITTED' : 'QUOTE_UPDATED',
        MarketRFQActorType.SELLER,
        sellerId,
        { quoteId: quote.id, quoteVersionId: version.id, version: version.version },
      );
    });

    const updated = await this.requireRfqDetail(rfq.id);
    const updatedQuote = (updated.quotes ?? []).find((item) => item.id === quote!.id) ?? quote!;
    this.emit('MARKET_RFQ_QUOTE_CREATED', updated, version);
    this.sendQuoteReceivedEmail(updated, updatedQuote, version!).catch((err) =>
      console.error('[MarketRFQService] Quote received email failed:', err),
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

  async listQuotesForBuyer(
    buyerId: string,
    rfqId: string,
    query: MarketRFQQuoteQueryDto,
    language: string,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
  }> {
    let rfq = await this.requireBuyerRfq(rfqId, buyerId);
    rfq = await this.expireRfqIfNeeded(rfq);

    let quotes = (rfq.quotes ?? []).map(sortQuoteVersions);
    if (query.status) {
      quotes = quotes.filter((quote) => quote.status === query.status);
    }
    if (query.currency) {
      quotes = quotes.filter((quote) => currentVersionForQuote(quote)?.currency === query.currency);
    }

    quotes = sortQuotesForComparison(quotes, query.sortBy);
    const total = quotes.length;
    const paged = quotes.slice((query.page - 1) * query.limit, query.page * query.limit);

    return {
      success: true,
      data: paged.map((quote) => serializeQuoteComparison(quote, language)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async getQuoteDetails(
    userId: string,
    rfqId: string,
    quoteId: string,
    language: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const rfq = await this.requireRfqDetail(rfqId);
    const quote = await this.requireQuote(rfq.id, quoteId);
    if (rfq.buyerId !== userId && quote.sellerId !== userId) {
      throw createError.forbidden('You do not have access to this Market RFQ quote');
    }

    return {
      success: true,
      data: serializeQuoteDetail(rfq, quote, language),
    };
  }

  async submitCounterOffer(
    userId: string,
    rfqId: string,
    quoteId: string,
    dto: MarketRFQCounterOfferDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    let rfq = await this.requireRfqDetail(rfqId);
    rfq = await this.assertRfqCommerciallyOpen(rfq);
    const quote = await this.requireQuote(rfq.id, quoteId);
    if (rfq.buyerId !== userId && quote.sellerId !== userId) {
      throw createError.forbidden('You do not have access to this Market RFQ negotiation');
    }
    if (quote.sellerId === userId) {
      await this.requireVerifiedSeller(userId);
    }
    if (quote.status !== MarketRFQQuoteStatus.ACTIVE) {
      throw createError.conflict('This quotation is no longer open for negotiation');
    }
    const currentVersion = currentVersionForQuote(quote);
    if (!currentVersion) throw createError.badRequest('Quotation has no active version');
    await this.assertCurrentVersionStillValid(quote, currentVersion);

    const actorType =
      rfq.buyerId === userId ? MarketRFQActorType.BUYER : MarketRFQActorType.SELLER;
    const terms = this.validateAndBuildTerms(rfq, dto);
    let version: MarketRFQQuoteVersion | null = null;

    await AppDataSource.transaction(async (manager) => {
      version = await this.createQuoteVersion(manager, quote, actorType, userId, terms);
      await manager.update(MarketRFQQuote, quote.id, {
        currentVersionId: version.id,
        status: MarketRFQQuoteStatus.ACTIVE,
      });
      await manager.update(MarketRFQ, rfq.id, {
        status: MarketRFQStatus.NEGOTIATING,
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
    this.emit('MARKET_RFQ_COUNTER_OFFER_CREATED', updated, version);
    this.sendCounterOfferEmail(updated, quote, version!, actorType).catch((err) =>
      console.error('[MarketRFQService] Counter-offer email failed:', err),
    );

    return {
      success: true,
      message: 'Counter-offer submitted successfully.',
      data: {
        rfqId: updated.id,
        rfqStatus: updated.status,
        quote: serializeQuoteSummary(quote, version!),
      },
    };
  }

  async acceptQuote(
    buyerId: string,
    rfqId: string,
    quoteId: string,
    dto: MarketRFQAcceptQuoteDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    let idempotentAward = false;
    let closedQuotes: MarketRFQQuote[] = [];

    await AppDataSource.transaction(async (manager) => {
      const lockedRfq = await manager
        .getRepository(MarketRFQ)
        .createQueryBuilder('rfq')
        .setLock('pessimistic_write')
        .where('rfq.id = :rfqId', { rfqId })
        .getOne();

      if (!lockedRfq) throw createError.notFound('Market RFQ not found');
      if (lockedRfq.buyerId !== buyerId) {
        throw createError.forbidden('Only the buyer can award this Market RFQ');
      }

      if (lockedRfq.status === MarketRFQStatus.AWARDED) {
        if (
          lockedRfq.acceptedQuoteId === quoteId &&
          lockedRfq.acceptedQuoteVersionId === dto.quoteVersionId
        ) {
          idempotentAward = true;
          return;
        }
        throw createError.conflict('Another seller quote has already been awarded');
      }
      if ([MarketRFQStatus.CANCELLED, MarketRFQStatus.EXPIRED].includes(lockedRfq.status)) {
        throw createError.conflict('This Market RFQ can no longer be awarded');
      }

      const quote = await manager.findOne(MarketRFQQuote, {
        where: { id: quoteId, rfqId },
        relations: ['versions', 'seller'],
      });
      if (!quote) throw createError.notFound('Market RFQ quote not found');
      if (quote.status !== MarketRFQQuoteStatus.ACTIVE) {
        throw createError.conflict('Only active quotations can be accepted');
      }
      const version = currentVersionForQuote(sortQuoteVersions(quote));
      if (!version || version.id !== dto.quoteVersionId) {
        throw createError.badRequest('Only the current quote version can be accepted');
      }
      if (version.createdByType !== MarketRFQActorType.SELLER) {
        throw createError.badRequest('Only seller-generated quote versions can be accepted');
      }
      if (version.validUntil.getTime() <= Date.now()) {
        await manager.update(MarketRFQQuote, quote.id, {
          status: MarketRFQQuoteStatus.EXPIRED,
        });
        throw createError.badRequest(
          'This quotation has expired. Please request updated terms from the seller.',
          'QUOTE_EXPIRED',
        );
      }

      const now = new Date();
      closedQuotes = await manager.find(MarketRFQQuote, {
        where: { rfqId, status: MarketRFQQuoteStatus.ACTIVE },
        relations: ['seller', 'versions'],
      });
      closedQuotes = closedQuotes.filter((item) => item.id !== quote.id);

      await manager.update(MarketRFQQuote, quote.id, {
        status: MarketRFQQuoteStatus.ACCEPTED,
        acceptedAt: now,
      });
      if (closedQuotes.length > 0) {
        await manager.update(
          MarketRFQQuote,
          { id: In(closedQuotes.map((item) => item.id)) },
          {
            status: MarketRFQQuoteStatus.CLOSED,
            closedAt: now,
            closedReason: 'another_seller_awarded',
          },
        );
      }
      await manager.update(MarketRFQ, lockedRfq.id, {
        status: MarketRFQStatus.AWARDED,
        awardedSellerId: quote.sellerId,
        acceptedQuoteId: quote.id,
        acceptedQuoteVersionId: version.id,
        awardedAt: now,
      });
      await this.recordAudit(
        manager,
        lockedRfq.id,
        'QUOTE_AWARDED',
        MarketRFQActorType.BUYER,
        buyerId,
        {
          quoteId: quote.id,
          quoteVersionId: version.id,
          awardedSellerId: quote.sellerId,
          closedQuoteIds: closedQuotes.map((item) => item.id),
        },
      );
    });

    const updated = await this.requireRfqDetail(rfqId);
    const acceptedQuote = await this.requireQuote(updated.id, updated.acceptedQuoteId!);
    const acceptedVersion = currentVersionForQuote(acceptedQuote);
    if (!acceptedVersion) throw createError.badRequest('Accepted quotation has no active version');

    if (!idempotentAward) {
      this.emit('MARKET_RFQ_AWARDED', updated, acceptedVersion);
      this.emit('MARKET_RFQ_QUOTE_CLOSED', updated);
      this.sendQuoteAcceptedEmail(updated, acceptedQuote, acceptedVersion).catch((err) =>
        console.error('[MarketRFQService] Quote accepted email failed:', err),
      );
      this.sendClosedQuoteEmails(updated, closedQuotes).catch((err) =>
        console.error('[MarketRFQService] Closed quote emails failed:', err),
      );
    }

    return this.acceptedQuoteResponse(updated, acceptedQuote, acceptedVersion);
  }

  async rejectQuote(
    buyerId: string,
    rfqId: string,
    quoteId: string,
    dto: MarketRFQRejectQuoteDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    let rfq = await this.requireBuyerRfq(rfqId, buyerId);
    rfq = await this.assertRfqCommerciallyOpen(rfq);
    const quote = await this.requireQuote(rfq.id, quoteId);
    if (quote.status !== MarketRFQQuoteStatus.ACTIVE) {
      throw createError.conflict('This quotation cannot be rejected in its current status');
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.update(MarketRFQQuote, quote.id, {
        status: MarketRFQQuoteStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
      });
      await manager.update(MarketRFQ, rfq.id, {
        status:
          rfq.status === MarketRFQStatus.NEGOTIATING
            ? MarketRFQStatus.NEGOTIATING
            : MarketRFQStatus.QUOTED,
      });
      await this.recordAudit(
        manager,
        rfq.id,
        'QUOTE_REJECTED',
        MarketRFQActorType.BUYER,
        buyerId,
        { quoteId: quote.id, reason: dto.reason },
      );
    });

    const updated = await this.requireRfqDetail(rfq.id);
    const rejectedQuote = await this.requireQuote(updated.id, quote.id);
    this.emit('MARKET_RFQ_QUOTE_REJECTED', updated);
    this.sendQuoteRejectedEmail(updated, rejectedQuote, dto.reason).catch((err) =>
      console.error('[MarketRFQService] Quote rejected email failed:', err),
    );

    return {
      success: true,
      message: 'Quotation rejected successfully.',
      data: {
        rfqId: updated.id,
        quoteId: quote.id,
        quoteStatus: MarketRFQQuoteStatus.REJECTED,
        rfqStatus: updated.status,
      },
    };
  }

  async cancelRfq(
    buyerId: string,
    rfqId: string,
    dto: MarketRFQCancelDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const rfq = await this.requireBuyerRfq(rfqId, buyerId);
    if (rfq.status === MarketRFQStatus.AWARDED) {
      throw createError.conflict(
        'Awarded Market RFQs must use the checkout, payment, or order cancellation flow',
      );
    }
    if (rfq.status === MarketRFQStatus.CANCELLED) {
      return {
        success: true,
        message: 'Market RFQ is already cancelled.',
        data: { rfqId: rfq.id, status: rfq.status },
      };
    }
    if (rfq.status === MarketRFQStatus.EXPIRED) {
      throw createError.conflict('Expired Market RFQs cannot be cancelled');
    }

    let closedQuotes: MarketRFQQuote[] = [];
    await AppDataSource.transaction(async (manager) => {
      closedQuotes = await manager.find(MarketRFQQuote, {
        where: { rfqId: rfq.id, status: MarketRFQQuoteStatus.ACTIVE },
        relations: ['seller', 'versions'],
      });
      await manager.update(MarketRFQ, rfq.id, {
        status: MarketRFQStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      });
      if (closedQuotes.length > 0) {
        await manager.update(
          MarketRFQQuote,
          { id: In(closedQuotes.map((quote) => quote.id)) },
          {
            status: MarketRFQQuoteStatus.CLOSED,
            closedAt: new Date(),
            closedReason: 'rfq_cancelled',
          },
        );
      }
      await this.recordAudit(
        manager,
        rfq.id,
        'RFQ_CANCELLED',
        MarketRFQActorType.BUYER,
        buyerId,
        { reason: dto.reason, closedQuoteIds: closedQuotes.map((quote) => quote.id) },
      );
    });

    const updated = await this.requireRfqDetail(rfq.id);
    this.emit('MARKET_RFQ_CANCELLED', updated);
    this.sendCancelledEmails(updated, closedQuotes, dto.reason).catch((err) =>
      console.error('[MarketRFQService] RFQ cancelled emails failed:', err),
    );

    return {
      success: true,
      message: 'Market RFQ cancelled successfully.',
      data: { rfqId: updated.id, status: updated.status },
    };
  }

  async listAdminMarketRFQs(
    query: AdminMarketRFQQueryDto,
    language = 'en',
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
      data: rfqs.map((rfq) => serializeAdminRfqListItem(rfq, language)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async getAdminMarketRFQById(
    rfqId: string,
    language = 'en',
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const rfq = await this.requireRfqDetail(rfqId, {
      includeAudit: true,
      includeVisibility: true,
    });
    const transactionRefs = await this.findTransactionRefs(rfq.id);
    const auditEvents = (rfq as MarketRFQ & { auditEvents?: MarketRFQAuditEvent[] }).auditEvents ?? [];
    return {
      success: true,
      data: {
        ...serializeAdminRfqDetail(rfq, language),
        transactionRefs,
        auditHistory: auditEvents.map((event) => ({
          eventId: event.id,
          eventType: event.eventType,
          actorType: event.actorType,
          actorId: event.actorId,
          metadata: event.metadata,
          createdAt: event.createdAt,
        })),
      },
    };
  }

  private async acceptedQuoteResponse(
    rfq: MarketRFQ,
    quote: MarketRFQQuote,
    version: MarketRFQQuoteVersion,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const canPrepareCheckout = [
      DeliveryType.SELLER_ARRANGED,
      DeliveryType.BUYER_ARRANGED,
    ].includes(version.deliveryType);
    const checkout = canPrepareCheckout
      ? await this.checkoutService.prepareMarketRfqCheckout({
          buyerId: rfq.buyerId,
          sellerId: quote.sellerId,
          rfqId: rfq.id,
          quoteId: quote.id,
          quoteVersionId: version.id,
          deliveryAddressId: rfq.deliveryAddressId!,
          deliveryAddressSnapshot: rfq.deliveryAddressSnapshot,
          product: checkoutProductSnapshot(rfq, version),
          quantity: Number(version.quantity),
          unit: version.unit,
          pricePerUnit: Number(version.pricePerUnit),
          productsTotal: Number(version.productsTotal),
          delivery: {
            type: version.deliveryType,
            logisticsAmount:
              version.logisticsAmount === null ? null : Number(version.logisticsAmount),
            logisticsCurrency: version.logisticsAmount === null ? null : version.currency,
          },
          quoteTotal: Number(version.quoteTotal),
          currency: version.currency,
          notes: resolveTranslation(rfq.buyerNotes, 'en', rfq.sourceLanguage),
          expiresAt: addHours(config.marketRfq.checkoutExpiryHours),
        })
      : null;

    return {
      success: true,
      message: 'Quotation accepted successfully.',
      data: {
        rfqId: rfq.id,
        rfqStatus: MarketRFQStatus.AWARDED,
        awardedSeller: serializeSeller(quote.seller ?? rfq.awardedSeller ?? null),
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
    rfq: MarketRFQ,
    dto: MarketRFQQuoteTermsDto | MarketRFQCounterOfferDto,
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
    quote: MarketRFQQuote,
    actorType: MarketRFQActorType,
    actorId: string,
    terms: QuoteTerms,
  ): Promise<MarketRFQQuoteVersion> {
    await requireActiveCurrency(terms.currency,manager);
    const currentVersions = quote.versions ?? [];
    const versionNumber =
      currentVersions.reduce((max, version) => Math.max(max, version.version), 0) + 1;

    return manager.save(
      MarketRFQQuoteVersion,
      manager.create(MarketRFQQuoteVersion, {
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

  private async assertRfqCommerciallyOpen(rfq: MarketRFQ): Promise<MarketRFQ> {
    const fresh = await this.expireRfqIfNeeded(rfq);
    if (FINAL_MARKET_RFQ_STATUSES.includes(fresh.status)) {
      throw createError.conflict('This Market RFQ is no longer open for commercial changes');
    }
    return fresh;
  }

  private async assertCurrentVersionStillValid(
    quote: MarketRFQQuote,
    version: MarketRFQQuoteVersion,
  ): Promise<void> {
    if (version.validUntil.getTime() > Date.now()) return;

    await this.quoteRepo.update(quote.id, { status: MarketRFQQuoteStatus.EXPIRED });
    throw createError.badRequest(
      'This quotation has expired. Please request updated terms from the seller.',
      'QUOTE_EXPIRED',
    );
  }

  private async expireRfqIfNeeded(rfq: MarketRFQ): Promise<MarketRFQ> {
    if (FINAL_MARKET_RFQ_STATUSES.includes(rfq.status)) return rfq;

    const detailed = rfq.quotes ? rfq : await this.requireRfqDetail(rfq.id);
    const now = Date.now();
    const expiredQuoteIds = (detailed.quotes ?? [])
      .filter((quote) => quote.status === MarketRFQQuoteStatus.ACTIVE)
      .filter((quote) => {
        const currentVersion = currentVersionForQuote(quote);
        return currentVersion ? currentVersion.validUntil.getTime() <= now : false;
      })
      .map((quote) => quote.id);

    if (expiredQuoteIds.length > 0) {
      await this.quoteRepo.update(
        { id: In(expiredQuoteIds) },
        { status: MarketRFQQuoteStatus.EXPIRED },
      );
    }

    const refreshed = expiredQuoteIds.length > 0 ? await this.requireRfqDetail(rfq.id) : detailed;
    const hasSelectableQuote = (refreshed.quotes ?? []).some((quote) => {
      if (quote.status !== MarketRFQQuoteStatus.ACTIVE) return false;
      const currentVersion = currentVersionForQuote(quote);
      return currentVersion ? currentVersion.validUntil.getTime() > now : false;
    });

    if (refreshed.submissionDeadline.getTime() <= now && !hasSelectableQuote) {
      await this.rfqRepo.update(refreshed.id, { status: MarketRFQStatus.EXPIRED });
      const expired = await this.requireRfqDetail(refreshed.id);
      this.emit('MARKET_RFQ_EXPIRED', expired);
      return expired;
    }

    return refreshed;
  }

  private async requireBuyerRfq(rfqId: string, buyerId: string): Promise<MarketRFQ> {
    const rfq = await this.requireRfqDetail(rfqId);
    if (rfq.buyerId !== buyerId) {
      throw createError.forbidden('Only the buyer can perform this Market RFQ action');
    }
    return rfq;
  }

  private async requireRfqDetail(
    rfqId: string,
    options: RfqDetailOptions = {},
  ): Promise<MarketRFQ> {
    const qb = this.baseRfqQuery()
      .where('rfq.id = :rfqId', { rfqId })
      .orderBy('quoteVersions.version', 'ASC');

    if (options.includeVisibility) {
      qb.leftJoinAndSelect('rfq.sellerVisibilities', 'sellerVisibilities')
        .leftJoinAndSelect('sellerVisibilities.seller', 'visibleSeller')
        .leftJoinAndSelect('rfq.sellerViews', 'sellerViews')
        .leftJoinAndSelect('sellerViews.seller', 'viewingSeller');
    }

    if (options.includeAudit) {
      qb.leftJoinAndMapMany(
        'rfq.auditEvents',
        MarketRFQAuditEvent,
        'auditEvents',
        'auditEvents.rfqId = rfq.id',
      ).addOrderBy('auditEvents.createdAt', 'ASC');
    }

    const rfq = await qb.getOne();
    if (!rfq) throw createError.notFound('Market RFQ not found');
    return sortRfqVersions(rfq);
  }

  private async requireQuote(rfqId: string, quoteId: string): Promise<MarketRFQQuote> {
    const quote = await this.quoteRepo.findOne({
      where: { id: quoteId, rfqId },
      relations: ['seller', 'versions'],
      order: { versions: { version: 'ASC' } },
    });
    if (!quote) throw createError.notFound('Market RFQ quote not found');
    return sortQuoteVersions(quote);
  }

  private async findSellerQuote(
    rfqId: string,
    sellerId: string,
  ): Promise<MarketRFQQuote | null> {
    const quote = await this.quoteRepo.findOne({
      where: { rfqId, sellerId },
      relations: ['seller', 'versions'],
      order: { versions: { version: 'ASC' } },
    });
    return quote ? sortQuoteVersions(quote) : null;
  }

  private baseRfqQuery(): SelectQueryBuilder<MarketRFQ> {
    return this.rfqRepo
      .createQueryBuilder('rfq')
      .distinct(true)
      .leftJoinAndSelect('rfq.buyer', 'buyer')
      .leftJoinAndSelect('rfq.product', 'product')
      .leftJoinAndSelect('rfq.variant', 'variant')
      .leftJoinAndSelect('rfq.awardedSeller', 'awardedSeller')
      .leftJoinAndSelect('rfq.quotes', 'quotes')
      .leftJoinAndSelect('quotes.seller', 'quoteSeller')
      .leftJoinAndSelect('quotes.versions', 'quoteVersions');
  }

  private applyRfqFilters(
    qb: SelectQueryBuilder<MarketRFQ>,
    query: MarketRFQQueryDto,
  ): void {
    if (query.status) qb.andWhere('rfq.status = :status', { status: query.status });
    if (query.dateFrom) qb.andWhere('rfq.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('rfq.createdAt <= :dateTo', { dateTo: query.dateTo });
    if (query.search) {
      qb.andWhere(
        new Brackets((searchQb) => {
          searchQb
            .where('rfq.rfqReference LIKE :search', { search: `%${query.search}%` })
            .orWhere('CAST(rfq.requirementTitle AS CHAR) LIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('CAST(rfq.description AS CHAR) LIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('CAST(rfq.buyerNotes AS CHAR) LIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }
  }

  private applyAvailableFilters(
    qb: SelectQueryBuilder<MarketRFQ>,
    query: MarketRFQAvailableQueryDto,
  ): void {
    if (query.categoryId) {
      qb.andWhere('JSON_CONTAINS(rfq.categoryIds, :categoryIdJson)', {
        categoryIdJson: JSON.stringify(query.categoryId),
      });
    }
    if (query.deliveryCountry) {
      qb.andWhere(
        "LOWER(JSON_UNQUOTE(JSON_EXTRACT(rfq.deliveryAddressSnapshot, '$.country'))) = :deliveryCountry",
        { deliveryCountry: query.deliveryCountry.toLowerCase() },
      );
    }
    if (query.deliveryType) {
      qb.andWhere('rfq.deliveryType = :deliveryType', { deliveryType: query.deliveryType });
    }
    if (query.dateFrom) qb.andWhere('rfq.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('rfq.createdAt <= :dateTo', { dateTo: query.dateTo });
    if (query.search) {
      qb.andWhere(
        new Brackets((searchQb) => {
          searchQb
            .where('rfq.rfqReference LIKE :search', { search: `%${query.search}%` })
            .orWhere('CAST(rfq.requirementTitle AS CHAR) LIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('CAST(rfq.description AS CHAR) LIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }
  }

  private applyAdminFilters(
    qb: SelectQueryBuilder<MarketRFQ>,
    query: AdminMarketRFQQueryDto,
  ): void {
    this.applyRfqFilters(qb, query);
    if (query.buyerId) qb.andWhere('rfq.buyerId = :buyerId', { buyerId: query.buyerId });
    if (query.categoryId) {
      qb.andWhere('JSON_CONTAINS(rfq.categoryIds, :categoryIdJson)', {
        categoryIdJson: JSON.stringify(query.categoryId),
      });
    }
    if (query.deliveryType) {
      qb.andWhere('rfq.deliveryType = :deliveryType', { deliveryType: query.deliveryType });
    }
    if (query.awardedSellerId) {
      qb.andWhere('rfq.awardedSellerId = :awardedSellerId', {
        awardedSellerId: query.awardedSellerId,
      });
    }
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');
    return user;
  }

  private async requireVerifiedSeller(sellerId: string): Promise<User> {
    const seller = await this.userRepo.findOne({ where: { id: sellerId } });
    if (!seller) throw createError.notFound('Seller not found');
    if (seller.userType !== UserType.SELLER) {
      throw createError.forbidden('Only sellers can access this Market RFQ resource');
    }
    if (seller.status !== UserStatus.ACTIVE) {
      throw createError.forbidden('Seller account cannot perform this action');
    }
    if (!seller.isCompanyVerified) {
      throw createError.forbidden('Only verified sellers can access Market RFQs');
    }
    return seller;
  }

  private async requireOwnedAddress(userId: string, addressId: string): Promise<UserAddress> {
    const address = await this.addressRepo.findOne({ where: { id: addressId, userId } });
    if (!address) throw createError.notFound('Delivery address not found');
    return address;
  }

  private async validateActiveCategories(categoryIds: string[]): Promise<Category[]> {
    const uniqueIds = Array.from(new Set(categoryIds));
    const categories = await this.categoryRepo.find({
      where: { id: In(uniqueIds), status: CategoryStatus.ACTIVE },
    });
    if (categories.length !== uniqueIds.length) {
      throw createError.badRequest('One or more categories are invalid or inactive');
    }
    const byId = new Map(categories.map((category) => [category.id, category]));
    return uniqueIds.map((id) => byId.get(id)!);
  }

  private async resolveProductContext(
    productId: string | null,
    variantId: string | null,
  ): Promise<{ product: Product | null; variant: ProductVariant | null }> {
    if (!productId) {
      if (variantId) throw createError.badRequest('variantId requires a productId');
      return { product: null, variant: null };
    }

    const product = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['seller', 'images', 'variants'],
      order: { images: { sortOrder: 'ASC' } },
    });
    if (!product || product.status !== ProductStatus.ACTIVE || product.deletedAt) {
      throw createError.badRequest('Product context is not eligible for Market RFQ');
    }
    if (
      product.seller.status !== UserStatus.ACTIVE ||
      !product.seller.isCompanyVerified
    ) {
      throw createError.badRequest('Product seller is not currently eligible');
    }
    if (product.inventoryStatus !== InventoryStatus.IN_STOCK) {
      throw createError.badRequest('Product context is currently out of stock');
    }

    if (product.productType === ProductType.SIMPLE) {
      if (variantId) throw createError.badRequest('Simple products cannot use a variant');
      return { product, variant: null };
    }

    if (!variantId) return { product, variant: null };
    const variant =
      product.variants.find((item) => item.id === variantId) ||
      (await this.variantRepo.findOne({ where: { id: variantId, productId: product.id } }));
    if (!variant) throw createError.badRequest('Variant does not belong to product');
    return { product, variant };
  }

  private async findEligibleSellers(
    categoryIds: string[],
    buyerId: string,
  ): Promise<EligibleSeller[]> {
    const matches = await this.productCategoryRepo.find({
      where: { categoryId: In(categoryIds) },
      relations: ['product', 'product.seller'],
    });
    const sellers = new Map<string, EligibleSeller>();

    for (const match of matches) {
      const product = match.product;
      const seller = product?.seller;
      if (!product || !seller) continue;
      if (seller.id === buyerId) continue;
      if (seller.userType !== UserType.SELLER) continue;
      if (seller.status !== UserStatus.ACTIVE || !seller.isCompanyVerified) continue;
      if (product.status !== ProductStatus.ACTIVE || product.deletedAt) continue;

      const existing = sellers.get(seller.id);
      if (existing) {
        if (!existing.matchedCategoryIds.includes(match.categoryId)) {
          existing.matchedCategoryIds.push(match.categoryId);
        }
      } else {
        sellers.set(seller.id, {
          seller,
          matchedCategoryIds: [match.categoryId],
        });
      }
    }

    return Array.from(sellers.values());
  }

  private async ensureSellerEligibleForRfq(
    rfq: MarketRFQ,
    seller: User,
  ): Promise<void> {
    const existing = await this.visibilityRepo.findOne({
      where: { rfqId: rfq.id, sellerId: seller.id },
    });
    if (existing) return;

    const sellerMatches = await this.sellerMatchesCategories(seller.id, rfq.categoryIds);
    if (!sellerMatches) {
      throw createError.forbidden('Seller is not eligible to quote this Market RFQ');
    }

    await this.visibilityRepo.save(
      this.visibilityRepo.create({
        rfqId: rfq.id,
        sellerId: seller.id,
        matchedCategoryIds: rfq.categoryIds,
        eligibilityReason: 'category_match',
        notifiedAt: null,
      }),
    );
  }

  private async sellerMatchesCategories(
    sellerId: string,
    categoryIds: string[],
  ): Promise<boolean> {
    const matches = await this.productCategoryRepo.find({
      where: { categoryId: In(categoryIds) },
      relations: ['product'],
    });
    return matches.some((match) => {
      const product = match.product;
      return (
        product?.sellerId === sellerId &&
        product.status === ProductStatus.ACTIVE &&
        !product.deletedAt
      );
    });
  }

  private async isSellerVisible(rfqId: string, sellerId: string): Promise<boolean> {
    const existing = await this.visibilityRepo.findOne({
      where: { rfqId, sellerId },
      select: ['id'],
    });
    return Boolean(existing);
  }

  private async recordSellerView(rfq: MarketRFQ, sellerId: string): Promise<void> {
    const now = new Date();
    const existing = await this.sellerViewRepo.findOne({
      where: { rfqId: rfq.id, sellerId },
    });
    if (existing) {
      await this.sellerViewRepo.update(existing.id, { lastViewedAt: now });
    } else {
      await AppDataSource.transaction(async (manager) => {
        await manager.save(
          MarketRFQSellerView,
          manager.create(MarketRFQSellerView, {
            rfqId: rfq.id,
            sellerId,
            firstViewedAt: now,
            lastViewedAt: now,
          }),
        );
        await this.recordAudit(
          manager,
          rfq.id,
          'SELLER_VIEWED',
          MarketRFQActorType.SELLER,
          sellerId,
          null,
        );
      });
      this.emit('MARKET_RFQ_SELLER_VIEWED', rfq);
    }
  }

  private async findTransactionRefs(rfqId: string): Promise<Record<string, unknown>> {
    const checkouts = await this.checkoutRepo.find({
      where: { sourceType: CheckoutSourceType.MARKET_RFQ, sourceId: rfqId },
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
      where: { sourceType: OrderSourceType.MARKET_RFQ, sourceId: rfqId },
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
        sellerId: order.sellerId,
        createdAt: order.createdAt,
      })),
    };
  }

  private async generateRfqReference(): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      const rfqReference = `TOFA-MRFQ-${datePart}-${suffix}`;
      const existing = await this.rfqRepo.findOne({
        where: { rfqReference },
        select: ['id'],
      });
      if (!existing) return rfqReference;
    }
    throw createError.conflict('Unable to generate a unique Market RFQ reference');
  }

  private async recordAudit(
    manager: EntityManager,
    rfqId: string,
    eventType: string,
    actorType: MarketRFQActorType,
    actorId: string | null,
    metadata: Record<string, unknown> | null,
  ): Promise<void> {
    await manager.save(
      MarketRFQAuditEvent,
      manager.create(MarketRFQAuditEvent, {
        rfqId,
        eventType,
        actorType,
        actorId,
        metadata,
      }),
    );
  }

  private emit(
    eventName: Parameters<typeof emitMarketRFQEvent>[0],
    rfq: MarketRFQ,
    version?: MarketRFQQuoteVersion | null,
  ): void {
    emitMarketRFQEvent(eventName, rfq, version);
    this.fastify?.log.info(
      { event: eventName, rfqId: rfq.id, rfqReference: rfq.rfqReference },
      `[MarketRFQService] ${eventName}`,
    );
  }

  private async sendMarketRfqCreatedEmails(
    rfq: MarketRFQ,
    eligibleSellers: EligibleSeller[],
  ): Promise<void> {
    const limit = Math.max(0, config.marketRfq.sellerNotificationLimit);
    const recipients = eligibleSellers.slice(0, limit);
    await Promise.all(
      recipients.map((eligible) =>
        sendMarketRFQCreatedEmail(
          eligible.seller.email,
          eligible.seller.firstName,
          emailDetails(rfq, null, eligible.seller),
        ),
      ),
    );
  }

  private async sendQuoteReceivedEmail(
    rfq: MarketRFQ,
    quote: MarketRFQQuote,
    version: MarketRFQQuoteVersion,
  ): Promise<void> {
    await sendMarketRFQQuoteReceivedEmail(
      rfq.buyer.email,
      rfq.buyer.firstName,
      emailDetails(rfq, version, quote.seller),
    );
  }

  private async sendCounterOfferEmail(
    rfq: MarketRFQ,
    quote: MarketRFQQuote,
    version: MarketRFQQuoteVersion,
    actorType: MarketRFQActorType,
  ): Promise<void> {
    const recipient = actorType === MarketRFQActorType.BUYER ? quote.seller : rfq.buyer;
    await sendMarketRFQCounterOfferEmail(
      recipient.email,
      recipient.firstName,
      emailDetails(rfq, version, quote.seller),
    );
  }

  private async sendQuoteAcceptedEmail(
    rfq: MarketRFQ,
    quote: MarketRFQQuote,
    version: MarketRFQQuoteVersion,
  ): Promise<void> {
    await sendMarketRFQQuoteAcceptedEmail(
      quote.seller.email,
      quote.seller.firstName,
      emailDetails(rfq, version, quote.seller),
    );
  }

  private async sendQuoteRejectedEmail(
    rfq: MarketRFQ,
    quote: MarketRFQQuote,
    reason: string,
  ): Promise<void> {
    await sendMarketRFQQuoteRejectedEmail(
      quote.seller.email,
      quote.seller.firstName,
      emailDetails(rfq, currentVersionForQuote(quote), quote.seller, reason),
    );
  }

  private async sendClosedQuoteEmails(
    rfq: MarketRFQ,
    closedQuotes: MarketRFQQuote[],
  ): Promise<void> {
    await Promise.all(
      closedQuotes
        .filter((quote) => quote.seller)
        .map((quote) =>
          sendMarketRFQQuoteClosedEmail(
            quote.seller.email,
            quote.seller.firstName,
            emailDetails(rfq, currentVersionForQuote(quote), quote.seller),
          ),
        ),
    );
  }

  private async sendCancelledEmails(
    rfq: MarketRFQ,
    closedQuotes: MarketRFQQuote[],
    reason: string,
  ): Promise<void> {
    await Promise.all(
      closedQuotes
        .filter((quote) => quote.seller)
        .map((quote) =>
          sendMarketRFQCancelledEmail(
            quote.seller.email,
            quote.seller.firstName,
            emailDetails(rfq, currentVersionForQuote(quote), quote.seller, reason),
          ),
        ),
    );
  }
}

function sortRfqVersions(rfq: MarketRFQ): MarketRFQ {
  rfq.quotes = (rfq.quotes ?? []).map(sortQuoteVersions);
  return rfq;
}

function sortQuoteVersions(quote: MarketRFQQuote): MarketRFQQuote {
  quote.versions = (quote.versions ?? []).sort((a, b) => a.version - b.version);
  return quote;
}

function currentVersionForQuote(quote: MarketRFQQuote): MarketRFQQuoteVersion | null {
  return (
    (quote.versions ?? []).find((version) => version.id === quote.currentVersionId) ||
    (quote.versions ?? [])[quote.versions.length - 1] ||
    null
  );
}

function sortQuotesForComparison(
  quotes: MarketRFQQuote[],
  sortBy: MarketRFQQuoteQueryDto['sortBy'],
): MarketRFQQuote[] {
  const sortable = [...quotes];
  if (sortBy === 'lowest_total') {
    return sortable.sort((a, b) => {
      const aTotal = Number(currentVersionForQuote(a)?.quoteTotal ?? Number.MAX_SAFE_INTEGER);
      const bTotal = Number(currentVersionForQuote(b)?.quoteTotal ?? Number.MAX_SAFE_INTEGER);
      return aTotal - bTotal;
    });
  }
  if (sortBy === 'highest_rating') {
    return sortable.sort(
      (a, b) =>
        Number(b.seller?.totalAverageReviews ?? 0) -
        Number(a.seller?.totalAverageReviews ?? 0),
    );
  }
  if (sortBy === 'earliest_delivery') {
    return sortable.sort((a, b) => {
      const aDate = currentVersionForQuote(a)?.estimatedDeliveryDate ?? '9999-12-31';
      const bDate = currentVersionForQuote(b)?.estimatedDeliveryDate ?? '9999-12-31';
      return aDate.localeCompare(bDate);
    });
  }
  return sortable.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function serializeRfqListItem(
  rfq: MarketRFQ,
  language: string,
): Record<string, unknown> {
  return {
    rfqId: rfq.id,
    rfqReference: rfq.rfqReference,
    requirementTitle: resolveTranslation(rfq.requirementTitle, language, rfq.sourceLanguage),
    sourceLanguage: rfq.sourceLanguage,
    quantity: Number(rfq.quantity),
    unit: rfq.unit,
    deliveryType: rfq.deliveryType,
    status: rfq.status,
    quotesCount: rfq.quotesCount,
    awardedSeller: serializeSeller(rfq.awardedSeller),
    submissionDeadline: rfq.submissionDeadline,
    createdAt: rfq.createdAt,
  };
}

function serializeAvailableRfqListItem(
  rfq: MarketRFQ,
  language: string,
): Record<string, unknown> {
  return {
    rfqId: rfq.id,
    rfqReference: rfq.rfqReference,
    requirementTitle: resolveTranslation(rfq.requirementTitle, language, rfq.sourceLanguage),
    categories: rfq.categorySnapshots,
    quantity: Number(rfq.quantity),
    unit: rfq.unit,
    delivery: {
      city: rfq.deliveryAddressSnapshot.city,
      country: rfq.deliveryAddressSnapshot.country,
      type: rfq.deliveryType,
    },
    buyer: serializeBuyerPublic(rfq.buyer),
    currencyPreference: rfq.currencyPreference,
    quotesCount: rfq.quotesCount,
    submissionDeadline: rfq.submissionDeadline,
    createdAt: rfq.createdAt,
  };
}

function serializeSellerResponseListItem(
  quote: MarketRFQQuote,
  language: string,
): Record<string, unknown> {
  const currentVersion = currentVersionForQuote(sortQuoteVersions(quote));
  return {
    rfqId: quote.rfq.id,
    rfqReference: quote.rfq.rfqReference,
    requirementTitle: resolveTranslation(
      quote.rfq.requirementTitle,
      language,
      quote.rfq.sourceLanguage,
    ),
    rfqStatus: quote.rfq.status,
    quote: currentVersion
      ? {
          quoteId: quote.id,
          status: quote.status,
          version: currentVersion.version,
          currency: currentVersion.currency,
          quoteTotal: Number(currentVersion.quoteTotal),
          validUntil: currentVersion.validUntil,
        }
      : null,
  };
}

function serializeBuyerRfqDetail(
  rfq: MarketRFQ,
  language: string,
): Record<string, unknown> {
  return {
    ...serializeRfqBaseDetail(rfq, language),
    buyer: serializeUser(rfq.buyer),
    quotes: (rfq.quotes ?? []).map((quote) => serializeQuoteComparison(quote, language)),
  };
}

function serializeSellerRfqDetail(
  rfq: MarketRFQ,
  sellerId: string,
  language: string,
): Record<string, unknown> {
  const ownQuote = (rfq.quotes ?? []).find((quote) => quote.sellerId === sellerId) ?? null;
  return {
    ...serializeRfqBaseDetail(rfq, language),
    buyer: serializeBuyerPublic(rfq.buyer),
    ownQuote: ownQuote ? serializeQuoteDetail(rfq, ownQuote, language) : null,
  };
}

function serializeAdminRfqListItem(
  rfq: MarketRFQ,
  language: string,
): Record<string, unknown> {
  return {
    ...serializeRfqListItem(rfq, language),
    buyer: serializeUser(rfq.buyer),
    awardedSeller: serializeSeller(rfq.awardedSeller),
  };
}

function serializeAdminRfqDetail(
  rfq: MarketRFQ,
  language: string,
): Record<string, unknown> {
  const sellerViews = rfq.sellerViews ?? [];
  const sellerVisibilities = rfq.sellerVisibilities ?? [];
  return {
    ...serializeBuyerRfqDetail(rfq, language),
    sellerEligibility: sellerVisibilities.map((visibility) => ({
      id: visibility.id,
      seller: serializeSeller(visibility.seller),
      matchedCategoryIds: visibility.matchedCategoryIds,
      eligibilityReason: visibility.eligibilityReason,
      notifiedAt: visibility.notifiedAt,
      createdAt: visibility.createdAt,
    })),
    sellerViews: sellerViews.map((view) => ({
      id: view.id,
      seller: serializeSeller(view.seller),
      firstViewedAt: view.firstViewedAt,
      lastViewedAt: view.lastViewedAt,
    })),
  };
}

function serializeRfqBaseDetail(
  rfq: MarketRFQ,
  language: string,
): Record<string, unknown> {
  return {
    rfqId: rfq.id,
    rfqReference: rfq.rfqReference,
    status: rfq.status,
    requirement: {
      title: resolveTranslation(rfq.requirementTitle, language, rfq.sourceLanguage),
      titleTranslations: rfq.requirementTitle,
      description: resolveTranslation(rfq.description, language, rfq.sourceLanguage),
      descriptionTranslations: rfq.description,
      sourceLanguage: rfq.sourceLanguage,
      quantity: Number(rfq.quantity),
      unit: rfq.unit,
      expectedDeliveryDate: rfq.expectedDeliveryDate,
    },
    categories: rfq.categorySnapshots,
    product: rfq.productSnapshot ? serializeProductSnapshot(rfq.productSnapshot) : null,
    delivery: {
      type: rfq.deliveryType,
      address: rfq.deliveryAddressSnapshot,
    },
    currencyPreference: rfq.currencyPreference,
    buyerNotes: resolveTranslation(rfq.buyerNotes, language, rfq.sourceLanguage),
    buyerNotesTranslations: rfq.buyerNotes,
    quotesCount: rfq.quotesCount,
    awardedSeller: serializeSeller(rfq.awardedSeller),
    acceptedQuoteId: rfq.acceptedQuoteId,
    acceptedQuoteVersionId: rfq.acceptedQuoteVersionId,
    submissionDeadline: rfq.submissionDeadline,
    awardedAt: rfq.awardedAt,
    cancelledAt: rfq.cancelledAt,
    cancellationReason: rfq.cancellationReason,
    createdAt: rfq.createdAt,
    updatedAt: rfq.updatedAt,
  };
}

function serializeQuoteComparison(
  quote: MarketRFQQuote,
  language: string,
): Record<string, unknown> {
  const currentVersion = currentVersionForQuote(sortQuoteVersions(quote));
  return {
    quoteId: quote.id,
    status: quote.status,
    seller: serializeSeller(quote.seller),
    currentVersion: currentVersion ? serializeVersion(currentVersion, quote.id) : null,
    comparison: currentVersion
      ? {
          sellerId: quote.sellerId,
          sellerName: displayUserName(quote.seller),
          rating: Number(quote.seller?.totalAverageReviews ?? 0),
          totalReviews: quote.seller?.totalReviewCount ?? 0,
          isVerified: quote.seller?.isCompanyVerified ?? false,
          sellerCountry: quote.seller?.country ?? null,
          pricePerUnit: Number(currentVersion.pricePerUnit),
          productsTotal: Number(currentVersion.productsTotal),
          logisticsAmount:
            currentVersion.logisticsAmount === null
              ? null
              : Number(currentVersion.logisticsAmount),
          quoteTotal: Number(currentVersion.quoteTotal),
          currency: currentVersion.currency,
          estimatedDeliveryDate: currentVersion.estimatedDeliveryDate,
          validUntil: currentVersion.validUntil,
          comparisonFx: null,
        }
      : null,
    requirementTitle: resolveTranslation(
      quote.rfq?.requirementTitle,
      language,
      quote.rfq?.sourceLanguage,
    ),
  };
}

function serializeQuoteDetail(
  rfq: MarketRFQ,
  quote: MarketRFQQuote,
  language: string,
): Record<string, unknown> {
  const currentVersion = currentVersionForQuote(quote);
  return {
    rfqId: rfq.id,
    rfqReference: rfq.rfqReference,
    requirementTitle: resolveTranslation(rfq.requirementTitle, language, rfq.sourceLanguage),
    quoteId: quote.id,
    status: quote.status,
    seller: serializeSeller(quote.seller),
    rejectionReason: quote.rejectionReason,
    closedReason: quote.closedReason,
    currentVersion: currentVersion ? serializeVersion(currentVersion, quote.id) : null,
    history: quote.versions.map((version) => serializeVersion(version, quote.id)),
  };
}

function serializeQuoteSummary(
  quote: MarketRFQQuote,
  version: MarketRFQQuoteVersion,
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
  version: MarketRFQQuoteVersion,
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

function serializeProductSnapshot(snapshot: NonNullable<MarketRFQProductSnapshot>): Record<string, unknown> {
  return {
    id: snapshot.productId,
    name: snapshot.productName,
    image: snapshot.productImage,
    sellerId: snapshot.sellerId,
    sellerStoreName: snapshot.sellerStoreName,
    variant: snapshot.variant,
  };
}

function serializeUser(user: User | undefined | null): Record<string, unknown> | null {
  if (!user) return null;
  return {
    id: user.id,
    name: displayUserName(user),
  };
}

function serializeBuyerPublic(user: User | undefined | null): Record<string, unknown> | null {
  if (!user) return null;
  return {
    companyName: user.companyName || user.storeName || displayUserName(user),
    country: user.country,
  };
}

function serializeSeller(user: User | undefined | null): Record<string, unknown> | null {
  if (!user) return null;
  return {
    id: user.id,
    name: displayUserName(user),
    storeName: user.storeName ?? user.companyName,
    isVerified: user.isCompanyVerified,
    rating: Number(user.totalAverageReviews ?? 0),
    totalReviews: user.totalReviewCount,
    country: user.country,
  };
}

function createProductSnapshot(
  product: Product,
  variant: ProductVariant | null,
  language: string,
): NonNullable<MarketRFQProductSnapshot> {
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

function checkoutProductSnapshot(
  rfq: MarketRFQ,
  version: MarketRFQQuoteVersion,
): {
  productId: string;
  variantId: string | null;
  productName: string | null;
  productImage: string | null;
  sku: string | null;
  attributes: Record<string, unknown> | null;
} {
  if (rfq.productSnapshot) {
    return {
      productId: rfq.productSnapshot.productId,
      variantId: rfq.productSnapshot.variant?.variantId ?? null,
      productName: rfq.productSnapshot.productName,
      productImage: rfq.productSnapshot.productImage,
      sku: rfq.productSnapshot.variant?.sku ?? null,
      attributes: rfq.productSnapshot.variant?.attributes ?? null,
    };
  }

  return {
    productId: rfq.id,
    variantId: null,
    productName: resolveTranslation(rfq.requirementTitle, 'en', rfq.sourceLanguage),
    productImage: null,
    sku: `MRFQ-${rfq.rfqReference}`,
    attributes: {
      sourceType: 'market_rfq',
      requirementTitle: rfq.requirementTitle,
      quoteVersion: version.version,
    },
  };
}

function toCategorySnapshot(
  category: Category,
  language: string,
): MarketRFQCategorySnapshot {
  return {
    id: category.id,
    name: resolveTranslation(category.name, language, category.sourceLanguage),
    slug: category.slug,
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

function applyAvailableRfqSort(
  qb: SelectQueryBuilder<MarketRFQ>,
  query: MarketRFQAvailableQueryDto,
): void {
  if (query.sortBy === 'newest') {
    qb.orderBy('rfq.createdAt', 'DESC');
    return;
  }
  if (query.sortBy === 'deadline_soonest') {
    qb.orderBy('rfq.submissionDeadline', 'ASC').addOrderBy('rfq.createdAt', 'DESC');
    return;
  }
  if (query.search) {
    const search = query.search.toLowerCase().replace(/'/g, "''");
    qb.orderBy(
      `CASE
        WHEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(rfq.requirementTitle, '$.en'))) = '${search}' THEN 100
        WHEN LOWER(CAST(rfq.requirementTitle AS CHAR)) LIKE '%${search}%' THEN 80
        WHEN LOWER(CAST(rfq.description AS CHAR)) LIKE '%${search}%' THEN 45
        WHEN LOWER(rfq.rfqReference) LIKE '%${search}%' THEN 30
        ELSE 0
      END`,
      'DESC',
    )
      .addOrderBy('rfq.submissionDeadline', 'ASC')
      .addOrderBy('rfq.createdAt', 'DESC');
    return;
  }

  qb.orderBy('rfq.submissionDeadline', 'ASC').addOrderBy('rfq.createdAt', 'DESC');
}

function emailDetails(
  rfq: MarketRFQ,
  version?: MarketRFQQuoteVersion | null,
  seller?: User | null,
  reason?: string,
): Parameters<typeof sendMarketRFQCreatedEmail>[2] {
  return {
    rfqReference: rfq.rfqReference,
    buyerName: displayUserName(rfq.buyer),
    sellerName: seller ? displayUserName(seller) : null,
    requirementTitle: resolveTranslation(rfq.requirementTitle, 'en', rfq.sourceLanguage),
    quantity: version ? Number(version.quantity) : Number(rfq.quantity),
    unit: version ? version.unit : rfq.unit,
    deliveryMethod: deliveryLabel(version?.deliveryType ?? rfq.deliveryType),
    deliveryAddress: formatAddress(rfq.deliveryAddressSnapshot),
    submissionDeadline: rfq.submissionDeadline,
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

function logisticsDisplay(version: MarketRFQQuoteVersion): string {
  if (version.deliveryType === DeliveryType.SELLER_ARRANGED) {
    return `${version.currency} ${Number(version.logisticsAmount ?? 0)}`;
  }
  if (version.deliveryType === DeliveryType.BUYER_ARRANGED) return 'Buyer arranged separately';
  if (version.deliveryType === DeliveryType.INTEGRATED_LOGISTICS) return 'Calculated through Logistics';
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

function displayUserName(user: User | undefined | null): string {
  if (!user) return 'there';
  return (
    user.storeName ||
    user.companyName ||
    `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
    user.email
  );
}

function pagination(page: number, limit: number, total: number): Record<string, number> {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
