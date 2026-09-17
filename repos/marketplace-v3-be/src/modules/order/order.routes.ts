import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../common/middleware/auth.middleware';
import {
  BuyerLogisticsSchema,
  CancelShipmentSchema,
  ConfirmReceiptSchema,
  CreateShipmentSchema,
  OrderCancellationRequestSchema,
  OrderQuerySchema,
  OrderShipSchema,
  OrderStatusUpdateSchema,
} from '../../common/utils/validation.schemas';
import {
  CancelOrderShipmentSwaggerSchema,
  ConfirmOrderReceiptSchema,
  CreateOrderShipmentSwaggerSchema,
  GetOrderByIdSwaggerSchema,
  GetOrderDeliverySwaggerSchema,
  GetOrdersSchema,
  GetOrderTrackingSwaggerSchema,
  RequestOrderCancellationSchema,
  ShipOrderSchema,
  SubmitBuyerLogisticsSchema,
  UpdateOrderStatusSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { LogisticsService } from '../logistics/logistics.service';
import { OrderService } from './order.service';

const OrderParamSchema = z.object({
  orderId: z.string().uuid(),
});

export async function orderRoutes(fastify: FastifyInstance): Promise<void> {
  const orderService = new OrderService(fastify);
  const logisticsService = new LogisticsService(fastify);

  fastify.get(
    '/',
    { schema: GetOrdersSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = OrderQuerySchema.parse(request.query);
      const result = await orderService.listOrders(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/:orderId/delivery',
    { schema: GetOrderDeliverySwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const result = await logisticsService.getOrderDelivery(request.dbUser!.id, orderId);
      return reply.send(result);
    },
  );

  fastify.get(
    '/:orderId/delivery/tracking',
    { schema: GetOrderTrackingSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const result = await logisticsService.getOrderTracking(request.dbUser!.id, orderId);
      return reply.send(result);
    },
  );

  fastify.post(
    '/:orderId/delivery/create-shipment',
    { schema: CreateOrderShipmentSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const body = CreateShipmentSchema.parse(request.body ?? {});
      const result = await logisticsService.createShipmentForOrder(
        request.dbUser!.id,
        orderId,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/:orderId/delivery/cancel',
    { schema: CancelOrderShipmentSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const body = CancelShipmentSchema.parse(request.body ?? {});
      const result = await logisticsService.cancelShipmentForOrder(
        request.dbUser!.id,
        orderId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/:orderId',
    { schema: GetOrderByIdSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const result = await orderService.getOrderById(request.dbUser!.id, orderId);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/:orderId/status',
    { schema: UpdateOrderStatusSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const body = OrderStatusUpdateSchema.parse(request.body);
      const result = await orderService.updateStatus(
        request.dbUser!.id,
        orderId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/:orderId/ship',
    { schema: ShipOrderSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const body = OrderShipSchema.parse(request.body);
      const result = await orderService.shipOrder(
        request.dbUser!.id,
        orderId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/:orderId/buyer-logistics',
    { schema: SubmitBuyerLogisticsSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const body = BuyerLogisticsSchema.parse(request.body);
      const result = await orderService.submitBuyerLogistics(
        request.dbUser!.id,
        orderId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:orderId/confirm-receipt',
    { schema: ConfirmOrderReceiptSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const body = ConfirmReceiptSchema.parse(request.body ?? {});
      const result = await orderService.confirmReceipt(
        request.dbUser!.id,
        orderId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:orderId/cancellation-request',
    { schema: RequestOrderCancellationSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const body = OrderCancellationRequestSchema.parse(request.body);
      const result = await orderService.requestCancellation(
        request.dbUser!.id,
        orderId,
        body,
      );
      return reply.status(201).send(result);
    },
  );
}
