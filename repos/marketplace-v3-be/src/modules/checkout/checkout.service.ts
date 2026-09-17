import { PaymentService } from '../payment/payment.service';
import { requireDeliveryType, requireActiveCurrency, requireActiveCountry } from '../system-settings/settings.reader';
import { writeAudit } from '../audit-log/audit-log.writer';
import { AppDataSource } from '../../database/data-source';
import {
  CheckoutDraft,
  DeliveryDraftQuote,
  DeliveryDraftSelection,
} from '../../database/entities/checkout-draft.entity';
import {
  AddressSnapshot,
  CheckoutSession,
  CheckoutSourceType,
  CheckoutStatus,
  DeliveryType,
} from '../../database/entities/checkout-session.entity';
import {
  CheckoutDeliverySnapshot,
  CheckoutItemSnapshot,
  CheckoutSellerGroup,
} from '../../database/entities/checkout-seller-group.entity';
import { UserAddress } from '../../database/entities/user-address.entity';
import { createError } from '../../common/utils/http-error.util';
import { addHours } from '../../common/utils/token.util';
import { roundMoney } from '../../common/utils/pricing.util';
import { CartSellerGroup, CartService, CartSummary } from '../cart/cart.service';
import { LogisticsService } from '../logistics/logistics.service';

type PaymentMethod = {
  code: string;
  name: string;
  requiresProof: boolean;
};

export type DirectRfqCheckoutInput = {
  buyerId: string;
  sellerId: string;
  rfqId: string;
  quoteId: string;
  quoteVersionId: string;
  deliveryAddressId: string;
  deliveryAddressSnapshot: AddressSnapshot;
  product: {
    productId: string;
    variantId: string | null;
    productName: string | null;
    productImage: string | null;
    sku: string | null;
    attributes: Record<string, unknown> | null;
  };
  quantity: number;
  unit: string;
  pricePerUnit: number;
  productsTotal: number;
  delivery: {
    type: DeliveryType;
    logisticsAmount: number | null;
    logisticsCurrency: string | null;
    logisticsQuoteId?: string | null;
    providerId?: string | null;
    providerName?: string | null;
    serviceName?: string | null;
    estimatedDelivery?: Record<string, unknown> | null;
  };
  quoteTotal: number;
  currency: string;
  notes?: string | null;
  expiresAt: Date;
};

export type MarketRfqCheckoutInput = DirectRfqCheckoutInput;

export class CheckoutService {
  private draftRepo = AppDataSource.getRepository(CheckoutDraft);
  private addressRepo = AppDataSource.getRepository(UserAddress);
  private checkoutRepo = AppDataSource.getRepository(CheckoutSession);
  private cartService = new CartService();
  private logisticsService = new LogisticsService();

  async selectAddress(
    userId: string,
    deliveryAddressId: string,
  ): Promise<{
    success: true;
    message: string;
    data: { deliveryAddressId: string; requiresLogisticsRefresh: boolean };
  }> {
    await this.getOwnedAddress(userId, deliveryAddressId);
    const draft = await this.getOrCreateDraft(userId);
    await this.draftRepo.update(draft.id, {
      deliveryAddressId,
      deliveryQuotes: null,
      deliverySelections: null,
    });

    return {
      success: true,
      message: 'Delivery address updated successfully.',
      data: { deliveryAddressId, requiresLogisticsRefresh: true },
    };
  }

  async getDeliveryOptions(
    userId: string,
    deliveryAddressId: string,
    language: string,
  ): Promise<{ success: true; data: unknown }> {
    const address = await this.getOwnedAddress(userId, deliveryAddressId);
    const cart = await this.requireCart(userId, language);
    if(cart.currency)await requireActiveCurrency(cart.currency);
    const quotes = await this.logisticsService.getCheckoutQuotes(userId, address, cart);

    const draft = await this.getOrCreateDraft(userId);
    await this.draftRepo.update(draft.id, {
      deliveryAddressId,
      deliveryQuotes: quotes,
      deliverySelections: null,
    });

    return {
      success: true,
      data: {
        deliveryAddress: {
          id: address.id,
          city: address.city,
          state: address.state,
          country: address.country,
        },
        sellerGroups: cart.sellerGroups.map((group) => ({
          sellerId: group.sellerId,
          storeName: group.storeName,
          integratedOptions: quotes.filter((quote) => quote.sellerId === group.sellerId),
          sellerArrangedOption: {
            available: true,
            type: DeliveryType.SELLER_ARRANGED,
            amount: null,
            description:
              'The seller will arrange delivery after the order is placed. Delivery charges will be handled separately outside TOFA.',
          },
          buyerArrangedOption: {
            available: true,
            type: DeliveryType.BUYER_ARRANGED,
            amount: null,
            description: 'You will arrange and pay for delivery separately outside TOFA.',
          },
        })),
      },
    };
  }

  async applyProvider(
    userId: string,
    providerId: string,
    language: string,
  ): Promise<{
    success: true;
    message: string;
    data: {
      appliedSellerGroups: string[];
      unavailableSellerGroups: string[];
      logisticsTotal: number;
    };
  }> {
    const draft = await this.requireDraftWithQuotes(userId);
    const cart = await this.requireCart(userId, language);
    if(cart.currency)await requireActiveCurrency(cart.currency);
    const quotes = this.requireFreshQuotes(draft.deliveryQuotes || []);

    const appliedSellerGroups: string[] = [];
    const unavailableSellerGroups: string[] = [];
    const selections: DeliveryDraftSelection[] = [];

    for (const group of cart.sellerGroups) {
      const quote = quotes.find(
        (item) => item.sellerId === group.sellerId && item.providerId === providerId,
      );
      if (quote) {
        appliedSellerGroups.push(group.sellerId);
        selections.push({
          sellerId: group.sellerId,
          type: DeliveryType.INTEGRATED_LOGISTICS,
          quoteId: quote.quoteId,
        });
      } else {
        unavailableSellerGroups.push(group.sellerId);
      }
    }

    for(const selection of selections)await requireDeliveryType(selection.type);
    await AppDataSource.transaction(async manager=>{
      await manager.update(CheckoutDraft,draft.id,{deliverySelections:selections});
      for(const selection of selections) await writeAudit(manager,{eventCode:'DELIVERY_METHOD_SELECTED',module:'logistics',actorType:'user',actorId:userId,entityType:'checkout',entityId:draft.id,metadata:{sellerId:selection.sellerId,deliveryType:selection.type,quoteId:selection.quoteId}});
    });
    await this.logisticsService.markQuotesSelected(
      selections.flatMap((selection) => (selection.quoteId ? [selection.quoteId] : [])),
    );

    const providerName = quotes.find((quote) => quote.providerId === providerId)?.providerName || providerId;
    return {
      success: true,
      message:
        unavailableSellerGroups.length > 0
          ? `${providerName} was applied where available.`
          : `${providerName} applied to all eligible shipments.`,
      data: {
        appliedSellerGroups,
        unavailableSellerGroups,
        logisticsTotal: this.calculateLogisticsTotal(selections, quotes),
      },
    };
  }

  async selectDeliveryOptions(
    userId: string,
    selections: DeliveryDraftSelection[],
    language: string,
  ): Promise<{
    success: true;
    message: string;
    data: { productsTotal: number; logisticsTotal: number; totalAmount: number; currency: string };
  }> {
    const draft = await this.requireDraftWithQuotes(userId);
    const cart = await this.requireCart(userId, language);
    if(cart.currency)await requireActiveCurrency(cart.currency);
    const quotes = this.requireFreshQuotes(draft.deliveryQuotes || []);
    this.validateDeliverySelections(cart, selections, quotes);
    for(const selection of selections)await requireDeliveryType(selection.type);

    for(const selection of selections)await requireDeliveryType(selection.type);
    await AppDataSource.transaction(async manager=>{
      await manager.update(CheckoutDraft,draft.id,{deliverySelections:selections});
      for(const selection of selections) await writeAudit(manager,{eventCode:'DELIVERY_METHOD_SELECTED',module:'logistics',actorType:'user',actorId:userId,entityType:'checkout',entityId:draft.id,metadata:{sellerId:selection.sellerId,deliveryType:selection.type,quoteId:selection.quoteId}});
    });
    await this.logisticsService.markQuotesSelected(
      selections.flatMap((selection) => (selection.quoteId ? [selection.quoteId] : [])),
    );
    const totals = this.calculateTotals(cart, selections, quotes);

    return {
      success: true,
      message: 'Delivery options selected successfully.',
      data: totals,
    };
  }

  async getPaymentMethods(userId:string): Promise<{success:true;data:PaymentMethod[]}> {
    const cart=await this.requireCart(userId,'en');
    const draft=await this.getOrCreateDraft(userId);
    const amount=this.calculateTotals(cart,draft.deliverySelections ?? [],draft.deliveryQuotes ?? []).totalAmount;
    return {success:true,data:await new PaymentService().getCheckoutPaymentMethods(userId,cart.currency!,amount)};
  }

  async selectPaymentMethod(
    userId: string,
    paymentMethod: string,
  ): Promise<{
    success: true;
    message: string;
    data: { paymentMethod: string; requiresProof: boolean };
  }> {
    const method = await this.findPaymentMethod(paymentMethod,userId);
    const draft = await this.getOrCreateDraft(userId);
    await this.draftRepo.update(draft.id, { paymentMethod });

    return {
      success: true,
      message: 'Payment method selected successfully.',
      data: { paymentMethod, requiresProof: method.requiresProof },
    };
  }

  async preview(userId: string, language: string): Promise<{ success: true; data: unknown }> {
    const draft = await this.requireCompleteDraft(userId, language);
    const cart = await this.requireCart(userId, language);
    if(cart.currency)await requireActiveCurrency(cart.currency);
    const address = await this.getOwnedAddress(userId, draft.deliveryAddressId!);
    const quotes = this.requireFreshQuotes(draft.deliveryQuotes || []);
    const selections = draft.deliverySelections || [];
    this.validateDeliverySelections(cart, selections, quotes);
    for(const selection of selections)await requireDeliveryType(selection.type);
    const totals = this.calculateTotals(cart, selections, quotes);
    const method = await this.findPaymentMethod(draft.paymentMethod!,userId);

    return {
      success: true,
      data: {
        sourceType: CheckoutSourceType.CART,
        deliveryAddress: this.toAddressPreview(address),
        sellerGroups: cart.sellerGroups.map((group) => ({
          sellerId: group.sellerId,
          storeName: group.storeName,
          items: group.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.finalUnitPrice,
            subtotal: item.subtotal,
          })),
          productsSubtotal: group.productsSubtotal,
          delivery: this.deliveryDetailForGroup(group, selections, quotes),
          sellerTotal: this.sellerTotal(group, selections, quotes),
        })),
        paymentMethod: method,
        summary: totals,
      },
    };
  }

  async createCheckout(
    userId: string,
    language: string,
    notes?: string,
  ): Promise<{
    success: true;
    message: string;
    data: {
      checkoutId: string;
      sourceType: CheckoutSourceType;
      productsTotal: number;
      logisticsTotal: number;
      totalAmount: number;
      currency: string;
      paymentMethod: string;
      sellerGroupsCount: number;
      status: CheckoutStatus;
      expiresAt: Date;
    };
  }> {
    const draft = await this.requireCompleteDraft(userId, language);
    const cart = await this.requireCart(userId, language);
    if(cart.currency)await requireActiveCurrency(cart.currency);
    const address = await this.getOwnedAddress(userId, draft.deliveryAddressId!);
    const quotes = this.requireFreshQuotes(draft.deliveryQuotes || []);
    const selections = draft.deliverySelections || [];
    this.validateDeliverySelections(cart, selections, quotes);
    for(const selection of selections)await requireDeliveryType(selection.type);
    const totals = this.calculateTotals(cart, selections, quotes);
    await this.findPaymentMethod(draft.paymentMethod!,userId);

    let checkout: CheckoutSession | null = null;

    await AppDataSource.transaction(async (manager) => {
      checkout = await manager.save(
        CheckoutSession,
        manager.create(CheckoutSession, {
          userId,
          sourceType: CheckoutSourceType.CART,
          sourceId: null,
          quoteId: null,
          quoteVersionId: null,
          deliveryAddressId: address.id,
          deliveryAddressSnapshot: this.toAddressSnapshot(address),
          paymentMethod: draft.paymentMethod!,
          productsTotal: totals.productsTotal,
          logisticsTotal: totals.logisticsTotal,
          totalAmount: totals.totalAmount,
          currency: totals.currency,
          status: CheckoutStatus.ACTIVE,
          notes: notes ?? null,
          expiresAt: addHours(24),
        }),
      );

      await manager.save(
        CheckoutSellerGroup,
        cart.sellerGroups.map((group) => {
          const selection = selections.find((item) => item.sellerId === group.sellerId)!;
          const quote = selection.quoteId
            ? quotes.find((item) => item.quoteId === selection.quoteId)
            : null;
          const logisticsAmount = quote ? quote.amount : 0;
          return manager.create(CheckoutSellerGroup, {
            checkoutId: checkout!.id,
            sellerId: group.sellerId,
            productsSubtotal: group.productsSubtotal,
            logisticsAmount,
            sellerTotal: roundMoney(group.productsSubtotal + logisticsAmount),
            deliveryType: selection.type as DeliveryType,
            logisticsQuoteId: selection.quoteId,
            itemsSnapshot: this.toCheckoutItemSnapshots(group),
            deliverySnapshot: this.toCheckoutDeliverySnapshot(selection, quote),
          });
        }),
      );
    });

    return {
      success: true,
      message: 'Checkout created successfully.',
      data: {
        checkoutId: checkout!.id,
        sourceType: CheckoutSourceType.CART,
        productsTotal: totals.productsTotal,
        logisticsTotal: totals.logisticsTotal,
        totalAmount: totals.totalAmount,
        currency: totals.currency,
        paymentMethod: draft.paymentMethod!,
        sellerGroupsCount: cart.sellerGroups.length,
        status: CheckoutStatus.ACTIVE,
        expiresAt: checkout!.expiresAt,
      },
    };
  }

  async prepareDirectRfqCheckout(
    input: DirectRfqCheckoutInput,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const existing = await this.checkoutRepo.findOne({
      where: {
        userId: input.buyerId,
        sourceType: CheckoutSourceType.DIRECT_RFQ,
        sourceId: input.rfqId,
        quoteId: input.quoteId,
        quoteVersionId: input.quoteVersionId,
      },
      relations: ['sellerGroups'],
    });

    if (existing) {
      return {
        success: true,
        message: 'Direct RFQ checkout is already prepared.',
        data: serializeCheckout(existing),
      };
    }

    let checkout: CheckoutSession | null = null;
    await requireActiveCurrency(input.currency);
    await requireDeliveryType(input.delivery.type);
    const logisticsTotal =
      input.delivery.type === DeliveryType.BUYER_ARRANGED
        ? 0
        : roundMoney(input.delivery.logisticsAmount ?? 0);

    await AppDataSource.transaction(async (manager) => {
      checkout = await manager.save(
        CheckoutSession,
        manager.create(CheckoutSession, {
          userId: input.buyerId,
          sourceType: CheckoutSourceType.DIRECT_RFQ,
          sourceId: input.rfqId,
          quoteId: input.quoteId,
          quoteVersionId: input.quoteVersionId,
          deliveryAddressId: input.deliveryAddressId,
          deliveryAddressSnapshot: input.deliveryAddressSnapshot,
          paymentMethod: 'pending_selection',
          productsTotal: input.productsTotal,
          logisticsTotal,
          totalAmount: roundMoney(input.productsTotal + logisticsTotal),
          currency: input.currency,
          status: CheckoutStatus.ACTIVE,
          notes: input.notes ?? null,
          expiresAt: input.expiresAt,
        }),
      );

      await manager.save(
        CheckoutSellerGroup,
        manager.create(CheckoutSellerGroup, {
          checkoutId: checkout.id,
          sellerId: input.sellerId,
          productsSubtotal: input.productsTotal,
          logisticsAmount: logisticsTotal,
          sellerTotal: roundMoney(input.productsTotal + logisticsTotal),
          deliveryType: input.delivery.type,
          logisticsQuoteId: input.delivery.logisticsQuoteId ?? null,
          itemsSnapshot: [
            {
              productId: input.product.productId,
              variantId: input.product.variantId,
              productNameSnapshot: input.product.productName,
              productImageSnapshot: input.product.productImage,
              skuSnapshot: input.product.sku,
              attributesSnapshot: input.product.attributes,
              unitPrice: input.pricePerUnit,
              discount: null,
              finalUnitPrice: input.pricePerUnit,
              quantity: input.quantity,
              unit: input.unit,
              subtotal: input.productsTotal,
              currency: input.currency,
            },
          ],
          deliverySnapshot: {
            type: input.delivery.type,
            providerId: input.delivery.providerId ?? null,
            providerName: input.delivery.providerName ?? null,
            serviceName: input.delivery.serviceName ?? null,
            quoteId: input.delivery.logisticsQuoteId ?? null,
            amount: input.delivery.logisticsAmount,
            currency: input.delivery.logisticsCurrency,
            estimatedDelivery: input.delivery.estimatedDelivery ?? null,
          },
        }),
      );
    });

    return {
      success: true,
      message: 'Direct RFQ checkout prepared successfully.',
      data: serializeCheckout(checkout!),
    };
  }

  async prepareMarketRfqCheckout(
    input: MarketRfqCheckoutInput,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const existing = await this.checkoutRepo.findOne({
      where: {
        userId: input.buyerId,
        sourceType: CheckoutSourceType.MARKET_RFQ,
        sourceId: input.rfqId,
        quoteId: input.quoteId,
        quoteVersionId: input.quoteVersionId,
      },
      relations: ['sellerGroups'],
    });

    if (existing) {
      return {
        success: true,
        message: 'Market RFQ checkout is already prepared.',
        data: serializeCheckout(existing),
      };
    }

    let checkout: CheckoutSession | null = null;
    await requireActiveCurrency(input.currency);
    await requireDeliveryType(input.delivery.type);
    const logisticsTotal =
      input.delivery.type === DeliveryType.BUYER_ARRANGED
        ? 0
        : roundMoney(input.delivery.logisticsAmount ?? 0);

    await AppDataSource.transaction(async (manager) => {
      checkout = await manager.save(
        CheckoutSession,
        manager.create(CheckoutSession, {
          userId: input.buyerId,
          sourceType: CheckoutSourceType.MARKET_RFQ,
          sourceId: input.rfqId,
          quoteId: input.quoteId,
          quoteVersionId: input.quoteVersionId,
          deliveryAddressId: input.deliveryAddressId,
          deliveryAddressSnapshot: input.deliveryAddressSnapshot,
          paymentMethod: 'pending_selection',
          productsTotal: input.productsTotal,
          logisticsTotal,
          totalAmount: roundMoney(input.productsTotal + logisticsTotal),
          currency: input.currency,
          status: CheckoutStatus.ACTIVE,
          notes: input.notes ?? null,
          expiresAt: input.expiresAt,
        }),
      );

      await manager.save(
        CheckoutSellerGroup,
        manager.create(CheckoutSellerGroup, {
          checkoutId: checkout.id,
          sellerId: input.sellerId,
          productsSubtotal: input.productsTotal,
          logisticsAmount: logisticsTotal,
          sellerTotal: roundMoney(input.productsTotal + logisticsTotal),
          deliveryType: input.delivery.type,
          logisticsQuoteId: input.delivery.logisticsQuoteId ?? null,
          itemsSnapshot: [
            {
              productId: input.product.productId,
              variantId: input.product.variantId,
              productNameSnapshot: input.product.productName,
              productImageSnapshot: input.product.productImage,
              skuSnapshot: input.product.sku,
              attributesSnapshot: input.product.attributes,
              unitPrice: input.pricePerUnit,
              discount: null,
              finalUnitPrice: input.pricePerUnit,
              quantity: input.quantity,
              unit: input.unit,
              subtotal: input.productsTotal,
              currency: input.currency,
            },
          ],
          deliverySnapshot: {
            type: input.delivery.type,
            providerId: input.delivery.providerId ?? null,
            providerName: input.delivery.providerName ?? null,
            serviceName: input.delivery.serviceName ?? null,
            quoteId: input.delivery.logisticsQuoteId ?? null,
            amount: input.delivery.logisticsAmount,
            currency: input.delivery.logisticsCurrency,
            estimatedDelivery: input.delivery.estimatedDelivery ?? null,
          },
        }),
      );
    });

    return {
      success: true,
      message: 'Market RFQ checkout prepared successfully.',
      data: serializeCheckout(checkout!),
    };
  }

  private async getOrCreateDraft(userId: string): Promise<CheckoutDraft> {
    const existing = await this.draftRepo.findOne({ where: { userId } });
    if (existing) return existing;

    const defaultAddress = await this.addressRepo.findOne({
      where: { userId, isDefault: true },
    });

    return this.draftRepo.save(
      this.draftRepo.create({
        userId,
        deliveryAddressId: defaultAddress?.id ?? null,
        deliveryQuotes: null,
        deliverySelections: null,
        paymentMethod: null,
      }),
    );
  }

  private async requireDraftWithQuotes(userId: string): Promise<CheckoutDraft> {
    const draft = await this.getOrCreateDraft(userId);
    if (!draft.deliveryQuotes?.length) {
      throw createError.badRequest('Please retrieve delivery options before selecting delivery');
    }
    return draft;
  }

  private async requireCompleteDraft(
    userId: string,
    language: string,
  ): Promise<CheckoutDraft> {
    const draft = await this.getOrCreateDraft(userId);
    if (!draft.deliveryAddressId) {
      throw createError.badRequest('Please select a delivery address');
    }
    if (!draft.deliveryQuotes?.length || !draft.deliverySelections?.length) {
      throw createError.badRequest('Please select delivery options');
    }
    if (!draft.paymentMethod) {
      throw createError.badRequest('Please select a payment method');
    }

    await this.requireCart(userId, language);
    return draft;
  }

  private async requireCart(userId: string, language: string): Promise<CartSummary> {
    const cart = await this.cartService.buildCartSummary(userId, language, true);
    if (!cart.cartId || cart.totalCount === 0) {
      throw createError.badRequest('Cart is empty');
    }
    if (!cart.currency) {
      throw createError.badRequest('Cart currency could not be determined');
    }
    return cart;
  }

  private async getOwnedAddress(userId: string, addressId: string): Promise<UserAddress> {
    const address = await this.addressRepo.findOne({
      where: { id: addressId, userId },
    });
    if (!address) throw createError.notFound('Delivery address not found');
    await requireActiveCountry(address.country);
    return address;
  }

  private validateDeliverySelections(
    cart: CartSummary,
    selections: DeliveryDraftSelection[],
    quotes: DeliveryDraftQuote[],
  ): void {
    const sellerIds = cart.sellerGroups.map((group) => group.sellerId);
    const selectedSellerIds = selections.map((selection) => selection.sellerId);

    if (new Set(selectedSellerIds).size !== selectedSellerIds.length) {
      throw createError.badRequest('Each seller group can only have one delivery selection');
    }

    for (const sellerId of sellerIds) {
      const selection = selections.find((item) => item.sellerId === sellerId);
      if (!selection) {
        throw createError.badRequest('Every seller group requires a delivery option');
      }

      if (selection.type === DeliveryType.INTEGRATED_LOGISTICS) {
        if (!selection.quoteId) {
          throw createError.badRequest('quoteId is required for integrated logistics');
        }
        const quote = quotes.find(
          (item) => item.quoteId === selection.quoteId && item.sellerId === sellerId,
        );
        if (!quote) throw createError.badRequest('Selected logistics quote is invalid');
        continue;
      }

      if (selection.quoteId) {
        throw createError.badRequest('quoteId must be null for non-integrated delivery');
      }
    }

    const unknownSeller = selections.find((selection) => !sellerIds.includes(selection.sellerId));
    if (unknownSeller) throw createError.badRequest('Unknown seller group in delivery selection');
  }

  private requireFreshQuotes(quotes: DeliveryDraftQuote[]): DeliveryDraftQuote[] {
    const expired = quotes.find((quote) => Date.parse(quote.expiresAt) <= Date.now());
    if (expired) {
      throw createError.badRequest(
        'The selected delivery price has expired. Please refresh your delivery options.',
        'LOGISTICS_QUOTE_EXPIRED',
      );
    }
    return quotes;
  }

  private calculateLogisticsTotal(
    selections: DeliveryDraftSelection[],
    quotes: DeliveryDraftQuote[],
  ): number {
    return roundMoney(
      selections.reduce((sum, selection) => {
        if (!selection.quoteId) return sum;
        const quote = quotes.find((item) => item.quoteId === selection.quoteId);
        return sum + (quote?.amount || 0);
      }, 0),
    );
  }

  private calculateTotals(
    cart: CartSummary,
    selections: DeliveryDraftSelection[],
    quotes: DeliveryDraftQuote[],
  ): { productsTotal: number; logisticsTotal: number; totalAmount: number; currency: string } {
    const productsTotal = roundMoney(cart.productsSubtotal);
    const logisticsTotal = this.calculateLogisticsTotal(selections, quotes);
    return {
      productsTotal,
      logisticsTotal,
      totalAmount: roundMoney(productsTotal + logisticsTotal),
      currency: cart.currency!,
    };
  }

  private sellerTotal(
    group: CartSellerGroup,
    selections: DeliveryDraftSelection[],
    quotes: DeliveryDraftQuote[],
  ): number {
    const selection = selections.find((item) => item.sellerId === group.sellerId);
    const quote = selection?.quoteId
      ? quotes.find((item) => item.quoteId === selection.quoteId)
      : null;
    return roundMoney(group.productsSubtotal + (quote?.amount || 0));
  }

  private deliveryDetailForGroup(
    group: CartSellerGroup,
    selections: DeliveryDraftSelection[],
    quotes: DeliveryDraftQuote[],
  ): unknown {
    const selection = selections.find((item) => item.sellerId === group.sellerId);
    if (!selection) return null;

    if (selection.type === DeliveryType.INTEGRATED_LOGISTICS) {
      const quote = quotes.find((item) => item.quoteId === selection.quoteId);
      return quote
        ? {
            type: quote.type,
            providerName: quote.providerName,
            serviceName: quote.serviceName,
            amount: quote.amount,
            estimatedDelivery: `${quote.estimatedDelivery.min}-${quote.estimatedDelivery.max} ${quote.estimatedDelivery.unit}`,
          }
        : null;
    }

    if (selection.type === DeliveryType.SELLER_ARRANGED) {
      return {
        type: DeliveryType.SELLER_ARRANGED,
        amount: null,
        description: 'Delivery charges will be handled separately outside TOFA.',
      };
    }

    return {
      type: DeliveryType.BUYER_ARRANGED,
      amount: null,
      description: 'You will arrange and pay for delivery separately outside TOFA.',
    };
  }

  private toCheckoutItemSnapshots(group: CartSellerGroup): CheckoutItemSnapshot[] {
    return group.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      productNameSnapshot: item.productName,
      productImageSnapshot: item.mainImage,
      skuSnapshot: item.sku,
      attributesSnapshot: item.attributes,
      unitPrice: item.unitPrice,
      discount: item.discount,
      finalUnitPrice: item.finalUnitPrice,
      quantity: item.quantity,
      unit: item.minimumOrder.unit,
      subtotal: item.subtotal,
      currency: item.currency,
    }));
  }

  private toCheckoutDeliverySnapshot(
    selection: DeliveryDraftSelection,
    quote: DeliveryDraftQuote | null | undefined,
  ): CheckoutDeliverySnapshot {
    if (selection.type === DeliveryType.INTEGRATED_LOGISTICS && quote) {
      return {
        type: DeliveryType.INTEGRATED_LOGISTICS,
        providerId: quote.providerId,
        providerName: quote.providerName,
        serviceName: quote.serviceName,
        quoteId: quote.quoteId,
        amount: quote.amount,
        currency: quote.currency,
        estimatedDelivery: quote.estimatedDelivery,
      };
    }

    return {
      type: selection.type as DeliveryType,
      quoteId: null,
      amount: null,
      currency: null,
      estimatedDelivery: null,
    };
  }

  private async findPaymentMethod(code: string,userId:string): Promise<PaymentMethod> {
    const method = (await this.getPaymentMethods(userId)).data.find((item) => item.code === code);
    if (!method) throw createError.badRequest('Selected payment method is not available');
    return method;
  }

  private toAddressPreview(address: UserAddress): unknown {
    return {
      id: address.id,
      label: address.label,
      recipientName: address.recipientName,
      addressLine1: address.addressLine1,
      city: address.city,
      state: address.state,
      country: address.country,
    };
  }

  private toAddressSnapshot(address: UserAddress): AddressSnapshot {
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
}

function serializeCheckout(checkout: CheckoutSession): Record<string, unknown> {
  return {
    checkoutId: checkout.id,
    sourceType: checkout.sourceType,
    sourceId: checkout.sourceId,
    quoteId: checkout.quoteId,
    quoteVersionId: checkout.quoteVersionId,
    productsTotal: Number(checkout.productsTotal),
    logisticsTotal: Number(checkout.logisticsTotal),
    totalAmount: Number(checkout.totalAmount),
    currency: checkout.currency,
    status: checkout.status,
    expiresAt: checkout.expiresAt,
  };
}
