import { SettlementService } from '../settlement/settlement.service';
import { getSetting } from '../system-settings/settings.reader';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { Brackets, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import { Admin, AdminStatus } from '../../database/entities/admin.entity';
import {
  DisputeAuditActorType,
  DisputeAuditEvent,
} from '../../database/entities/dispute-audit-event.entity';
import {
  Dispute,
  DisputeFinancialAction,
  DisputeRaisedByType,
  DisputeResolutionType,
  DisputeStatus,
} from '../../database/entities/dispute.entity';
import { DisputeEvidence } from '../../database/entities/dispute-evidence.entity';
import {
  DisputeEvidenceUpload,
  DisputeEvidenceUploadStatus,
} from '../../database/entities/dispute-evidence-upload.entity';
import { DisputeItem } from '../../database/entities/dispute-item.entity';
import {
  DisputeMessage,
  DisputeMessageAttachmentSnapshot,
  DisputeMessageSenderType,
} from '../../database/entities/dispute-message.entity';
import { DeliveryType } from '../../database/entities/checkout-session.entity';
import { OrderDelivery } from '../../database/entities/order-delivery.entity';
import { OrderItem, OrderProductNameSnapshot } from '../../database/entities/order-item.entity';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { Payment } from '../../database/entities/payment.entity';
import { User } from '../../database/entities/user.entity';
import {
  processUpload,
  UploadedFile,
  UploadValidationError,
} from '../../common/utils/file-upload.util';
import { createError } from '../../common/utils/http-error.util';
import { toNumber } from '../../common/utils/pricing.util';
import { deletePrivateBlob } from '../../common/utils/azure-blob-storage.util';
import {
  AdminDisputeQueryDto,
  AdminDisputeStatusUpdateDto,
  AssignDisputeDto,
  CloseDisputeDto,
  CreateDisputeDto,
  DisputeMessageDto,
  DisputeQueryDto,
  RequestDisputeInformationDto,
  ResolveDisputeDto,
} from '../../common/utils/validation.schemas';
import {
  sendBuyerDisputeRaisedEmail,
  sendDisputeInformationRequestedEmail,
  sendDisputeResolvedEmail,
  sendDisputeSubmittedEmail,
  sendSellerDisputeRaisedEmail,
} from '../../common/utils/email.service';
import { DisputeEventName, emitDisputeEvent } from './dispute.events';

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type EvidenceReference = {
  fileId: string;
  description?: string | null;
};

type DisputedItemInput = {
  orderItemId: string;
  quantityAffected: number;
};

type DisputeWithRelations = Dispute & {
  order?: (Order & {
    buyer?: User;
    seller?: User;
    items?: OrderItem[];
    delivery?: OrderDelivery | null;
    payment?: Payment;
  });
  buyer?: User;
  seller?: User;
  raiser?: User;
  items?: Array<DisputeItem & { orderItem?: OrderItem }>;
  evidence?: DisputeEvidence[];
  messages?: DisputeMessage[];
  auditEvents?: DisputeAuditEvent[];
};

type AuditInput = {
  disputeId: string;
  actorId: string | null;
  actorType: DisputeAuditActorType;
  action: DisputeEventName;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

const ACTIVE_DISPUTE_STATUSES = [
  DisputeStatus.OPEN,
  DisputeStatus.UNDER_REVIEW,
  DisputeStatus.AWAITING_BUYER,
  DisputeStatus.AWAITING_SELLER,
];

const ORDER_PROGRESS: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.READY_FOR_SHIPMENT,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.RECEIVED,
  OrderStatus.COMPLETED,
];

export class DisputeService {
  private disputeRepo = AppDataSource.getRepository(Dispute);
  private evidenceRepo = AppDataSource.getRepository(DisputeEvidence);
  private uploadRepo = AppDataSource.getRepository(DisputeEvidenceUpload);
  private orderRepo = AppDataSource.getRepository(Order);
  private adminRepo = AppDataSource.getRepository(Admin);

  constructor(private readonly fastify?: FastifyInstance) {}

  async uploadEvidence(
    userId: string,
    file: UploadedFile,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const queryRunner = AppDataSource.createQueryRunner();
    const lockName = `dispute-upload:${userId}`;
    let lockAcquired = false;
    let uploadedStoredName: string | null = null;

    try {
      await queryRunner.connect();
      const lockRows = (await queryRunner.query(
        'SELECT GET_LOCK(?, 10) AS acquired',
        [lockName],
      )) as Array<{ acquired: number | string | null }>;
      lockAcquired = Number(lockRows[0]?.acquired) === 1;
      if (!lockAcquired) {
        throw createError.tooManyRequests(
          'Another evidence upload is already in progress. Please retry shortly.',
          'DISPUTE_EVIDENCE_UPLOAD_BUSY',
        );
      }

      const uploadRepo = queryRunner.manager.getRepository(DisputeEvidenceUpload);
      const now = new Date();
      const expired = await uploadRepo
        .createQueryBuilder('upload')
        .where('upload.userId = :userId', { userId })
        .andWhere('upload.status = :status', {
          status: DisputeEvidenceUploadStatus.UPLOADED,
        })
        .andWhere('upload.expiresAt IS NOT NULL')
        .andWhere('upload.expiresAt <= :now', { now })
        .getMany();
      for (const upload of expired) {
        await deletePrivateBlob(upload.storedName);
      }
      if (expired.length > 0) {
        await uploadRepo.update(
          { id: In(expired.map((upload) => upload.id)) },
          { status: DisputeEvidenceUploadStatus.DELETED },
        );
      }

      const activeUploadCount = await uploadRepo
        .createQueryBuilder('upload')
        .where('upload.userId = :userId', { userId })
        .andWhere('upload.status = :status', {
          status: DisputeEvidenceUploadStatus.UPLOADED,
        })
        .andWhere('(upload.expiresAt IS NULL OR upload.expiresAt > :now)', { now })
        .getCount();
      if (activeUploadCount >= config.disputes.maxEvidenceFiles) {
        throw createError.tooManyRequests(
          'Finish or discard an existing evidence upload before adding another.',
          'DISPUTE_EVIDENCE_UPLOAD_LIMIT_REACHED',
        );
      }

      const processed = await processUpload(file, {
        allowedMimeTypes: config.disputes.allowedEvidenceMimeTypes,
        maxFileSizeMb: config.disputes.maxEvidenceFileSizeMb,
        pathPrefix: 'dispute-evidence',
      });
      uploadedStoredName = processed.storedName;
      const upload = await uploadRepo.save(
        uploadRepo.create({
          userId,
          fileName: normalizeFileName(file.filename),
          fileUrl: processed.url,
          storedName: processed.storedName,
          fileType: processed.mimetype,
          fileSize: processed.sizeBytes,
          status: DisputeEvidenceUploadStatus.UPLOADED,
          usedAt: null,
          expiresAt: addHours(config.disputes.evidenceUploadExpiryHours),
        }),
      );

      return {
        success: true,
        message: 'Dispute evidence uploaded successfully.',
        data: serializeUpload(upload),
      };
    } catch (err) {
      if (uploadedStoredName) {
        await deletePrivateBlob(uploadedStoredName).catch(() => undefined);
      }
      if (err instanceof UploadValidationError) {
        throw createError.badRequest(err.message, 'DISPUTE_EVIDENCE_NOT_ALLOWED');
      }
      if (err instanceof Error && 'statusCode' in err) throw err;
      this.fastify?.log.error(
        { err: config.isDev ? err : undefined },
        '[DisputeService] Evidence upload failed',
      );
      throw createError.internal('Dispute evidence upload failed');
    } finally {
      if (lockAcquired) {
        await queryRunner.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined);
      }
      await queryRunner.release().catch(() => undefined);
    }
  }

  async createDispute(
    userId: string,
    dto: CreateDisputeDto,
  ): Promise<{
    success: true;
    message: string;
    data: Record<string, unknown>;
  }> {
    const order = await this.requireOrderDetail(dto.sellerOrderId);
    const raisedByType = this.resolveParticipantType(order, userId);
    const reason = this.resolveReason(raisedByType, dto.reason);
    this.assertMessageLength(dto.description, 'Dispute description');
    this.assertOrderStageAllowsDispute(order, raisedByType, reason);
    await this.assertWithinDisputeWindow(order);

    const disputedItems = this.resolveDisputedItems(order, dto.disputedItems);
    await this.assertNoDuplicateActiveDispute(
      order.id,
      userId,
      reason,
      disputedItems,
    );

    const evidenceRefs = dto.evidence as EvidenceReference[];
    this.assertNoDuplicateFileIds(evidenceRefs);
    if (evidenceRefs.length > (await getSetting<number>('maximumDisputeEvidenceFiles'))) {
      throw createError.badRequest(
        `A dispute cannot include more than ${(await getSetting<number>('maximumDisputeEvidenceFiles'))} evidence files.`,
        'DISPUTE_EVIDENCE_LIMIT_REACHED',
      );
    }

    let disputeId = '';
    await AppDataSource.transaction(async (manager) => {
      const lockedOrder = await this.requireOrderDetail(order.id, manager);
      if (dto.returnId) {
        const { ReturnRequest } = await import('../../database/entities/returns.entity');
        const linkedReturn = await manager.findOneBy(ReturnRequest, { id: dto.returnId, orderId: order.id });
        if (!linkedReturn) throw createError.badRequest('Return does not belong to the disputed order');
      }
      const lockedRaisedByType = this.resolveParticipantType(lockedOrder, userId);
      const lockedReason = this.resolveReason(lockedRaisedByType, dto.reason);
      this.assertOrderStageAllowsDispute(lockedOrder, lockedRaisedByType, lockedReason);
      await this.assertWithinDisputeWindow(lockedOrder);
      const lockedDisputedItems = this.resolveDisputedItems(
        lockedOrder,
        dto.disputedItems,
      );
      await this.assertNoDuplicateActiveDispute(
        lockedOrder.id,
        userId,
        lockedReason,
        lockedDisputedItems,
        manager,
      );
      const uploads = await this.loadAvailableUploads(userId, evidenceRefs, manager);

      const dispute = await manager.save(
        Dispute,
        manager.create(Dispute, {
          disputeNumber: await this.generateDisputeNumber(manager),
          orderId: lockedOrder.id,
          sellerOrderId: lockedOrder.id,
          returnId: dto.returnId ?? null,
          raisedBy: userId,
          raisedByType: lockedRaisedByType,
          buyerId: lockedOrder.buyerId,
          sellerId: lockedOrder.sellerId,
          reason: lockedReason,
          description: dto.description,
          status: DisputeStatus.OPEN,
          resolutionType: null,
          resolutionNotes: null,
          financialAction: null,
          assignedAdminId: null,
          resolvedBy: null,
          resolvedAt: null,
          closedAt: null,
        }),
      );
      disputeId = dispute.id;

      await manager.save(
        DisputeItem,
        lockedDisputedItems.map((item) =>
          manager.create(DisputeItem, {
            disputeId: dispute.id,
            orderItemId: item.orderItemId,
            quantityAffected: item.quantityAffected,
          }),
        ),
      );

      const evidence = await this.attachUploadsAsEvidence(
        manager,
        dispute.id,
        userId,
        evidenceRefs,
        uploads,
      );

      await manager.save(
        DisputeMessage,
        manager.create(DisputeMessage, {
          disputeId: dispute.id,
          senderId: userId,
          senderType: messageSenderTypeFromRaisedBy(lockedRaisedByType),
          message: dto.description,
          attachments: evidence.map(snapshotEvidence),
        }),
      );

      await this.recordAudit(manager, {
        disputeId: dispute.id,
        actorId: userId,
        actorType: auditActorTypeFromRaisedBy(lockedRaisedByType),
        action: 'DISPUTE_CREATED',
        previousValue: null,
        newValue: {
          status: DisputeStatus.OPEN,
          reason: lockedReason,
          disputedItems: lockedDisputedItems,
        },
        metadata: {
          orderId: lockedOrder.id,
          orderReference: lockedOrder.orderReference,
          sellerOrderId: lockedOrder.id,
        },
      });

      if (evidence.length > 0) {
        await this.recordAudit(manager, {
          disputeId: dispute.id,
          actorId: userId,
          actorType: auditActorTypeFromRaisedBy(lockedRaisedByType),
          action: 'DISPUTE_EVIDENCE_ADDED',
          metadata: { evidenceCount: evidence.length },
        });
      }
    });

    const dispute = await this.requireDisputeDetail(disputeId);
    emitDisputeEvent('DISPUTE_CREATED', dispute, {
      actorId: userId,
      actorType: raisedByType,
    });
    if ((dispute.evidence ?? []).length > 0) {
      emitDisputeEvent('DISPUTE_EVIDENCE_ADDED', dispute, {
        actorId: userId,
        actorType: raisedByType,
        metadata: { evidenceCount: dispute.evidence?.length ?? 0 },
      });
    }
    await this.sendCreationEmails(dispute);

    return {
      success: true,
      message: 'Your dispute has been submitted successfully.',
      data: {
        id: dispute.id,
        disputeId: dispute.id,
        disputeNumber: dispute.disputeNumber,
        sellerOrderId: dispute.sellerOrderId,
    returnId: dispute.returnId,
        status: dispute.status,
      },
    };
  }

  async listMyDisputes(
    userId: string,
    query: DisputeQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[]; pagination: Pagination }> {
    const qb = this.disputeRepo
      .createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.order', 'order')
      .leftJoinAndSelect('dispute.buyer', 'buyer')
      .leftJoinAndSelect('dispute.seller', 'seller')
      .where(
        new Brackets((whereQb) => {
          whereQb
            .where('dispute.buyerId = :userId', { userId })
            .orWhere('dispute.sellerId = :userId', { userId });
        }),
      )
      .orderBy('dispute.updatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    this.applyDisputeFilters(qb, query);
    const [disputes, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: disputes.map((dispute) => serializeDisputeListItem(dispute, userId)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async getMyDisputeById(
    userId: string,
    disputeId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const dispute = await this.requireParticipantDisputeDetail(disputeId, userId);
    return { success: true, data: serializeDisputeDetail(dispute, userId, false) };
  }

  async sendMessage(
    userId: string,
    disputeId: string,
    dto: DisputeMessageDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const dispute = await this.requireParticipantDisputeDetail(disputeId, userId);
    if ([DisputeStatus.RESOLVED, DisputeStatus.CLOSED].includes(dispute.status)) {
      throw createError.conflict('Resolved or closed disputes cannot receive new messages.');
    }

    let senderType = this.resolveParticipantSenderType(dispute, userId);
    this.assertMessageLength(dto.message, 'Dispute message');
    const evidenceRefs = dto.attachments as EvidenceReference[];
    this.assertNoDuplicateFileIds(evidenceRefs);
    if (evidenceRefs.length > config.disputes.maxMessageAttachments) {
      throw createError.badRequest(
        `A dispute message cannot include more than ${config.disputes.maxMessageAttachments} attachments.`,
        'DISPUTE_MESSAGE_ATTACHMENT_LIMIT_REACHED',
      );
    }

    let messageId = '';
    await AppDataSource.transaction(async (manager) => {
      const lockedDispute = await this.requireDisputeDetail(dispute.id, manager);
      if ([DisputeStatus.RESOLVED, DisputeStatus.CLOSED].includes(lockedDispute.status)) {
        throw createError.conflict('Resolved or closed disputes cannot receive new messages.');
      }
      senderType = this.resolveParticipantSenderType(lockedDispute, userId);
      await this.assertEvidenceCapacity(
        lockedDispute.id,
        evidenceRefs.length,
        manager,
      );
      const uploads = await this.loadAvailableUploads(userId, evidenceRefs, manager);
      const previousStatus = lockedDispute.status;
      const nextStatus = nextStatusAfterParticipantMessage(
        lockedDispute.status,
        senderType,
      );
      const evidence = await this.attachUploadsAsEvidence(
        manager,
        lockedDispute.id,
        userId,
        evidenceRefs,
        uploads,
      );
      const message = await manager.save(
        DisputeMessage,
        manager.create(DisputeMessage, {
          disputeId: lockedDispute.id,
          senderId: userId,
          senderType,
          message: dto.message,
          attachments: evidence.map(snapshotEvidence),
        }),
      );
      messageId = message.id;

      if (nextStatus && nextStatus !== lockedDispute.status) {
        await manager.update(Dispute, lockedDispute.id, { status: nextStatus });
      }

      await this.recordAudit(manager, {
        disputeId: lockedDispute.id,
        actorId: userId,
        actorType: auditActorTypeFromSender(senderType),
        action: 'DISPUTE_MESSAGE_SENT',
        metadata: { messageId, attachmentCount: evidence.length },
      });
      await this.recordAudit(manager, {
        disputeId: lockedDispute.id,
        actorId: userId,
        actorType: auditActorTypeFromSender(senderType),
        action:
          senderType === DisputeMessageSenderType.BUYER
            ? 'DISPUTE_BUYER_RESPONDED'
            : 'DISPUTE_SELLER_RESPONDED',
        previousValue: previousStatus === nextStatus ? null : { status: previousStatus },
        newValue: nextStatus ? { status: nextStatus } : null,
        metadata: { messageId },
      });
      if (evidence.length > 0) {
        await this.recordAudit(manager, {
          disputeId: lockedDispute.id,
          actorId: userId,
          actorType: auditActorTypeFromSender(senderType),
          action: 'DISPUTE_EVIDENCE_ADDED',
          metadata: { evidenceCount: evidence.length, messageId },
        });
      }
    });

    const updated = await this.requireDisputeDetail(dispute.id);
    emitDisputeEvent('DISPUTE_MESSAGE_SENT', updated, {
      actorId: userId,
      actorType: senderType,
      metadata: { messageId },
    });
    emitDisputeEvent(
      senderType === DisputeMessageSenderType.BUYER
        ? 'DISPUTE_BUYER_RESPONDED'
        : 'DISPUTE_SELLER_RESPONDED',
      updated,
      { actorId: userId, actorType: senderType, metadata: { messageId } },
    );
    if (evidenceRefs.length > 0) {
      emitDisputeEvent('DISPUTE_EVIDENCE_ADDED', updated, {
        actorId: userId,
        actorType: senderType,
        metadata: { evidenceCount: evidenceRefs.length, messageId },
      });
    }

    return {
      success: true,
      message: 'Dispute response submitted successfully.',
      data: serializeDisputeMessage(
        (updated.messages ?? []).find((message) => message.id === messageId)!,
      ),
    };
  }

  async listAdminDisputes(
    query: AdminDisputeQueryDto,
  ): Promise<{ success: true; data: Record<string, unknown>[]; pagination: Pagination }> {
    const qb = this.disputeRepo
      .createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.order', 'order')
      .leftJoinAndSelect('dispute.buyer', 'buyer')
      .leftJoinAndSelect('dispute.seller', 'seller')
      .orderBy('dispute.updatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    this.applyDisputeFilters(qb, query);
    if (query.search) {
      qb.andWhere(
        new Brackets((searchQb) => {
          searchQb
            .where('dispute.disputeNumber LIKE :search')
            .orWhere('order.orderReference LIKE :search')
            .orWhere('buyer.email LIKE :search')
            .orWhere('seller.email LIKE :search')
            .orWhere('buyer.firstName LIKE :search')
            .orWhere('buyer.lastName LIKE :search')
            .orWhere('seller.firstName LIKE :search')
            .orWhere('seller.lastName LIKE :search')
            .orWhere('seller.storeName LIKE :search')
            .orWhere('seller.companyName LIKE :search');
        }),
      ).setParameter('search', `%${query.search}%`);
    }
    if (query.reason) {
      qb.andWhere('dispute.reason LIKE :reason', { reason: `%${query.reason}%` });
    }
    if (query.raisedByType) {
      qb.andWhere('dispute.raisedByType = :raisedByType', {
        raisedByType: query.raisedByType,
      });
    }
    if (query.buyerId) {
      qb.andWhere('dispute.buyerId = :buyerId', { buyerId: query.buyerId });
    }
    if (query.sellerId) {
      qb.andWhere('dispute.sellerId = :sellerId', { sellerId: query.sellerId });
    }
    if (query.assignedAdminId) {
      qb.andWhere('dispute.assignedAdminId = :assignedAdminId', {
        assignedAdminId: query.assignedAdminId,
      });
    }

    const [disputes, total] = await qb.getManyAndCount();
    return {
      success: true,
      data: disputes.map((dispute) => serializeDisputeListItem(dispute)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async getAdminMetrics(): Promise<{ success: true; data: Record<string, unknown> }> {
    const statusRows = await this.disputeRepo
      .createQueryBuilder('dispute')
      .select('dispute.status', 'status')
      .addSelect('COUNT(*)', 'total')
      .groupBy('dispute.status')
      .getRawMany<{ status: DisputeStatus; total: string }>();
    const average = await this.disputeRepo
      .createQueryBuilder('dispute')
      .select('AVG(TIMESTAMPDIFF(SECOND, dispute.createdAt, dispute.resolvedAt))', 'seconds')
      .where('dispute.resolvedAt IS NOT NULL')
      .getRawOne<{ seconds: string | null }>();

    const byStatus = Object.fromEntries(
      Object.values(DisputeStatus).map((status) => [status, 0]),
    ) as Record<DisputeStatus, number>;
    for (const row of statusRows) {
      byStatus[row.status] = Number(row.total);
    }

    return {
      success: true,
      data: {
        openDisputes: byStatus[DisputeStatus.OPEN],
        underReview: byStatus[DisputeStatus.UNDER_REVIEW],
        awaitingBuyer: byStatus[DisputeStatus.AWAITING_BUYER],
        awaitingSeller: byStatus[DisputeStatus.AWAITING_SELLER],
        resolved: byStatus[DisputeStatus.RESOLVED],
        closed: byStatus[DisputeStatus.CLOSED],
        byStatus,
        averageResolutionTimeSeconds:
          average?.seconds === null || average?.seconds === undefined
            ? null
            : Number(average.seconds),
      },
    };
  }

  async getAdminDisputeById(
    disputeId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const dispute = await this.requireDisputeDetail(disputeId);
    return { success: true, data: serializeDisputeDetail(dispute, undefined, true) };
  }

  async assignDispute(
    disputeId: string,
    actorAdminId: string,
    dto: AssignDisputeDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const dispute = await this.requireDisputeDetail(disputeId);
    if ([DisputeStatus.RESOLVED, DisputeStatus.CLOSED].includes(dispute.status)) {
      throw createError.conflict('Resolved or closed disputes cannot be reassigned.');
    }
    const admin = await this.adminRepo.findOne({
      where: { id: dto.adminId, status: AdminStatus.ACTIVE },
    });
    if (!admin) throw createError.notFound('Active Admin assignee not found.');

    await AppDataSource.transaction(async (manager) => {
      await manager.update(Dispute, dispute.id, { assignedAdminId: dto.adminId });
      await this.recordAudit(manager, {
        disputeId: dispute.id,
        actorId: actorAdminId,
        actorType: DisputeAuditActorType.ADMIN,
        action: 'DISPUTE_ASSIGNED',
        previousValue: { assignedAdminId: dispute.assignedAdminId },
        newValue: { assignedAdminId: dto.adminId },
      });
    });

    const updated = await this.requireDisputeDetail(dispute.id);
    emitDisputeEvent('DISPUTE_ASSIGNED', updated, {
      actorId: actorAdminId,
      actorType: DisputeAuditActorType.ADMIN,
    });

    return {
      success: true,
      message: 'Dispute assigned successfully.',
      data: {
        disputeId: updated.id,
        disputeNumber: updated.disputeNumber,
        assignedAdminId: updated.assignedAdminId,
      },
    };
  }

  async startReview(
    disputeId: string,
    adminId: string,
    dto: AdminDisputeStatusUpdateDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const dispute = await this.requireDisputeDetail(disputeId);
    if (dto.status !== DisputeStatus.UNDER_REVIEW) {
      throw createError.badRequest('Only under_review can be set from this endpoint.');
    }
    if (dispute.status === DisputeStatus.UNDER_REVIEW) {
      return {
        success: true,
        message: 'Dispute is already under review.',
        data: { disputeId: dispute.id, status: dispute.status },
      };
    }
    if (!ACTIVE_DISPUTE_STATUSES.includes(dispute.status)) {
      throw createError.conflict(`Dispute cannot move from ${dispute.status} to under_review.`);
    }

    const changed = await AppDataSource.transaction(async (manager) => {
      const locked = await this.lockDispute(manager, dispute.id);
      if (locked.status === DisputeStatus.UNDER_REVIEW) return false;
      if (!ACTIVE_DISPUTE_STATUSES.includes(locked.status)) {
        throw createError.conflict(
          `Dispute cannot move from ${locked.status} to under_review.`,
        );
      }
      await manager.update(Dispute, dispute.id, { status: DisputeStatus.UNDER_REVIEW });
      await this.recordAudit(manager, {
        disputeId: dispute.id,
        actorId: adminId,
        actorType: DisputeAuditActorType.ADMIN,
        action: 'DISPUTE_REVIEW_STARTED',
        previousValue: { status: locked.status },
        newValue: { status: DisputeStatus.UNDER_REVIEW },
        metadata: { notes: dto.notes ?? null },
      });
      return true;
    });

    if (!changed) {
      return {
        success: true,
        message: 'Dispute is already under review.',
        data: { disputeId: dispute.id, status: DisputeStatus.UNDER_REVIEW },
      };
    }

    const updated = await this.requireDisputeDetail(dispute.id);
    emitDisputeEvent('DISPUTE_REVIEW_STARTED', updated, {
      actorId: adminId,
      actorType: DisputeAuditActorType.ADMIN,
    });

    return {
      success: true,
      message: 'Dispute review started successfully.',
      data: { disputeId: updated.id, status: updated.status },
    };
  }

  async requestInformation(
    disputeId: string,
    adminId: string,
    dto: RequestDisputeInformationDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const dispute = await this.requireDisputeDetail(disputeId);
    if ([DisputeStatus.RESOLVED, DisputeStatus.CLOSED].includes(dispute.status)) {
      throw createError.conflict('Resolved or closed disputes cannot request more information.');
    }
    this.assertMessageLength(dto.message, 'Information request message');
    const nextStatus =
      dto.from === DisputeRaisedByType.BUYER
        ? DisputeStatus.AWAITING_BUYER
        : DisputeStatus.AWAITING_SELLER;
    const action: DisputeEventName =
      dto.from === DisputeRaisedByType.BUYER
        ? 'DISPUTE_BUYER_INFORMATION_REQUESTED'
        : 'DISPUTE_SELLER_INFORMATION_REQUESTED';

    let messageId = '';
    await AppDataSource.transaction(async (manager) => {
      const locked = await this.lockDispute(manager, dispute.id);
      if ([DisputeStatus.RESOLVED, DisputeStatus.CLOSED].includes(locked.status)) {
        throw createError.conflict(
          'Resolved or closed disputes cannot request more information.',
        );
      }
      await manager.update(Dispute, dispute.id, { status: nextStatus });
      const message = await manager.save(
        DisputeMessage,
        manager.create(DisputeMessage, {
          disputeId: dispute.id,
          senderId: adminId,
          senderType: DisputeMessageSenderType.ADMIN,
          message: dto.message,
          attachments: null,
        }),
      );
      messageId = message.id;

      await this.recordAudit(manager, {
        disputeId: dispute.id,
        actorId: adminId,
        actorType: DisputeAuditActorType.ADMIN,
        action,
        previousValue: { status: locked.status },
        newValue: { status: nextStatus },
        metadata: { messageId, requestMessage: dto.message },
      });
    });

    const updated = await this.requireDisputeDetail(dispute.id);
    emitDisputeEvent(action, updated, {
      actorId: adminId,
      actorType: DisputeAuditActorType.ADMIN,
      metadata: { messageId },
    });
    await this.sendInformationRequestEmail(updated, dto.from, dto.message);

    return {
      success: true,
      message: 'Additional dispute information requested successfully.',
      data: { disputeId: updated.id, status: updated.status },
    };
  }

  async resolveDispute(
    disputeId: string,
    adminId: string,
    dto: ResolveDisputeDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const dispute = await this.requireDisputeDetail(disputeId);
    if ([DisputeStatus.RESOLVED, DisputeStatus.CLOSED].includes(dispute.status)) {
      throw createError.conflict('This dispute has already been resolved or closed.');
    }
    this.validateFinancialAction(dispute, dto.financialAction);
    this.assertMessageLength(dto.resolutionNotes, 'Resolution notes');

    const now = new Date();
    await AppDataSource.transaction('READ COMMITTED', async (manager) => {
      const { lockOrder, AfterSalesService } = await import('../after-sales/after-sales.service');
      await lockOrder(manager, dispute.orderId);
      const locked = await this.lockDispute(manager, dispute.id);
      if ([DisputeStatus.RESOLVED, DisputeStatus.CLOSED].includes(locked.status)) {
        throw createError.conflict('This dispute has already been resolved or closed.');
      }
      await manager.update(Dispute, dispute.id, {
        status: DisputeStatus.RESOLVED,
        resolutionType: dto.resolutionType as DisputeResolutionType,
        resolutionNotes: dto.resolutionNotes,
        financialAction: dto.financialAction,
        resolvedBy: adminId,
        resolvedAt: now,
      });
      await this.recordAudit(manager, {
        disputeId: dispute.id,
        actorId: adminId,
        actorType: DisputeAuditActorType.ADMIN,
        action: 'DISPUTE_RESOLVED',
        previousValue: { status: locked.status },
        newValue: {
          status: DisputeStatus.RESOLVED,
          resolutionType: dto.resolutionType,
          financialAction: dto.financialAction,
        },
        metadata: { resolutionNotes: dto.resolutionNotes },
      });
      if (dto.financialAction.type !== 'none') {
        await new AfterSalesService().createRefund(manager, { id: adminId, type: 'admin' }, {
          sellerOrderId: dispute.orderId, sourceType: 'dispute', disputeId: dispute.id,
          refundType: dto.financialAction.type === 'refund' ? 'full' : 'partial',
          amount: dto.financialAction.amount!, reason: dto.resolutionNotes,
        });
        await this.recordAudit(manager, {
          disputeId: dispute.id,
          actorId: adminId,
          actorType: DisputeAuditActorType.ADMIN,
          action: 'DISPUTE_REFUND_REQUESTED',
          metadata: { financialAction: dto.financialAction },
        });
      }
    });

    const updated = await this.requireDisputeDetail(dispute.id);
    emitDisputeEvent('DISPUTE_RESOLVED', updated, {
      actorId: adminId,
      actorType: DisputeAuditActorType.ADMIN,
    });
    if (dto.financialAction.type !== 'none') {
      emitDisputeEvent('DISPUTE_REFUND_REQUESTED', updated, {
        actorId: adminId,
        actorType: DisputeAuditActorType.ADMIN,
        metadata: { financialAction: dto.financialAction },
      });
    }
    await this.sendResolutionEmails(updated);

    return {
      success: true,
      message: 'Dispute resolved successfully.',
      data: {
        disputeId: updated.id,
        disputeNumber: updated.disputeNumber,
        status: updated.status,
        resolutionType: updated.resolutionType,
        financialAction: updated.financialAction,
      },
    };
  }

  async closeDispute(
    disputeId: string,
    adminId: string,
    dto: CloseDisputeDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const dispute = await this.requireDisputeDetail(disputeId);
    if (dispute.status === DisputeStatus.CLOSED) {
      return {
        success: true,
        message: 'Dispute is already closed.',
        data: { disputeId: dispute.id, status: dispute.status },
      };
    }
    if (dispute.status !== DisputeStatus.RESOLVED) {
      throw createError.conflict('Only resolved disputes can be closed.');
    }

    const changed = await AppDataSource.transaction(async (manager) => {
      const locked = await this.lockDispute(manager, dispute.id);
      if (locked.status === DisputeStatus.CLOSED) return false;
      if (locked.status !== DisputeStatus.RESOLVED) {
        throw createError.conflict('Only resolved disputes can be closed.');
      }
      await manager.update(Dispute, dispute.id, {
        status: DisputeStatus.CLOSED,
        closedAt: new Date(),
      });
      await this.recordAudit(manager, {
        disputeId: dispute.id,
        actorId: adminId,
        actorType: DisputeAuditActorType.ADMIN,
        action: 'DISPUTE_CLOSED',
        previousValue: { status: locked.status },
        newValue: { status: DisputeStatus.CLOSED },
        metadata: { notes: dto.notes ?? null },
      });
      return true;
    });

    if (!changed) {
      return {
        success: true,
        message: 'Dispute is already closed.',
        data: { disputeId: dispute.id, status: DisputeStatus.CLOSED },
      };
    }

    const updated = await this.requireDisputeDetail(dispute.id);
    emitDisputeEvent('DISPUTE_CLOSED', updated, {
      actorId: adminId,
      actorType: DisputeAuditActorType.ADMIN,
    });

    return {
      success: true,
      message: 'Dispute closed successfully.',
      data: {
        disputeId: updated.id,
        disputeNumber: updated.disputeNumber,
        status: updated.status,
        closedAt: updated.closedAt,
      },
    };
  }

  private async requireOrderDetail(
    sellerOrderId: string,
    manager?: EntityManager,
  ): Promise<Order> {
    const repo = manager?.getRepository(Order) ?? this.orderRepo;
    const order = await repo.findOne({
      where: { id: sellerOrderId },
      relations: ['buyer', 'seller', 'items', 'delivery', 'payment'],
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!order) throw createError.notFound('Seller order not found.');
    return order;
  }

  private async lockDispute(
    manager: EntityManager,
    disputeId: string,
  ): Promise<Dispute> {
    const dispute = await manager
      .getRepository(Dispute)
      .createQueryBuilder('dispute')
      .setLock('pessimistic_write')
      .where('dispute.id = :disputeId', { disputeId })
      .getOne();
    if (!dispute) throw createError.notFound('Dispute not found');
    return dispute;
  }

  private resolveParticipantType(
    order: Order,
    userId: string,
  ): DisputeRaisedByType {
    if (order.buyerId === userId) return DisputeRaisedByType.BUYER;
    if (order.sellerId === userId) return DisputeRaisedByType.SELLER;
    throw createError.forbidden('You do not have access to this seller order.');
  }

  private resolveParticipantSenderType(
    dispute: Dispute,
    userId: string,
  ): DisputeMessageSenderType {
    if (dispute.buyerId === userId) return DisputeMessageSenderType.BUYER;
    if (dispute.sellerId === userId) return DisputeMessageSenderType.SELLER;
    throw createError.forbidden('You do not have access to this dispute.');
  }

  private resolveReason(
    raisedByType: DisputeRaisedByType,
    reason: string,
  ): string {
    const allowed =
      raisedByType === DisputeRaisedByType.BUYER
        ? config.disputes.buyerReasons
        : config.disputes.sellerReasons;
    const normalized = reason.trim().toLowerCase();
    const matched = allowed.find((value) => value.trim().toLowerCase() === normalized);
    if (!matched) {
      throw createError.badRequest(
        `Invalid dispute reason for ${raisedByType}.`,
        'DISPUTE_REASON_NOT_ALLOWED',
      );
    }
    return matched;
  }

  private assertOrderStageAllowsDispute(
    order: Order,
    raisedByType: DisputeRaisedByType,
    reason: string,
  ): void {
    if (order.status === OrderStatus.CANCELLED) {
      throw createError.conflict('Cancelled orders cannot receive new disputes.');
    }
    const lowerReason = reason.toLowerCase();
    const deliveredOrLater = isOrderAtOrAfter(order.status, OrderStatus.DELIVERED);
    const shippedOrLater = isOrderAtOrAfter(order.status, OrderStatus.SHIPPED);
    const paidOrLater = isOrderAtOrAfter(order.status, OrderStatus.PAID);

    if (raisedByType === DisputeRaisedByType.BUYER) {
      if (
        includesAny(lowerReason, [
          'wrong product',
          'significantly different',
          'damaged',
          'incorrect quantity',
          'missing items',
        ]) &&
        !deliveredOrLater
      ) {
        throw createError.conflict('This dispute reason is available after delivery.');
      }
      if (
        includesAny(lowerReason, ['not received', 'delivery issue']) &&
        !shippedOrLater
      ) {
        throw createError.conflict('Delivery disputes are available after shipment.');
      }
      if (!paidOrLater) {
        throw createError.conflict('This order is not yet eligible for disputes.');
      }
      return;
    }

    if (
      lowerReason.includes('buyer-arranged logistics') &&
      order.deliveryType !== DeliveryType.BUYER_ARRANGED
    ) {
      throw createError.badRequest(
        'Buyer-arranged logistics disputes require a buyer-arranged delivery order.',
      );
    }
    if (lowerReason.includes('delivery acceptance') && !deliveredOrLater) {
      throw createError.conflict('Delivery acceptance disputes are available after delivery.');
    }
    if (!paidOrLater) {
      throw createError.conflict('This order is not yet eligible for disputes.');
    }
  }

  private async assertWithinDisputeWindow(order: Order): Promise<void> {
    const windowDays=await getSetting<number>('disputeWindowDays');
    if (windowDays <= 0) return;

    const anchor =
      order.delivery?.deliveredAt ??
      order.receivedAt ??
      order.completedAt ??
      (isOrderAtOrAfter(order.status, OrderStatus.DELIVERED) ? order.updatedAt : null);
    if (!anchor) return;

    const cutoff = addDays(anchor, windowDays);
    if (Date.now() > cutoff.getTime()) {
      throw createError.conflict(
        `The dispute window for this order closed on ${cutoff.toISOString()}.`,
        'DISPUTE_WINDOW_CLOSED',
      );
    }
  }

  private resolveDisputedItems(
    order: Order,
    requestedItems: DisputedItemInput[],
  ): DisputedItemInput[] {
    const orderItems = order.items ?? [];
    if (orderItems.length === 0) {
      throw createError.conflict('This seller order has no items to dispute.');
    }
    if (requestedItems.length === 0) {
      if (orderItems.length > 1) {
        throw createError.badRequest(
          'disputedItems is required when a seller order contains multiple products.',
        );
      }
      const item = orderItems[0];
      return [{ orderItemId: item.id, quantityAffected: toNumber(item.quantity) }];
    }

    const seen = new Set<string>();
    const byItemId = new Map(orderItems.map((item) => [item.id, item]));
    for (const item of requestedItems) {
      if (seen.has(item.orderItemId)) {
        throw createError.badRequest('Duplicate disputed order items are not allowed.');
      }
      seen.add(item.orderItemId);
      const orderItem = byItemId.get(item.orderItemId);
      if (!orderItem) {
        throw createError.badRequest('One or more disputed items do not belong to this seller order.');
      }
      if (item.quantityAffected > toNumber(orderItem.quantity)) {
        throw createError.badRequest(
          'quantityAffected cannot exceed the quantity purchased.',
        );
      }
    }

    return requestedItems;
  }

  private async assertNoDuplicateActiveDispute(
    sellerOrderId: string,
    userId: string,
    reason: string,
    disputedItems: DisputedItemInput[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager?.getRepository(Dispute) ?? this.disputeRepo;
    const existing = await repo.find({
      where: {
        sellerOrderId,
        raisedBy: userId,
        reason,
        status: In(ACTIVE_DISPUTE_STATUSES),
      },
      relations: ['items'],
    });
    if (existing.length === 0) return;

    const requestedItemIds = new Set(disputedItems.map((item) => item.orderItemId));
    const duplicate = existing.find((dispute) => {
      const existingItemIds = (dispute.items ?? []).map((item) => item.orderItemId);
      if (requestedItemIds.size === 0 || existingItemIds.length === 0) return true;
      return existingItemIds.some((itemId) => requestedItemIds.has(itemId));
    });

    if (duplicate) {
      throw createError.conflict(
        'An active dispute already exists for this issue.',
        'ACTIVE_DISPUTE_EXISTS',
      );
    }
  }

  private async assertEvidenceCapacity(
    disputeId: string,
    additionalCount: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (additionalCount === 0) return;
    const repo = manager?.getRepository(DisputeEvidence) ?? this.evidenceRepo;
    const currentCount = await repo.count({ where: { disputeId } });
    if (currentCount + additionalCount > (await getSetting<number>('maximumDisputeEvidenceFiles'))) {
      throw createError.badRequest(
        `A dispute cannot contain more than ${(await getSetting<number>('maximumDisputeEvidenceFiles'))} evidence files.`,
        'DISPUTE_EVIDENCE_LIMIT_REACHED',
      );
    }
  }

  private assertMessageLength(value: string, label: string): void {
    if (value.length > config.disputes.maxMessageCharacters) {
      throw createError.badRequest(
        `${label} cannot exceed ${config.disputes.maxMessageCharacters} characters.`,
      );
    }
  }

  private assertNoDuplicateFileIds(refs: EvidenceReference[]): void {
    const fileIds = refs.map((ref) => ref.fileId);
    if (unique(fileIds).length !== fileIds.length) {
      throw createError.badRequest('Duplicate evidence fileIds are not allowed.');
    }
  }

  private async loadAvailableUploads(
    userId: string,
    refs: EvidenceReference[],
    manager?: EntityManager,
  ): Promise<DisputeEvidenceUpload[]> {
    if (refs.length === 0) return [];
    const fileIds = refs.map((ref) => ref.fileId);
    let qb = (manager?.getRepository(DisputeEvidenceUpload) ?? this.uploadRepo)
      .createQueryBuilder('upload')
      .where('upload.id IN (:...fileIds)', { fileIds })
      .andWhere('upload.userId = :userId', { userId })
      .andWhere('upload.status = :status', {
        status: DisputeEvidenceUploadStatus.UPLOADED,
      });
    if (manager) {
      qb = qb.setLock('pessimistic_write');
    }
    const uploads = await qb.getMany();
    if (uploads.length !== fileIds.length) {
      throw createError.badRequest(
        'One or more dispute evidence files were not found or are already attached.',
        'DISPUTE_EVIDENCE_NOT_ALLOWED',
      );
    }
    const now = Date.now();
    for (const upload of uploads) {
      if (upload.expiresAt && upload.expiresAt.getTime() < now) {
        throw createError.badRequest(
          'One or more dispute evidence uploads have expired. Please upload again.',
          'DISPUTE_EVIDENCE_EXPIRED',
        );
      }
    }
    return uploads;
  }

  private async attachUploadsAsEvidence(
    manager: EntityManager,
    disputeId: string,
    uploadedBy: string,
    refs: EvidenceReference[],
    uploads: DisputeEvidenceUpload[],
  ): Promise<DisputeEvidence[]> {
    if (refs.length === 0) return [];

    const uploadById = new Map(uploads.map((upload) => [upload.id, upload]));
    const evidence = await manager.save(
      DisputeEvidence,
      refs.map((ref) => {
        const upload = uploadById.get(ref.fileId);
        if (!upload) {
          throw createError.badRequest('One or more dispute evidence files are invalid.');
        }
        return manager.create(DisputeEvidence, {
          disputeId,
          uploadedBy,
          fileType: upload.fileType,
          fileUrl: upload.fileUrl,
          fileName: upload.fileName,
          storedName: upload.storedName,
          uploadId: upload.id,
          description: ref.description ?? null,
        });
      }),
    );

    await manager.update(
      DisputeEvidenceUpload,
      { id: In(refs.map((ref) => ref.fileId)) },
      { status: DisputeEvidenceUploadStatus.ATTACHED, usedAt: new Date() },
    );
    return evidence;
  }

  private applyDisputeFilters(
    qb: SelectQueryBuilder<Dispute>,
    query: DisputeQueryDto,
  ): void {
    if (query.status) {
      qb.andWhere('dispute.status = :status', { status: query.status });
    }
    if (query.dateFrom) {
      qb.andWhere('dispute.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('dispute.createdAt <= :dateTo', { dateTo: query.dateTo });
    }
  }

  private async requireParticipantDisputeDetail(
    disputeId: string,
    userId: string,
  ): Promise<DisputeWithRelations> {
    const dispute = await this.requireDisputeDetail(disputeId);
    if (dispute.buyerId !== userId && dispute.sellerId !== userId) {
      throw createError.forbidden('You do not have access to this dispute.');
    }
    return dispute;
  }

  private async requireDisputeDetail(
    disputeId: string,
    manager?: EntityManager,
  ): Promise<DisputeWithRelations> {
    const repo = manager?.getRepository(Dispute) ?? this.disputeRepo;
    const dispute = await repo.findOne({
      where: { id: disputeId },
      relations: [
        'order',
        'order.buyer',
        'order.seller',
        'order.items',
        'order.delivery',
        'order.payment',
        'buyer',
        'seller',
        'raiser',
        'items',
        'items.orderItem',
        'evidence',
        'messages',
        'auditEvents',
      ],
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!dispute) throw createError.notFound('Dispute not found.');
    return dispute as DisputeWithRelations;
  }

  private async generateDisputeNumber(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      const disputeNumber = `DSP-${year}-${suffix}`;
      const existing = await manager.findOne(Dispute, {
        where: { disputeNumber },
        select: ['id'],
      });
      if (!existing) return disputeNumber;
    }
    throw createError.conflict('Unable to generate a unique dispute number.');
  }

  private validateFinancialAction(
    dispute: DisputeWithRelations,
    financialAction: DisputeFinancialAction,
  ): void {
    if (financialAction.type === 'none') return;
    const order = dispute.order;
    if (!order) throw createError.conflict('Dispute order details are unavailable.');
    const paymentCurrency = order.paymentCurrency.toUpperCase();
    if (financialAction.currency?.toUpperCase() !== paymentCurrency) {
      throw createError.badRequest(
        `Refund currency must match the original payment currency (${paymentCurrency}).`,
        'DISPUTE_REFUND_CURRENCY_MISMATCH',
      );
    }
    const amount = Number(financialAction.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw createError.badRequest('Refund amount must be greater than zero.');
    }
    if (amount > toNumber(order.paymentAmount)) {
      throw createError.badRequest(
        'Refund amount cannot exceed the amount paid through TOFA for this seller order.',
        'DISPUTE_REFUND_AMOUNT_EXCEEDS_PAYMENT',
      );
    }
  }

  private async recordAudit(
    manager: EntityManager,
    input: AuditInput,
  ): Promise<DisputeAuditEvent> {
    const current = await manager.findOneBy(Dispute, {id:input.disputeId});
    if (current?.orderId) {
      const order = await manager.findOneBy(Order, {id:current.orderId});
      if (order) await new SettlementService().syncOrder(manager, order);
    }
    return manager.save(
      DisputeAuditEvent,
      manager.create(DisputeAuditEvent, {
        disputeId: input.disputeId,
        actorId: input.actorId,
        actorType: input.actorType,
        action: input.action,
        previousValue: input.previousValue ?? null,
        newValue: input.newValue ?? null,
        metadata: input.metadata ?? null,
      }),
    );
  }

  private async sendCreationEmails(dispute: DisputeWithRelations): Promise<void> {
    const payload = disputeEmailPayload(dispute);
    if (!dispute.buyer || !dispute.seller) return;

    if (dispute.raisedByType === DisputeRaisedByType.BUYER) {
      await Promise.all([
        sendDisputeSubmittedEmail(dispute.buyer.email, dispute.buyer.firstName, payload),
        sendSellerDisputeRaisedEmail(
          dispute.seller.email,
          sellerDisplayName(dispute.seller),
          payload,
        ),
      ]);
      return;
    }

    await Promise.all([
      sendDisputeSubmittedEmail(
        dispute.seller.email,
        sellerDisplayName(dispute.seller),
        payload,
      ),
      sendBuyerDisputeRaisedEmail(dispute.buyer.email, dispute.buyer.firstName, payload),
    ]);
  }

  private async sendInformationRequestEmail(
    dispute: DisputeWithRelations,
    from: 'buyer' | 'seller',
    requestMessage: string,
  ): Promise<void> {
    const payload = { ...disputeEmailPayload(dispute), requestMessage };
    if (from === 'buyer' && dispute.buyer) {
      await sendDisputeInformationRequestedEmail(
        dispute.buyer.email,
        dispute.buyer.firstName,
        payload,
      );
    }
    if (from === 'seller' && dispute.seller) {
      await sendDisputeInformationRequestedEmail(
        dispute.seller.email,
        sellerDisplayName(dispute.seller),
        payload,
      );
    }
  }

  private async sendResolutionEmails(dispute: DisputeWithRelations): Promise<void> {
    if (!dispute.buyer || !dispute.seller) return;
    const payload = {
      ...disputeEmailPayload(dispute),
      resolutionSummary: dispute.resolutionNotes ?? 'The dispute has been resolved.',
    };
    await Promise.all([
      sendDisputeResolvedEmail(dispute.buyer.email, dispute.buyer.firstName, payload),
      sendDisputeResolvedEmail(
        dispute.seller.email,
        sellerDisplayName(dispute.seller),
        payload,
      ),
    ]);
  }
}

function serializeDisputeListItem(
  dispute: DisputeWithRelations,
  viewerId?: string,
): Record<string, unknown> {
  return {
    disputeId: dispute.id,
    id: dispute.id,
    disputeNumber: dispute.disputeNumber,
    orderId: dispute.orderId,
    sellerOrderId: dispute.sellerOrderId,
    returnId: dispute.returnId,
    orderReference: dispute.order?.orderReference ?? null,
    buyer: serializeUser(dispute.buyer),
    seller: serializeSeller(dispute.seller),
    raisedBy: dispute.raisedBy,
    raisedByType: dispute.raisedByType,
    reason: dispute.reason,
    status: dispute.status,
    assignedAdminId: dispute.assignedAdminId,
    actionRequired: actionRequiredForViewer(dispute, viewerId),
    resolutionType: dispute.resolutionType,
    resolvedAt: dispute.resolvedAt,
    closedAt: dispute.closedAt,
    createdAt: dispute.createdAt,
    updatedAt: dispute.updatedAt,
  };
}

function serializeDisputeDetail(
  dispute: DisputeWithRelations,
  viewerId: string | undefined,
  includeAdminFields: boolean,
): Record<string, unknown> {
  const sortedItems = [...(dispute.items ?? [])].sort(byCreatedAt);
  const sortedEvidence = [...(dispute.evidence ?? [])].sort(byCreatedAt);
  const sortedMessages = [...(dispute.messages ?? [])].sort(byCreatedAt);
  const sortedAudit = [...(dispute.auditEvents ?? [])].sort(byCreatedAt);

  return {
    ...serializeDisputeListItem(dispute, viewerId),
    description: dispute.description,
    buyer: serializeUser(dispute.buyer ?? dispute.order?.buyer, includeAdminFields),
    seller: serializeSeller(dispute.seller ?? dispute.order?.seller, includeAdminFields),
    order: serializeOrder(dispute.order, includeAdminFields),
    affectedProducts: sortedItems.map(serializeDisputeItem),
    disputedItems: sortedItems.map(serializeDisputeItem),
    evidence: sortedEvidence.map(serializeEvidence),
    messages: sortedMessages.map(serializeDisputeMessage),
    timeline: sortedAudit.map(serializeTimelineEvent),
    resolution: {
      resolutionType: dispute.resolutionType,
      resolutionNotes: dispute.resolutionNotes,
      financialAction: dispute.financialAction,
      resolvedBy: dispute.resolvedBy,
      resolvedAt: dispute.resolvedAt,
      closedAt: dispute.closedAt,
    },
  };
}

function serializeOrder(
  order: DisputeWithRelations['order'] | undefined,
  includeAdminFields: boolean,
): Record<string, unknown> | null {
  if (!order) return null;
  return {
    orderId: order.id,
    sellerOrderId: order.id,
    orderReference: order.orderReference,
    status: order.status,
    sourceType: order.sourceType,
    sourceId: order.sourceId,
    orderCurrency: order.orderCurrency,
    productsSubtotal: toNumber(order.productsSubtotal),
    logisticsAmount: order.logisticsAmount === null ? null : toNumber(order.logisticsAmount),
    orderTotal: toNumber(order.orderTotal),
    payment: {
      paymentId: includeAdminFields ? order.paymentId : undefined,
      paymentReference: includeAdminFields ? order.payment?.paymentReference ?? null : undefined,
      status: includeAdminFields ? order.payment?.status ?? null : undefined,
      currency: order.paymentCurrency,
      amount: toNumber(order.paymentAmount),
      method: includeAdminFields ? order.payment?.paymentMethod ?? null : undefined,
    },
    delivery: serializeDelivery(order.delivery ?? null),
    items: (order.items ?? []).map(serializeOrderItem),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function serializeDisputeItem(
  item: DisputeItem & { orderItem?: OrderItem },
): Record<string, unknown> {
  return {
    disputeItemId: item.id,
    orderItemId: item.orderItemId,
    quantityAffected: toNumber(item.quantityAffected),
    product: item.orderItem ? serializeOrderItem(item.orderItem) : null,
    createdAt: item.createdAt,
  };
}

function serializeOrderItem(item: OrderItem): Record<string, unknown> {
  return {
    orderItemId: item.id,
    productId: item.productId,
    variantId: item.variantId,
    productName: productNameDisplay(item.productNameSnapshot),
    productNameSnapshot: item.productNameSnapshot,
    productImage: item.productImageSnapshot,
    sku: item.skuSnapshot,
    attributes: item.attributesSnapshot,
    unitPrice: toNumber(item.unitPrice),
    discount: item.discount === null ? null : toNumber(item.discount),
    finalUnitPrice: toNumber(item.finalUnitPrice),
    quantity: toNumber(item.quantity),
    unit: item.unit,
    subtotal: toNumber(item.subtotal),
  };
}

function serializeDelivery(delivery: OrderDelivery | null): Record<string, unknown> | null {
  if (!delivery) return null;
  return {
    type: delivery.deliveryType,
    providerId: delivery.providerId,
    providerName: delivery.providerNameSnapshot,
    serviceName: delivery.serviceNameSnapshot,
    logisticsQuoteId: delivery.logisticsQuoteId,
    logisticsAmount:
      delivery.logisticsAmount === null ? null : toNumber(delivery.logisticsAmount),
    logisticsCurrency: delivery.logisticsCurrency,
    trackingId: delivery.trackingId,
    trackingUrl: delivery.trackingUrl,
    deliveryContact: delivery.deliveryContact,
    estimatedDelivery: delivery.estimatedDelivery,
    buyerLogistics: {
      providerName: delivery.providerNameSnapshot,
      contactName: delivery.buyerLogisticsContactName,
      phoneNumber: delivery.deliveryContact,
      email: delivery.buyerLogisticsEmail,
      trackingReference: delivery.trackingId,
      expectedPickupDate: delivery.expectedPickupDate,
      notes: delivery.buyerLogisticsNotes,
    },
    handover:
      delivery.handoverTo || delivery.handoverReference || delivery.shippedAt
        ? {
            handoverTo: delivery.handoverTo,
            handoverReference: delivery.handoverReference,
            shippedAt: delivery.shippedAt,
            notes: delivery.sellerDeliveryNotes,
          }
        : null,
    pickupAddress: delivery.pickupAddressSnapshot,
    deliveryAddress: delivery.deliveryAddressSnapshot,
    shippedAt: delivery.shippedAt,
    deliveredAt: delivery.deliveredAt,
    sellerDeliveryNotes: delivery.sellerDeliveryNotes,
  };
}

function serializeEvidence(evidence: DisputeEvidence): Record<string, unknown> {
  return {
    evidenceId: evidence.id,
    uploadedBy: evidence.uploadedBy,
    fileType: evidence.fileType,
    fileUrl: evidence.fileUrl,
    fileName: evidence.fileName,
    description: evidence.description,
    createdAt: evidence.createdAt,
  };
}

function serializeDisputeMessage(message: DisputeMessage): Record<string, unknown> {
  return {
    messageId: message.id,
    disputeId: message.disputeId,
    senderId: message.senderId,
    senderType: message.senderType,
    message: message.message,
    attachments: message.attachments ?? [],
    createdAt: message.createdAt,
  };
}

function serializeTimelineEvent(event: DisputeAuditEvent): Record<string, unknown> {
  return {
    id: event.id,
    action: event.action,
    actorId: event.actorId,
    actorType: event.actorType,
    previousValue: event.previousValue,
    newValue: event.newValue,
    metadata: event.metadata,
    createdAt: event.createdAt,
  };
}

function serializeUpload(upload: DisputeEvidenceUpload): Record<string, unknown> {
  return {
    fileId: upload.id,
    fileName: upload.fileName,
    fileType: upload.fileType,
    fileSize: upload.fileSize,
    expiresAt: upload.expiresAt,
    createdAt: upload.createdAt,
  };
}

function snapshotEvidence(evidence: DisputeEvidence): DisputeMessageAttachmentSnapshot {
  return {
    evidenceId: evidence.id,
    fileName: evidence.fileName,
    fileType: evidence.fileType,
    fileUrl: evidence.fileUrl,
  };
}

function serializeUser(
  user?: User | null,
  includeEmail = false,
): Record<string, unknown> | null {
  if (!user) return null;
  return {
    id: user.id,
    name: displayName(user),
    firstName: user.firstName,
    lastName: user.lastName,
    ...(includeEmail ? { email: user.email, phoneNumber: user.phoneNumber } : {}),
    country: user.country,
  };
}

function serializeSeller(
  seller?: User | null,
  includeEmail = false,
): Record<string, unknown> | null {
  if (!seller) return null;
  return {
    id: seller.id,
    name: sellerDisplayName(seller),
    firstName: seller.firstName,
    lastName: seller.lastName,
    storeName: seller.storeName,
    companyName: seller.companyName,
    ...(includeEmail ? { email: seller.email, phoneNumber: seller.phoneNumber } : {}),
    country: seller.country,
  };
}

function actionRequiredForViewer(
  dispute: Dispute,
  viewerId?: string,
): boolean {
  if (!viewerId) return false;
  return (
    (dispute.status === DisputeStatus.AWAITING_BUYER && dispute.buyerId === viewerId) ||
    (dispute.status === DisputeStatus.AWAITING_SELLER && dispute.sellerId === viewerId)
  );
}

function disputeEmailPayload(dispute: DisputeWithRelations): {
  disputeNumber: string;
  orderReference: string;
  reason: string;
  status: string;
} {
  return {
    disputeNumber: dispute.disputeNumber,
    orderReference: dispute.order?.orderReference ?? dispute.orderId,
    reason: dispute.reason,
    status: dispute.status,
  };
}

function messageSenderTypeFromRaisedBy(
  raisedByType: DisputeRaisedByType,
): DisputeMessageSenderType {
  return raisedByType === DisputeRaisedByType.BUYER
    ? DisputeMessageSenderType.BUYER
    : DisputeMessageSenderType.SELLER;
}

function auditActorTypeFromRaisedBy(
  raisedByType: DisputeRaisedByType,
): DisputeAuditActorType {
  return raisedByType === DisputeRaisedByType.BUYER
    ? DisputeAuditActorType.BUYER
    : DisputeAuditActorType.SELLER;
}

function auditActorTypeFromSender(
  senderType: DisputeMessageSenderType,
): DisputeAuditActorType {
  if (senderType === DisputeMessageSenderType.ADMIN) return DisputeAuditActorType.ADMIN;
  if (senderType === DisputeMessageSenderType.BUYER) return DisputeAuditActorType.BUYER;
  return DisputeAuditActorType.SELLER;
}

function nextStatusAfterParticipantMessage(
  currentStatus: DisputeStatus,
  senderType: DisputeMessageSenderType,
): DisputeStatus | null {
  if (
    currentStatus === DisputeStatus.AWAITING_BUYER &&
    senderType === DisputeMessageSenderType.BUYER
  ) {
    return DisputeStatus.UNDER_REVIEW;
  }
  if (
    currentStatus === DisputeStatus.AWAITING_SELLER &&
    senderType === DisputeMessageSenderType.SELLER
  ) {
    return DisputeStatus.UNDER_REVIEW;
  }
  return null;
}

function isOrderAtOrAfter(current: OrderStatus, minimum: OrderStatus): boolean {
  const currentIndex = ORDER_PROGRESS.indexOf(current);
  const minimumIndex = ORDER_PROGRESS.indexOf(minimum);
  return currentIndex >= minimumIndex && minimumIndex >= 0;
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function productNameDisplay(value: OrderProductNameSnapshot): string | null {
  if (typeof value === 'string') return value;
  const displayName = value.displayName;
  return typeof displayName === 'string' ? displayName : null;
}

function displayName(user: User): string {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Marketplace User';
}

function sellerDisplayName(user: User): string {
  return user.storeName || user.companyName || displayName(user);
}

function normalizeFileName(filename: string): string {
  const clean = filename.trim().replace(/[^\w.\- ]+/g, '-').slice(0, 255);
  return clean || 'evidence';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function addHours(hours: number): Date {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function pagination(page: number, limit: number, total: number): Pagination {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

function byCreatedAt<T extends { createdAt: Date }>(a: T, b: T): number {
  return a.createdAt.getTime() - b.createdAt.getTime();
}
