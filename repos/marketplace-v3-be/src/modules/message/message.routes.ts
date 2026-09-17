import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { createError } from '../../common/utils/http-error.util';
import { UploadedFile } from '../../common/utils/file-upload.util';
import {
  ConversationQuerySchema,
  EditMessageSchema,
  MarkConversationReadSchema,
  MessagesQuerySchema,
  ReportMessageSchema,
  SendMessageSchema,
  StartConversationSchema,
} from '../../common/utils/validation.schemas';
import {
  DeleteMessageSwaggerSchema,
  EditMessageSwaggerSchema,
  GetConversationsSwaggerSchema,
  GetMessagesSwaggerSchema,
  GetMessageUnreadCountSwaggerSchema,
  MarkConversationReadSwaggerSchema,
  ReportMessageSwaggerSchema,
  SendMessageSwaggerSchema,
  StartConversationSwaggerSchema,
  UploadMessageAttachmentSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { MessageService } from './message.service';

const ConversationParamSchema = z.object({
  conversationId: z.string().uuid(),
});

const MessageParamSchema = z.object({
  messageId: z.string().uuid(),
});

export async function messageRoutes(fastify: FastifyInstance): Promise<void> {
  const messageService = new MessageService(fastify);

  fastify.post(
    '/conversations',
    { schema: StartConversationSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = StartConversationSchema.parse(request.body);
      const result = await messageService.startConversation(request.dbUser!.id, body);
      return reply.status(result.created ? 201 : 200).send(result);
    },
  );

  fastify.get(
    '/conversations',
    { schema: GetConversationsSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = ConversationQuerySchema.parse(request.query);
      const result = await messageService.listConversations(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.post(
    '/uploads',
    { schema: UploadMessageAttachmentSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const file = await readMultipartFile(request);
      const result = await messageService.uploadAttachment(request.dbUser!.id, file);
      return reply.send(result);
    },
  );

  fastify.post(
    '/conversations/:conversationId/messages',
    { schema: SendMessageSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conversationId } = ConversationParamSchema.parse(request.params);
      const body = SendMessageSchema.parse(request.body);
      const result = await messageService.sendMessage(
        request.dbUser!.id,
        conversationId,
        body,
      );
      return reply.status(result.idempotent ? 200 : 201).send(result);
    },
  );

  fastify.get(
    '/conversations/:conversationId/messages',
    { schema: GetMessagesSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conversationId } = ConversationParamSchema.parse(request.params);
      const query = MessagesQuerySchema.parse(request.query);
      const result = await messageService.getConversationMessages(
        request.dbUser!.id,
        conversationId,
        query,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/conversations/:conversationId/read',
    { schema: MarkConversationReadSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conversationId } = ConversationParamSchema.parse(request.params);
      const body = MarkConversationReadSchema.parse(request.body ?? {});
      const result = await messageService.markConversationRead(
        request.dbUser!.id,
        conversationId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/unread-count',
    { schema: GetMessageUnreadCountSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await messageService.getUnreadCount(request.dbUser!.id);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/:messageId',
    { schema: EditMessageSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { messageId } = MessageParamSchema.parse(request.params);
      const body = EditMessageSchema.parse(request.body);
      const result = await messageService.editMessage(
        request.dbUser!.id,
        messageId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.delete(
    '/:messageId',
    { schema: DeleteMessageSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { messageId } = MessageParamSchema.parse(request.params);
      const result = await messageService.deleteMessage(request.dbUser!.id, messageId);
      return reply.send(result);
    },
  );

  fastify.post(
    '/:messageId/report',
    { schema: ReportMessageSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { messageId } = MessageParamSchema.parse(request.params);
      const body = ReportMessageSchema.parse(request.body);
      const result = await messageService.reportMessage(
        request.dbUser!.id,
        messageId,
        body,
      );
      return reply.status(201).send(result);
    },
  );
}

async function readMultipartFile(request: FastifyRequest): Promise<UploadedFile> {
  let file: UploadedFile | undefined;

  for await (const part of request.parts()) {
    if (part.type !== 'file') continue;
    if (file) {
      for await (const _chunk of part.file) {
        // Drain ignored extra files so multipart parsing completes cleanly.
      }
      continue;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of part.file) {
      chunks.push(chunk);
    }
    file = {
      filename: part.filename,
      mimetype: part.mimetype,
      buffer: Buffer.concat(chunks),
    };
  }

  if (!file) throw createError.badRequest('Attachment file is required.');
  return file;
}
