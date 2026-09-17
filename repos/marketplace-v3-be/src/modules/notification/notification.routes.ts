import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../common/middleware/auth.middleware';
import {
  NotificationPreferenceUpdateSchema,
  NotificationQuerySchema,
} from '../../common/utils/validation.schemas';
import {
  DeleteNotificationSwaggerSchema,
  GetNotificationPreferencesSwaggerSchema,
  GetNotificationsSwaggerSchema,
  GetUnreadNotificationCountSwaggerSchema,
  MarkAllNotificationsReadSwaggerSchema,
  MarkNotificationReadSwaggerSchema,
  UpdateNotificationPreferencesSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { NotificationService } from './notification.service';

const NotificationParamSchema = z.object({
  notificationId: z.string().uuid(),
});

export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  const notificationService = new NotificationService(fastify);

  fastify.get(
    '/',
    { schema: GetNotificationsSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = NotificationQuerySchema.parse(request.query);
      const result = await notificationService.listNotifications(
        request.dbUser!.id,
        query,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/unread-count',
    { schema: GetUnreadNotificationCountSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await notificationService.getUnreadCount(request.dbUser!.id);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/read-all',
    { schema: MarkAllNotificationsReadSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await notificationService.markAllRead(request.dbUser!.id);
      return reply.send(result);
    },
  );

  fastify.get(
    '/preferences',
    { schema: GetNotificationPreferencesSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await notificationService.getPreferences(request.dbUser!.id);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/preferences',
    { schema: UpdateNotificationPreferencesSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = NotificationPreferenceUpdateSchema.parse(request.body);
      const result = await notificationService.updatePreferences(
        request.dbUser!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/:notificationId/read',
    { schema: MarkNotificationReadSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { notificationId } = NotificationParamSchema.parse(request.params);
      const result = await notificationService.markRead(
        request.dbUser!.id,
        notificationId,
      );
      return reply.send(result);
    },
  );

  fastify.delete(
    '/:notificationId',
    { schema: DeleteNotificationSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { notificationId } = NotificationParamSchema.parse(request.params);
      const result = await notificationService.deleteNotification(
        request.dbUser!.id,
        notificationId,
      );
      return reply.send(result);
    },
  );
}
