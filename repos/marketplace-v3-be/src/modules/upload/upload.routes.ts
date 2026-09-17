import { BinaryDownloadResponse } from '../../common/utils/swagger-contracts';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  adminHasPermission,
  requireAdmin,
  requireAuth,
} from '../../common/middleware/auth.middleware';
import { createError } from '../../common/utils/http-error.util';
import {
  processUpload,
  UploadedFile,
  UploadValidationError,
} from '../../common/utils/file-upload.util';
import { downloadPrivateBlob } from '../../common/utils/azure-blob-storage.util';
import { UploadMediaSwaggerSchema } from '../../common/utils/swagger.schemas';
import { AppDataSource } from '../../database/data-source';
import { ConversationParticipant } from '../../database/entities/conversation-participant.entity';
import { DisputeEvidence } from '../../database/entities/dispute-evidence.entity';
import {
  DisputeEvidenceUpload,
  DisputeEvidenceUploadStatus,
} from '../../database/entities/dispute-evidence-upload.entity';
import { MessageAttachment } from '../../database/entities/message-attachment.entity';
import { MessageStatus } from '../../database/entities/message.entity';
import {
  MessageUpload,
  MessageUploadStatus,
} from '../../database/entities/message-upload.entity';
import { Payment } from '../../database/entities/payment.entity';

const UploadFieldsSchema = z.object({
  purpose: z
    .enum(['product_image', 'review_image', 'company_logo', 'general'])
    .default('general'),
});

const PATH_PREFIX_BY_PURPOSE: Record<z.infer<typeof UploadFieldsSchema>['purpose'], string> = {
  product_image: 'product-images',
  review_image: 'review-images',
  company_logo: 'seller-logos',
  general: 'general',
};

interface DownloadParams {
  '*': string;
}

const allowedBlobName = /^(?:[A-Za-z0-9._-]+\/)*[0-9]+-[a-f0-9]{16}\.(?:jpg|png|webp|pdf|doc|docx|xls|xlsx|csv|txt)$/;
const publicBlobPrefixes = new Set([
  'general',
  'product-images',
  'review-images',
  'seller-logos',
]);
const sensitiveBlobPrefixes = new Set([
  'dispute-evidence',
  'message-attachments',
  'payment-proofs',
]);

export async function uploadRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/*',
    { schema: { summary: 'Download an uploaded file', tags: ['Uploads'], description: 'Public media is readable anonymously. Payment proofs, message attachments and dispute evidence require an authorized bearer token.', security: [{}, { bearerAuth: [] }], params: { type: 'object', required: ['*'], properties: { '*': { type: 'string', description: 'Stored path, including its folder and filename' } } }, response: BinaryDownloadResponse } },
    async (
      request: FastifyRequest<{ Params: DownloadParams }>,
      reply: FastifyReply,
    ) => {
      const blobName = request.params['*'];
      if (!allowedBlobName.test(blobName)) {
        throw createError.notFound('Upload not found');
      }

      const prefix = blobName.split('/', 1)[0];
      const isPublic = publicBlobPrefixes.has(prefix);
      if (!isPublic && !sensitiveBlobPrefixes.has(prefix)) {
        throw createError.notFound('Upload not found');
      }

      if (!isPublic) {
        const authorized = await authorizeSensitiveDownload(request, reply, blobName, prefix);
        if (reply.sent) return reply;
        if (!authorized) throw createError.notFound('Upload not found');
      }

      try {
        const blob = await downloadPrivateBlob(blobName);
        if (!blob.readableStreamBody) throw createError.notFound('Upload not found');
        const contentType = blob.contentType || 'application/octet-stream';
        const disposition = contentType.startsWith('image/') ? 'inline' : 'attachment';
        return reply
          .header('Content-Type', contentType)
          .header(
            'Cache-Control',
            isPublic ? 'public, max-age=3600' : 'private, no-store',
          )
          .header('Content-Disposition', disposition)
          .header('X-Content-Type-Options', 'nosniff')
          .send(blob.readableStreamBody);
      } catch (error) {
        if (
          typeof error === 'object'
          && error
          && 'statusCode' in error
          && (error as { statusCode?: number }).statusCode === 404
        ) {
          throw createError.notFound('Upload not found');
        }
        throw error;
      }
    },
  );

  fastify.post(
    '/media',
    { schema: UploadMediaSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { file, fields } = await readMultipartUpload(request);
      const body = UploadFieldsSchema.parse(fields);

      try {
        const processed = await processUpload(file, {
          pathPrefix: PATH_PREFIX_BY_PURPOSE[body.purpose],
        });
        return reply.send({
          success: true,
          message: 'File uploaded successfully.',
          data: {
            url: processed.url,
            storedName: processed.storedName,
            mimetype: processed.mimetype,
            sizeBytes: processed.sizeBytes,
            purpose: body.purpose,
          },
        });
      } catch (err) {
        if (err instanceof UploadValidationError) {
          throw createError.badRequest(err.message);
        }
        console.error('[UploadRoutes] Media upload failed:', err);
        throw createError.internal('File storage upload failed');
      }
    },
  );
}

async function authorizeSensitiveDownload(
  request: FastifyRequest,
  reply: FastifyReply,
  blobName: string,
  prefix: string,
): Promise<boolean> {
  try {
    await request.jwtVerify();
  } catch {
    throw createError.unauthorized('Authentication is required');
  }

  if (request.user.tokenType === 'admin') {
    await requireAdmin(request, reply);
    if (reply.sent || !request.dbAdmin) return false;
    if (prefix === 'payment-proofs') {
      return adminHasPermission(request.dbAdmin, 'payments.view');
    }
    return prefix === 'dispute-evidence'
      && adminHasPermission(request.dbAdmin, 'disputes.view');
  }

  await requireAuth(request, reply);
  if (reply.sent || !request.dbUser) return false;

  const userId = request.dbUser.id;
  const fileUrl = `/api/uploads/${blobName}`;

  if (prefix === 'payment-proofs') {
    return AppDataSource.getRepository(Payment).existsBy({
      payerId: userId,
      paymentProofUrl: fileUrl,
    });
  }

  if (prefix === 'dispute-evidence') {
    const stagedUpload = await AppDataSource.getRepository(DisputeEvidenceUpload)
      .findOne({ where: { storedName: blobName } });
    if (
      stagedUpload?.userId === userId
      && stagedUpload.status !== DisputeEvidenceUploadStatus.DELETED
      && (
        stagedUpload.status === DisputeEvidenceUploadStatus.ATTACHED
        || !stagedUpload.expiresAt
        || stagedUpload.expiresAt.getTime() > Date.now()
      )
    ) {
      return true;
    }

    const evidence = await AppDataSource.getRepository(DisputeEvidence).findOne({
      where: { storedName: blobName },
      relations: ['dispute'],
    });
    return Boolean(
      evidence?.dispute
      && (evidence.dispute.buyerId === userId || evidence.dispute.sellerId === userId),
    );
  }

  const upload = await AppDataSource.getRepository(MessageUpload).findOne({
    where: { storedName: blobName },
  });
  if (upload?.status === MessageUploadStatus.DELETED) return false;
  if (
    upload?.status === MessageUploadStatus.UPLOADED
    && upload.userId === userId
  ) return true;

  const attachment = await AppDataSource.getRepository(MessageAttachment).findOne({
    where: { fileUrl },
    relations: ['message'],
  });
  if (!attachment?.message || attachment.message.status === MessageStatus.DELETED) {
    return false;
  }

  return AppDataSource.getRepository(ConversationParticipant).existsBy({
    conversationId: attachment.message.conversationId,
    userId,
  });
}

async function readMultipartUpload(
  request: FastifyRequest,
): Promise<{ file: UploadedFile; fields: Record<string, string> }> {
  const fields: Record<string, string> = {};
  let file: UploadedFile | undefined;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
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
      continue;
    }

    fields[part.fieldname] = String(part.value);
  }

  if (!file) {
    throw createError.badRequest('Upload file is required');
  }

  return { file, fields };
}
