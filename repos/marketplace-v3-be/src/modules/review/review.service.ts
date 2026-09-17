import { RewardService } from '../reward/reward.service';
import { RewardRule } from '../../database/entities/reward-rule.entity';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { Brackets, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { OrderItem, OrderProductNameSnapshot } from '../../database/entities/order-item.entity';
import { PointsSourceType, PointsTransaction, PointsTransactionType } from '../../database/entities/points-transaction.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductReview, ReviewStatus } from '../../database/entities/product-review.entity';
import { ReviewAuditActorType, ReviewAuditEvent } from '../../database/entities/review-audit-event.entity';
import { ReviewEligibility, ReviewEligibilityStatus, ReviewType } from '../../database/entities/review-eligibility.entity';
import { ReviewResponse, ReviewResponseStatus } from '../../database/entities/review-response.entity';
import { ReviewVote, ReviewVoteValue } from '../../database/entities/review-vote.entity';
import { RewardSetting } from '../../database/entities/reward-setting.entity';
import { SellerReview } from '../../database/entities/seller-review.entity';
import { User } from '../../database/entities/user.entity';
import { createError } from '../../common/utils/http-error.util';
import { toNumber } from '../../common/utils/pricing.util';
import { processUpload, UploadValidationError, UploadedFile } from '../../common/utils/file-upload.util';
import {
  AdminReviewQueryDto,
  BatchOrderReviewDto,
  MyReviewsQueryDto,
  PointsAdjustmentDto,
  PointsHistoryQueryDto,
  ProductReviewCreateDto,
  ProductReviewUpdateDto,
  ReviewEligibilityQueryDto,
  ReviewListQueryDto,
  ReviewModerationStatusDto,
  ReviewResponseCreateDto,
  ReviewResponseUpdateDto,
  ReviewVoteDto,
  RewardSettingsUpdateDto,
  SellerReviewCreateDto,
  SellerReviewUpdateDto,
} from '../../common/utils/validation.schemas';
import {
  sendLowRatingReviewEmail,
  sendReviewReminderEmail,
  sendReviewResponseEmail,
  sendReviewSubmittedEmail,
} from '../../common/utils/email.service';
import { onOrderEvent, OrderEventPayload } from '../order/order.events';
import { emitReviewEvent } from './review.events';

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ReviewRewardSettings = {
  productReviewPoints: number;
  sellerReviewPoints: number;
  reviewWithImageBonus: number;
  minimumReviewCharacters: number;
  maxReviewRewardPerOrder: number;
  reviewSubmissionWindowDays: number;
  reviewReminderDays: number;
  maxReviewImages: number;
};

type ModerationResult = {
  status: ReviewStatus;
  flags: string[] | null;
  reason: string | null;
};

type PointsAwardResult = {
  pointsAwarded: number;
  transactionId: string | null;
};

type ProductReviewWithRelations = ProductReview & {
  buyer?: User;
  seller?: User;
  product?: Product | null;
  order?: Order;
  orderItem?: OrderItem;
};

type SellerReviewWithRelations = SellerReview & {
  buyer?: User;
  seller?: User;
  order?: Order;
};

const REVIEW_REWARD_SETTING_KEYS: Record<keyof ReviewRewardSettings, string> = {
  productReviewPoints: 'product_review_points',
  sellerReviewPoints: 'seller_review_points',
  reviewWithImageBonus: 'review_with_image_bonus',
  minimumReviewCharacters: 'minimum_review_characters',
  maxReviewRewardPerOrder: 'max_review_reward_per_order',
  reviewSubmissionWindowDays: 'review_submission_window_days',
  reviewReminderDays: 'review_reminder_days',
  maxReviewImages: 'max_review_images',
};

const FLAG_RULES: Array<{ flag: string; pattern: RegExp }> = [
  { flag: 'personal_contact_info', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { flag: 'personal_contact_info', pattern: /(\+?\d[\d\s().-]{7,}\d)/ },
  { flag: 'spam', pattern: /(https?:\/\/|www\.)/i },
  { flag: 'repeated_content', pattern: /\b(\w{3,})\b(?:\W+\1\b){3,}/i },
  { flag: 'abusive_language', pattern: /\b(fraudster|scammer|idiot|stupid)\b/i },
];

let orderEventHandlersRegistered = false;

export function registerReviewOrderEventHandlers(fastify?: FastifyInstance): void {
  if (orderEventHandlersRegistered) return;
  orderEventHandlersRegistered = true;

  const reviewService = new ReviewService(fastify);
  onOrderEvent('ORDER_COMPLETED', async (payload) => {
    await reviewService.createEligibilityFromCompletedOrder(payload);
  });
}

export class ReviewService {
  private eligibilityRepo = AppDataSource.getRepository(ReviewEligibility);
  private productReviewRepo = AppDataSource.getRepository(ProductReview);
  private sellerReviewRepo = AppDataSource.getRepository(SellerReview);
  private voteRepo = AppDataSource.getRepository(ReviewVote);
  private responseRepo = AppDataSource.getRepository(ReviewResponse);
  private settingRepo = AppDataSource.getRepository(RewardSetting);
  private pointsRepo = AppDataSource.getRepository(PointsTransaction);
  private userRepo = AppDataSource.getRepository(User);
  private productRepo = AppDataSource.getRepository(Product);
  private orderRepo = AppDataSource.getRepository(Order);

  constructor(private readonly fastify?: FastifyInstance) {}

  async createEligibilityFromCompletedOrder(
    payload: OrderEventPayload,
  ): Promise<{ success: true; created: number }> {
    const order = await this.orderRepo.findOne({
      where: { id: payload.orderId },
      relations: ['buyer', 'seller', 'items'],
    });

    if (!order || order.status !== OrderStatus.COMPLETED) {
      return { success: true, created: 0 };
    }

    const settings = await this.getEffectiveRewardSettings();
    const eligibleAt = order.completedAt ?? payload.completedAt ?? new Date();
    const expiresAt =
      settings.reviewSubmissionWindowDays > 0
        ? addDays(eligibleAt, settings.reviewSubmissionWindowDays)
        : null;

    const records = [
      ...(order.items ?? []).map((item) =>
        ({
          id: crypto.randomUUID(),
          eligibilityKey: `${ReviewType.PRODUCT}:${order.id}:${item.id}`,
          orderId: order.id,
          orderItemId: item.id,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          productId: item.productId,
          reviewType: ReviewType.PRODUCT,
          status: ReviewEligibilityStatus.ELIGIBLE,
          reviewId: null,
          eligibleAt,
          expiresAt,
          submittedAt: null,
        }),
      ),
      {
        id: crypto.randomUUID(),
        eligibilityKey: `${ReviewType.SELLER}:${order.id}:${order.sellerId}`,
        orderId: order.id,
        orderItemId: null,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        productId: null,
        reviewType: ReviewType.SELLER,
        status: ReviewEligibilityStatus.ELIGIBLE,
        reviewId: null,
        eligibleAt,
        expiresAt,
        submittedAt: null,
      },
    ];

    let created = 0;
    await AppDataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(ReviewEligibility)
        .values(records)
        .orIgnore()
        .execute();

      created = result.identifiers.length;
      await this.recordAudit(manager, {
        eventType: 'REVIEW_ELIGIBILITY_CREATED',
        actorType: ReviewAuditActorType.SYSTEM,
        actorId: null,
        reviewType: null,
        reviewId: null,
        eligibilityId: null,
        pointsTransactionId: null,
        metadata: {
          orderId: order.id,
          created,
          attempted: records.length,
          expiresAt: expiresAt?.toISOString() ?? null,
        },
      });
    });

    emitReviewEvent('REVIEW_ELIGIBILITY_CREATED', {
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      metadata: { created, attempted: records.length },
    });

    return { success: true, created };
  }

  async listReviewEligibility(
    buyerId: string,
    query: ReviewEligibilityQueryDto,
  ): Promise<{ success: true; data: unknown[]; pagination: Pagination }> {
    await this.expireEligibleReviews();

    const qb = this.eligibilityRepo
      .createQueryBuilder('eligibility')
      .leftJoinAndSelect('eligibility.order', 'order')
      .leftJoinAndSelect('eligibility.orderItem', 'orderItem')
      .leftJoinAndSelect('eligibility.seller', 'seller')
      .leftJoinAndSelect('eligibility.product', 'product')
      .where('eligibility.buyerId = :buyerId', { buyerId })
      .orderBy('eligibility.eligibleAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.status) {
      qb.andWhere('eligibility.status = :status', { status: query.status });
    }

    if (query.orderId) {
      qb.andWhere('eligibility.orderId = :orderId', { orderId: query.orderId });
    }

    const [eligibilities, total] = await qb.getManyAndCount();
    return {
      success: true,
      data: eligibilities.map((eligibility) => this.serializeEligibility(eligibility)),
      pagination: paginate(query.page, query.limit, total),
    };
  }

  async getOrderReviewEligibility(
    buyerId: string,
    orderId: string,
  ): Promise<{ success: true; data: unknown[] }> {
    await this.ensureBuyerOrder(orderId, buyerId);
    await this.expireEligibleReviews();

    const eligibilities = await this.eligibilityRepo
      .createQueryBuilder('eligibility')
      .leftJoinAndSelect('eligibility.order', 'order')
      .leftJoinAndSelect('eligibility.orderItem', 'orderItem')
      .leftJoinAndSelect('eligibility.seller', 'seller')
      .leftJoinAndSelect('eligibility.product', 'product')
      .where('eligibility.orderId = :orderId', { orderId })
      .andWhere('eligibility.buyerId = :buyerId', { buyerId })
      .orderBy('eligibility.reviewType', 'ASC')
      .addOrderBy('eligibility.createdAt', 'ASC')
      .getMany();

    return {
      success: true,
      data: eligibilities.map((eligibility) => this.serializeEligibility(eligibility)),
    };
  }

  async submitProductReview(
    buyerId: string,
    dto: ProductReviewCreateDto,
  ): Promise<{ success: true; message: string; data: unknown }> {
    const settings = await this.getEffectiveRewardSettings();
    this.assertImagesAllowed(dto.images, settings);

    let reviewId = '';
    let pointsAwarded = 0;

    await AppDataSource.transaction(async (manager) => {
      const eligibility = await this.requireEligibilityForSubmission(
        manager,
        buyerId,
        dto.eligibilityId,
        ReviewType.PRODUCT,
      );

      if (!eligibility.orderItemId || !eligibility.productId) {
        throw createError.conflict('Product review eligibility is incomplete');
      }

      await this.ensureCompletedOrder(manager, eligibility.orderId);
      await this.ensureNoProductReviewForEligibility(manager, eligibility.id);

      const moderation = this.moderateReview(dto.comment, dto.title ?? null);
      const review = await manager.save(
        ProductReview,
        manager.create(ProductReview, {
          eligibilityId: eligibility.id,
          orderId: eligibility.orderId,
          orderItemId: eligibility.orderItemId,
          buyerId,
          sellerId: eligibility.sellerId,
          productId: eligibility.productId,
          rating: dto.rating,
          title: dto.title ?? null,
          comment: dto.comment,
          images: dto.images,
          status: moderation.status,
          isVerifiedPurchase: true,
          pointsAwarded: 0,
          helpfulCount: 0,
          notHelpfulCount: 0,
          moderationReason: moderation.reason,
          moderationFlags: moderation.flags,
        }),
      );

      const award = await this.awardReviewPoints(manager, {
        buyerId,
        orderId: eligibility.orderId,
        reviewType: ReviewType.PRODUCT,
        reviewId: review.id,
        comment: review.comment,
        status: review.status,
        basePoints: settings.productReviewPoints,
        bonusPoints: review.images.length > 0 ? settings.reviewWithImageBonus : 0,
        settings,
      });
      pointsAwarded = award.pointsAwarded;

      if (pointsAwarded > 0) {
        await manager.update(ProductReview, review.id, { pointsAwarded });
      }

      await manager.update(ReviewEligibility, eligibility.id, {
        status: ReviewEligibilityStatus.SUBMITTED,
        reviewId: review.id,
        submittedAt: new Date(),
      });

      await this.recalculateProductRating(manager, eligibility.productId);
      await this.recordAudit(manager, {
        eventType: 'PRODUCT_REVIEW_SUBMITTED',
        actorType: ReviewAuditActorType.BUYER,
        actorId: buyerId,
        reviewType: ReviewType.PRODUCT,
        reviewId: review.id,
        eligibilityId: eligibility.id,
        pointsTransactionId: award.transactionId,
        metadata: {
          rating: review.rating,
          status: review.status,
          pointsAwarded,
          flags: moderation.flags,
        },
      });

      reviewId = review.id;
    });

    const review = await this.loadProductReviewOrFail(reviewId);
    await this.sendReviewSubmissionNotifications(ReviewType.PRODUCT, review, pointsAwarded);
    emitReviewEvent('REVIEW_SUBMITTED', {
      reviewType: ReviewType.PRODUCT,
      reviewId,
      eligibilityId: dto.eligibilityId,
      orderId: review.orderId,
      buyerId,
      sellerId: review.sellerId,
      productId: review.productId,
      metadata: { pointsAwarded },
    });

    return {
      success: true,
      message: 'Product review submitted successfully.',
      data: await this.serializeProductReviewWithResponse(review),
    };
  }

  async submitSellerReview(
    buyerId: string,
    dto: SellerReviewCreateDto,
  ): Promise<{ success: true; message: string; data: unknown }> {
    const settings = await this.getEffectiveRewardSettings();
    let reviewId = '';
    let pointsAwarded = 0;

    await AppDataSource.transaction(async (manager) => {
      const eligibility = await this.requireEligibilityForSubmission(
        manager,
        buyerId,
        dto.eligibilityId,
        ReviewType.SELLER,
      );

      await this.ensureCompletedOrder(manager, eligibility.orderId);
      await this.ensureNoSellerReviewForEligibility(manager, eligibility.id);

      const moderation = this.moderateReview(dto.comment, null);
      const review = await manager.save(
        SellerReview,
        manager.create(SellerReview, {
          eligibilityId: eligibility.id,
          orderId: eligibility.orderId,
          buyerId,
          sellerId: eligibility.sellerId,
          overallRating: dto.overallRating,
          communicationRating: dto.communicationRating ?? null,
          fulfillmentRating: dto.fulfillmentRating ?? null,
          reliabilityRating: dto.reliabilityRating ?? null,
          comment: dto.comment,
          status: moderation.status,
          isVerifiedTransaction: true,
          pointsAwarded: 0,
          helpfulCount: 0,
          notHelpfulCount: 0,
          moderationReason: moderation.reason,
          moderationFlags: moderation.flags,
        }),
      );

      const award = await this.awardReviewPoints(manager, {
        buyerId,
        orderId: eligibility.orderId,
        reviewType: ReviewType.SELLER,
        reviewId: review.id,
        comment: review.comment,
        status: review.status,
        basePoints: settings.sellerReviewPoints,
        bonusPoints: 0,
        settings,
      });
      pointsAwarded = award.pointsAwarded;

      if (pointsAwarded > 0) {
        await manager.update(SellerReview, review.id, { pointsAwarded });
      }

      await manager.update(ReviewEligibility, eligibility.id, {
        status: ReviewEligibilityStatus.SUBMITTED,
        reviewId: review.id,
        submittedAt: new Date(),
      });

      await this.recalculateSellerRating(manager, eligibility.sellerId);
      await this.recordAudit(manager, {
        eventType: 'SELLER_REVIEW_SUBMITTED',
        actorType: ReviewAuditActorType.BUYER,
        actorId: buyerId,
        reviewType: ReviewType.SELLER,
        reviewId: review.id,
        eligibilityId: eligibility.id,
        pointsTransactionId: award.transactionId,
        metadata: {
          rating: review.overallRating,
          status: review.status,
          pointsAwarded,
          flags: moderation.flags,
        },
      });

      reviewId = review.id;
    });

    const review = await this.loadSellerReviewOrFail(reviewId);
    await this.sendReviewSubmissionNotifications(ReviewType.SELLER, review, pointsAwarded);
    emitReviewEvent('REVIEW_SUBMITTED', {
      reviewType: ReviewType.SELLER,
      reviewId,
      eligibilityId: dto.eligibilityId,
      orderId: review.orderId,
      buyerId,
      sellerId: review.sellerId,
      productId: null,
      metadata: { pointsAwarded },
    });

    return {
      success: true,
      message: 'Seller review submitted successfully.',
      data: await this.serializeSellerReviewWithResponse(review),
    };
  }

  async submitOrderReviews(
    buyerId: string,
    orderId: string,
    dto: BatchOrderReviewDto,
  ): Promise<{ success: true; message: string; data: unknown }> {
    await this.ensureBuyerOrder(orderId, buyerId);

    for (const review of dto.productReviews) {
      await this.assertEligibilityBelongsToOrder(buyerId, orderId, review.eligibilityId);
    }
    if (dto.sellerReview) {
      await this.assertEligibilityBelongsToOrder(buyerId, orderId, dto.sellerReview.eligibilityId);
    }

    const productReviews = [];
    for (const review of dto.productReviews) {
      productReviews.push((await this.submitProductReview(buyerId, review)).data);
    }

    const sellerReview = dto.sellerReview
      ? (await this.submitSellerReview(buyerId, dto.sellerReview)).data
      : null;

    return {
      success: true,
      message: 'Order reviews submitted successfully.',
      data: {
        orderId,
        productReviews,
        sellerReview,
      },
    };
  }

  async getProductReviews(
    productId: string,
    query: ReviewListQueryDto,
  ): Promise<{ success: true; data: unknown[]; summary: unknown; pagination: Pagination }> {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw createError.notFound('Product not found');

    const qb = this.productReviewRepo
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.buyer', 'buyer')
      .leftJoinAndSelect('review.seller', 'seller')
      .leftJoinAndSelect('review.product', 'product')
      .leftJoinAndSelect('review.orderItem', 'orderItem')
      .where('review.productId = :productId', { productId })
      .andWhere('review.status = :status', { status: ReviewStatus.PUBLISHED })
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.rating) {
      qb.andWhere('review.rating = :rating', { rating: query.rating });
    }
    if (query.withImages) {
      qb.andWhere('JSON_LENGTH(review.images) > 0');
    }

    this.applyReviewSort(qb, 'review.rating', query.sortBy);
    const [reviews, total] = await qb.getManyAndCount();
    const responseMap = await this.loadResponseMap(ReviewType.PRODUCT, reviews.map((review) => review.id));

    return {
      success: true,
      data: reviews.map((review) => this.serializeProductReview(review, responseMap.get(review.id))),
      summary: {
        productId,
        averageRating: toNumber(product.averageRating),
        totalReviews: product.totalReviews,
      },
      pagination: paginate(query.page, query.limit, total),
    };
  }

  async getSellerReviews(
    sellerId: string,
    query: ReviewListQueryDto,
  ): Promise<{ success: true; data: unknown[]; summary: unknown; pagination: Pagination }> {
    const seller = await this.userRepo.findOne({ where: { id: sellerId } });
    if (!seller) throw createError.notFound('Seller not found');

    const qb = this.sellerReviewRepo
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.buyer', 'buyer')
      .leftJoinAndSelect('review.seller', 'seller')
      .where('review.sellerId = :sellerId', { sellerId })
      .andWhere('review.status = :status', { status: ReviewStatus.PUBLISHED })
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.rating) {
      qb.andWhere('review.overallRating = :rating', { rating: query.rating });
    }

    this.applyReviewSort(qb, 'review.overallRating', query.sortBy);
    const [reviews, total] = await qb.getManyAndCount();
    const responseMap = await this.loadResponseMap(ReviewType.SELLER, reviews.map((review) => review.id));

    return {
      success: true,
      data: reviews.map((review) => this.serializeSellerReview(review, responseMap.get(review.id))),
      summary: {
        sellerId,
        averageRating: toNumber(seller.totalAverageReviews),
        totalReviews: seller.totalReviewCount,
      },
      pagination: paginate(query.page, query.limit, total),
    };
  }

  async getMyReviews(
    buyerId: string,
    query: MyReviewsQueryDto,
  ): Promise<{ success: true; data: unknown[]; pagination: Pagination }> {
    if (query.type === ReviewType.PRODUCT) {
      return this.listBuyerProductReviews(buyerId, query);
    }
    if (query.type === ReviewType.SELLER) {
      return this.listBuyerSellerReviews(buyerId, query);
    }

    const productReviews = await this.buildBuyerProductReviewQuery(buyerId, query)
      .take(query.page * query.limit)
      .getMany();
    const sellerReviews = await this.buildBuyerSellerReviewQuery(buyerId, query)
      .take(query.page * query.limit)
      .getMany();
    const total =
      (await this.buildBuyerProductReviewQuery(buyerId, query).getCount()) +
      (await this.buildBuyerSellerReviewQuery(buyerId, query).getCount());

    const productResponses = await this.loadResponseMap(
      ReviewType.PRODUCT,
      productReviews.map((review) => review.id),
    );
    const sellerResponses = await this.loadResponseMap(
      ReviewType.SELLER,
      sellerReviews.map((review) => review.id),
    );
    const data = [
      ...productReviews.map((review) =>
        this.serializeProductReview(review, productResponses.get(review.id)),
      ),
      ...sellerReviews.map((review) =>
        this.serializeSellerReview(review, sellerResponses.get(review.id)),
      ),
    ]
      .sort(sortSerializedReviews)
      .slice((query.page - 1) * query.limit, query.page * query.limit);

    return { success: true, data, pagination: paginate(query.page, query.limit, total) };
  }

  async updateProductReview(
    buyerId: string,
    reviewId: string,
    dto: ProductReviewUpdateDto,
  ): Promise<{ success: true; message: string; data: unknown }> {
    const settings = await this.getEffectiveRewardSettings();
    if (dto.images) this.assertImagesAllowed(dto.images, settings);

    await AppDataSource.transaction(async (manager) => {
      const review = await this.loadProductReviewForUpdate(manager, reviewId);
      this.assertBuyerOwnsReview(review, buyerId);
      this.assertReviewEditable(review.status);

      const nextComment = dto.comment ?? review.comment;
      const nextTitle = dto.title !== undefined ? dto.title ?? null : review.title;
      const moderation = this.moderateReview(nextComment, nextTitle);
      const nextStatus =
        review.status === ReviewStatus.HIDDEN ? ReviewStatus.HIDDEN : moderation.status;

      await manager.update(ProductReview, review.id, {
        ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
        ...(dto.title !== undefined ? { title: dto.title ?? null } : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
        ...(dto.images !== undefined ? { images: dto.images } : {}),
        status: nextStatus,
        moderationReason: moderation.reason,
        moderationFlags: moderation.flags,
      });
      await this.recalculateProductRating(manager, review.productId);
      await this.recordAudit(manager, {
        eventType: 'PRODUCT_REVIEW_UPDATED',
        actorType: ReviewAuditActorType.BUYER,
        actorId: buyerId,
        reviewType: ReviewType.PRODUCT,
        reviewId: review.id,
        eligibilityId: review.eligibilityId,
        pointsTransactionId: null,
        metadata: { previousStatus: review.status, status: nextStatus },
      });
    });

    return {
      success: true,
      message: 'Product review updated successfully.',
      data: await this.serializeProductReviewWithResponse(
        await this.loadProductReviewOrFail(reviewId),
      ),
    };
  }

  async updateSellerReview(
    buyerId: string,
    reviewId: string,
    dto: SellerReviewUpdateDto,
  ): Promise<{ success: true; message: string; data: unknown }> {
    await AppDataSource.transaction(async (manager) => {
      const review = await this.loadSellerReviewForUpdate(manager, reviewId);
      this.assertBuyerOwnsReview(review, buyerId);
      this.assertReviewEditable(review.status);

      const nextComment = dto.comment ?? review.comment;
      const moderation = this.moderateReview(nextComment, null);
      const nextStatus =
        review.status === ReviewStatus.HIDDEN ? ReviewStatus.HIDDEN : moderation.status;

      await manager.update(SellerReview, review.id, {
        ...(dto.overallRating !== undefined ? { overallRating: dto.overallRating } : {}),
        ...(dto.communicationRating !== undefined
          ? { communicationRating: dto.communicationRating ?? null }
          : {}),
        ...(dto.fulfillmentRating !== undefined
          ? { fulfillmentRating: dto.fulfillmentRating ?? null }
          : {}),
        ...(dto.reliabilityRating !== undefined
          ? { reliabilityRating: dto.reliabilityRating ?? null }
          : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
        status: nextStatus,
        moderationReason: moderation.reason,
        moderationFlags: moderation.flags,
      });
      await this.recalculateSellerRating(manager, review.sellerId);
      await this.recordAudit(manager, {
        eventType: 'SELLER_REVIEW_UPDATED',
        actorType: ReviewAuditActorType.BUYER,
        actorId: buyerId,
        reviewType: ReviewType.SELLER,
        reviewId: review.id,
        eligibilityId: review.eligibilityId,
        pointsTransactionId: null,
        metadata: { previousStatus: review.status, status: nextStatus },
      });
    });

    return {
      success: true,
      message: 'Seller review updated successfully.',
      data: await this.serializeSellerReviewWithResponse(
        await this.loadSellerReviewOrFail(reviewId),
      ),
    };
  }

  async deleteProductReview(
    buyerId: string,
    reviewId: string,
  ): Promise<{ success: true; message: string }> {
    await AppDataSource.transaction(async (manager) => {
      const review = await this.loadProductReviewForUpdate(manager, reviewId);
      this.assertBuyerOwnsReview(review, buyerId);
      if (review.status === ReviewStatus.DELETED) return;

      await manager.update(ProductReview, review.id, { status: ReviewStatus.DELETED });
      await this.recalculateProductRating(manager, review.productId);
      await this.recordAudit(manager, {
        eventType: 'PRODUCT_REVIEW_DELETED',
        actorType: ReviewAuditActorType.BUYER,
        actorId: buyerId,
        reviewType: ReviewType.PRODUCT,
        reviewId: review.id,
        eligibilityId: review.eligibilityId,
        pointsTransactionId: null,
        metadata: null,
      });
    });

    return { success: true, message: 'Product review deleted successfully.' };
  }

  async deleteSellerReview(
    buyerId: string,
    reviewId: string,
  ): Promise<{ success: true; message: string }> {
    await AppDataSource.transaction(async (manager) => {
      const review = await this.loadSellerReviewForUpdate(manager, reviewId);
      this.assertBuyerOwnsReview(review, buyerId);
      if (review.status === ReviewStatus.DELETED) return;

      await manager.update(SellerReview, review.id, { status: ReviewStatus.DELETED });
      await this.recalculateSellerRating(manager, review.sellerId);
      await this.recordAudit(manager, {
        eventType: 'SELLER_REVIEW_DELETED',
        actorType: ReviewAuditActorType.BUYER,
        actorId: buyerId,
        reviewType: ReviewType.SELLER,
        reviewId: review.id,
        eligibilityId: review.eligibilityId,
        pointsTransactionId: null,
        metadata: null,
      });
    });

    return { success: true, message: 'Seller review deleted successfully.' };
  }

  async voteReview(
    userId: string,
    reviewType: ReviewType,
    reviewId: string,
    dto: ReviewVoteDto,
  ): Promise<{ success: true; message: string; data: unknown }> {
    await AppDataSource.transaction(async (manager) => {
      await this.ensureReviewCanBeVoted(manager, reviewType, reviewId, userId);

      const existing = await manager.findOne(ReviewVote, {
        where: { reviewType, reviewId, userId },
      });

      if (existing) {
        await manager.update(ReviewVote, existing.id, { vote: dto.vote as ReviewVoteValue });
      } else {
        await manager.save(
          ReviewVote,
          manager.create(ReviewVote, {
            reviewType,
            reviewId,
            userId,
            vote: dto.vote as ReviewVoteValue,
          }),
        );
      }
      await this.refreshVoteCounts(manager, reviewType, reviewId);
    });

    return {
      success: true,
      message: 'Review vote recorded successfully.',
      data: await this.getReviewVoteCounts(reviewType, reviewId),
    };
  }

  async removeReviewVote(
    userId: string,
    reviewType: ReviewType,
    reviewId: string,
  ): Promise<{ success: true; message: string; data: unknown }> {
    await AppDataSource.transaction(async (manager) => {
      await manager.delete(ReviewVote, { reviewType, reviewId, userId });
      await this.refreshVoteCounts(manager, reviewType, reviewId);
    });

    return {
      success: true,
      message: 'Review vote removed successfully.',
      data: await this.getReviewVoteCounts(reviewType, reviewId),
    };
  }

  async addReviewResponse(
    sellerId: string,
    reviewType: ReviewType,
    reviewId: string,
    dto: ReviewResponseCreateDto,
  ): Promise<{ success: true; message: string; data: unknown }> {
    let responseId = '';
    let buyerEmail: string | null = null;
    let buyerFirstName = '';
    let subjectName = 'your review';

    await AppDataSource.transaction(async (manager) => {
      const review = await this.requireReviewForSellerResponse(
        manager,
        reviewType,
        reviewId,
        sellerId,
      );

      const existing = await manager.findOne(ReviewResponse, {
        where: { reviewType, reviewId, sellerId },
      });
      if (existing && existing.status !== ReviewResponseStatus.DELETED) {
        throw createError.conflict('A seller response already exists for this review');
      }

      const response = await manager.save(
        ReviewResponse,
        manager.create(ReviewResponse, {
          reviewType,
          reviewId,
          sellerId,
          comment: dto.comment,
          status: ReviewResponseStatus.PUBLISHED,
        }),
      );

      responseId = response.id;
      buyerEmail = review.buyer?.email ?? null;
      buyerFirstName = review.buyer?.firstName ?? '';
      subjectName =
        reviewType === ReviewType.PRODUCT
          ? this.productReviewSubject(review as ProductReviewWithRelations)
          : this.sellerReviewSubject(review as SellerReviewWithRelations);

      await this.recordAudit(manager, {
        eventType: 'REVIEW_RESPONSE_CREATED',
        actorType: ReviewAuditActorType.SELLER,
        actorId: sellerId,
        reviewType,
        reviewId,
        eligibilityId: null,
        pointsTransactionId: null,
        metadata: { responseId },
      });
    });

    if (buyerEmail) {
      await sendReviewResponseEmail(buyerEmail, buyerFirstName, {
        reviewType,
        subjectName,
      });
    }

    emitReviewEvent('REVIEW_RESPONSE_CREATED', {
      reviewType,
      reviewId,
      sellerId,
      metadata: { responseId },
    });

    return {
      success: true,
      message: 'Review response created successfully.',
      data: this.serializeReviewResponse(await this.loadResponseOrFail(responseId)),
    };
  }

  async updateReviewResponse(
    sellerId: string,
    responseId: string,
    dto: ReviewResponseUpdateDto,
  ): Promise<{ success: true; message: string; data: unknown }> {
    const response = await this.responseRepo.findOne({ where: { id: responseId } });
    if (!response || response.status === ReviewResponseStatus.DELETED) {
      throw createError.notFound('Review response not found');
    }
    if (response.sellerId !== sellerId) {
      throw createError.forbidden('Only the responding seller can update this response');
    }

    await this.responseRepo.update(response.id, { comment: dto.comment });
    return {
      success: true,
      message: 'Review response updated successfully.',
      data: this.serializeReviewResponse(await this.loadResponseOrFail(response.id)),
    };
  }

  async processReviewImage(
    file: UploadedFile,
  ): Promise<{ success: true; message: string; data: unknown }> {
    let processed;
    try {
      processed = await processUpload(file, {
        allowedMimeTypes: config.reviews.imageAllowedMimeTypes,
        maxFileSizeMb: config.reviews.imageMaxFileSizeMb,
        pathPrefix: 'review-images',
      });
    } catch (err) {
      if (err instanceof UploadValidationError) {
        throw createError.badRequest(err.message);
      }
      console.error('[ReviewService] Review image upload failed:', err);
      throw createError.internal('File storage upload failed');
    }

    return {
      success: true,
      message: 'Review image uploaded successfully.',
      data: {
        url: processed.url,
        mimetype: processed.mimetype,
        sizeBytes: processed.sizeBytes,
      },
    };
  }

  async getPointsSummary(
    userId: string,
  ): Promise<{ success: true; data: unknown }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw createError.notFound('User not found');

    const rows = await this.pointsRepo
      .createQueryBuilder('transaction')
      .select('transaction.type', 'type')
      .addSelect('COALESCE(SUM(transaction.points), 0)', 'points')
      .where('transaction.userId = :userId', { userId })
      .groupBy('transaction.type')
      .getRawMany<{ type: PointsTransactionType; points: string }>();

    const totals = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.type] = Number(row.points);
      return acc;
    }, {});

    return {
      success: true,
      data: {
        userId,
        balance: user.totalPoints,
        totals,
      },
    };
  }

  async getPointsHistory(
    userId: string,
    query: PointsHistoryQueryDto,
  ): Promise<{ success: true; data: unknown[]; pagination: Pagination }> {
    const qb = this.pointsRepo
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .orderBy('transaction.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.type) {
      qb.andWhere('transaction.type = :type', { type: query.type });
    }
    if (query.sourceType) {
      qb.andWhere('transaction.sourceType = :sourceType', { sourceType: query.sourceType });
    }
    if (query.dateFrom) {
      qb.andWhere('transaction.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('transaction.createdAt <= :dateTo', { dateTo: query.dateTo });
    }

    const [transactions, total] = await qb.getManyAndCount();
    return {
      success: true,
      data: transactions.map((transaction) => this.serializePointsTransaction(transaction)),
      pagination: paginate(query.page, query.limit, total),
    };
  }

  async getRewardSettings(): Promise<{ success: true; data: ReviewRewardSettings }> {
    return { success: true, data: await this.getEffectiveRewardSettings() };
  }

  async updateRewardSettings(
    adminId: string,
    dto: RewardSettingsUpdateDto,
  ): Promise<{ success: true; message: string; data: ReviewRewardSettings }> {
    if (dto.productReviewPoints !== undefined || dto.sellerReviewPoints !== undefined) {
      throw createError.badRequest('Manage review base points through the REVIEW_SUBMITTED reward rule');
    }
    let settings!: ReviewRewardSettings;

    await AppDataSource.transaction(async (manager) => {
      for (const [key, value] of Object.entries(dto) as Array<[keyof RewardSettingsUpdateDto, number]>) {
        if (value === undefined) continue;
        const settingKey = REVIEW_REWARD_SETTING_KEYS[key as keyof ReviewRewardSettings];
        if (!settingKey) continue;

        const existing = await manager.findOne(RewardSetting, { where: { settingKey } });
        if (existing) {
          await manager.update(RewardSetting, existing.id, {
            settingValue: value,
            updatedBy: adminId,
          });
        } else {
          await manager.save(
            RewardSetting,
            manager.create(RewardSetting, {
              settingKey,
              settingValue: value,
              updatedBy: adminId,
            }),
          );
        }
      }

      settings = await this.getEffectiveRewardSettings(manager);
      await this.recordAudit(manager, {
        eventType: 'REWARD_SETTINGS_UPDATED',
        actorType: ReviewAuditActorType.ADMIN,
        actorId: adminId,
        reviewType: null,
        reviewId: null,
        eligibilityId: null,
        pointsTransactionId: null,
        metadata: dto,
      });
    });

    return {
      success: true,
      message: 'Reward settings updated successfully.',
      data: settings,
    };
  }

  async adjustUserPoints(
    adminId: string,
    dto: PointsAdjustmentDto,
    requestKey: string,
  ): Promise<{success:true;message:string;data:unknown}> {
    await new RewardService().adjust(adminId, {
      userId:dto.userId, transactionType:dto.points>0?'credit':'debit',
      points:Math.abs(dto.points), reason:dto.reason,
    },requestKey);
    const transaction=await this.pointsRepo.findOneByOrFail({idempotencyKey:`ADMIN:${adminId}:${requestKey}`});
    return {success:true,message:'User points adjusted successfully.',data:this.serializePointsTransaction(transaction)};
  }

  async listAdminReviews(
    query: AdminReviewQueryDto,
  ): Promise<{ success: true; data: unknown[]; pagination: Pagination }> {
    if (query.type === ReviewType.PRODUCT) {
      return this.listAdminProductReviews(query);
    }
    if (query.type === ReviewType.SELLER) {
      return this.listAdminSellerReviews(query);
    }

    const productReviews = await this.buildAdminProductReviewQuery(query)
      .take(query.page * query.limit)
      .getMany();
    const sellerReviews = await this.buildAdminSellerReviewQuery(query)
      .take(query.page * query.limit)
      .getMany();
    const total =
      (await this.buildAdminProductReviewQuery(query).getCount()) +
      (await this.buildAdminSellerReviewQuery(query).getCount());
    const productResponses = await this.loadResponseMap(
      ReviewType.PRODUCT,
      productReviews.map((review) => review.id),
      true,
    );
    const sellerResponses = await this.loadResponseMap(
      ReviewType.SELLER,
      sellerReviews.map((review) => review.id),
      true,
    );
    const data = [
      ...productReviews.map((review) =>
        this.serializeProductReview(review, productResponses.get(review.id), true),
      ),
      ...sellerReviews.map((review) =>
        this.serializeSellerReview(review, sellerResponses.get(review.id), true),
      ),
    ]
      .sort(sortSerializedReviews)
      .slice((query.page - 1) * query.limit, query.page * query.limit);

    return { success: true, data, pagination: paginate(query.page, query.limit, total) };
  }

  async getAdminReviewById(
    reviewType: ReviewType,
    reviewId: string,
  ): Promise<{ success: true; data: unknown }> {
    if (reviewType === ReviewType.PRODUCT) {
      const review = await this.loadProductReviewOrFail(reviewId);
      return {
        success: true,
        data: await this.serializeProductReviewWithResponse(review, true),
      };
    }

    const review = await this.loadSellerReviewOrFail(reviewId);
    return {
      success: true,
      data: await this.serializeSellerReviewWithResponse(review, true),
    };
  }

  async moderateReviewStatus(
    adminId: string,
    reviewType: ReviewType,
    reviewId: string,
    dto: ReviewModerationStatusDto,
  ): Promise<{ success: true; message: string; data: unknown }> {
    await AppDataSource.transaction(async (manager) => {
      if (reviewType === ReviewType.PRODUCT) {
        const review = await this.loadProductReviewForUpdate(manager, reviewId);
        const previousStatus = review.status;
        let pointsTransactionId: string | null = null;

        if (dto.status === ReviewStatus.PUBLISHED && review.pointsAwarded === 0) {
          const settings = await this.getEffectiveRewardSettings(manager);
          const award = await this.awardReviewPoints(manager, {
            buyerId: review.buyerId,
            orderId: review.orderId,
            reviewType,
            reviewId: review.id,
            comment: review.comment,
            status: ReviewStatus.PUBLISHED,
            basePoints: settings.productReviewPoints,
            bonusPoints: review.images.length > 0 ? settings.reviewWithImageBonus : 0,
            settings,
          });
          pointsTransactionId = award.transactionId;
          if (award.pointsAwarded > 0) {
            await manager.update(ProductReview, review.id, {
              pointsAwarded: award.pointsAwarded,
            });
          }
        }

        if (dto.status === ReviewStatus.REJECTED) {
          pointsTransactionId =
            (await this.reverseReviewPoints(manager, reviewType, review.id, adminId, dto.reason)).transactionId ??
            pointsTransactionId;
        }

        await manager.update(ProductReview, review.id, {
          status: dto.status as ReviewStatus,
          moderationReason: dto.reason ?? review.moderationReason,
        });
        await this.recalculateProductRating(manager, review.productId);
        await this.recordStatusAudit(
          manager,
          adminId,
          reviewType,
          review.id,
          review.eligibilityId,
          previousStatus,
          dto.status as ReviewStatus,
          dto.reason ?? null,
          pointsTransactionId,
        );
        return;
      }

      const review = await this.loadSellerReviewForUpdate(manager, reviewId);
      const previousStatus = review.status;
      let pointsTransactionId: string | null = null;

      if (dto.status === ReviewStatus.PUBLISHED && review.pointsAwarded === 0) {
        const settings = await this.getEffectiveRewardSettings(manager);
        const award = await this.awardReviewPoints(manager, {
          buyerId: review.buyerId,
          orderId: review.orderId,
          reviewType,
          reviewId: review.id,
          comment: review.comment,
          status: ReviewStatus.PUBLISHED,
          basePoints: settings.sellerReviewPoints,
          bonusPoints: 0,
          settings,
        });
        pointsTransactionId = award.transactionId;
        if (award.pointsAwarded > 0) {
          await manager.update(SellerReview, review.id, {
            pointsAwarded: award.pointsAwarded,
          });
        }
      }

      if (dto.status === ReviewStatus.REJECTED) {
        pointsTransactionId =
          (await this.reverseReviewPoints(manager, reviewType, review.id, adminId, dto.reason)).transactionId ??
          pointsTransactionId;
      }

      await manager.update(SellerReview, review.id, {
        status: dto.status as ReviewStatus,
        moderationReason: dto.reason ?? review.moderationReason,
      });
      await this.recalculateSellerRating(manager, review.sellerId);
      await this.recordStatusAudit(
        manager,
        adminId,
        reviewType,
        review.id,
        review.eligibilityId,
        previousStatus,
        dto.status as ReviewStatus,
        dto.reason ?? null,
        pointsTransactionId,
      );
    });

    emitReviewEvent('REVIEW_STATUS_CHANGED', {
      reviewType,
      reviewId,
      metadata: { status: dto.status, reason: dto.reason ?? null },
    });

    return {
      success: true,
      message: 'Review status updated successfully.',
      data: (await this.getAdminReviewById(reviewType, reviewId)).data,
    };
  }

  async sendDueReviewReminders(): Promise<{ success: true; data: { sent: number } }> {
    const settings = await this.getEffectiveRewardSettings();
    if (settings.reviewReminderDays <= 0) {
      return { success: true, data: { sent: 0 } };
    }

    const reminderDate = addDays(new Date(), settings.reviewReminderDays);
    const eligibilities = await this.eligibilityRepo
      .createQueryBuilder('eligibility')
      .leftJoinAndSelect('eligibility.order', 'order')
      .leftJoinAndSelect('eligibility.buyer', 'buyer')
      .where('eligibility.status = :status', { status: ReviewEligibilityStatus.ELIGIBLE })
      .andWhere('eligibility.expiresAt IS NOT NULL')
      .andWhere('eligibility.expiresAt <= :reminderDate', { reminderDate })
      .take(100)
      .getMany();

    let sent = 0;
    const seenOrders = new Set<string>();
    for (const eligibility of eligibilities) {
      if (!eligibility.buyer?.email || seenOrders.has(eligibility.orderId)) continue;
      seenOrders.add(eligibility.orderId);
      await sendReviewReminderEmail(eligibility.buyer.email, eligibility.buyer.firstName, {
        orderReference: eligibility.order?.orderReference ?? eligibility.orderId,
        expiresAt: eligibility.expiresAt,
      });
      sent += 1;
    }

    return { success: true, data: { sent } };
  }

  private async listBuyerProductReviews(
    buyerId: string,
    query: MyReviewsQueryDto,
  ): Promise<{ success: true; data: unknown[]; pagination: Pagination }> {
    const qb = this.buildBuyerProductReviewQuery(buyerId, query)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [reviews, total] = await qb.getManyAndCount();
    const responseMap = await this.loadResponseMap(ReviewType.PRODUCT, reviews.map((review) => review.id), true);
    return {
      success: true,
      data: reviews.map((review) => this.serializeProductReview(review, responseMap.get(review.id), true)),
      pagination: paginate(query.page, query.limit, total),
    };
  }

  private async listBuyerSellerReviews(
    buyerId: string,
    query: MyReviewsQueryDto,
  ): Promise<{ success: true; data: unknown[]; pagination: Pagination }> {
    const qb = this.buildBuyerSellerReviewQuery(buyerId, query)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [reviews, total] = await qb.getManyAndCount();
    const responseMap = await this.loadResponseMap(ReviewType.SELLER, reviews.map((review) => review.id), true);
    return {
      success: true,
      data: reviews.map((review) => this.serializeSellerReview(review, responseMap.get(review.id), true)),
      pagination: paginate(query.page, query.limit, total),
    };
  }

  private async listAdminProductReviews(
    query: AdminReviewQueryDto,
  ): Promise<{ success: true; data: unknown[]; pagination: Pagination }> {
    const qb = this.buildAdminProductReviewQuery(query)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [reviews, total] = await qb.getManyAndCount();
    const responseMap = await this.loadResponseMap(ReviewType.PRODUCT, reviews.map((review) => review.id), true);
    return {
      success: true,
      data: reviews.map((review) => this.serializeProductReview(review, responseMap.get(review.id), true)),
      pagination: paginate(query.page, query.limit, total),
    };
  }

  private async listAdminSellerReviews(
    query: AdminReviewQueryDto,
  ): Promise<{ success: true; data: unknown[]; pagination: Pagination }> {
    const qb = this.buildAdminSellerReviewQuery(query)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [reviews, total] = await qb.getManyAndCount();
    const responseMap = await this.loadResponseMap(ReviewType.SELLER, reviews.map((review) => review.id), true);
    return {
      success: true,
      data: reviews.map((review) => this.serializeSellerReview(review, responseMap.get(review.id), true)),
      pagination: paginate(query.page, query.limit, total),
    };
  }

  private buildBuyerProductReviewQuery(
    buyerId: string,
    query: MyReviewsQueryDto,
  ): SelectQueryBuilder<ProductReview> {
    const qb = this.productReviewRepo
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.buyer', 'buyer')
      .leftJoinAndSelect('review.seller', 'seller')
      .leftJoinAndSelect('review.product', 'product')
      .leftJoinAndSelect('review.orderItem', 'orderItem')
      .where('review.buyerId = :buyerId', { buyerId })
      .orderBy('review.createdAt', 'DESC');

    if (query.status) {
      qb.andWhere('review.status = :status', { status: query.status });
    }
    return qb;
  }

  private buildBuyerSellerReviewQuery(
    buyerId: string,
    query: MyReviewsQueryDto,
  ): SelectQueryBuilder<SellerReview> {
    const qb = this.sellerReviewRepo
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.buyer', 'buyer')
      .leftJoinAndSelect('review.seller', 'seller')
      .where('review.buyerId = :buyerId', { buyerId })
      .orderBy('review.createdAt', 'DESC');

    if (query.status) {
      qb.andWhere('review.status = :status', { status: query.status });
    }
    return qb;
  }

  private buildAdminProductReviewQuery(
    query: AdminReviewQueryDto,
  ): SelectQueryBuilder<ProductReview> {
    const qb = this.productReviewRepo
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.buyer', 'buyer')
      .leftJoinAndSelect('review.seller', 'seller')
      .leftJoinAndSelect('review.product', 'product')
      .leftJoinAndSelect('review.orderItem', 'orderItem')
      .orderBy('review.createdAt', 'DESC');

    if (query.status) qb.andWhere('review.status = :status', { status: query.status });
    if (query.buyerId) qb.andWhere('review.buyerId = :buyerId', { buyerId: query.buyerId });
    if (query.sellerId) qb.andWhere('review.sellerId = :sellerId', { sellerId: query.sellerId });
    if (query.productId) qb.andWhere('review.productId = :productId', { productId: query.productId });
    if (query.rating) qb.andWhere('review.rating = :rating', { rating: query.rating });
    if (query.dateFrom) qb.andWhere('review.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('review.createdAt <= :dateTo', { dateTo: query.dateTo });
    if (query.search) {
      qb.andWhere(
        new Brackets((nested) => {
          nested
            .where('LOWER(review.comment) LIKE :search', {
              search: `%${query.search!.toLowerCase()}%`,
            })
            .orWhere('LOWER(review.title) LIKE :search', {
              search: `%${query.search!.toLowerCase()}%`,
            });
        }),
      );
    }

    return qb;
  }

  private buildAdminSellerReviewQuery(
    query: AdminReviewQueryDto,
  ): SelectQueryBuilder<SellerReview> {
    const qb = this.sellerReviewRepo
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.buyer', 'buyer')
      .leftJoinAndSelect('review.seller', 'seller')
      .orderBy('review.createdAt', 'DESC');

    if (query.status) qb.andWhere('review.status = :status', { status: query.status });
    if (query.buyerId) qb.andWhere('review.buyerId = :buyerId', { buyerId: query.buyerId });
    if (query.sellerId) qb.andWhere('review.sellerId = :sellerId', { sellerId: query.sellerId });
    if (query.productId) qb.andWhere('1 = 0');
    if (query.rating) qb.andWhere('review.overallRating = :rating', { rating: query.rating });
    if (query.dateFrom) qb.andWhere('review.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('review.createdAt <= :dateTo', { dateTo: query.dateTo });
    if (query.search) {
      qb.andWhere('LOWER(review.comment) LIKE :search', {
        search: `%${query.search.toLowerCase()}%`,
      });
    }

    return qb;
  }

  private async getEffectiveRewardSettings(
    manager: EntityManager = AppDataSource.manager,
  ): Promise<ReviewRewardSettings> {
    const defaults: ReviewRewardSettings = {
      productReviewPoints: config.rewards.productReviewPoints,
      sellerReviewPoints: config.rewards.sellerReviewPoints,
      reviewWithImageBonus: config.rewards.reviewWithImageBonus,
      minimumReviewCharacters: config.rewards.minimumReviewCharacters,
      maxReviewRewardPerOrder: config.rewards.maxReviewRewardPerOrder,
      reviewSubmissionWindowDays: config.reviews.submissionWindowDays,
      reviewReminderDays: config.reviews.reminderDays,
      maxReviewImages: config.reviews.maxImages,
    };

    const rows = await manager.find(RewardSetting, {
      where: { settingKey: In(Object.values(REVIEW_REWARD_SETTING_KEYS)) },
    });
    const settings = { ...defaults };

    for (const row of rows) {
      const settingName = (Object.entries(REVIEW_REWARD_SETTING_KEYS) as Array<[keyof ReviewRewardSettings, string]>)
        .find(([, settingKey]) => settingKey === row.settingKey)?.[0];
      if (!settingName) continue;

      settings[settingName] = coerceNumberSetting(
        row.settingValue,
        defaults[settingName],
      );
    }

    const rule = await manager.findOneBy(RewardRule, {eventCode:'REVIEW_SUBMITTED'});
    if (rule) { settings.productReviewPoints = rule.points; settings.sellerReviewPoints = rule.points; }
    return settings;
  }

  private async requireEligibilityForSubmission(
    manager: EntityManager,
    buyerId: string,
    eligibilityId: string,
    reviewType: ReviewType,
  ): Promise<ReviewEligibility> {
    const eligibility = await manager
      .getRepository(ReviewEligibility)
      .createQueryBuilder('eligibility')
      .setLock('pessimistic_write')
      .where('eligibility.id = :eligibilityId', { eligibilityId })
      .getOne();

    if (!eligibility) throw createError.notFound('Review eligibility not found');
    if (eligibility.buyerId !== buyerId) {
      throw createError.forbidden('Only the eligible buyer can submit this review');
    }
    if (eligibility.reviewType !== reviewType) {
      throw createError.badRequest('Review type does not match eligibility');
    }
    if (eligibility.status !== ReviewEligibilityStatus.ELIGIBLE) {
      throw createError.conflict(`Review eligibility is ${eligibility.status}`);
    }
    if (eligibility.expiresAt && eligibility.expiresAt.getTime() < Date.now()) {
      await manager.update(ReviewEligibility, eligibility.id, {
        status: ReviewEligibilityStatus.EXPIRED,
      });
      throw createError.conflict('Review eligibility has expired');
    }

    return eligibility;
  }

  private async ensureCompletedOrder(
    manager: EntityManager,
    orderId: string,
  ): Promise<Order> {
    const order = await manager.findOne(Order, { where: { id: orderId } });
    if (!order) throw createError.notFound('Order not found');
    if (order.status !== OrderStatus.COMPLETED) {
      throw createError.conflict('Reviews can only be submitted after order completion');
    }
    return order;
  }

  private async ensureBuyerOrder(orderId: string, buyerId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw createError.notFound('Order not found');
    if (order.buyerId !== buyerId) {
      throw createError.forbidden('Only the buyer can access this order review eligibility');
    }
    return order;
  }

  private async assertEligibilityBelongsToOrder(
    buyerId: string,
    orderId: string,
    eligibilityId: string,
  ): Promise<void> {
    const eligibility = await this.eligibilityRepo.findOne({ where: { id: eligibilityId } });
    if (!eligibility) throw createError.notFound('Review eligibility not found');
    if (eligibility.buyerId !== buyerId || eligibility.orderId !== orderId) {
      throw createError.badRequest('Review eligibility does not belong to this order');
    }
  }

  private async ensureNoProductReviewForEligibility(
    manager: EntityManager,
    eligibilityId: string,
  ): Promise<void> {
    const existing = await manager.findOne(ProductReview, { where: { eligibilityId } });
    if (existing) throw createError.conflict('A product review has already been submitted');
  }

  private async ensureNoSellerReviewForEligibility(
    manager: EntityManager,
    eligibilityId: string,
  ): Promise<void> {
    const existing = await manager.findOne(SellerReview, { where: { eligibilityId } });
    if (existing) throw createError.conflict('A seller review has already been submitted');
  }

  private assertImagesAllowed(images: string[], settings: ReviewRewardSettings): void {
    if (images.length > settings.maxReviewImages) {
      throw createError.badRequest(`A review can include at most ${settings.maxReviewImages} image(s)`);
    }
  }

  private moderateReview(comment: string, title: string | null): ModerationResult {
    const text = `${title ?? ''} ${comment}`.trim();
    const flags = Array.from(
      new Set(FLAG_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.flag)),
    );

    if (!flags.length) {
      return { status: ReviewStatus.PUBLISHED, flags: null, reason: null };
    }

    return {
      status: ReviewStatus.PENDING_MODERATION,
      flags,
      reason: `Review requires moderation: ${flags.join(', ')}`,
    };
  }

  private async awardReviewPoints(
    manager: EntityManager,
    input: {
      buyerId: string;
      orderId: string;
      reviewType: ReviewType;
      reviewId: string;
      comment: string;
      status: ReviewStatus;
      basePoints: number;
      bonusPoints: number;
      settings: ReviewRewardSettings;
    },
  ): Promise<PointsAwardResult> {
    if (input.status !== ReviewStatus.PUBLISHED) {
      return { pointsAwarded: 0, transactionId: null };
    }
    if (input.comment.trim().length < input.settings.minimumReviewCharacters) {
      return { pointsAwarded: 0, transactionId: null };
    }

    const sourceType =
      input.reviewType === ReviewType.PRODUCT
        ? PointsSourceType.PRODUCT_REVIEW
        : PointsSourceType.SELLER_REVIEW;
    const existing = await manager.findOne(PointsTransaction, {
      where: {
        sourceType,
        sourceId: input.reviewId,
        rewardType: 'review_submission',
      },
    });
    if (existing) return { pointsAwarded: 0, transactionId: existing.id };

    await this.loadUserForPointsUpdate(manager, input.buyerId);
    const rule = await manager.findOneBy(RewardRule, {eventCode:'REVIEW_SUBMITTED',status:'active'});
    if (!rule) return {pointsAwarded:0,transactionId:null};
    const desiredPoints = rule.points + input.bonusPoints;
    const alreadyAwarded = await this.sumAwardedReviewPointsForOrder(
      manager,
      input.buyerId,
      input.orderId,
    );
    const remainingForOrder =
      input.settings.maxReviewRewardPerOrder > 0
        ? Math.max(0, input.settings.maxReviewRewardPerOrder - alreadyAwarded)
        : desiredPoints;
    let pointsAwarded = Math.min(desiredPoints, remainingForOrder);

    if (pointsAwarded <= 0) return { pointsAwarded: 0, transactionId: null };

    const transaction = await new RewardService().award(manager,input.buyerId,'REVIEW_SUBMITTED',sourceType,input.reviewId,pointsAwarded,input.bonusPoints,input.orderId);
    if (!transaction) return {pointsAwarded:0,transactionId:null};
    pointsAwarded = transaction.points;
    const user = {id:input.buyerId};
    const balanceAfter = transaction.balanceAfter;

    await this.recordAudit(manager, {
      eventType: 'REVIEW_POINTS_AWARDED',
      actorType: ReviewAuditActorType.SYSTEM,
      actorId: null,
      reviewType: input.reviewType,
      reviewId: input.reviewId,
      eligibilityId: null,
      pointsTransactionId: transaction.id,
      metadata: {
        userId: user.id,
        orderId: input.orderId,
        pointsAwarded,
        balanceAfter,
      },
    });

    return { pointsAwarded, transactionId: transaction.id };
  }

  private async reverseReviewPoints(
    manager: EntityManager,
    reviewType: ReviewType,
    reviewId: string,
    adminId: string,
    reason?: string,
  ): Promise<PointsAwardResult> {
    const sourceType =
      reviewType === ReviewType.PRODUCT
        ? PointsSourceType.PRODUCT_REVIEW
        : PointsSourceType.SELLER_REVIEW;
    const earned = await manager.findOne(PointsTransaction, {
      where: { sourceType, sourceId: reviewId, rewardType: 'review_submission' },
    });
    if (!earned || earned.points <= 0) {
      return { pointsAwarded: 0, transactionId: null };
    }

    const existingReversal = await manager.findOne(PointsTransaction, {
      where: { sourceType, sourceId: reviewId, rewardType: 'review_reversal' },
    });
    if (existingReversal) {
      return { pointsAwarded: 0, transactionId: existingReversal.id };
    }

    const user = await this.loadUserForPointsUpdate(manager, earned.userId);
    const points = Math.abs(earned.points) * -1;
    const balanceAfter = user.totalPoints + points;
    if (balanceAfter < 0 || balanceAfter > 2147483647) {
      throw createError.conflict('Cannot reverse review points because user balance would go below zero');
    }

    await manager.update(User, user.id, { totalPoints: balanceAfter });
    const transaction = await manager.save(
      PointsTransaction,
      manager.create(PointsTransaction, {
        userId: user.id,
        type: PointsTransactionType.REVERSED,
        points,
        sourceType,
        sourceId: reviewId,
        rewardType: 'review_reversal',
        description: reason || 'Review reward reversed after moderation',
        balanceAfter,
      }),
    );

    await this.recordAudit(manager, {
      eventType: 'POINTS_REVERSED',
      actorType: ReviewAuditActorType.ADMIN,
      actorId: adminId,
      reviewType,
      reviewId,
      eligibilityId: null,
      pointsTransactionId: transaction.id,
      metadata: {
        userId: user.id,
        points,
        balanceAfter,
        reason: reason ?? null,
      },
    });

    return { pointsAwarded: points, transactionId: transaction.id };
  }

  private async sumAwardedReviewPointsForOrder(
    manager: EntityManager,
    buyerId: string,
    orderId: string,
  ): Promise<number> {
    const result = await manager.getRepository(PointsTransaction).createQueryBuilder('t')
      .select('COALESCE(SUM(t.points),0)', 'total')
      .where("t.userId = :buyerId AND t.orderId = :orderId AND t.eventCode = 'REVIEW_SUBMITTED' AND t.points > 0", {buyerId,orderId})
      .setLock('pessimistic_write').getRawOne();
    return Number(result.total);
  }

  private async loadUserForPointsUpdate(
    manager: EntityManager,
    userId: string,
  ): Promise<User> {
    const user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) throw createError.notFound('User not found');
    return user;
  }

  private async recalculateProductRating(
    manager: EntityManager,
    productId: string,
  ): Promise<void> {
    const raw = await manager
      .getRepository(ProductReview)
      .createQueryBuilder('review')
      .select('COUNT(review.id)', 'total')
      .addSelect('AVG(review.rating)', 'average')
      .where('review.productId = :productId', { productId })
      .andWhere('review.status = :status', { status: ReviewStatus.PUBLISHED })
      .getRawOne<{ total: string; average: string | null }>();

    await manager.update(Product, productId, {
      totalReviews: Number(raw?.total ?? 0),
      averageRating: Number(Number(raw?.average ?? 0).toFixed(2)),
    });
  }

  private async recalculateSellerRating(
    manager: EntityManager,
    sellerId: string,
  ): Promise<void> {
    const raw = await manager
      .getRepository(SellerReview)
      .createQueryBuilder('review')
      .select('COUNT(review.id)', 'total')
      .addSelect('AVG(review.overallRating)', 'average')
      .where('review.sellerId = :sellerId', { sellerId })
      .andWhere('review.status = :status', { status: ReviewStatus.PUBLISHED })
      .getRawOne<{ total: string; average: string | null }>();

    await manager.update(User, sellerId, {
      totalReviewCount: Number(raw?.total ?? 0),
      totalAverageReviews: Number(Number(raw?.average ?? 0).toFixed(2)).toFixed(2),
    });
  }

  private async ensureReviewCanBeVoted(
    manager: EntityManager,
    reviewType: ReviewType,
    reviewId: string,
    userId: string,
  ): Promise<void> {
    const review =
      reviewType === ReviewType.PRODUCT
        ? await manager.findOne(ProductReview, { where: { id: reviewId } })
        : await manager.findOne(SellerReview, { where: { id: reviewId } });

    if (!review || review.status !== ReviewStatus.PUBLISHED) {
      throw createError.notFound('Published review not found');
    }
    if (review.buyerId === userId) {
      throw createError.conflict('You cannot vote on your own review');
    }
  }

  private async refreshVoteCounts(
    manager: EntityManager,
    reviewType: ReviewType,
    reviewId: string,
  ): Promise<void> {
    const helpfulCount = await manager.count(ReviewVote, {
      where: { reviewType, reviewId, vote: ReviewVoteValue.HELPFUL },
    });
    const notHelpfulCount = await manager.count(ReviewVote, {
      where: { reviewType, reviewId, vote: ReviewVoteValue.NOT_HELPFUL },
    });

    if (reviewType === ReviewType.PRODUCT) {
      await manager.update(ProductReview, reviewId, { helpfulCount, notHelpfulCount });
    } else {
      await manager.update(SellerReview, reviewId, { helpfulCount, notHelpfulCount });
    }
  }

  private async getReviewVoteCounts(
    reviewType: ReviewType,
    reviewId: string,
  ): Promise<{ reviewType: ReviewType; reviewId: string; helpfulCount: number; notHelpfulCount: number }> {
    const review =
      reviewType === ReviewType.PRODUCT
        ? await this.productReviewRepo.findOne({ where: { id: reviewId } })
        : await this.sellerReviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw createError.notFound('Review not found');
    return {
      reviewType,
      reviewId,
      helpfulCount: review.helpfulCount,
      notHelpfulCount: review.notHelpfulCount,
    };
  }

  private async requireReviewForSellerResponse(
    manager: EntityManager,
    reviewType: ReviewType,
    reviewId: string,
    sellerId: string,
  ): Promise<ProductReviewWithRelations | SellerReviewWithRelations> {
    const review =
      reviewType === ReviewType.PRODUCT
        ? await manager.findOne(ProductReview, {
            where: { id: reviewId },
            relations: ['buyer', 'seller', 'product', 'orderItem'],
          })
        : await manager.findOne(SellerReview, {
            where: { id: reviewId },
            relations: ['buyer', 'seller'],
          });

    if (!review || review.status === ReviewStatus.DELETED || review.status === ReviewStatus.REJECTED) {
      throw createError.notFound('Review not found');
    }
    if (review.sellerId !== sellerId) {
      throw createError.forbidden('Only the reviewed seller can respond');
    }
    return review;
  }

  private async loadResponseMap(
    reviewType: ReviewType,
    reviewIds: string[],
    includeHidden = false,
  ): Promise<Map<string, ReviewResponse>> {
    if (!reviewIds.length) return new Map();
    const responses = await this.responseRepo.find({
      where: {
        reviewType,
        reviewId: In(reviewIds),
        ...(includeHidden ? {} : { status: ReviewResponseStatus.PUBLISHED }),
      },
    });
    return new Map(responses.map((response) => [response.reviewId, response]));
  }

  private async loadResponseOrFail(responseId: string): Promise<ReviewResponse> {
    const response = await this.responseRepo.findOne({ where: { id: responseId } });
    if (!response) throw createError.notFound('Review response not found');
    return response;
  }

  private async loadProductReviewOrFail(reviewId: string): Promise<ProductReviewWithRelations> {
    const review = await this.productReviewRepo.findOne({
      where: { id: reviewId },
      relations: ['buyer', 'seller', 'product', 'order', 'orderItem'],
    });
    if (!review) throw createError.notFound('Product review not found');
    return review;
  }

  private async loadSellerReviewOrFail(reviewId: string): Promise<SellerReviewWithRelations> {
    const review = await this.sellerReviewRepo.findOne({
      where: { id: reviewId },
      relations: ['buyer', 'seller', 'order'],
    });
    if (!review) throw createError.notFound('Seller review not found');
    return review;
  }

  private async loadProductReviewForUpdate(
    manager: EntityManager,
    reviewId: string,
  ): Promise<ProductReview> {
    const review = await manager
      .getRepository(ProductReview)
      .createQueryBuilder('review')
      .setLock('pessimistic_write')
      .where('review.id = :reviewId', { reviewId })
      .getOne();
    if (!review) throw createError.notFound('Product review not found');
    return review;
  }

  private async loadSellerReviewForUpdate(
    manager: EntityManager,
    reviewId: string,
  ): Promise<SellerReview> {
    const review = await manager
      .getRepository(SellerReview)
      .createQueryBuilder('review')
      .setLock('pessimistic_write')
      .where('review.id = :reviewId', { reviewId })
      .getOne();
    if (!review) throw createError.notFound('Seller review not found');
    return review;
  }

  private assertBuyerOwnsReview(
    review: ProductReview | SellerReview,
    buyerId: string,
  ): void {
    if (review.buyerId !== buyerId) {
      throw createError.forbidden('Only the review author can modify this review');
    }
  }

  private assertReviewEditable(status: ReviewStatus): void {
    if (status === ReviewStatus.DELETED || status === ReviewStatus.REJECTED) {
      throw createError.conflict('This review cannot be edited');
    }
  }

  private applyReviewSort<T extends ProductReview | SellerReview>(
    qb: SelectQueryBuilder<T>,
    ratingColumn: string,
    sortBy: ReviewListQueryDto['sortBy'],
  ): void {
    if (sortBy === 'highest_rating') {
      qb.orderBy(ratingColumn, 'DESC').addOrderBy('review.createdAt', 'DESC');
      return;
    }
    if (sortBy === 'lowest_rating') {
      qb.orderBy(ratingColumn, 'ASC').addOrderBy('review.createdAt', 'DESC');
      return;
    }
    if (sortBy === 'most_helpful') {
      qb.orderBy('review.helpfulCount', 'DESC').addOrderBy('review.createdAt', 'DESC');
      return;
    }
    qb.orderBy('review.createdAt', 'DESC');
  }

  private async expireEligibleReviews(): Promise<void> {
    await this.eligibilityRepo
      .createQueryBuilder()
      .update(ReviewEligibility)
      .set({ status: ReviewEligibilityStatus.EXPIRED })
      .where('status = :status', { status: ReviewEligibilityStatus.ELIGIBLE })
      .andWhere('expiresAt IS NOT NULL')
      .andWhere('expiresAt < :now', { now: new Date() })
      .execute();
  }

  private async recordStatusAudit(
    manager: EntityManager,
    adminId: string,
    reviewType: ReviewType,
    reviewId: string,
    eligibilityId: string,
    previousStatus: ReviewStatus,
    status: ReviewStatus,
    reason: string | null,
    pointsTransactionId: string | null,
  ): Promise<void> {
    const eventType =
      status === ReviewStatus.HIDDEN
        ? 'REVIEW_HIDDEN'
        : status === ReviewStatus.REJECTED
          ? 'REVIEW_REJECTED'
          : status === ReviewStatus.PUBLISHED && previousStatus !== ReviewStatus.PUBLISHED
            ? 'REVIEW_RESTORED'
            : 'REVIEW_STATUS_CHANGED';

    await this.recordAudit(manager, {
      eventType,
      actorType: ReviewAuditActorType.ADMIN,
      actorId: adminId,
      reviewType,
      reviewId,
      eligibilityId,
      pointsTransactionId,
      metadata: {
        previousStatus,
        status,
        reason,
      },
    });
  }

  private async recordAudit(
    manager: EntityManager,
    input: {
      eventType: string;
      actorType: ReviewAuditActorType;
      actorId: string | null;
      reviewType: ReviewType | null;
      reviewId: string | null;
      eligibilityId: string | null;
      pointsTransactionId: string | null;
      metadata: Record<string, unknown> | null;
    },
  ): Promise<void> {
    await manager.save(ReviewAuditEvent, manager.create(ReviewAuditEvent, input));
  }

  private async serializeProductReviewWithResponse(
    review: ProductReviewWithRelations,
    includePrivate = false,
  ): Promise<unknown> {
    const response = await this.responseRepo.findOne({
      where: {
        reviewType: ReviewType.PRODUCT,
        reviewId: review.id,
        ...(includePrivate ? {} : { status: ReviewResponseStatus.PUBLISHED }),
      },
    });
    return this.serializeProductReview(review, response ?? undefined, includePrivate);
  }

  private async serializeSellerReviewWithResponse(
    review: SellerReviewWithRelations,
    includePrivate = false,
  ): Promise<unknown> {
    const response = await this.responseRepo.findOne({
      where: {
        reviewType: ReviewType.SELLER,
        reviewId: review.id,
        ...(includePrivate ? {} : { status: ReviewResponseStatus.PUBLISHED }),
      },
    });
    return this.serializeSellerReview(review, response ?? undefined, includePrivate);
  }

  private serializeProductReview(
    review: ProductReviewWithRelations,
    response?: ReviewResponse,
    includePrivate = false,
  ): Record<string, unknown> {
    return {
      id: review.id,
      type: ReviewType.PRODUCT,
      orderId: review.orderId,
      orderItemId: review.orderItemId,
      productId: review.productId,
      sellerId: review.sellerId,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      images: review.images,
      status: review.status,
      isVerifiedPurchase: review.isVerifiedPurchase,
      pointsAwarded: review.pointsAwarded,
      helpfulCount: review.helpfulCount,
      notHelpfulCount: review.notHelpfulCount,
      moderationReason: includePrivate ? review.moderationReason : undefined,
      moderationFlags: includePrivate ? review.moderationFlags : undefined,
      buyer: includePrivate
        ? this.serializePrivateUser(review.buyer)
        : this.serializePublicBuyer(review.buyer),
      seller: this.serializeSellerSummary(review.seller),
      product: {
        id: review.productId,
        name: this.productReviewSubject(review),
      },
      response: response ? this.serializeReviewResponse(response) : null,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  private serializeSellerReview(
    review: SellerReviewWithRelations,
    response?: ReviewResponse,
    includePrivate = false,
  ): Record<string, unknown> {
    return {
      id: review.id,
      type: ReviewType.SELLER,
      orderId: review.orderId,
      sellerId: review.sellerId,
      overallRating: review.overallRating,
      communicationRating: review.communicationRating,
      fulfillmentRating: review.fulfillmentRating,
      reliabilityRating: review.reliabilityRating,
      comment: review.comment,
      status: review.status,
      isVerifiedTransaction: review.isVerifiedTransaction,
      pointsAwarded: review.pointsAwarded,
      helpfulCount: review.helpfulCount,
      notHelpfulCount: review.notHelpfulCount,
      moderationReason: includePrivate ? review.moderationReason : undefined,
      moderationFlags: includePrivate ? review.moderationFlags : undefined,
      buyer: includePrivate
        ? this.serializePrivateUser(review.buyer)
        : this.serializePublicBuyer(review.buyer),
      seller: this.serializeSellerSummary(review.seller),
      response: response ? this.serializeReviewResponse(response) : null,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  private serializeEligibility(eligibility: ReviewEligibility): Record<string, unknown> {
    return {
      id: eligibility.id,
      orderId: eligibility.orderId,
      orderReference: eligibility.order?.orderReference,
      orderItemId: eligibility.orderItemId,
      buyerId: eligibility.buyerId,
      sellerId: eligibility.sellerId,
      productId: eligibility.productId,
      reviewType: eligibility.reviewType,
      status: eligibility.status,
      reviewId: eligibility.reviewId,
      product: eligibility.productId
        ? {
            id: eligibility.productId,
            name: productNameFromEntity(eligibility.product) ??
              productNameFromSnapshot(eligibility.orderItem?.productNameSnapshot) ??
              'Product',
          }
        : null,
      seller: this.serializeSellerSummary(eligibility.seller),
      eligibleAt: eligibility.eligibleAt,
      expiresAt: eligibility.expiresAt,
      submittedAt: eligibility.submittedAt,
      createdAt: eligibility.createdAt,
      updatedAt: eligibility.updatedAt,
    };
  }

  private serializeReviewResponse(response: ReviewResponse): Record<string, unknown> {
    return {
      id: response.id,
      reviewType: response.reviewType,
      reviewId: response.reviewId,
      sellerId: response.sellerId,
      comment: response.comment,
      status: response.status,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
    };
  }

  private serializePointsTransaction(
    transaction: PointsTransaction,
  ): Record<string, unknown> {
    return {
      id: transaction.id,
      userId: transaction.userId,
      type: transaction.type,
      points: transaction.points,
      sourceType: transaction.sourceType,
      sourceId: transaction.sourceId,
      rewardType: transaction.rewardType,
      description: transaction.description,
      balanceAfter: transaction.balanceAfter,
      createdAt: transaction.createdAt,
    };
  }

  private serializePublicBuyer(user?: User | null): Record<string, unknown> | null {
    if (!user) return null;
    return {
      id: user.id,
      displayName: `${user.firstName || 'Buyer'}${user.lastName ? ` ${user.lastName.charAt(0).toUpperCase()}.` : ''}`,
    };
  }

  private serializePrivateUser(user?: User | null): Record<string, unknown> | null {
    if (!user) return null;
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      userType: user.userType,
      status: user.status,
    };
  }

  private serializeSellerSummary(user?: User | null): Record<string, unknown> | null {
    if (!user) return null;
    return {
      id: user.id,
      storeName: user.storeName,
      companyName: user.companyName,
      country: user.country,
      averageRating: toNumber(user.totalAverageReviews),
      totalReviews: user.totalReviewCount,
    };
  }

  private productReviewSubject(review: ProductReviewWithRelations): string {
    return (
      productNameFromEntity(review.product) ??
      productNameFromSnapshot(review.orderItem?.productNameSnapshot) ??
      'Product'
    );
  }

  private sellerReviewSubject(review: SellerReviewWithRelations): string {
    return (
      review.seller?.storeName ||
      review.seller?.companyName ||
      `${review.seller?.firstName ?? 'Seller'} ${review.seller?.lastName ?? ''}`.trim()
    );
  }

  private async sendReviewSubmissionNotifications(
    reviewType: ReviewType,
    review: ProductReviewWithRelations | SellerReviewWithRelations,
    pointsAwarded: number,
  ): Promise<void> {
    const subjectName =
      reviewType === ReviewType.PRODUCT
        ? this.productReviewSubject(review as ProductReviewWithRelations)
        : this.sellerReviewSubject(review as SellerReviewWithRelations);
    const rating =
      reviewType === ReviewType.PRODUCT
        ? (review as ProductReviewWithRelations).rating
        : (review as SellerReviewWithRelations).overallRating;

    if (review.buyer?.email) {
      await sendReviewSubmittedEmail(review.buyer.email, review.buyer.firstName, {
        reviewType,
        subjectName,
        rating,
        pointsAwarded,
      });
    }

    if (rating <= 2 && review.seller?.email) {
      await sendLowRatingReviewEmail(review.seller.email, review.seller.firstName, {
        reviewType,
        subjectName,
        rating,
      });
    }
  }
}

function paginate(page: number, limit: number, total: number): Pagination {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function coerceNumberSetting(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function productNameFromEntity(product?: Product | null): string | null {
  if (!product?.productName) return null;
  const name = product.productName as Record<string, string>;
  return name.en ?? Object.values(name)[0] ?? null;
}

function productNameFromSnapshot(snapshot?: OrderProductNameSnapshot | null): string | null {
  if (!snapshot) return null;
  if (typeof snapshot === 'string') return snapshot;
  return snapshot.displayName ?? null;
}

function sortSerializedReviews(a: unknown, b: unknown): number {
  const left = Date.parse(String((a as { createdAt?: unknown }).createdAt ?? ''));
  const right = Date.parse(String((b as { createdAt?: unknown }).createdAt ?? ''));
  return right - left;
}
