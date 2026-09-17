import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { Brackets, EntityManager, In } from 'typeorm';
import { config } from '../../config';
import { AppDataSource } from '../../database/data-source';
import {
  Conversation,
  ConversationStatus,
} from '../../database/entities/conversation.entity';
import { ConversationParticipant } from '../../database/entities/conversation-participant.entity';
import {
  MessageAttachment,
  MessageAttachmentType,
} from '../../database/entities/message-attachment.entity';
import {
  MessageReport,
  MessageReportAction,
  MessageReportReason,
  MessageReportStatus,
} from '../../database/entities/message-report.entity';
import { MessageSetting } from '../../database/entities/message-setting.entity';
import {
  MessageUpload,
  MessageUploadStatus,
} from '../../database/entities/message-upload.entity';
import { Message, MessageStatus, MessageType } from '../../database/entities/message.entity';
import {
  UserSubscription,
  UserSubscriptionStatus,
} from '../../database/entities/user-subscription.entity';
import { User, UserStatus } from '../../database/entities/user.entity';
import { createError } from '../../common/utils/http-error.util';
import {
  processUpload,
  UploadedFile,
  UploadValidationError,
} from '../../common/utils/file-upload.util';
import {
  AdminMessageConversationQueryDto,
  AdminMessageConversationStatusDto,
  AdminMessageReportQueryDto,
  AdminMessageReportReviewDto,
  ConversationQueryDto,
  EditMessageDto,
  MarkConversationReadDto,
  MessageSettingsUpdateDto,
  MessagesQueryDto,
  ReportMessageDto,
  SendMessageDto,
  StartConversationDto,
} from '../../common/utils/validation.schemas';
import { sendUnreadMessageEmail } from '../../common/utils/email.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { emitMessageEvent } from './message.events';

type EntitlementPrimitive = boolean | number | string | null;

type MessageCenterSettings = {
  maxMessageCharacters: number;
  maxAttachmentsPerMessage: number;
  maxAttachmentSizeMb: number;
  allowedAttachmentTypes: string[];
  messageEditWindowMinutes: number;
  unreadEmailDelayMinutes: number;
  messageReportingEnabled: boolean;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ConversationWithRelations = Conversation & {
  participants?: Array<ConversationParticipant & { user?: User }>;
  lastMessage?: (Message & { attachments?: MessageAttachment[] }) | null;
};

type MessageWithRelations = Message & {
  sender?: User;
  attachments?: MessageAttachment[];
  replyToMessage?: Message | null;
};

type ReportWithRelations = MessageReport & {
  message?: MessageWithRelations;
  conversation?: Conversation;
  reportedBy?: User;
  reportedUser?: User;
};

const MESSAGE_SETTING_KEYS: Record<keyof MessageCenterSettings, string> = {
  maxMessageCharacters: 'max_message_characters',
  maxAttachmentsPerMessage: 'max_attachments_per_message',
  maxAttachmentSizeMb: 'max_attachment_size_mb',
  allowedAttachmentTypes: 'allowed_attachment_types',
  messageEditWindowMinutes: 'message_edit_window_minutes',
  unreadEmailDelayMinutes: 'unread_email_delay_minutes',
  messageReportingEnabled: 'message_reporting_enabled',
};

const MIME_TYPES_BY_EXTENSION: Record<string, string[]> = {
  jpg: ['image/jpeg', 'image/jpg'],
  jpeg: ['image/jpeg', 'image/jpg'],
  png: ['image/png'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv: ['text/csv', 'application/csv'],
  txt: ['text/plain'],
};

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export class MessageService {
  private conversationRepo = AppDataSource.getRepository(Conversation);
  private participantRepo = AppDataSource.getRepository(ConversationParticipant);
  private messageRepo = AppDataSource.getRepository(Message);
  private attachmentRepo = AppDataSource.getRepository(MessageAttachment);
  private uploadRepo = AppDataSource.getRepository(MessageUpload);
  private reportRepo = AppDataSource.getRepository(MessageReport);
  private settingRepo = AppDataSource.getRepository(MessageSetting);
  private userRepo = AppDataSource.getRepository(User);
  private subscriptionRepo = AppDataSource.getRepository(UserSubscription);
  private subscriptionService: SubscriptionService;

  constructor(private readonly fastify?: FastifyInstance) {
    this.subscriptionService = new SubscriptionService(fastify);
  }

  async startConversation(
    userId: string,
    dto: StartConversationDto,
  ): Promise<Record<string, unknown>> {
    if (dto.recipientUserId === userId) {
      throw createError.badRequest('You cannot start a conversation with yourself.');
    }

    const recipient = await this.userRepo.findOne({
      where: { id: dto.recipientUserId, status: UserStatus.ACTIVE },
    });
    if (!recipient) {
      throw createError.notFound('Recipient user not found or inactive.');
    }

    const participantPairKey = buildParticipantPairKey(userId, dto.recipientUserId);
    const existing = await this.conversationRepo.findOne({
      where: { participantPairKey },
      relations: ['participants', 'participants.user', 'lastMessage', 'lastMessage.attachments'],
    });
    if (existing) {
      return {
        success: true,
        created: false,
        data: this.serializeConversation(existing, userId),
      };
    }

    await this.assertCanStartConversation(userId);

    let conversationId: string | null = null;
    await AppDataSource.transaction(async (manager) => {
      const now = new Date();
      const conversation = manager.create(Conversation, {
        conversationReference: this.generateConversationReference(),
        participantPairKey,
        status: ConversationStatus.ACTIVE,
        lastMessageId: null,
        lastMessageAt: null,
        initiatedById: userId,
        blockedBy: null,
        blockedAt: null,
        blockReason: null,
      });
      const savedConversation = await manager.save(Conversation, conversation);
      conversationId = savedConversation.id;

      await manager.save(ConversationParticipant, [
        manager.create(ConversationParticipant, {
          conversationId: savedConversation.id,
          userId,
          lastReadMessageId: null,
          unreadCount: 0,
          joinedAt: now,
          leftAt: null,
          lastUnreadEmailSentAt: null,
        }),
        manager.create(ConversationParticipant, {
          conversationId: savedConversation.id,
          userId: dto.recipientUserId,
          lastReadMessageId: null,
          unreadCount: 0,
          joinedAt: now,
          leftAt: null,
          lastUnreadEmailSentAt: null,
        }),
      ]);
    });

    const conversation = await this.loadConversationForUser(userId, conversationId!);
    emitMessageEvent('CONVERSATION_CREATED', {
      conversationId: conversation.id,
      actorId: userId,
      recipientUserId: dto.recipientUserId,
    });

    return {
      success: true,
      created: true,
      data: this.serializeConversation(conversation, userId),
    };
  }

  async uploadAttachment(
    userId: string,
    file: UploadedFile,
  ): Promise<Record<string, unknown>> {
    await this.assertAttachmentAllowed(userId);
    const settings = await this.getEffectiveSettings();
    const extension = extensionFromFilename(file.filename);
    const allowedTypes = normalizeAllowedAttachmentTypes(settings.allowedAttachmentTypes);
    if (extension && !allowedTypes.includes(extension)) {
      throw createError.badRequest(
        `File extension ".${extension}" is not allowed for messages.`,
        'MESSAGE_ATTACHMENT_TYPE_NOT_ALLOWED',
      );
    }

    try {
      const processed = await processUpload(file, {
        allowedMimeTypes: mimeTypesForExtensions(allowedTypes),
        maxFileSizeMb: settings.maxAttachmentSizeMb,
        pathPrefix: 'message-attachments',
      });
      const attachmentType = attachmentTypeForMime(file.mimetype);
      const upload = await this.uploadRepo.save(
        this.uploadRepo.create({
          userId,
          fileName: normalizeFileName(file.filename),
          fileUrl: processed.url,
          storedName: processed.storedName,
          attachmentType,
          mimeType: processed.mimetype,
          fileSize: processed.sizeBytes,
          status: MessageUploadStatus.UPLOADED,
          usedAt: null,
          expiresAt: addHours(24),
        }),
      );

      return {
        success: true,
        message: 'Message attachment uploaded successfully.',
        data: this.serializeUpload(upload),
      };
    } catch (err) {
      if (err instanceof UploadValidationError) {
        throw createError.badRequest(err.message, 'MESSAGE_ATTACHMENT_NOT_ALLOWED');
      }
      console.error('[MessageService] Attachment upload failed:', err);
      throw createError.internal('Message attachment upload failed');
    }
  }

  async listConversations(
    userId: string,
    query: ConversationQueryDto,
  ): Promise<Record<string, unknown>> {
    const qb = this.participantRepo
      .createQueryBuilder('selfParticipant')
      .innerJoinAndSelect('selfParticipant.conversation', 'conversation')
      .leftJoinAndSelect('conversation.participants', 'participant')
      .leftJoinAndSelect('participant.user', 'participantUser')
      .leftJoinAndSelect('conversation.lastMessage', 'lastMessage')
      .leftJoinAndSelect('lastMessage.attachments', 'lastMessageAttachment')
      .where('selfParticipant.userId = :userId', { userId })
      .distinct(true);

    if (query.unreadOnly) {
      qb.andWhere('selfParticipant.unreadCount > 0');
    }

    if (query.search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb.where(
            `
              EXISTS (
                SELECT 1
                FROM conversation_participants searchParticipant
                JOIN users searchUser ON searchUser.id = searchParticipant.userId
                WHERE searchParticipant.conversationId = conversation.id
                  AND searchParticipant.userId != :userId
                  AND (
                    searchUser.firstName LIKE :search OR
                    searchUser.lastName LIKE :search OR
                    searchUser.companyName LIKE :search OR
                    searchUser.storeName LIKE :search
                  )
              )
            `,
          );
        }),
      ).setParameter('search', `%${query.search}%`);
    }

    qb.orderBy('COALESCE(conversation.lastMessageAt, conversation.createdAt)', 'DESC')
      .addOrderBy('conversation.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [participants, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: participants.map((participant) =>
        this.serializeConversation(participant.conversation, userId, participant),
      ),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async getConversationMessages(
    userId: string,
    conversationId: string,
    query: MessagesQueryDto,
  ): Promise<Record<string, unknown>> {
    await this.assertParticipant(userId, conversationId);

    const qb = this.messageRepo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('message.attachments', 'attachment')
      .leftJoinAndSelect('message.replyToMessage', 'replyToMessage')
      .where('message.conversationId = :conversationId', { conversationId });

    if (query.cursor) {
      const cursorMessage = await this.messageRepo.findOne({
        where: { id: query.cursor, conversationId },
      });
      if (!cursorMessage) throw createError.badRequest('Invalid message cursor.');
      qb.andWhere(
        new Brackets((cursorQb) => {
          cursorQb
            .where('message.sentAt < :cursorSentAt', {
              cursorSentAt: cursorMessage.sentAt,
            })
            .orWhere(
              'message.sentAt = :cursorSentAt AND message.id < :cursorMessageId',
              {
                cursorSentAt: cursorMessage.sentAt,
                cursorMessageId: cursorMessage.id,
              },
            );
        }),
      );
    }

    const rows = await qb
      .orderBy('message.sentAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(query.limit + 1)
      .getMany();
    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const chronological = [...pageRows].reverse();
    const nextCursor = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].id : null;

    return {
      success: true,
      data: chronological.map((message) => this.serializeMessage(message, userId)),
      meta: {
        nextCursor,
        hasMore,
      },
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<Record<string, unknown>> {
    const conversation = await this.loadConversationForUser(userId, conversationId);
    if (conversation.status === ConversationStatus.BLOCKED) {
      throw createError.forbidden('This conversation has been blocked.');
    }

    const existing = await this.messageRepo.findOne({
      where: { senderId: userId, clientMessageId: dto.clientMessageId },
      relations: ['sender', 'attachments', 'replyToMessage'],
    });
    if (existing) {
      if (existing.conversationId !== conversationId) {
        throw createError.conflict(
          'clientMessageId was already used for another conversation.',
        );
      }
      return {
        success: true,
        idempotent: true,
        data: this.serializeMessage(existing, userId),
      };
    }

    await this.assertMessageRateLimit(userId, conversationId);
    const settings = await this.getEffectiveSettings();
    const normalizedContent = normalizeOptionalText(dto.content);
    this.validateMessageBody(dto, normalizedContent, settings);

    const fileIds = unique(dto.attachments.map((attachment) => attachment.fileId));
    if (fileIds.length !== dto.attachments.length) {
      throw createError.badRequest('Duplicate message attachment fileIds are not allowed.');
    }

    let uploads: MessageUpload[] = [];
    if (fileIds.length > 0) {
      await this.assertAttachmentAllowed(userId);
      uploads = await this.uploadRepo.find({
        where: { id: In(fileIds), userId, status: MessageUploadStatus.UPLOADED },
      });
      if (uploads.length !== fileIds.length) {
        throw createError.badRequest(
          'One or more message attachments were not found or are already attached.',
          'MESSAGE_ATTACHMENT_NOT_ALLOWED',
        );
      }
      this.validateUploads(uploads, dto.messageType as MessageType, settings);
    }

    if (dto.replyToMessageId) {
      const reply = await this.messageRepo.findOne({
        where: { id: dto.replyToMessageId, conversationId },
      });
      if (!reply || reply.status === MessageStatus.DELETED) {
        throw createError.badRequest('replyToMessageId must belong to this conversation.');
      }
    }

    let savedMessage: MessageWithRelations | null = null;
    await AppDataSource.transaction(async (manager) => {
      const now = new Date();
      const message = await manager.save(
        Message,
        manager.create(Message, {
          conversationId,
          senderId: userId,
          clientMessageId: dto.clientMessageId,
          messageType: dto.messageType as MessageType,
          content: normalizedContent,
          replyToMessageId: dto.replyToMessageId ?? null,
          status: MessageStatus.SENT,
          sentAt: now,
          deliveredAt: null,
          readAt: null,
          editedAt: null,
          deletedAt: null,
        }),
      );

      if (uploads.length > 0) {
        await manager.save(
          MessageAttachment,
          uploads.map((upload) =>
            manager.create(MessageAttachment, {
              messageId: message.id,
              fileName: upload.fileName,
              fileUrl: upload.fileUrl,
              attachmentType: upload.attachmentType,
              mimeType: upload.mimeType,
              fileSize: upload.fileSize,
            }),
          ),
        );
        await manager.update(
          MessageUpload,
          { id: In(fileIds) },
          { status: MessageUploadStatus.ATTACHED, usedAt: now },
        );
      }

      await manager.update(Conversation, conversationId, {
        lastMessageId: message.id,
        lastMessageAt: now,
      });
      await manager
        .createQueryBuilder()
        .update(ConversationParticipant)
        .set({
          unreadCount: () => '`unreadCount` + 1',
          lastUnreadEmailSentAt: null,
        })
        .where('conversationId = :conversationId', { conversationId })
        .andWhere('userId != :userId', { userId })
        .execute();

      savedMessage = await manager.findOne(Message, {
        where: { id: message.id },
        relations: ['sender', 'attachments', 'replyToMessage'],
      });
    });

    emitMessageEvent('MESSAGE_SENT', {
      conversationId,
      messageId: savedMessage!.id,
      senderId: userId,
      recipientUserId: otherParticipantId(conversation, userId),
    });

    return {
      success: true,
      data: this.serializeMessage(savedMessage!, userId),
    };
  }

  async markConversationRead(
    userId: string,
    conversationId: string,
    dto: MarkConversationReadDto,
  ): Promise<Record<string, unknown>> {
    const participant = await this.assertParticipant(userId, conversationId);
    const targetMessage = dto.lastReadMessageId
      ? await this.messageRepo.findOne({
          where: { id: dto.lastReadMessageId, conversationId },
        })
      : await this.messageRepo.findOne({
          where: { conversationId },
          order: { sentAt: 'DESC', id: 'DESC' },
        });

    if (!targetMessage) {
      await this.participantRepo.update(participant.id, {
        unreadCount: 0,
        lastReadMessageId: null,
      });
      return {
        success: true,
        data: { conversationId, unreadCount: 0, lastReadMessageId: null },
      };
    }

    const now = new Date();
    await this.messageRepo
      .createQueryBuilder()
      .update(Message)
      .set({ status: MessageStatus.READ, readAt: now })
      .where('conversationId = :conversationId', { conversationId })
      .andWhere('senderId != :userId', { userId })
      .andWhere('status IN (:...statuses)', {
        statuses: [MessageStatus.SENT, MessageStatus.DELIVERED],
      })
      .andWhere('sentAt <= :sentAt', { sentAt: targetMessage.sentAt })
      .execute();

    const unreadCount = await this.messageRepo
      .createQueryBuilder('message')
      .where('message.conversationId = :conversationId', { conversationId })
      .andWhere('message.senderId != :userId', { userId })
      .andWhere('message.status != :deleted', { deleted: MessageStatus.DELETED })
      .andWhere('message.sentAt > :sentAt', { sentAt: targetMessage.sentAt })
      .getCount();

    await this.participantRepo.update(participant.id, {
      unreadCount,
      lastReadMessageId: targetMessage.id,
    });

    emitMessageEvent('MESSAGE_READ', {
      conversationId,
      messageId: targetMessage.id,
      actorId: userId,
    });

    return {
      success: true,
      data: {
        conversationId,
        unreadCount,
        lastReadMessageId: targetMessage.id,
        readAt: now,
      },
    };
  }

  async getUnreadCount(userId: string): Promise<Record<string, unknown>> {
    const row = await this.participantRepo
      .createQueryBuilder('participant')
      .select('COALESCE(SUM(participant.unreadCount), 0)', 'count')
      .where('participant.userId = :userId', { userId })
      .getRawOne<{ count: string | number }>();

    return {
      success: true,
      data: {
        unreadCount: Number(row?.count ?? 0),
      },
    };
  }

  async editMessage(
    userId: string,
    messageId: string,
    dto: EditMessageDto,
  ): Promise<Record<string, unknown>> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
      relations: ['sender', 'attachments', 'replyToMessage'],
    });
    if (!message) throw createError.notFound('Message not found.');
    if (message.senderId !== userId) {
      throw createError.forbidden('Only the message sender can edit this message.');
    }
    if (message.status === MessageStatus.DELETED) {
      throw createError.conflict('Deleted messages cannot be edited.');
    }
    if (![MessageType.TEXT, MessageType.MIXED].includes(message.messageType)) {
      throw createError.badRequest('Only text or mixed messages can be edited.');
    }

    const settings = await this.getEffectiveSettings();
    if (settings.messageEditWindowMinutes <= 0) {
      throw createError.forbidden('Message editing is currently disabled.');
    }
    const editDeadline = addMinutes(message.sentAt, settings.messageEditWindowMinutes);
    if (Date.now() > editDeadline.getTime()) {
      throw createError.forbidden('The message edit window has expired.');
    }
    if (dto.content.length > settings.maxMessageCharacters) {
      throw createError.badRequest(
        `Message content cannot exceed ${settings.maxMessageCharacters} characters.`,
      );
    }

    message.content = dto.content;
    message.editedAt = new Date();
    const saved = await this.messageRepo.save(message);
    emitMessageEvent('MESSAGE_EDITED', {
      conversationId: saved.conversationId,
      messageId: saved.id,
      actorId: userId,
    });

    return {
      success: true,
      data: this.serializeMessage(saved, userId),
    };
  }

  async deleteMessage(userId: string, messageId: string): Promise<Record<string, unknown>> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
      relations: ['sender', 'attachments'],
    });
    if (!message) throw createError.notFound('Message not found.');
    if (message.senderId !== userId) {
      throw createError.forbidden('Only the message sender can delete this message.');
    }
    if (message.status === MessageStatus.DELETED) {
      return {
        success: true,
        data: this.serializeMessage(message, userId),
      };
    }

    message.status = MessageStatus.DELETED;
    message.content = null;
    message.deletedAt = new Date();
    const saved = await this.messageRepo.save(message);
    emitMessageEvent('MESSAGE_DELETED', {
      conversationId: saved.conversationId,
      messageId: saved.id,
      actorId: userId,
    });

    return {
      success: true,
      data: this.serializeMessage(saved, userId),
    };
  }

  async reportMessage(
    userId: string,
    messageId: string,
    dto: ReportMessageDto,
  ): Promise<Record<string, unknown>> {
    const settings = await this.getEffectiveSettings();
    if (!settings.messageReportingEnabled) {
      throw createError.forbidden('Message reporting is currently disabled.');
    }

    const message = await this.messageRepo.findOne({
      where: { id: messageId },
      relations: ['conversation', 'conversation.participants', 'sender'],
    });
    if (!message) throw createError.notFound('Message not found.');
    if (!(message.conversation?.participants ?? []).some((participant) => participant.userId === userId)) {
      throw createError.notFound('Message not found.');
    }
    if (message.senderId === userId) {
      throw createError.badRequest('You cannot report your own message.');
    }

    const existing = await this.reportRepo.findOne({
      where: { messageId, reportedById: userId },
    });
    if (existing) {
      throw createError.conflict('You have already reported this message.');
    }

    const report = await this.reportRepo.save(
      this.reportRepo.create({
        messageId: message.id,
        conversationId: message.conversationId,
        reportedById: userId,
        reportedUserId: message.senderId,
        reason: dto.reason as MessageReportReason,
        details: dto.details ?? null,
        status: MessageReportStatus.PENDING,
        action: null,
        notes: null,
        reviewedById: null,
        reviewedAt: null,
      }),
    );

    emitMessageEvent('MESSAGE_REPORTED', {
      conversationId: message.conversationId,
      messageId: message.id,
      reportId: report.id,
      actorId: userId,
      senderId: message.senderId,
    });

    return {
      success: true,
      data: this.serializeReport(report),
    };
  }

  async listAdminConversations(
    query: AdminMessageConversationQueryDto,
  ): Promise<Record<string, unknown>> {
    const qb = this.conversationRepo
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.participants', 'participant')
      .leftJoinAndSelect('participant.user', 'participantUser')
      .leftJoinAndSelect('conversation.lastMessage', 'lastMessage')
      .leftJoinAndSelect('lastMessage.attachments', 'lastMessageAttachment')
      .distinct(true);

    if (query.status) {
      qb.andWhere('conversation.status = :status', { status: query.status });
    }
    if (query.userId) {
      qb.andWhere(
        `
          EXISTS (
            SELECT 1
            FROM conversation_participants userParticipant
            WHERE userParticipant.conversationId = conversation.id
              AND userParticipant.userId = :filterUserId
          )
        `,
        { filterUserId: query.userId },
      );
    }
    if (query.reportedOnly) {
      qb.andWhere(
        `
          EXISTS (
            SELECT 1
            FROM message_reports report
            WHERE report.conversationId = conversation.id
          )
        `,
      );
    }
    if (query.search) {
      qb.andWhere(
        new Brackets((searchQb) => {
          searchQb
            .where('conversation.conversationReference LIKE :search')
            .orWhere('participantUser.firstName LIKE :search')
            .orWhere('participantUser.lastName LIKE :search')
            .orWhere('participantUser.companyName LIKE :search')
            .orWhere('participantUser.storeName LIKE :search');
        }),
      ).setParameter('search', `%${query.search}%`);
    }
    if (query.dateFrom) {
      qb.andWhere('conversation.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('conversation.createdAt <= :dateTo', { dateTo: query.dateTo });
    }

    qb.orderBy('COALESCE(conversation.lastMessageAt, conversation.createdAt)', 'DESC')
      .addOrderBy('conversation.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [conversations, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: conversations.map((conversation) => this.serializeAdminConversation(conversation)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async getAdminConversationById(conversationId: string): Promise<Record<string, unknown>> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: ['participants', 'participants.user', 'lastMessage', 'lastMessage.attachments'],
    });
    if (!conversation) throw createError.notFound('Conversation not found.');

    const messages = await this.messageRepo.find({
      where: { conversationId },
      relations: ['sender', 'attachments', 'reports'],
      order: { sentAt: 'ASC', id: 'ASC' },
      take: 100,
    });

    return {
      success: true,
      data: {
        ...this.serializeAdminConversation(conversation),
        messages: messages.map((message) => this.serializeMessage(message)),
      },
    };
  }

  async updateAdminConversationStatus(
    adminId: string,
    conversationId: string,
    dto: AdminMessageConversationStatusDto,
  ): Promise<Record<string, unknown>> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: ['participants', 'participants.user', 'lastMessage', 'lastMessage.attachments'],
    });
    if (!conversation) throw createError.notFound('Conversation not found.');

    conversation.status = dto.status as ConversationStatus;
    if (conversation.status === ConversationStatus.BLOCKED) {
      conversation.blockedBy = adminId;
      conversation.blockedAt = new Date();
      conversation.blockReason = dto.reason ?? null;
    } else {
      conversation.blockedBy = null;
      conversation.blockedAt = null;
      conversation.blockReason = dto.reason ?? null;
    }
    const saved = await this.conversationRepo.save(conversation);

    if (saved.status === ConversationStatus.BLOCKED) {
      emitMessageEvent('CONVERSATION_BLOCKED', {
        conversationId: saved.id,
        actorId: adminId,
        status: saved.status,
      });
    }

    return {
      success: true,
      data: this.serializeAdminConversation(saved),
    };
  }

  async listAdminReports(
    query: AdminMessageReportQueryDto,
  ): Promise<Record<string, unknown>> {
    const qb = this.reportRepo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.message', 'message')
      .leftJoinAndSelect('message.attachments', 'attachment')
      .leftJoinAndSelect('report.conversation', 'conversation')
      .leftJoinAndSelect('report.reportedBy', 'reportedBy')
      .leftJoinAndSelect('report.reportedUser', 'reportedUser')
      .distinct(true);

    if (query.status) qb.andWhere('report.status = :status', { status: query.status });
    if (query.reason) qb.andWhere('report.reason = :reason', { reason: query.reason });
    if (query.reportedUserId) {
      qb.andWhere('report.reportedUserId = :reportedUserId', {
        reportedUserId: query.reportedUserId,
      });
    }
    if (query.reportedBy) {
      qb.andWhere('report.reportedById = :reportedBy', {
        reportedBy: query.reportedBy,
      });
    }
    if (query.dateFrom) qb.andWhere('report.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('report.createdAt <= :dateTo', { dateTo: query.dateTo });

    qb.orderBy('report.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [reports, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: reports.map((report) => this.serializeReport(report)),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async reviewAdminReport(
    adminId: string,
    reportId: string,
    dto: AdminMessageReportReviewDto,
  ): Promise<Record<string, unknown>> {
    const report = await this.reportRepo.findOne({
      where: { id: reportId },
      relations: ['message', 'conversation', 'reportedBy', 'reportedUser'],
    });
    if (!report) throw createError.notFound('Message report not found.');

    await AppDataSource.transaction(async (manager) => {
      report.status = dto.status as MessageReportStatus;
      report.action = dto.action as MessageReportAction;
      report.notes = dto.notes ?? null;
      report.reviewedById = adminId;
      report.reviewedAt = new Date();
      await manager.save(MessageReport, report);
      await this.applyReportAction(manager, report, dto.action as MessageReportAction, adminId);
    });

    const saved = await this.reportRepo.findOne({
      where: { id: reportId },
      relations: ['message', 'message.attachments', 'conversation', 'reportedBy', 'reportedUser'],
    });

    emitMessageEvent('MESSAGE_REPORT_RESOLVED', {
      conversationId: report.conversationId,
      messageId: report.messageId,
      reportId: report.id,
      actorId: adminId,
      status: report.status,
      metadata: { action: report.action },
    });

    return {
      success: true,
      data: this.serializeReport(saved ?? report),
    };
  }

  async getSettings(): Promise<Record<string, unknown>> {
    return {
      success: true,
      data: await this.getEffectiveSettings(),
    };
  }

  async updateSettings(
    adminId: string,
    dto: MessageSettingsUpdateDto,
  ): Promise<Record<string, unknown>> {
    const updates = { ...dto };
    if (updates.allowedAttachmentTypes) {
      updates.allowedAttachmentTypes = normalizeAllowedAttachmentTypes(
        updates.allowedAttachmentTypes,
      );
      const unsupported = updates.allowedAttachmentTypes.filter(
        (extension) => !MIME_TYPES_BY_EXTENSION[extension],
      );
      if (unsupported.length > 0) {
        throw createError.badRequest(
          `Unsupported attachment type(s): ${unsupported.join(', ')}`,
        );
      }
    }

    for (const [dtoKey, settingKey] of Object.entries(MESSAGE_SETTING_KEYS)) {
      const value = updates[dtoKey as keyof MessageSettingsUpdateDto];
      if (value === undefined) continue;
      const existing = await this.settingRepo.findOne({ where: { settingKey } });
      await this.settingRepo.save(
        this.settingRepo.create({
          id: existing?.id,
          settingKey,
          settingValue: value,
          updatedBy: adminId,
        }),
      );
    }

    return {
      success: true,
      data: await this.getEffectiveSettings(),
    };
  }

  async sendUnreadMessageEmails(): Promise<Record<string, unknown>> {
    const settings = await this.getEffectiveSettings();
    if (settings.unreadEmailDelayMinutes <= 0) {
      return { success: true, data: { sent: 0 } };
    }

    const cutoff = addMinutes(new Date(), -settings.unreadEmailDelayMinutes);
    const participants = await this.participantRepo
      .createQueryBuilder('participant')
      .innerJoinAndSelect('participant.user', 'user')
      .innerJoinAndSelect('participant.conversation', 'conversation')
      .leftJoinAndSelect('conversation.participants', 'allParticipant')
      .leftJoinAndSelect('allParticipant.user', 'allUser')
      .where('participant.unreadCount > 0')
      .andWhere('conversation.lastMessageAt IS NOT NULL')
      .andWhere('conversation.lastMessageAt <= :cutoff', { cutoff })
      .andWhere(
        '(participant.lastUnreadEmailSentAt IS NULL OR participant.lastUnreadEmailSentAt < conversation.lastMessageAt)',
      )
      .getMany();

    let sent = 0;
    for (const participant of participants) {
      const otherUser = (participant.conversation.participants ?? []).find(
        (item) => item.userId !== participant.userId,
      )?.user;
      try {
        await sendUnreadMessageEmail(participant.user.email, participant.user.firstName, {
          unreadCount: participant.unreadCount,
          senderName: displayName(otherUser) ?? 'a marketplace user',
        });
        await this.participantRepo.update(participant.id, {
          lastUnreadEmailSentAt: new Date(),
        });
        sent += 1;
      } catch (err) {
        console.error('[MessageService] Unread message email failed:', err);
      }
    }

    return { success: true, data: { sent } };
  }

  private async loadConversationForUser(
    userId: string,
    conversationId: string,
  ): Promise<ConversationWithRelations> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: ['participants', 'participants.user', 'lastMessage', 'lastMessage.attachments'],
    });
    if (!conversation || !(conversation.participants ?? []).some((p) => p.userId === userId)) {
      throw createError.notFound('Conversation not found.');
    }
    return conversation;
  }

  private async assertParticipant(
    userId: string,
    conversationId: string,
  ): Promise<ConversationParticipant> {
    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId },
      relations: ['conversation'],
    });
    if (!participant) throw createError.notFound('Conversation not found.');
    return participant;
  }

  private async assertCanStartConversation(userId: string): Promise<void> {
    const hasAccess = booleanFromEntitlement(
      await this.subscriptionService.getEffectiveEntitlement(
        userId,
        'message_center_access',
      ),
    );
    if (!hasAccess) {
      throw createError.forbidden(
        'Your subscription does not include Message Center access.',
        'MESSAGE_CENTER_ACCESS_DENIED',
      );
    }

    const maxNewConversations = limitFromEntitlement(
      await this.subscriptionService.getEffectiveEntitlement(
        userId,
        'max_new_conversations_per_month',
      ),
    );
    if (maxNewConversations === null) return;

    const { from, to } = await this.resolveConversationLimitPeriod(userId);
    const qb = this.conversationRepo
      .createQueryBuilder('conversation')
      .where('conversation.initiatedById = :userId', { userId })
      .andWhere('conversation.createdAt >= :from', { from });
    if (to) qb.andWhere('conversation.createdAt < :to', { to });

    const count = await qb.getCount();
    if (count >= maxNewConversations) {
      throw createError.forbidden(
        `Your subscription allows up to ${maxNewConversations} new conversations for this period.`,
        'MESSAGE_CONVERSATION_LIMIT_REACHED',
      );
    }
  }

  private async assertAttachmentAllowed(userId: string): Promise<void> {
    const allowed = booleanFromEntitlement(
      await this.subscriptionService.getEffectiveEntitlement(userId, 'attachment_access'),
    );
    if (!allowed) {
      throw createError.forbidden(
        'Your subscription does not include Message Center attachments.',
        'MESSAGE_ATTACHMENT_NOT_ALLOWED',
      );
    }
  }

  private async resolveConversationLimitPeriod(
    userId: string,
  ): Promise<{ from: Date; to: Date | null }> {
    const now = new Date();
    const subscription = await this.subscriptionRepo
      .createQueryBuilder('subscription')
      .where('subscription.userId = :userId', { userId })
      .andWhere('subscription.status = :status', { status: UserSubscriptionStatus.ACTIVE })
      .andWhere('(subscription.startedAt IS NULL OR subscription.startedAt <= :now)', { now })
      .andWhere('(subscription.expiresAt IS NULL OR subscription.expiresAt > :now)', { now })
      .orderBy('subscription.startedAt', 'DESC')
      .addOrderBy('subscription.createdAt', 'DESC')
      .getOne();

    if (subscription?.startedAt) {
      return { from: subscription.startedAt, to: subscription.expiresAt };
    }

    return { from: startOfMonth(now), to: startOfNextMonth(now) };
  }

  private async assertMessageRateLimit(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentCount = await this.messageRepo
      .createQueryBuilder('message')
      .where('message.senderId = :userId', { userId })
      .andWhere('message.conversationId = :conversationId', { conversationId })
      .andWhere('message.sentAt >= :oneMinuteAgo', { oneMinuteAgo })
      .getCount();

    if (recentCount >= 30) {
      throw createError.tooManyRequests(
        'Too many messages sent in this conversation. Please try again shortly.',
      );
    }
  }

  private validateMessageBody(
    dto: SendMessageDto,
    content: string | null,
    settings: MessageCenterSettings,
  ): void {
    const attachmentCount = dto.attachments.length;
    if (content && content.length > settings.maxMessageCharacters) {
      throw createError.badRequest(
        `Message content cannot exceed ${settings.maxMessageCharacters} characters.`,
      );
    }
    if (attachmentCount > settings.maxAttachmentsPerMessage) {
      throw createError.badRequest(
        `Messages cannot include more than ${settings.maxAttachmentsPerMessage} attachments.`,
        'MESSAGE_ATTACHMENT_LIMIT_REACHED',
      );
    }

    if (dto.messageType === MessageType.TEXT) {
      if (!content) throw createError.badRequest('Text messages require content.');
      if (attachmentCount > 0) {
        throw createError.badRequest('Text messages cannot include attachments.');
      }
      return;
    }

    if ([MessageType.IMAGE, MessageType.FILE].includes(dto.messageType as MessageType)) {
      if (attachmentCount === 0) {
        throw createError.badRequest(`${dto.messageType} messages require attachments.`);
      }
      return;
    }

    if (dto.messageType === MessageType.MIXED && !content && attachmentCount === 0) {
      throw createError.badRequest('Mixed messages require content or attachments.');
    }
  }

  private validateUploads(
    uploads: MessageUpload[],
    messageType: MessageType,
    settings: MessageCenterSettings,
  ): void {
    const now = Date.now();
    const allowedTypes = normalizeAllowedAttachmentTypes(settings.allowedAttachmentTypes);
    for (const upload of uploads) {
      if (upload.expiresAt && upload.expiresAt.getTime() < now) {
        throw createError.badRequest(
          'One or more message attachments have expired. Please upload again.',
          'MESSAGE_ATTACHMENT_EXPIRED',
        );
      }
      const extension = extensionFromFilename(upload.fileName) ?? extensionFromMime(upload.mimeType);
      if (!extension || !allowedTypes.includes(extension)) {
        throw createError.badRequest(
          'One or more message attachments are not allowed.',
          'MESSAGE_ATTACHMENT_NOT_ALLOWED',
        );
      }
    }

    if (
      messageType === MessageType.IMAGE &&
      uploads.some((upload) => upload.attachmentType !== MessageAttachmentType.IMAGE)
    ) {
      throw createError.badRequest('Image messages can only include image attachments.');
    }
    if (
      messageType === MessageType.FILE &&
      uploads.some((upload) => upload.attachmentType !== MessageAttachmentType.FILE)
    ) {
      throw createError.badRequest('File messages can only include file attachments.');
    }
  }

  private async getEffectiveSettings(): Promise<MessageCenterSettings> {
    const defaults = defaultMessageSettings();
    const rows = await this.settingRepo.find();
    const values = new Map(rows.map((row) => [row.settingKey, row.settingValue]));

    return {
      maxMessageCharacters: positiveInteger(
        values.get(MESSAGE_SETTING_KEYS.maxMessageCharacters),
        defaults.maxMessageCharacters,
      ),
      maxAttachmentsPerMessage: nonNegativeInteger(
        values.get(MESSAGE_SETTING_KEYS.maxAttachmentsPerMessage),
        defaults.maxAttachmentsPerMessage,
      ),
      maxAttachmentSizeMb: positiveInteger(
        values.get(MESSAGE_SETTING_KEYS.maxAttachmentSizeMb),
        defaults.maxAttachmentSizeMb,
      ),
      allowedAttachmentTypes: normalizeAllowedAttachmentTypes(
        values.get(MESSAGE_SETTING_KEYS.allowedAttachmentTypes),
        defaults.allowedAttachmentTypes,
      ),
      messageEditWindowMinutes: nonNegativeInteger(
        values.get(MESSAGE_SETTING_KEYS.messageEditWindowMinutes),
        defaults.messageEditWindowMinutes,
      ),
      unreadEmailDelayMinutes: nonNegativeInteger(
        values.get(MESSAGE_SETTING_KEYS.unreadEmailDelayMinutes),
        defaults.unreadEmailDelayMinutes,
      ),
      messageReportingEnabled: booleanValue(
        values.get(MESSAGE_SETTING_KEYS.messageReportingEnabled),
        defaults.messageReportingEnabled,
      ),
    };
  }

  private async applyReportAction(
    manager: EntityManager,
    report: MessageReport,
    action: MessageReportAction,
    adminId: string,
  ): Promise<void> {
    if (action === MessageReportAction.MESSAGE_HIDDEN) {
      await manager.update(Message, report.messageId, {
        status: MessageStatus.DELETED,
        content: null,
        deletedAt: new Date(),
      });
      return;
    }

    if (action === MessageReportAction.CONVERSATION_BLOCKED) {
      await manager.update(Conversation, report.conversationId, {
        status: ConversationStatus.BLOCKED,
        blockedBy: adminId,
        blockedAt: new Date(),
        blockReason: report.notes || 'Conversation blocked after message report review.',
      });
    }
  }

  private generateConversationReference(): string {
    return `MSG-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private serializeConversation(
    conversation: ConversationWithRelations,
    currentUserId: string,
    currentParticipant?: ConversationParticipant,
  ): Record<string, unknown> {
    const participants = conversation.participants ?? [];
    const selfParticipant =
      currentParticipant ?? participants.find((participant) => participant.userId === currentUserId);
    const otherParticipant = participants.find((participant) => participant.userId !== currentUserId);

    return {
      conversationId: conversation.id,
      conversationReference: conversation.conversationReference,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: selfParticipant?.unreadCount ?? 0,
      lastReadMessageId: selfParticipant?.lastReadMessageId ?? null,
      participant: this.serializeUser(otherParticipant?.user),
      lastMessage: conversation.lastMessage
        ? this.serializeMessagePreview(conversation.lastMessage)
        : null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private serializeAdminConversation(
    conversation: ConversationWithRelations,
  ): Record<string, unknown> {
    return {
      conversationId: conversation.id,
      conversationReference: conversation.conversationReference,
      status: conversation.status,
      lastMessageId: conversation.lastMessageId,
      lastMessageAt: conversation.lastMessageAt,
      initiatedById: conversation.initiatedById,
      blockedBy: conversation.blockedBy,
      blockedAt: conversation.blockedAt,
      blockReason: conversation.blockReason,
      participants: (conversation.participants ?? []).map((participant) => ({
        participantId: participant.id,
        userId: participant.userId,
        unreadCount: participant.unreadCount,
        lastReadMessageId: participant.lastReadMessageId,
        joinedAt: participant.joinedAt,
        user: this.serializeUser(participant.user),
      })),
      lastMessage: conversation.lastMessage
        ? this.serializeMessagePreview(conversation.lastMessage)
        : null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private serializeMessage(
    message: MessageWithRelations,
    currentUserId?: string,
  ): Record<string, unknown> {
    const isDeleted = message.status === MessageStatus.DELETED;
    return {
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: this.serializeUser(message.sender),
      isMine: currentUserId ? message.senderId === currentUserId : undefined,
      clientMessageId: message.clientMessageId,
      messageType: message.messageType,
      content: isDeleted ? null : message.content,
      replyToMessageId: message.replyToMessageId,
      replyToMessage: message.replyToMessage
        ? this.serializeMessagePreview(message.replyToMessage)
        : null,
      status: message.status,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
      attachments: isDeleted
        ? []
        : (message.attachments ?? []).map((attachment) =>
            this.serializeAttachment(attachment),
          ),
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }

  private serializeMessagePreview(message: MessageWithRelations): Record<string, unknown> {
    const isDeleted = message.status === MessageStatus.DELETED;
    return {
      messageId: message.id,
      senderId: message.senderId,
      messageType: message.messageType,
      content: isDeleted ? null : message.content,
      status: message.status,
      attachmentCount: isDeleted ? 0 : message.attachments?.length ?? 0,
      sentAt: message.sentAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
    };
  }

  private serializeAttachment(attachment: MessageAttachment): Record<string, unknown> {
    return {
      attachmentId: attachment.id,
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      attachmentType: attachment.attachmentType,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      createdAt: attachment.createdAt,
    };
  }

  private serializeUpload(upload: MessageUpload): Record<string, unknown> {
    return {
      fileId: upload.id,
      fileName: upload.fileName,
      fileUrl: upload.fileUrl,
      attachmentType: upload.attachmentType,
      mimeType: upload.mimeType,
      fileSize: upload.fileSize,
      expiresAt: upload.expiresAt,
      createdAt: upload.createdAt,
    };
  }

  private serializeReport(report: ReportWithRelations): Record<string, unknown> {
    return {
      reportId: report.id,
      messageId: report.messageId,
      conversationId: report.conversationId,
      reportedById: report.reportedById,
      reportedBy: this.serializeUser(report.reportedBy),
      reportedUserId: report.reportedUserId,
      reportedUser: this.serializeUser(report.reportedUser),
      reason: report.reason,
      details: report.details,
      status: report.status,
      action: report.action,
      notes: report.notes,
      reviewedById: report.reviewedById,
      reviewedAt: report.reviewedAt,
      message: report.message ? this.serializeMessage(report.message) : undefined,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  private serializeUser(user?: User | null): Record<string, unknown> | null {
    if (!user) return null;
    return {
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: displayName(user),
      userType: user.userType,
      storeName: user.storeName,
      companyName: user.companyName,
      companyLogo: user.companyLogo,
      country: user.country,
      isCompanyVerified: user.isCompanyVerified,
      totalReviewCount: user.totalReviewCount,
      totalAverageReviews: Number(user.totalAverageReviews ?? 0),
    };
  }
}

function defaultMessageSettings(): MessageCenterSettings {
  return {
    maxMessageCharacters: config.messageCenter.maxMessageCharacters,
    maxAttachmentsPerMessage: config.messageCenter.maxAttachmentsPerMessage,
    maxAttachmentSizeMb: config.messageCenter.maxAttachmentSizeMb,
    allowedAttachmentTypes: [...config.messageCenter.allowedAttachmentTypes],
    messageEditWindowMinutes: config.messageCenter.messageEditWindowMinutes,
    unreadEmailDelayMinutes: config.messageCenter.unreadEmailDelayMinutes,
    messageReportingEnabled: config.messageCenter.reportingEnabled,
  };
}

function buildParticipantPairKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(':');
}

function otherParticipantId(
  conversation: ConversationWithRelations,
  userId: string,
): string | undefined {
  return (conversation.participants ?? []).find((participant) => participant.userId !== userId)
    ?.userId;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function extensionFromFilename(filename: string): string | null {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : null;
}

function extensionFromMime(mimeType: string): string | null {
  for (const [extension, mimeTypes] of Object.entries(MIME_TYPES_BY_EXTENSION)) {
    if (mimeTypes.includes(mimeType)) return extension;
  }
  return null;
}

function mimeTypesForExtensions(extensions: string[]): string[] {
  return unique(
    extensions.flatMap((extension) => MIME_TYPES_BY_EXTENSION[extension] ?? []),
  );
}

function normalizeAllowedAttachmentTypes(
  value: unknown,
  fallback: string[] = [],
): string[] {
  if (!Array.isArray(value)) return fallback;
  return unique(
    value
      .map((extension) => String(extension).trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean),
  );
}

function attachmentTypeForMime(mimeType: string): MessageAttachmentType {
  const extension = extensionFromMime(mimeType);
  return extension && IMAGE_EXTENSIONS.has(extension)
    ? MessageAttachmentType.IMAGE
    : MessageAttachmentType.FILE;
}

function normalizeFileName(filename: string): string {
  const clean = filename.trim().replace(/[^\w.\- ]+/g, '-').slice(0, 255);
  return clean || 'attachment';
}

function displayName(user?: User | null): string | null {
  if (!user) return null;
  return (
    user.storeName ||
    user.companyName ||
    `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
    'Marketplace User'
  );
}

function addHours(hours: number): Date {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date;
}

function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function limitFromEntitlement(value: EntitlementPrimitive): number | null {
  if (value === null) return null;
  if (typeof value === 'string' && value.toLowerCase() === 'unlimited') return null;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, numeric);
}

function booleanFromEntitlement(value: EntitlementPrimitive): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
}

function positiveInteger(value: unknown, fallback: number): number {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
}

function pagination(page: number, limit: number, total: number): Pagination {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
