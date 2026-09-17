import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { CheckoutService } from './checkout.service';
import {
  ApplyDeliveryProviderSchema as ApplyDeliveryProviderZod,
  CheckoutAddressSchema as CheckoutAddressZod,
  CheckoutCreateSchema as CheckoutCreateZod,
  DeliveryOptionsSchema as DeliveryOptionsZod,
  DeliverySelectionSchema as DeliverySelectionZod,
  PaymentMethodSchema as PaymentMethodZod,
} from '../../common/utils/validation.schemas';
import {
  ApplyDeliveryProviderSchema,
  CheckoutPreviewSchema,
  CreateCheckoutSchema,
  GetDeliveryOptionsSchema,
  GetPaymentMethodsSchema,
  SelectCheckoutAddressSchema,
  SelectDeliveryOptionsSchema,
  SelectPaymentMethodSchema,
} from '../../common/utils/swagger.schemas';
import { requireAuth } from '../../common/middleware/auth.middleware';

export async function checkoutRoutes(fastify: FastifyInstance): Promise<void> {
  const checkoutService = new CheckoutService();

  fastify.patch(
    '/address',
    { schema: SelectCheckoutAddressSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { deliveryAddressId } = CheckoutAddressZod.parse(request.body);
      const result = await checkoutService.selectAddress(
        request.dbUser!.id,
        deliveryAddressId,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/delivery-options',
    { schema: GetDeliveryOptionsSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { deliveryAddressId } = DeliveryOptionsZod.parse(request.body);
      const result = await checkoutService.getDeliveryOptions(
        request.dbUser!.id,
        deliveryAddressId,
        request.dbUser!.selectedLanguage,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/delivery-options/apply-provider',
    { schema: ApplyDeliveryProviderSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { providerId } = ApplyDeliveryProviderZod.parse(request.body);
      const result = await checkoutService.applyProvider(
        request.dbUser!.id,
        providerId,
        request.dbUser!.selectedLanguage,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/delivery-options/select',
    { schema: SelectDeliveryOptionsSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sellerSelections } = DeliverySelectionZod.parse(request.body);
      const result = await checkoutService.selectDeliveryOptions(
        request.dbUser!.id,
        sellerSelections,
        request.dbUser!.selectedLanguage,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/payment-methods',
    { schema: GetPaymentMethodsSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await checkoutService.getPaymentMethods(request.dbUser!.id);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/payment-method',
    { schema: SelectPaymentMethodSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { paymentMethod } = PaymentMethodZod.parse(request.body);
      const result = await checkoutService.selectPaymentMethod(
        request.dbUser!.id,
        paymentMethod,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/preview',
    { schema: CheckoutPreviewSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await checkoutService.preview(
        request.dbUser!.id,
        request.dbUser!.selectedLanguage,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/',
    { schema: CreateCheckoutSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { notes } = CheckoutCreateZod.parse(request.body || {});
      const result = await checkoutService.createCheckout(
        request.dbUser!.id,
        request.dbUser!.selectedLanguage,
        notes,
      );
      return reply.status(201).send(result);
    },
  );
}
