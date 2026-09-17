import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SellerService } from './seller.service';
import { AddressService } from '../address/address.service';
import {
  AddressCreateSchema as AddressCreateZod,
  UpgradeToSellerSchema,
  UserProfileUpdateSchema,
} from '../../common/utils/validation.schemas';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { UploadedFile } from '../../common/utils/file-upload.util';
import { config } from '../../config';
import {
  CreateAddressSchema,
  GetAddressesSchema,
  GetMyProfileSchema,
  GetVerificationStatusSchema,
  UpdateProfileSchema,
  UpgradeToSellerSchema as UpgradeToSellerSwaggerSchema,
} from '../../common/utils/swagger.schemas';

export async function sellerRoutes(fastify: FastifyInstance): Promise<void> {
  const sellerService = new SellerService(fastify);
  const addressService = new AddressService();

  // POST /users/upgrade-to-seller
  // multipart/form-data — fields + optional companyLogo file
  fastify.post(
    '/upgrade-to-seller',
    { schema: UpgradeToSellerSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parts = request.parts();

      const fields: Record<string, string> = {};
      let logoFile: UploadedFile | undefined;

      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'companyLogo') {
          // Stream file into a buffer
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          logoFile = {
            filename: part.filename,
            mimetype: part.mimetype,
            buffer: Buffer.concat(chunks),
          };

          // Enforce size limit early
          const maxBytes = config.upload.maxFileSizeMb * 1024 * 1024;
          if (logoFile.buffer.length > maxBytes) {
            throw fastify.httpErrors.payloadTooLarge(
              `File must not exceed ${config.upload.maxFileSizeMb}MB`,
            );
          }
        } else if (part.type === 'field') {
          fields[part.fieldname] = part.value as string;
        }
      }

      const dto = UpgradeToSellerSchema.parse(fields);
      const result = await sellerService.upgradeToSeller(
        request.dbUser!.id,
        dto,
        logoFile,
      );

      return reply.status(201).send(result);
    },
  );

  // GET /users/me — get authenticated user profile
  fastify.get(
    '/me',
    { schema: GetMyProfileSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const profile = await sellerService.getMyProfile(request.dbUser!.id);
      return reply.send(profile);
    },
  );

  // PATCH /users/profile
  fastify.patch(
    '/profile',
    { schema: UpdateProfileSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = UserProfileUpdateSchema.parse(request.body);
      const result = await sellerService.updateProfile(request.dbUser!.id, body);
      return reply.send(result);
    },
  );

  // GET /users/me/verification-status
  fastify.get(
    '/me/verification-status',
    { schema: GetVerificationStatusSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await sellerService.getMyVerificationStatus(
        request.dbUser!.id,
      );
      return reply.send({ data: result });
    },
  );

  // GET /users/addresses
  fastify.get(
    '/addresses',
    { schema: GetAddressesSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await addressService.getAddresses(request.dbUser!.id);
      return reply.send(result);
    },
  );

  // POST /users/addresses
  fastify.post(
    '/addresses',
    { schema: CreateAddressSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = AddressCreateZod.parse(request.body);
      const result = await addressService.createAddress(request.dbUser!.id, body);
      return reply.status(201).send(result);
    },
  );
}
