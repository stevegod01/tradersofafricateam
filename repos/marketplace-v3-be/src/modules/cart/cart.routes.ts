import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CartService } from './cart.service';
import {
  CartItemSchema as CartItemZod,
  CartItemUpdateSchema as CartItemUpdateZod,
} from '../../common/utils/validation.schemas';
import {
  AddCartItemSchema,
  ClearCartSchema,
  GetCartSchema,
  RemoveCartItemSchema,
  UpdateCartItemSchema,
} from '../../common/utils/swagger.schemas';
import { requireAuth } from '../../common/middleware/auth.middleware';

const CartItemParamSchema = z.object({
  cartItemId: z.string().uuid(),
});

export async function cartRoutes(fastify: FastifyInstance): Promise<void> {
  const cartService = new CartService();

  fastify.post(
    '/items',
    { schema: AddCartItemSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = CartItemZod.parse(request.body);
      const result = await cartService.addItem(request.dbUser!.id, body);
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/',
    { schema: GetCartSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await cartService.getCart(
        request.dbUser!.id,
        request.dbUser!.selectedLanguage,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/items/:cartItemId',
    { schema: UpdateCartItemSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { cartItemId } = CartItemParamSchema.parse(request.params);
      const { quantity } = CartItemUpdateZod.parse(request.body);
      const result = await cartService.updateItem(
        request.dbUser!.id,
        cartItemId,
        quantity,
      );
      return reply.send(result);
    },
  );

  fastify.delete(
    '/items/:cartItemId',
    { schema: RemoveCartItemSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { cartItemId } = CartItemParamSchema.parse(request.params);
      const result = await cartService.removeItem(request.dbUser!.id, cartItemId);
      return reply.send(result);
    },
  );

  fastify.delete(
    '/',
    { schema: ClearCartSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await cartService.clearCart(request.dbUser!.id);
      return reply.send(result);
    },
  );
}
