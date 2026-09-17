import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { createError } from '../../common/utils/http-error.util';
import { UploadedFile } from '../../common/utils/file-upload.util';
import {
  BatchOrderReviewSchema,
  MyReviewsQuerySchema,
  PointsHistoryQuerySchema,
  ProductReviewCreateSchema,
  ProductReviewUpdateSchema,
  ReviewEligibilityQuerySchema,
  ReviewListQuerySchema,
  ReviewResponseCreateSchema,
  ReviewResponseUpdateSchema,
  ReviewVoteSchema,
  SellerReviewCreateSchema,
  SellerReviewUpdateSchema,
} from '../../common/utils/validation.schemas';
import {
  AddProductReviewResponseSwaggerSchema,
  AddSellerReviewResponseSwaggerSchema,
  DeleteProductReviewSwaggerSchema,
  DeleteSellerReviewSwaggerSchema,
  GetMyReviewsSwaggerSchema,
  GetOrderReviewEligibilitySwaggerSchema,
  GetProductReviewsSwaggerSchema,
  GetReviewEligibilitySwaggerSchema,
  GetRewardPointsHistorySwaggerSchema,
  GetRewardPointsSwaggerSchema,
  GetSellerReviewsSwaggerSchema,
  RemoveProductReviewVoteSwaggerSchema,
  RemoveSellerReviewVoteSwaggerSchema,
  SubmitBatchOrderReviewSwaggerSchema,
  SubmitProductReviewSwaggerSchema,
  SubmitSellerReviewSwaggerSchema,
  UpdateProductReviewSwaggerSchema,
  UpdateReviewResponseSwaggerSchema,
  UpdateSellerReviewSwaggerSchema,
  UploadReviewImageSwaggerSchema,
  VoteProductReviewSwaggerSchema,
  VoteSellerReviewSwaggerSchema,
} from '../../common/utils/swagger.schemas';
import { ReviewType } from '../../database/entities/review-eligibility.entity';
import { ReviewService } from './review.service';

const IdParamSchema = z.object({
  reviewId: z.string().uuid(),
});

const ResponseParamSchema = z.object({
  responseId: z.string().uuid(),
});

const OrderParamSchema = z.object({
  orderId: z.string().uuid(),
});

const ProductParamSchema = z.object({
  productId: z.string().uuid(),
});

const SellerParamSchema = z.object({
  sellerId: z.string().uuid(),
});

export async function reviewRoutes(fastify: FastifyInstance): Promise<void> {
  const reviewService = new ReviewService(fastify);

  fastify.get(
    '/reviews/eligibility',
    { schema: GetReviewEligibilitySwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = ReviewEligibilityQuerySchema.parse(request.query);
      const result = await reviewService.listReviewEligibility(
        request.dbUser!.id,
        query,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/orders/:orderId/review-eligibility',
    { schema: GetOrderReviewEligibilitySwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const result = await reviewService.getOrderReviewEligibility(
        request.dbUser!.id,
        orderId,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/reviews/images',
    { schema: UploadReviewImageSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const file = await readMultipartImage(request);
      const result = await reviewService.processReviewImage(file);
      return reply.send(result);
    },
  );

  fastify.post(
    '/reviews/products',
    { schema: SubmitProductReviewSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = ProductReviewCreateSchema.parse(request.body);
      const result = await reviewService.submitProductReview(
        request.dbUser!.id,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/reviews/sellers',
    { schema: SubmitSellerReviewSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = SellerReviewCreateSchema.parse(request.body);
      const result = await reviewService.submitSellerReview(
        request.dbUser!.id,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/reviews/order/:orderId',
    { schema: SubmitBatchOrderReviewSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = OrderParamSchema.parse(request.params);
      const body = BatchOrderReviewSchema.parse(request.body);
      const result = await reviewService.submitOrderReviews(
        request.dbUser!.id,
        orderId,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/reviews/me',
    { schema: GetMyReviewsSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = MyReviewsQuerySchema.parse(request.query);
      const result = await reviewService.getMyReviews(request.dbUser!.id, query);
      return reply.send(result);
    },
  );

  fastify.patch(
    '/reviews/products/:reviewId',
    { schema: UpdateProductReviewSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewId } = IdParamSchema.parse(request.params);
      const body = ProductReviewUpdateSchema.parse(request.body);
      const result = await reviewService.updateProductReview(
        request.dbUser!.id,
        reviewId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.patch(
    '/reviews/sellers/:reviewId',
    { schema: UpdateSellerReviewSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewId } = IdParamSchema.parse(request.params);
      const body = SellerReviewUpdateSchema.parse(request.body);
      const result = await reviewService.updateSellerReview(
        request.dbUser!.id,
        reviewId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.delete(
    '/reviews/products/:reviewId',
    { schema: DeleteProductReviewSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewId } = IdParamSchema.parse(request.params);
      const result = await reviewService.deleteProductReview(
        request.dbUser!.id,
        reviewId,
      );
      return reply.send(result);
    },
  );

  fastify.delete(
    '/reviews/sellers/:reviewId',
    { schema: DeleteSellerReviewSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewId } = IdParamSchema.parse(request.params);
      const result = await reviewService.deleteSellerReview(
        request.dbUser!.id,
        reviewId,
      );
      return reply.send(result);
    },
  );

  fastify.put(
    '/reviews/products/:reviewId/vote',
    { schema: VoteProductReviewSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewId } = IdParamSchema.parse(request.params);
      const body = ReviewVoteSchema.parse(request.body);
      const result = await reviewService.voteReview(
        request.dbUser!.id,
        ReviewType.PRODUCT,
        reviewId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.delete(
    '/reviews/products/:reviewId/vote',
    { schema: RemoveProductReviewVoteSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewId } = IdParamSchema.parse(request.params);
      const result = await reviewService.removeReviewVote(
        request.dbUser!.id,
        ReviewType.PRODUCT,
        reviewId,
      );
      return reply.send(result);
    },
  );

  fastify.put(
    '/reviews/sellers/:reviewId/vote',
    { schema: VoteSellerReviewSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewId } = IdParamSchema.parse(request.params);
      const body = ReviewVoteSchema.parse(request.body);
      const result = await reviewService.voteReview(
        request.dbUser!.id,
        ReviewType.SELLER,
        reviewId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.delete(
    '/reviews/sellers/:reviewId/vote',
    { schema: RemoveSellerReviewVoteSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewId } = IdParamSchema.parse(request.params);
      const result = await reviewService.removeReviewVote(
        request.dbUser!.id,
        ReviewType.SELLER,
        reviewId,
      );
      return reply.send(result);
    },
  );

  fastify.post(
    '/reviews/products/:reviewId/response',
    { schema: AddProductReviewResponseSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewId } = IdParamSchema.parse(request.params);
      const body = ReviewResponseCreateSchema.parse(request.body);
      const result = await reviewService.addReviewResponse(
        request.dbUser!.id,
        ReviewType.PRODUCT,
        reviewId,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/reviews/sellers/:reviewId/response',
    { schema: AddSellerReviewResponseSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { reviewId } = IdParamSchema.parse(request.params);
      const body = ReviewResponseCreateSchema.parse(request.body);
      const result = await reviewService.addReviewResponse(
        request.dbUser!.id,
        ReviewType.SELLER,
        reviewId,
        body,
      );
      return reply.status(201).send(result);
    },
  );

  fastify.patch(
    '/reviews/responses/:responseId',
    { schema: UpdateReviewResponseSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { responseId } = ResponseParamSchema.parse(request.params);
      const body = ReviewResponseUpdateSchema.parse(request.body);
      const result = await reviewService.updateReviewResponse(
        request.dbUser!.id,
        responseId,
        body,
      );
      return reply.send(result);
    },
  );

  fastify.get(
    '/products/:productId/reviews',
    { schema: GetProductReviewsSwaggerSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = ProductParamSchema.parse(request.params);
      const query = ReviewListQuerySchema.parse(request.query);
      const result = await reviewService.getProductReviews(productId, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/sellers/:sellerId/reviews',
    { schema: GetSellerReviewsSwaggerSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sellerId } = SellerParamSchema.parse(request.params);
      const query = ReviewListQuerySchema.parse(request.query);
      const result = await reviewService.getSellerReviews(sellerId, query);
      return reply.send(result);
    },
  );

  fastify.get(
    '/rewards/points',
    { schema: GetRewardPointsSwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await reviewService.getPointsSummary(request.dbUser!.id);
      return reply.send(result);
    },
  );

  fastify.get(
    '/rewards/points/history',
    { schema: GetRewardPointsHistorySwaggerSchema, preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = PointsHistoryQuerySchema.parse(request.query);
      const result = await reviewService.getPointsHistory(request.dbUser!.id, query);
      return reply.send(result);
    },
  );
}

async function readMultipartImage(request: FastifyRequest): Promise<UploadedFile> {
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

  if (!file) {
    throw createError.badRequest('Review image file is required');
  }

  return file;
}
