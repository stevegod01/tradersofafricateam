import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  requireAuth,
  requirePermission,
} from '../../common/middleware/auth.middleware';
import {
  AdminDisputeQuerySchema,
  AdminDisputeStatusUpdateSchema,
  AssignDisputeSchema,
  CloseDisputeSchema,
  CreateDisputeSchema,
  DisputeMessageSchema,
  DisputeQuerySchema,
  RequestDisputeInformationSchema,
  ResolveDisputeSchema,
} from '../../common/utils/validation.schemas';
import {
  AssignDisputeSwaggerSchema,
  CloseDisputeSwaggerSchema,
  CreateDisputeSwaggerSchema,
  GetAdminDisputeByIdSwaggerSchema,
  GetAdminDisputeMetricsSwaggerSchema,
  GetAdminDisputesSwaggerSchema,
  GetDisputeByIdSwaggerSchema,
  GetDisputesSwaggerSchema,
  RequestDisputeInformationSwaggerSchema,
  ResolveDisputeSwaggerSchema,
  SendDisputeMessageSwaggerSchema,
  StartDisputeReviewSwaggerSchema,
  UploadDisputeEvidenceSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { UploadedFile } from '../../common/utils/file-upload.util';
import { createError } from '../../common/utils/http-error.util';
import { DisputeService } from './dispute.service';

const DisputeParamSchema = z.object({
  disputeId: z.string().uuid(),
});

export async function disputeRoutes(fastify: FastifyInstance): Promise<void> {
  const disputeService = new DisputeService(fastify);

  fastify.post(
    '/evidence-uploads',
    { schema: UploadDisputeEvidenceSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const file = await readMultipartFile(request);
      const result = await disputeService.uploadEvidence(request.dbUser!.id, file);
      return reply.send(result);
    },
  );

  fastify.post(
    '/',
    { schema: CreateDisputeSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = CreateDisputeSchema.parse(request.body ?? {});
      const result = await disputeService.createDispute(request.dbUser!.id, body);
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/',
    { schema: GetDisputesSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = DisputeQuerySchema.parse(request.query ?? {});
      const result = await disputeService.listMyDisputes(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/:disputeId',
    { schema: GetDisputeByIdSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { disputeId } = DisputeParamSchema.parse(request.params);
      const result = await disputeService.getMyDisputeById(
        request.dbUser!.id,
        disputeId,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:disputeId/messages',
    { schema: SendDisputeMessageSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { disputeId } = DisputeParamSchema.parse(request.params);
      const body = DisputeMessageSchema.parse(request.body ?? {});
      const result = await disputeService.sendMessage(
        request.dbUser!.id,
        disputeId,
        body,
      );
      return reply.status(201).send(result);
    },
  );
}

export async function adminDisputeRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const disputeService = new DisputeService(fastify);

  fastify.get(
    '/metrics',
    { schema: GetAdminDisputeMetricsSwaggerSchema, preHandler: requirePermission('disputes.view') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await disputeService.getAdminMetrics();
      return reply.send(result);
    },
  );

  fastify.get(
    '/',
    { schema: GetAdminDisputesSwaggerSchema, preHandler: requirePermission('disputes.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AdminDisputeQuerySchema.parse(request.query ?? {});
      const result = await disputeService.listAdminDisputes(query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/:disputeId',
    { schema: GetAdminDisputeByIdSwaggerSchema, preHandler: requirePermission('disputes.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { disputeId } = DisputeParamSchema.parse(request.params);
      const result = await disputeService.getAdminDisputeById(disputeId);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/:disputeId/assign',
    { schema: AssignDisputeSwaggerSchema, preHandler: requirePermission('disputes.assign') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { disputeId } = DisputeParamSchema.parse(request.params);
      const body = AssignDisputeSchema.parse(request.body ?? {});
      const result = await disputeService.assignDispute(
        disputeId,
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/:disputeId/status',
    { schema: StartDisputeReviewSwaggerSchema, preHandler: requirePermission('disputes.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { disputeId } = DisputeParamSchema.parse(request.params);
      const body = AdminDisputeStatusUpdateSchema.parse(request.body ?? {});
      const result = await disputeService.startReview(
        disputeId,
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:disputeId/request-information',
    {
      schema: RequestDisputeInformationSwaggerSchema,
      preHandler: requirePermission('disputes.request_information'),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { disputeId } = DisputeParamSchema.parse(request.params);
      const body = RequestDisputeInformationSchema.parse(request.body ?? {});
      const result = await disputeService.requestInformation(
        disputeId,
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:disputeId/resolve',
    { schema: ResolveDisputeSwaggerSchema, preHandler: requirePermission('disputes.resolve') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { disputeId } = DisputeParamSchema.parse(request.params);
      const body = ResolveDisputeSchema.parse(request.body ?? {});
      const result = await disputeService.resolveDispute(
        disputeId,
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/:disputeId/close',
    { schema: CloseDisputeSwaggerSchema, preHandler: requirePermission('disputes.close') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { disputeId } = DisputeParamSchema.parse(request.params);
      const body = CloseDisputeSchema.parse(request.body ?? {});
      const result = await disputeService.closeDispute(
        disputeId,
        request.dbAdmin!.id,
        body,
      );
      return reply.send(result);
    },
  );
}

async function readMultipartFile(request: FastifyRequest): Promise<UploadedFile> {
  let file: UploadedFile | undefined;

  for await (const part of request.parts()) {
    if (part.type !== 'file') continue;
    if (file) {
      for await (const _chunk of part.file) {
        // Drain ignored extra files so the multipart parser can finish cleanly.
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

  if (!file) throw createError.badRequest('Evidence file is required.');
  return file;
}
