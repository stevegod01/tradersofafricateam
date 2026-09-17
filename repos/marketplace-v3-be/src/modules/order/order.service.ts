import { SettlementService } from '../settlement/settlement.service';
import { RewardService } from '../reward/reward.service';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { Brackets, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import { Cart } from '../../database/entities/cart.entity';
import {
  CheckoutItemSnapshot,
  CheckoutSellerGroup,
} from '../../database/entities/checkout-seller-group.entity';
import {
  CheckoutSession,
  CheckoutStatus,
  DeliveryType,
} from '../../database/entities/checkout-session.entity';
import {
  Order,
  OrderSourceType,
  OrderStatus,
} from '../../database/entities/order.entity';
import {
  Dispute,
  DisputeStatus,
} from '../../database/entities/dispute.entity';
import {
  OrderCancellationRequest,
  OrderCancellationStatus,
} from '../../database/entities/order-cancellation-request.entity';
import { OrderDelivery } from '../../database/entities/order-delivery.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import {
  OrderActorType,
  OrderStatusHistory,
} from '../../database/entities/order-status-history.entity';
import { ShipmentStatus } from '../../database/entities/shipment.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import {
  InventoryStatus,
  ProductStatus,
  ProductType,
} from '../../database/entities/product.entity';
import { User } from '../../database/entities/user.entity';
import {
  AdminOrderCancellationReviewDto,
  BuyerLogisticsDto,
  ConfirmReceiptDto,
  OrderCancellationRequestDto,
  OrderQueryDto,
  OrderShipDto,
  OrderStatusUpdateDto,
} from '../../common/utils/validation.schemas';
import { createError } from '../../common/utils/http-error.util';
import { resolveTranslation } from '../../common/utils/i18n.util';
import {
  calculateFinalPrice,
  roundMoney,
  toNumber,
} from '../../common/utils/pricing.util';
import {
  sendBuyerLogisticsDetailsEmail,
  sendOrderCompletedEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusUpdatedEmail,
  sendSellerOrderConfirmationEmail,
} from '../../common/utils/email.service';
import { onPaymentEvent } from '../payment/payment.events';
import { onLogisticsEvent } from '../logistics/logistics.events';
import { SubscriptionService } from '../subscription/subscription.service';
import {
  emitOrderEvent,
  OrderEventName,
  serializeOrderEventPayload,
} from './order.events';

const EXTERNAL_DELIVERY_TYPES = [
  DeliveryType.SELLER_ARRANGED,
  DeliveryType.BUYER_ARRANGED,
];

const ACTIVE_DISPUTE_STATUSES = [
  DisputeStatus.OPEN,
  DisputeStatus.UNDER_REVIEW,
  DisputeStatus.AWAITING_BUYER,
  DisputeStatus.AWAITING_SELLER,
];

const SHIPPED_OR_LATER = [
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.RECEIVED,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];

let paymentEventHandlersRegistered = false;
let logisticsEventHandlersRegistered = false;

export function registerOrderPaymentEventHandlers(
  fastify?: FastifyInstance,
): void {
  if (paymentEventHandlersRegistered) return;
  paymentEventHandlersRegistered = true;

  const orderService = new OrderService(fastify);
  onPaymentEvent('PAYMENT_READY_FOR_ORDER', async (payload) => {
    await orderService.createOrdersFromPaymentId(payload.paymentId);
  });
}

export function registerOrderLogisticsEventHandlers(
  fastify?: FastifyInstance,
): void {
  if (logisticsEventHandlersRegistered) return;
  logisticsEventHandlersRegistered = true;

  const orderService = new OrderService(fastify);
  const applyShipmentStatus = async (payload: {
    orderId?: string;
    shipmentId?: string;
    status?: string;
  }) => {
    if (!payload.orderId || !payload.status) return;
    await orderService.applyLogisticsShipmentStatus(
      payload.orderId,
      payload.status,
      payload.shipmentId ?? null,
    );
  };

  onLogisticsEvent('SHIPMENT_PICKED_UP', applyShipmentStatus);
  onLogisticsEvent('SHIPMENT_IN_TRANSIT', applyShipmentStatus);
  onLogisticsEvent('SHIPMENT_OUT_FOR_DELIVERY', applyShipmentStatus);
  onLogisticsEvent('SHIPMENT_DELIVERED', applyShipmentStatus);
  onLogisticsEvent('SHIPMENT_DELIVERY_FAILED', applyShipmentStatus);
}

type PaymentAllocation = {
  paymentAmount: number;
  allocatedSoFar: number;
};

export class OrderService {
  private orderRepo = AppDataSource.getRepository(Order);
  private disputeRepo = AppDataSource.getRepository(Dispute);
  private orderItemRepo = AppDataSource.getRepository(OrderItem);
  private orderDeliveryRepo = AppDataSource.getRepository(OrderDelivery);
  private orderCancellationRepo = AppDataSource.getRepository(OrderCancellationRequest);
  private paymentRepo = AppDataSource.getRepository(Payment);
  private checkoutRepo = AppDataSource.getRepository(CheckoutSession);
  private cartRepo = AppDataSource.getRepository(Cart);
  private subscriptionService = new SubscriptionService();

  constructor(private readonly fastify?: FastifyInstance) {}

  async createOrdersFromPaymentId(
    paymentId: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['payer'],
    });

    if (!payment) throw createError.notFound('Payment not found');
    if (payment.status !== PaymentStatus.CONFIRMED) {
      throw createError.conflict('Payment is not ready for order creation');
    }

    const existing = await this.findOrdersByPayment(payment.id);
    if (existing.length > 0) {
      return {
        success: true,
        message: 'Orders already exist for this payment.',
        data: this.serializeOrderCreation(payment.id, existing),
      };
    }

    if (payment.sourceType !== 'checkout') {
      this.fastify?.log.info(
        { paymentId: payment.id, sourceType: payment.sourceType },
        '[OrderService] Payment source is not handled by Order Management yet',
      );
      return {
        success: true,
        message: 'Payment source is not order-backed in this deployment.',
        data: { paymentId: payment.id, ordersCreated: 0, orders: [] },
      };
    }

    const checkout = await this.checkoutRepo.findOne({
      where: { id: payment.sourceId },
      relations: ['user', 'sellerGroups', 'sellerGroups.seller'],
    });
    if (!checkout) throw createError.notFound('Checkout source not found');
    if (!checkout.sellerGroups?.length) {
      throw createError.badRequest('Checkout has no seller groups to convert into orders');
    }

    await AppDataSource.transaction(async (manager) => {
      const alreadyCreated = await manager.count(Order, {
        where: { paymentId: payment.id },
      });
      if (alreadyCreated > 0) return;

      const totalCheckoutAmount = checkout.sellerGroups.reduce(
        (sum, group) => sum + toNumber(group.sellerTotal),
        0,
      );
      if (totalCheckoutAmount <= 0) {
        throw createError.badRequest('Checkout total must be greater than zero to create orders');
      }

      let allocatedPaymentAmount = 0;

      for (const [index, group] of checkout.sellerGroups.entries()) {
        const itemSnapshots = await this.getCheckoutItemSnapshots(
          manager,
          checkout,
          group,
        );
        if (itemSnapshots.length === 0) {
          throw createError.badRequest('Seller group has no item snapshots');
        }

        const allocation = this.allocatePaymentAmount(
          payment,
          group,
          totalCheckoutAmount,
          index === checkout.sellerGroups.length - 1,
          allocatedPaymentAmount,
        );
        allocatedPaymentAmount = allocation.allocatedSoFar;

        const logisticsAmount = this.includedLogisticsAmount(group);
        const productsSubtotal = roundMoney(toNumber(group.productsSubtotal));
        const orderTotal = roundMoney(productsSubtotal + (logisticsAmount ?? 0));
        const orderCurrency = this.resolveOrderCurrency(itemSnapshots, checkout.currency);
        const fx = this.fxSnapshot(orderCurrency, payment.currency, orderTotal, allocation.paymentAmount, payment);
        const feeSnapshot =
          await this.subscriptionService.calculateTransactionFeeSnapshot(
            group.sellerId,
            productsSubtotal,
          );
        const order = await manager.save(
          Order,
          manager.create(Order, {
            orderReference: await this.generateOrderReference(manager),
            paymentId: payment.id,
            checkoutId: checkout.id,
            buyerId: checkout.userId,
            sellerId: group.sellerId,
            sourceType: checkout.sourceType as unknown as OrderSourceType,
            sourceId: checkout.sourceId,
            quoteId: checkout.quoteId,
            quoteVersionId: checkout.quoteVersionId,
            status: OrderStatus.PAID,
            orderCurrency,
            productsSubtotal,
            logisticsAmount,
            orderTotal,
            subscriptionId: feeSnapshot.subscriptionId,
            subscriptionPlanId: feeSnapshot.subscriptionPlanId,
            transactionFeePercentage: feeSnapshot.transactionFeePercentage,
            feeBaseAmount: feeSnapshot.feeBaseAmount,
            transactionFeeAmount: feeSnapshot.transactionFeeAmount,
            sellerNetProductAmount: feeSnapshot.sellerNetProductAmount,
            paymentCurrency: payment.currency,
            paymentAmount: allocation.paymentAmount,
            fxApplied: fx.applied,
            fxRateSnapshot: fx.rate,
            fxSourceCurrency: fx.sourceCurrency,
            fxTargetCurrency: fx.targetCurrency,
            fxSourceAmount: fx.sourceAmount,
            fxConvertedAmount: fx.convertedAmount,
            fxQuotedAt: fx.quotedAt,
            fxProvider: fx.provider,
            deliveryType: group.deliveryType,
            deliveryAddressSnapshot: checkout.deliveryAddressSnapshot,
            buyerNotes: checkout.notes,
            sellerBuyerNote: null,
            sellerInternalNote: null,
            receivedAt: null,
            cancelledAt: null,
            cancellationReason: null,
            completedAt: null,
          }),
        );

        await new SettlementService().syncOrder(manager, order);
        await manager.save(
          OrderItem,
          itemSnapshots.map((item) =>
            manager.create(OrderItem, {
              orderId: order.id,
              productId: item.productId,
              variantId: item.variantId,
              productNameSnapshot: { displayName: item.productNameSnapshot },
              productImageSnapshot: item.productImageSnapshot,
              skuSnapshot: item.skuSnapshot,
              attributesSnapshot: item.attributesSnapshot,
              unitPrice: item.unitPrice,
              discount: item.discount,
              finalUnitPrice: item.finalUnitPrice,
              quantity: item.quantity,
              unit: item.unit,
              subtotal: item.subtotal,
            }),
          ),
        );

        await manager.save(
          OrderDelivery,
          manager.create(OrderDelivery, this.buildDelivery(order, group, checkout)),
        );

        await manager.save(
          OrderStatusHistory,
          manager.create(OrderStatusHistory, {
            orderId: order.id,
            fromStatus: null,
            toStatus: OrderStatus.PAID,
            changedByType: OrderActorType.SYSTEM,
            changedById: null,
            notes: 'Created after payment readiness.',
          }),
        );
      }

      if (checkout.status !== CheckoutStatus.CONVERTED) {
        await manager.update(CheckoutSession, checkout.id, {
          status: CheckoutStatus.CONVERTED,
        });
      }
    });

    const created = await this.findOrdersByPayment(payment.id);
    await this.sendOrderCreatedEmails(created);
    for (const order of created) {
      this.emitOrderEvent('ORDERS_CREATED', order);
    }

    return {
      success: true,
      message: 'Orders created successfully.',
      data: this.serializeOrderCreation(payment.id, created),
    };
  }

  async listOrders(
    userId: string,
    query: OrderQueryDto,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
  }> {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.buyer', 'buyer')
      .leftJoinAndSelect('order.seller', 'seller')
      .orderBy('order.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.type === 'incoming') {
      qb.where('order.sellerId = :userId', { userId });
    } else if (query.type === 'outgoing') {
      qb.where('order.buyerId = :userId', { userId });
    } else {
      qb.where(
        new Brackets((subQb) => {
          subQb
            .where('order.buyerId = :userId', { userId })
            .orWhere('order.sellerId = :userId', { userId });
        }),
      );
    }

    this.applyOrderFilters(qb, query);
    const [orders, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: orders.map(serializeOrderListItem),
      pagination: this.pagination(query.page, query.limit, total),
    };
  }

  async listAdminOrders(
    query: OrderQueryDto,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
  }> {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.buyer', 'buyer')
      .leftJoinAndSelect('order.seller', 'seller')
      .orderBy('order.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    this.applyOrderFilters(qb, query);
    const [orders, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: orders.map(serializeOrderListItem),
      pagination: this.pagination(query.page, query.limit, total),
    };
  }

  async getOrderById(
    userId: string,
    orderId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const order = await this.requireParticipantOrder(orderId, userId);
    return {
      success: true,
      data: {
        ...serializeOrderDetail(order),
        dispute: await this.getOrderDisputeMetadata(order, userId),
      },
    };
  }

  async getAdminOrderById(
    orderId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const order = await this.requireOrderDetail(orderId);
    return { success: true, data: serializeOrderDetail(order) };
  }

  async updateStatus(
    userId: string,
    orderId: string,
    dto: OrderStatusUpdateDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const order = await this.requireParticipantOrder(orderId, userId);
    const nextStatus = dto.status as OrderStatus;
    if (order.sellerId !== userId) {
      throw createError.forbidden('Only the seller can update this order status');
    }

    if (nextStatus === OrderStatus.PROCESSING) {
      this.assertTransition(order, [OrderStatus.PAID], nextStatus);
      return this.transitionOrder(
        order,
        nextStatus,
        OrderActorType.SELLER,
        userId,
        dto.notes ?? null,
      );
    }

    if (nextStatus === OrderStatus.READY_FOR_SHIPMENT) {
      this.assertTransition(order, [OrderStatus.PROCESSING], nextStatus);
      return this.transitionOrder(
        order,
        nextStatus,
        OrderActorType.SELLER,
        userId,
        dto.notes ?? null,
      );
    }

    if (nextStatus === OrderStatus.DELIVERED) {
      this.assertExternalDeliveredTransition(order);
      return this.transitionOrder(
        order,
        nextStatus,
        OrderActorType.SELLER,
        userId,
        dto.notes ?? null,
      );
    }

    throw createError.badRequest('This status transition is not available to sellers');
  }

  async adminUpdateStatus(
    orderId: string,
    adminId: string,
    dto: OrderStatusUpdateDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const order = await this.requireOrderDetail(orderId);
    const nextStatus = dto.status as OrderStatus;

    if (nextStatus === OrderStatus.CANCELLED) {
      if (order.status === OrderStatus.CANCELLED) {
        return {
          success: true,
          message: 'Order is already cancelled.',
          data: { orderId: order.id, status: order.status },
        };
      }
      if (order.status === OrderStatus.COMPLETED) {
        throw createError.conflict('Completed orders cannot be cancelled');
      }
      if (SHIPPED_OR_LATER.includes(order.status)) {
        throw createError.conflict('Shipped orders must use the disputes or returns process');
      }
      return this.cancelOrder(
        order,
        OrderActorType.ADMIN,
        adminId,
        dto.reason ?? dto.notes ?? 'Cancelled by admin',
      );
    }

    if (nextStatus === OrderStatus.DELIVERED) {
      this.assertTransition(order, [OrderStatus.SHIPPED], nextStatus);
      return this.transitionOrder(order, nextStatus, OrderActorType.ADMIN, adminId, dto.notes ?? null);
    }

    if (nextStatus === OrderStatus.COMPLETED) {
      this.assertTransition(order, [OrderStatus.RECEIVED], nextStatus);
      return this.transitionOrder(order, nextStatus, OrderActorType.ADMIN, adminId, dto.notes ?? null);
    }

    if (
      nextStatus === OrderStatus.PROCESSING ||
      nextStatus === OrderStatus.READY_FOR_SHIPMENT
    ) {
      const allowedFrom =
        nextStatus === OrderStatus.PROCESSING
          ? [OrderStatus.PAID]
          : [OrderStatus.PROCESSING];
      this.assertTransition(order, allowedFrom, nextStatus);
      return this.transitionOrder(order, nextStatus, OrderActorType.ADMIN, adminId, dto.notes ?? null);
    }

    throw createError.badRequest('This admin status transition is not supported');
  }

  async applyLogisticsShipmentStatus(
    orderId: string,
    shipmentStatus: string,
    shipmentId: string | null,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const order = await this.requireOrderDetail(orderId);
    if (order.deliveryType !== DeliveryType.INTEGRATED_LOGISTICS) {
      return {
        success: true,
        message: 'Shipment status ignored for non-integrated delivery.',
        data: { orderId: order.id, status: order.status },
      };
    }

    const notes = shipmentId
      ? `Provider shipment ${shipmentId} reported ${shipmentStatus}.`
      : `Provider shipment reported ${shipmentStatus}.`;

    if (
      shipmentStatus === ShipmentStatus.PICKED_UP ||
      shipmentStatus === ShipmentStatus.IN_TRANSIT ||
      shipmentStatus === ShipmentStatus.OUT_FOR_DELIVERY ||
      shipmentStatus === ShipmentStatus.DELIVERY_FAILED
    ) {
      if (order.status === OrderStatus.READY_FOR_SHIPMENT) {
        return this.transitionOrder(
          order,
          OrderStatus.SHIPPED,
          OrderActorType.PROVIDER,
          shipmentId,
          notes,
        );
      }

      return {
        success: true,
        message: 'Order status already reflects shipment progress.',
        data: { orderId: order.id, status: order.status },
      };
    }

    if (shipmentStatus === ShipmentStatus.DELIVERED) {
      let deliverableOrder = order;
      if (deliverableOrder.status === OrderStatus.READY_FOR_SHIPMENT) {
        await this.transitionOrder(
          deliverableOrder,
          OrderStatus.SHIPPED,
          OrderActorType.PROVIDER,
          shipmentId,
          notes,
        );
        deliverableOrder = await this.requireOrderDetail(orderId);
      }

      if (deliverableOrder.status === OrderStatus.SHIPPED) {
        return this.transitionOrder(
          deliverableOrder,
          OrderStatus.DELIVERED,
          OrderActorType.PROVIDER,
          shipmentId,
          notes,
        );
      }

      return {
        success: true,
        message: 'Order delivery status already applied.',
        data: { orderId: deliverableOrder.id, status: deliverableOrder.status },
      };
    }

    return {
      success: true,
      message: 'Shipment status does not require an order status change.',
      data: { orderId: order.id, status: order.status },
    };
  }

  async shipOrder(
    sellerId: string,
    orderId: string,
    dto: OrderShipDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const order = await this.requireSellerOrder(orderId, sellerId);
    this.assertTransition(order, [OrderStatus.READY_FOR_SHIPMENT], OrderStatus.SHIPPED);

    if (order.deliveryType === DeliveryType.INTEGRATED_LOGISTICS) {
      throw createError.badRequest('Integrated logistics shipments are updated by provider events');
    }

    if (!order.delivery) throw createError.notFound('Order delivery record not found');

    const updates: QueryDeepPartialEntity<OrderDelivery> = {
      shippedAt: new Date(),
      sellerDeliveryNotes: dto.notes ?? null,
    };

    if (order.deliveryType === DeliveryType.SELLER_ARRANGED) {
      if (!dto.providerName) {
        throw createError.badRequest('providerName is required for seller-arranged delivery');
      }
      Object.assign(updates, {
        providerNameSnapshot: dto.providerName,
        trackingId: dto.trackingId ?? null,
        trackingUrl: dto.trackingUrl ?? null,
        deliveryContact: dto.deliveryContact ?? null,
        estimatedDelivery: dto.estimatedDelivery ?? null,
      });
    }

    if (order.deliveryType === DeliveryType.BUYER_ARRANGED) {
      if (!order.delivery.buyerLogisticsContactName || !order.delivery.deliveryContact) {
        throw createError.badRequest('Buyer logistics details are required before handover');
      }
      if (!dto.handoverTo) {
        throw createError.badRequest('handoverTo is required for buyer-arranged handover');
      }
      Object.assign(updates, {
        handoverTo: dto.handoverTo,
        handoverReference: dto.handoverReference ?? order.delivery.trackingId,
      });
    }

    const result = await this.transitionOrder(
      order,
      OrderStatus.SHIPPED,
      OrderActorType.SELLER,
      sellerId,
      dto.notes ?? null,
      updates,
    );

    return {
      ...result,
      message:
        order.deliveryType === DeliveryType.BUYER_ARRANGED
          ? 'Order handover confirmed and marked as shipped.'
          : 'Order marked as shipped successfully.',
    };
  }

  async submitBuyerLogistics(
    buyerId: string,
    orderId: string,
    dto: BuyerLogisticsDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const order = await this.requireBuyerOrder(orderId, buyerId);
    if (order.deliveryType !== DeliveryType.BUYER_ARRANGED) {
      throw createError.badRequest('This order does not use buyer-arranged logistics');
    }
    if (SHIPPED_OR_LATER.includes(order.status)) {
      throw createError.conflict('Buyer logistics details cannot be changed after handover');
    }
    if (!order.delivery) throw createError.notFound('Order delivery record not found');

    const isUpdate = Boolean(order.delivery.buyerLogisticsContactName);
    await this.orderDeliveryRepo.update(order.delivery.id, {
      providerNameSnapshot: dto.providerName ?? null,
      buyerLogisticsContactName: dto.contactName,
      deliveryContact: dto.phoneNumber,
      buyerLogisticsEmail: dto.email ?? null,
      trackingId: dto.trackingReference ?? null,
      expectedPickupDate: dto.expectedPickupDate,
      buyerLogisticsNotes: dto.notes ?? null,
    });

    const updated = await this.requireOrderDetail(order.id);
    this.emitOrderEvent(
      isUpdate
        ? 'BUYER_LOGISTICS_DETAILS_UPDATED'
        : 'BUYER_LOGISTICS_DETAILS_SUBMITTED',
      updated,
    );
    this.sendBuyerLogisticsDetailsToSeller(updated).catch((err) =>
      console.error('[OrderService] Buyer logistics email failed:', err),
    );

    return {
      success: true,
      message: 'Pickup details submitted successfully.',
      data: {
        orderId: updated.id,
        deliveryType: updated.deliveryType,
        providerName: updated.delivery?.providerNameSnapshot ?? null,
        contactName: updated.delivery?.buyerLogisticsContactName ?? null,
        phoneNumber: updated.delivery?.deliveryContact ?? null,
        expectedPickupDate: updated.delivery?.expectedPickupDate ?? null,
      },
    };
  }

  async confirmReceipt(
    buyerId: string,
    orderId: string,
    dto: ConfirmReceiptDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const order = await this.requireBuyerOrder(orderId, buyerId);
    this.assertTransition(order, [OrderStatus.DELIVERED], OrderStatus.RECEIVED);

    return this.transitionOrder(
      order,
      OrderStatus.RECEIVED,
      OrderActorType.BUYER,
      buyerId,
      dto.notes ?? null,
    );
  }

  async requestCancellation(
    userId: string,
    orderId: string,
    dto: OrderCancellationRequestDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const order = await this.requireParticipantOrder(orderId, userId);
    const { AfterSalesService } = await import('../after-sales/after-sales.service');
    return new AfterSalesService().cancellation({ id: userId, type: order.buyerId === userId ? 'buyer' : 'seller' }, orderId, { reason: dto.reason, description: dto.notes }, true) as unknown as Promise<{ success: true; message: string; data: Record<string, unknown> }>;
  }

  async approveCancellationRequest(
    orderId: string,
    cancellationRequestId: string,
    adminId: string,
    dto: AdminOrderCancellationReviewDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const { AfterSalesService } = await import('../after-sales/after-sales.service');
    return new AfterSalesService().reviewCancellation({ id: adminId, type: 'admin' }, cancellationRequestId, 'approve', dto.notes, orderId) as unknown as Promise<{ success: true; message: string; data: Record<string, unknown> }>;
  }

  async rejectCancellationRequest(
    orderId: string,
    cancellationRequestId: string,
    adminId: string,
    dto: AdminOrderCancellationReviewDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const { AfterSalesService } = await import('../after-sales/after-sales.service');
    return new AfterSalesService().reviewCancellation({ id: adminId, type: 'admin' }, cancellationRequestId, 'reject', dto.notes, orderId) as unknown as Promise<{ success: true; message: string; data: Record<string, unknown> }>;
  }

  private async findOrdersByPayment(paymentId: string): Promise<Order[]> {
    return this.orderRepo.find({
      where: { paymentId },
      relations: ['buyer', 'seller', 'items', 'delivery', 'cancellationRequests'],
      order: { createdAt: 'ASC' },
    });
  }

  private async getCheckoutItemSnapshots(
    manager: EntityManager,
    checkout: CheckoutSession,
    group: CheckoutSellerGroup,
  ): Promise<CheckoutItemSnapshot[]> {
    if (group.itemsSnapshot?.length) return group.itemsSnapshot;

    const cart = await manager.getRepository(Cart).findOne({
      where: { userId: checkout.userId },
      relations: [
        'items',
        'items.product',
        'items.product.images',
        'items.variant',
      ],
    });
    if (!cart) return [];

    return (cart.items ?? [])
      .filter((item) => item.product?.sellerId === group.sellerId)
      .map((item) => {
        const product = item.product;
        const variant = item.variant;
        const unitPrice =
          product.productType === ProductType.SIMPLE
            ? toNumber(product.price)
            : toNumber(variant?.price);
        const discount =
          product.productType === ProductType.SIMPLE
            ? product.discount === null
              ? null
              : toNumber(product.discount)
            : variant?.discount === null || variant?.discount === undefined
              ? null
              : toNumber(variant.discount);
        const finalUnitPrice = calculateFinalPrice(unitPrice, discount);
        const quantity = toNumber(item.quantity);
        const primaryImage = (product.images ?? []).find((image) => image.isPrimary);
        const fallbackImage = (product.images ?? [])[0];

        if (
          product.status !== ProductStatus.ACTIVE ||
          product.inventoryStatus !== InventoryStatus.IN_STOCK ||
          product.deletedAt
        ) {
          throw createError.conflict('A checkout product is no longer available for order creation');
        }

        return {
          productId: item.productId,
          variantId: item.variantId,
          productNameSnapshot: resolveTranslation(
            product.productName,
            checkout.user?.selectedLanguage ?? 'en',
          ),
          productImageSnapshot:
            variant?.image || primaryImage?.url || fallbackImage?.url || null,
          skuSnapshot: variant?.sku || product.barcode || null,
          attributesSnapshot: variant?.attributes || null,
          unitPrice,
          discount,
          finalUnitPrice,
          quantity,
          unit: product.unitForMinOrder,
          subtotal: roundMoney(finalUnitPrice * quantity),
          currency: product.currency,
        };
      });
  }

  private allocatePaymentAmount(
    payment: Payment,
    group: CheckoutSellerGroup,
    totalCheckoutAmount: number,
    isLastGroup: boolean,
    allocatedSoFar: number,
  ): PaymentAllocation {
    const paymentTotal = Number(payment.amount);
    const groupTotal = toNumber(group.sellerTotal);
    const paymentAmount =
      isLastGroup && totalCheckoutAmount > 0
        ? roundMoney(paymentTotal - allocatedSoFar)
        : roundMoney(paymentTotal * (groupTotal / totalCheckoutAmount));

    return {
      paymentAmount,
      allocatedSoFar: roundMoney(allocatedSoFar + paymentAmount),
    };
  }

  private resolveOrderCurrency(
    items: CheckoutItemSnapshot[],
    fallbackCurrency: string,
  ): string {
    return (items[0]?.currency || fallbackCurrency).toUpperCase();
  }

  private includedLogisticsAmount(group: CheckoutSellerGroup): number | null {
    if (EXTERNAL_DELIVERY_TYPES.includes(group.deliveryType)) return null;
    return roundMoney(toNumber(group.logisticsAmount));
  }

  private fxSnapshot(
    orderCurrency: string,
    paymentCurrency: string,
    orderTotal: number,
    paymentAmount: number,
    payment: Payment,
  ): {
    applied: boolean;
    rate: number | null;
    sourceCurrency: string | null;
    targetCurrency: string | null;
    sourceAmount: number | null;
    convertedAmount: number | null;
    quotedAt: Date | null;
    provider: string | null;
  } {
    if (orderCurrency === paymentCurrency) {
      return {
        applied: false,
        rate: null,
        sourceCurrency: null,
        targetCurrency: null,
        sourceAmount: null,
        convertedAmount: null,
        quotedAt: null,
        provider: null,
      };
    }

    return {
      applied: true,
      rate: orderTotal > 0 ? Number((paymentAmount / orderTotal).toFixed(8)) : null,
      sourceCurrency: orderCurrency,
      targetCurrency: paymentCurrency,
      sourceAmount: orderTotal,
      convertedAmount: paymentAmount,
      quotedAt: payment.paidAt ?? payment.updatedAt,
      provider: 'checkout_locked_amount',
    };
  }

  private buildDelivery(
    order: Order,
    group: CheckoutSellerGroup,
    checkout: CheckoutSession,
  ): Partial<OrderDelivery> {
    const snapshot = group.deliverySnapshot;
    const logisticsAmount = this.includedLogisticsAmount(group);

    return {
      orderId: order.id,
      deliveryType: group.deliveryType,
      providerId: snapshot?.providerId ?? null,
      providerNameSnapshot: snapshot?.providerName ?? null,
      serviceNameSnapshot: snapshot?.serviceName ?? null,
      logisticsQuoteId: group.logisticsQuoteId ?? snapshot?.quoteId ?? null,
      logisticsAmount,
      logisticsCurrency: logisticsAmount === null ? null : snapshot?.currency ?? checkout.currency,
      trackingId: null,
      trackingUrl: null,
      deliveryContact: null,
      buyerLogisticsContactName: null,
      buyerLogisticsEmail: null,
      expectedPickupDate: null,
      handoverTo: null,
      handoverReference: null,
      pickupAddressSnapshot: this.pickupAddressSnapshot(group.seller),
      deliveryAddressSnapshot: checkout.deliveryAddressSnapshot,
      estimatedDelivery: snapshot?.estimatedDelivery ?? null,
      shippedAt: null,
      deliveredAt: null,
      sellerDeliveryNotes: null,
      buyerLogisticsNotes: null,
    };
  }

  private pickupAddressSnapshot(seller: User | undefined): {
    sellerName: string;
    storeName: string | null;
    phoneNumber: string | null;
    pickupAddress: string | null;
    country: string | null;
  } {
    return {
      sellerName: seller
        ? `${seller.firstName} ${seller.lastName}`.trim()
        : 'Seller',
      storeName: seller?.storeName ?? seller?.companyName ?? null,
      phoneNumber: seller?.phoneNumber ?? null,
      pickupAddress: seller?.pickupAddress ?? seller?.companyAddress ?? null,
      country: seller?.country ?? null,
    };
  }

  private async requireParticipantOrder(
    orderId: string,
    userId: string,
  ): Promise<Order> {
    const order = await this.requireOrderDetail(orderId);
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw createError.forbidden('You do not have access to this order');
    }
    return order;
  }

  private async requireBuyerOrder(orderId: string, buyerId: string): Promise<Order> {
    const order = await this.requireOrderDetail(orderId);
    if (order.buyerId !== buyerId) {
      throw createError.forbidden('Only the buyer can perform this action');
    }
    return order;
  }

  private async requireSellerOrder(orderId: string, sellerId: string): Promise<Order> {
    const order = await this.requireOrderDetail(orderId);
    if (order.sellerId !== sellerId) {
      throw createError.forbidden('Only the seller can perform this action');
    }
    return order;
  }

  private async requireOrderDetail(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'buyer',
        'seller',
        'items',
        'delivery',
        'statusHistory',
        'cancellationRequests',
      ],
      order: {
        statusHistory: { createdAt: 'ASC' },
        cancellationRequests: { createdAt: 'DESC' },
      },
    });
    if (!order) throw createError.notFound('Order not found');
    return order;
  }

  private async requirePendingCancellationRequest(
    orderId: string,
    cancellationRequestId: string,
  ): Promise<OrderCancellationRequest> {
    const request = await this.orderCancellationRepo.findOne({
      where: {
        id: cancellationRequestId,
        orderId,
        status: OrderCancellationStatus.PENDING,
      },
    });
    if (!request) throw createError.notFound('Pending cancellation request not found');
    return request;
  }

  private assertTransition(
    order: Order,
    allowedFrom: OrderStatus[],
    nextStatus: OrderStatus,
  ): void {
    if (order.status === nextStatus) return;
    if (!allowedFrom.includes(order.status)) {
      throw createError.conflict(
        `Order cannot move from ${order.status} to ${nextStatus}`,
      );
    }
  }

  private assertExternalDeliveredTransition(order: Order): void {
    this.assertTransition(order, [OrderStatus.SHIPPED], OrderStatus.DELIVERED);
    if (!EXTERNAL_DELIVERY_TYPES.includes(order.deliveryType)) {
      throw createError.badRequest('Integrated deliveries are marked delivered by provider or admin flow');
    }
  }

  private async transitionOrder(
    order: Order,
    nextStatus: OrderStatus,
    actorType: OrderActorType,
    actorId: string | null,
    notes: string | null,
    deliveryUpdates?: QueryDeepPartialEntity<OrderDelivery>,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    if (order.status === nextStatus) {
      return {
        success: true,
        message: 'Order status already applied.',
        data: { orderId: order.id, status: order.status },
      };
    }

    const now = new Date();
    const updates: QueryDeepPartialEntity<Order> = { status: nextStatus };
    if (nextStatus === OrderStatus.RECEIVED) updates.receivedAt = now;
    if (nextStatus === OrderStatus.COMPLETED) updates.completedAt = now;

    await AppDataSource.transaction(async (manager) => {
      const changed = await manager.update(Order, { id: order.id, status: order.status }, updates);
      if (changed.affected !== 1) throw createError.conflict('Order state changed; reload before retrying');
      if (nextStatus === OrderStatus.COMPLETED) await new RewardService().completedTrade(manager, order);
      await new SettlementService().syncOrder(manager, order);
      if (deliveryUpdates) await manager.update(OrderDelivery, { orderId: order.id }, deliveryUpdates);
      if (nextStatus === OrderStatus.DELIVERED) {
        await manager.update(OrderDelivery, { orderId: order.id }, { deliveredAt: now });
      }
      await manager.save(
        OrderStatusHistory,
        manager.create(OrderStatusHistory, {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: nextStatus,
          changedByType: actorType,
          changedById: actorId,
          notes,
        }),
      );
    });

    const updated = await this.requireOrderDetail(order.id);
    const event = eventForStatus(nextStatus);
    if (event) this.emitOrderEvent(event, updated);

    if (nextStatus === OrderStatus.COMPLETED) {
      this.sendCompletedEmail(updated).catch((err) =>
        console.error('[OrderService] Order completed email failed:', err),
      );
    } else if (
      nextStatus === OrderStatus.READY_FOR_SHIPMENT ||
      nextStatus === OrderStatus.SHIPPED ||
      nextStatus === OrderStatus.DELIVERED ||
      nextStatus === OrderStatus.RECEIVED
    ) {
      this.sendStatusEmail(updated).catch((err) =>
        console.error('[OrderService] Order status email failed:', err),
      );
    }

    return {
      success: true,
      message: messageForStatus(nextStatus),
      data: {
        orderId: updated.id,
        orderReference: updated.orderReference,
        status: updated.status,
        receivedAt: updated.receivedAt,
        completedAt: updated.completedAt,
      },
    };
  }

  private async cancelOrder(
    order: Order,
    actorType: OrderActorType,
    actorId: string | null,
    reason: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const { AfterSalesService } = await import('../after-sales/after-sales.service');
    if (!actorId) throw createError.forbidden('Cancellation actor is required');
    return new AfterSalesService().cancellation({ id: actorId, type: 'admin' }, order.id, { reason }, true) as unknown as Promise<{ success: true; message: string; data: Record<string, unknown> }>;
  }

  /** Called inside the after-sales transaction; Order remains the lifecycle owner. */
  async finalizeCancellation(manager: EntityManager, order: Order, adminId: string, reason: string): Promise<void> {
    const previousStatus = order.status;
    await manager.update(Order, order.id, { status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: reason });
    await manager.save(OrderStatusHistory, manager.create(OrderStatusHistory, {
      orderId: order.id, fromStatus: previousStatus, toStatus: OrderStatus.CANCELLED,
      changedByType: OrderActorType.ADMIN, changedById: adminId, notes: reason,
    }));
    order.status = OrderStatus.CANCELLED;
  }

  private applyOrderFilters(
    qb: SelectQueryBuilder<Order>,
    query: OrderQueryDto,
  ): void {
    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }
    if (query.sourceType) {
      qb.andWhere('order.sourceType = :sourceType', { sourceType: query.sourceType });
    }
    if (query.dateFrom) {
      qb.andWhere('order.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('order.createdAt <= :dateTo', { dateTo: query.dateTo });
    }
    if (query.search) {
      qb.andWhere(
        '(order.orderReference LIKE :search OR order.sourceId LIKE :search OR buyer.email LIKE :search OR seller.email LIKE :search)',
        { search: `%${query.search}%` },
      );
    }
  }

  private pagination(page: number, limit: number, total: number): Record<string, number> {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async getOrderDisputeMetadata(
    order: Order,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const activeDispute = await this.disputeRepo.findOne({
      where: [
        {
          sellerOrderId: order.id,
          buyerId: userId,
          status: In(ACTIVE_DISPUTE_STATUSES),
        },
        {
          sellerOrderId: order.id,
          sellerId: userId,
          status: In(ACTIVE_DISPUTE_STATUSES),
        },
      ],
      order: { updatedAt: 'DESC' },
    });
    const participantType =
      order.buyerId === userId ? 'buyer' : order.sellerId === userId ? 'seller' : null;
    const eligible =
      Boolean(participantType) &&
      !activeDispute &&
      order.status !== OrderStatus.CANCELLED &&
      isWithinDisputeWindow(order);

    return {
      eligible,
      hasActiveDispute: Boolean(activeDispute),
      disputeId: activeDispute?.id ?? null,
      disputeNumber: activeDispute?.disputeNumber ?? null,
      status: activeDispute?.status ?? null,
      sellerOrderId: order.id,
      reasons:
        participantType === 'buyer'
          ? config.disputes.buyerReasons
          : participantType === 'seller'
            ? config.disputes.sellerReasons
            : [],
    };
  }

  private async generateOrderReference(manager: EntityManager): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      const orderReference = `TOFA-ORD-${datePart}-${suffix}`;
      const existing = await manager.findOne(Order, {
        where: { orderReference },
        select: ['id'],
      });
      if (!existing) return orderReference;
    }
    throw createError.conflict('Unable to generate a unique order reference');
  }

  private emitOrderEvent(event: OrderEventName, order: Order): void {
    emitOrderEvent(event, order);
    this.fastify?.log.info(
      { event, order: serializeOrderEventPayload(event, order) },
      `[OrderService] ${event}`,
    );
  }

  private serializeOrderCreation(paymentId: string, orders: Order[]): Record<string, unknown> {
    return {
      paymentId,
      ordersCreated: orders.length,
      orderIds: orders.map((order) => order.id),
      orders: orders.map(serializeOrderListItem),
    };
  }

  private async sendOrderCreatedEmails(orders: Order[]): Promise<void> {
    await Promise.all(
      orders.map(async (order) => {
        await Promise.all([
          sendOrderConfirmationEmail(
            order.buyer.email,
            order.buyer.firstName,
            serializeOrderEmailPayload(order),
          ),
          sendSellerOrderConfirmationEmail(
            order.seller.email,
            order.seller.firstName,
            serializeOrderEmailPayload(order),
          ),
        ]);
      }),
    );
  }

  private async sendBuyerLogisticsDetailsToSeller(order: Order): Promise<void> {
    if (!order.delivery) return;
    await sendBuyerLogisticsDetailsEmail(
      order.seller.email,
      order.seller.firstName,
      {
        orderReference: order.orderReference,
        buyerName: displayUserName(order.buyer),
        providerName: order.delivery.providerNameSnapshot,
        contactName: order.delivery.buyerLogisticsContactName,
        phoneNumber: order.delivery.deliveryContact,
        email: order.delivery.buyerLogisticsEmail,
        trackingReference: order.delivery.trackingId,
        expectedPickupDate: order.delivery.expectedPickupDate,
        notes: order.delivery.buyerLogisticsNotes,
      },
    );
  }

  private async sendStatusEmail(order: Order): Promise<void> {
    await sendOrderStatusUpdatedEmail(
      order.buyer.email,
      order.buyer.firstName,
      serializeOrderEmailPayload(order),
    );
  }

  private async sendCompletedEmail(order: Order): Promise<void> {
    await sendOrderCompletedEmail(
      order.buyer.email,
      order.buyer.firstName,
      serializeOrderEmailPayload(order),
    );
  }
}

function eventForStatus(status: OrderStatus): OrderEventName | null {
  const events: Partial<Record<OrderStatus, OrderEventName>> = {
    [OrderStatus.PROCESSING]: 'ORDER_PROCESSING',
    [OrderStatus.READY_FOR_SHIPMENT]: 'ORDER_READY_FOR_SHIPMENT',
    [OrderStatus.SHIPPED]: 'ORDER_SHIPPED',
    [OrderStatus.DELIVERED]: 'ORDER_DELIVERED',
    [OrderStatus.RECEIVED]: 'ORDER_RECEIVED',
    [OrderStatus.COMPLETED]: 'ORDER_COMPLETED',
    [OrderStatus.CANCELLED]: 'ORDER_CANCELLED',
  };
  return events[status] ?? null;
}

function messageForStatus(status: OrderStatus): string {
  const messages: Record<OrderStatus, string> = {
    [OrderStatus.PAID]: 'Order marked as paid.',
    [OrderStatus.PROCESSING]: 'Order marked as processing.',
    [OrderStatus.READY_FOR_SHIPMENT]: 'Order marked as ready for shipment.',
    [OrderStatus.SHIPPED]: 'Order marked as shipped.',
    [OrderStatus.DELIVERED]: 'Order marked as delivered.',
    [OrderStatus.RECEIVED]: 'Order receipt confirmed successfully.',
    [OrderStatus.COMPLETED]: 'Order completed successfully.',
    [OrderStatus.CANCELLED]: 'Order cancelled successfully.',
  };
  return messages[status];
}

function serializeOrderListItem(order: Order): Record<string, unknown> {
  return {
    orderId: order.id,
    orderReference: order.orderReference,
    paymentId: order.paymentId,
    buyer: serializeUser(order.buyer),
    seller: serializeSeller(order.seller),
    sourceType: order.sourceType,
    sourceId: order.sourceId,
    status: order.status,
    orderCurrency: order.orderCurrency,
    productsSubtotal: Number(order.productsSubtotal),
    logisticsAmount: order.logisticsAmount === null ? null : Number(order.logisticsAmount),
    orderTotal: Number(order.orderTotal),
    transactionFee: {
      subscriptionId: order.subscriptionId,
      subscriptionPlanId: order.subscriptionPlanId,
      percentage:
        order.transactionFeePercentage === null
          ? null
          : Number(order.transactionFeePercentage),
      feeBaseAmount: order.feeBaseAmount === null ? null : Number(order.feeBaseAmount),
      amount:
        order.transactionFeeAmount === null
          ? null
          : Number(order.transactionFeeAmount),
      sellerNetProductAmount:
        order.sellerNetProductAmount === null
          ? null
          : Number(order.sellerNetProductAmount),
    },
    paymentCurrency: order.paymentCurrency,
    paymentAmount: Number(order.paymentAmount),
    deliveryType: order.deliveryType,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function serializeOrderDetail(order: Order): Record<string, unknown> {
  return {
    ...serializeOrderListItem(order),
    quoteId: order.quoteId,
    quoteVersionId: order.quoteVersionId,
    fx: {
      applied: order.fxApplied,
      sourceCurrency: order.fxSourceCurrency,
      targetCurrency: order.fxTargetCurrency,
      rate: order.fxRateSnapshot === null ? null : Number(order.fxRateSnapshot),
      sourceAmount: order.fxSourceAmount === null ? null : Number(order.fxSourceAmount),
      convertedAmount:
        order.fxConvertedAmount === null ? null : Number(order.fxConvertedAmount),
      quotedAt: order.fxQuotedAt,
      provider: order.fxProvider,
    },
    deliveryAddress: order.deliveryAddressSnapshot,
    buyerNotes: order.buyerNotes,
    sellerBuyerNote: order.sellerBuyerNote,
    sellerInternalNote: order.sellerInternalNote,
    receivedAt: order.receivedAt,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
    completedAt: order.completedAt,
    items: (order.items ?? []).map(serializeOrderItem),
    delivery: serializeOrderDelivery(order.delivery),
    statusHistory: (order.statusHistory ?? []).map((history) => ({
      id: history.id,
      fromStatus: history.fromStatus,
      toStatus: history.toStatus,
      changedByType: history.changedByType,
      changedById: history.changedById,
      notes: history.notes,
      createdAt: history.createdAt,
    })),
    cancellationRequests: (order.cancellationRequests ?? []).map((request) => ({
      id: request.id,
      cancellationNumber: request.cancellationNumber,
      refundRequired: request.refundRequired,
      refundId: request.refundId,
      cancelledAt: request.cancelledAt,
      requestedByType: request.requestedByType,
      requestedById: request.requestedById,
      reason: request.reason,
      notes: request.notes,
      status: request.status,
      reviewedBy: request.reviewedBy,
      reviewedAt: request.reviewedAt,
      reviewNotes: request.reviewNotes,
      createdAt: request.createdAt,
    })),
  };
}

function serializeOrderItem(item: OrderItem): Record<string, unknown> {
  return {
    orderItemId: item.id,
    productId: item.productId,
    variantId: item.variantId,
    productName: productNameDisplay(item.productNameSnapshot),
    productNameSnapshot: item.productNameSnapshot,
    productImage: item.productImageSnapshot,
    sku: item.skuSnapshot,
    attributes: item.attributesSnapshot,
    unitPrice: Number(item.unitPrice),
    discount: item.discount === null ? null : Number(item.discount),
    finalUnitPrice: Number(item.finalUnitPrice),
    quantity: Number(item.quantity),
    unit: item.unit,
    subtotal: Number(item.subtotal),
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
    logisticsAmount:
      delivery.logisticsAmount === null ? null : Number(delivery.logisticsAmount),
    logisticsCurrency: delivery.logisticsCurrency,
    trackingId: delivery.trackingId,
    trackingUrl: delivery.trackingUrl,
    estimatedDelivery: delivery.estimatedDelivery,
    buyerLogistics: {
      providerName: delivery.providerNameSnapshot,
      contactName: delivery.buyerLogisticsContactName,
      phoneNumber: delivery.deliveryContact,
      email: delivery.buyerLogisticsEmail,
      trackingReference: delivery.trackingId,
      expectedPickupDate: delivery.expectedPickupDate,
      notes: delivery.buyerLogisticsNotes,
    },
    handover:
      delivery.handoverTo || delivery.handoverReference || delivery.shippedAt
        ? {
            handoverTo: delivery.handoverTo,
            handoverReference: delivery.handoverReference,
            shippedAt: delivery.shippedAt,
            notes: delivery.sellerDeliveryNotes,
          }
        : null,
    pickupAddress: delivery.pickupAddressSnapshot,
    deliveryAddress: delivery.deliveryAddressSnapshot,
    shippedAt: delivery.shippedAt,
    deliveredAt: delivery.deliveredAt,
    sellerDeliveryNotes: delivery.sellerDeliveryNotes,
  };
}

function serializeUser(user: User | undefined): Record<string, unknown> | null {
  if (!user) return null;
  return {
    id: user.id,
    name: displayUserName(user),
    email: user.email,
  };
}

function serializeSeller(seller: User | undefined): Record<string, unknown> | null {
  if (!seller) return null;
  return {
    id: seller.id,
    name: displayUserName(seller),
    storeName: seller.storeName ?? seller.companyName,
    email: seller.email,
  };
}

function displayUserName(user: User): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

function productNameDisplay(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'displayName' in value) {
    const displayName = (value as { displayName?: unknown }).displayName;
    return typeof displayName === 'string' ? displayName : null;
  }
  return null;
}

function deliveryMethodDisplay(type: DeliveryType): string {
  const names: Record<DeliveryType, string> = {
    [DeliveryType.INTEGRATED_LOGISTICS]: 'Integrated Logistics',
    [DeliveryType.SELLER_ARRANGED]: 'Seller-Arranged Delivery',
    [DeliveryType.BUYER_ARRANGED]: 'Buyer-Arranged Delivery',
    [DeliveryType.B2B_LOGISTICS]: 'B2B Logistics',
  };
  return names[type];
}

function logisticsDisplay(order: Order): string {
  if (order.logisticsAmount === null) {
    return 'Delivery charge handled separately outside TOFA.';
  }
  return `${order.orderCurrency} ${Number(order.logisticsAmount)}`;
}

function serializeOrderEmailPayload(order: Order): {
  orderReference: string;
  sellerName: string;
  buyerName: string;
  status: string;
  orderCurrency: string;
  productsSubtotal: number;
  logisticsDisplay: string;
  orderTotal: number;
  paymentCurrency: string;
  paymentAmount: number;
  deliveryMethod: string;
  deliveryAddress: string;
  items: Array<{
    productName: string | null;
    attributes: Record<string, unknown> | null;
    quantity: number;
    unit: string | null;
    unitPrice: number;
    subtotal: number;
  }>;
} {
  return {
    orderReference: order.orderReference,
    sellerName: order.seller
      ? order.seller.storeName ?? order.seller.companyName ?? displayUserName(order.seller)
      : 'Seller',
    buyerName: order.buyer ? displayUserName(order.buyer) : 'Buyer',
    status: order.status,
    orderCurrency: order.orderCurrency,
    productsSubtotal: Number(order.productsSubtotal),
    logisticsDisplay: logisticsDisplay(order),
    orderTotal: Number(order.orderTotal),
    paymentCurrency: order.paymentCurrency,
    paymentAmount: Number(order.paymentAmount),
    deliveryMethod: deliveryMethodDisplay(order.deliveryType),
    deliveryAddress: formatAddress(order.deliveryAddressSnapshot),
    items: (order.items ?? []).map((item) => ({
      productName: productNameDisplay(item.productNameSnapshot),
      attributes: item.attributesSnapshot,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.finalUnitPrice),
      subtotal: Number(item.subtotal),
    })),
  };
}

function formatAddress(address: Record<string, unknown>): string {
  return [
    address.recipientName,
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

function isWithinDisputeWindow(order: Order): boolean {
  if (config.disputes.windowDays <= 0) return true;
  const anchor =
    order.delivery?.deliveredAt ??
    order.receivedAt ??
    order.completedAt ??
    (SHIPPED_OR_LATER.includes(order.status) ? order.updatedAt : null);
  if (!anchor) return true;

  const cutoff = new Date(anchor);
  cutoff.setDate(cutoff.getDate() + config.disputes.windowDays);
  return Date.now() <= cutoff.getTime();
}
