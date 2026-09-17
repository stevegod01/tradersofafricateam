import { requireActiveCurrency } from '../system-settings/settings.reader';
import { PaymentMethodConfig } from '../../database/entities/payment-method-config.entity';
import { auditedUpdate } from '../audit-log/audit-log.mutations';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import {
  Payment,
  PaymentStatus,
} from '../../database/entities/payment.entity';
import { PaymentAccount, PaymentAccountStatus } from '../../database/entities/payment-account.entity';
import { PaymentAttempt } from '../../database/entities/payment-attempt.entity';
import { PaymentAuditLog } from '../../database/entities/payment-audit-log.entity';
import {
  PaymentProvider,
  PaymentProviderStatus,
  PaymentProviderType,
} from '../../database/entities/payment-provider.entity';
import { User } from '../../database/entities/user.entity';
import { createError } from '../../common/utils/http-error.util';
import {
  ProcessedFile,
  processUpload,
  UploadValidationError,
  UploadedFile,
} from '../../common/utils/file-upload.util';
import {
  sendPaymentConfirmedEmail,
  sendPaymentExpiredEmail,
  sendPaymentInstructionsEmail,
  sendPaymentProofReceivedEmail,
  sendPaymentRejectedEmail,
} from '../../common/utils/email.service';
import {
  AdminPaymentConfirmDto,
  AdminPaymentRejectDto,
  CancelPaymentDto,
  CreatePaymentDto,
  PaymentProofFieldsDto,
  PaymentQueryDto,
  PaymentWebhookDto,
} from '../../common/utils/validation.schemas';
import { addHours } from '../../common/utils/token.util';
import {
  emitPaymentEvent as publishPaymentEvent,
  PaymentEventName,
  serializePaymentEventPayload,
} from './payment.events';
import { getGatewayAdapter } from './payment.gateway-adapters';
import { PaymentSourceResolver, PayableDetails } from './payment-source.resolver';

const PAYMENT_PROOF_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];
const PAYMENT_PROOF_MAX_MB = 10;

const TERMINAL_PAYMENT_STATUSES = [
  PaymentStatus.CONFIRMED,
  PaymentStatus.FAILED,
  PaymentStatus.EXPIRED,
  PaymentStatus.CANCELLED,
];

type PaymentInitialization = {
  authorizationUrl?: string | null;
  providerReference?: string | null;
  bankAccount?: Record<string, unknown> | null;
};

export class PaymentService {
  private paymentRepo = AppDataSource.getRepository(Payment);
  private paymentProviderRepo = AppDataSource.getRepository(PaymentProvider);
  private paymentAccountRepo = AppDataSource.getRepository(PaymentAccount);
  private paymentAttemptRepo = AppDataSource.getRepository(PaymentAttempt);
  private paymentAuditRepo = AppDataSource.getRepository(PaymentAuditLog);
  private userRepo = AppDataSource.getRepository(User);
  private sourceResolver = new PaymentSourceResolver();

  constructor(private readonly fastify?: FastifyInstance) {}

  async getCheckoutPaymentMethods(payerId:string,currency:string,amount:number) {
    const payer=await this.userRepo.findOneBy({id:payerId});
    if(!payer)throw createError.notFound('Payer not found');
    const providers=await this.getEligibleProviders({sourceType:'checkout',sourceId:payerId,purpose:'marketplace_purchase',payerId,amount,currency,description:'Checkout method selection',expiresAt:null,metadata:null},payer);
    return providers.map(provider=>({code:provider.code,name:provider.name,requiresProof:provider.requiresProof}));
  }

  async getPaymentMethods(
    payerId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const { source, payer } = await this.resolvePaymentContext(
      payerId,
      sourceType,
      sourceId,
    );
    const providers = await this.getEligibleProviders(source, payer);
    const recommendedCode = this.recommendedProviderCode(providers);

    return {
      success: true,
      data: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        amount: source.amount,
        currency: source.currency,
        methods: providers.map((provider) => ({
          code: provider.code,
          name: provider.name,
          type: provider.type,
          requiresProof: provider.requiresProof,
          recommended: provider.code === recommendedCode,
        })),
      },
    };
  }

  async createPayment(
    payerId: string,
    dto: CreatePaymentDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const { source, payer } = await this.resolvePaymentContext(
      payerId,
      dto.sourceType,
      dto.sourceId,
    );
    await this.ensureSourceHasNoConfirmedPayment(source);

    const provider = await this.getEligibleProvider(source, payer, dto.paymentMethod);
    const paymentReference = await this.generatePaymentReference();
    const expiresAt = this.expiryFor(provider, source);
    const status = this.initialStatusFor(provider);

    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        paymentReference,
        payerId: source.payerId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        purpose: source.purpose,
        description: source.description,
        amount: source.amount,
        currency: source.currency,
        paymentMethod: provider.code,
        providerId: provider.id,
        status,
        canResubmitProof: true,
        expiresAt,
        metadata: source.metadata,
      }),
    );

    const initialization = await this.initializePayment(payment, provider, payer);
    if (initialization.providerReference) {
      await auditedUpdate(this.paymentRepo, payment.id, {
        providerReference: initialization.providerReference,
      });
      payment.providerReference = initialization.providerReference;
    }
    payment.provider = provider;
    payment.payer = payer;

    await this.paymentAttemptRepo.save(
      this.paymentAttemptRepo.create({
        paymentId: payment.id,
        providerId: provider.id,
        paymentMethod: provider.code,
        providerReference: initialization.providerReference ?? null,
        status: payment.status,
        initiatedAt: new Date(),
      }),
    );

    await this.recordPaymentAudit(payment, 'PAYMENT_CREATED', {
      metadata: { providerCode: provider.code },
    });
    await this.recordPaymentAudit(payment, 'PAYMENT_INITIALIZED', {
      metadata: { status: payment.status },
    });

    if (initialization.bankAccount) {
      sendPaymentInstructionsEmail(
        payer.email,
        payer.firstName,
        {
          paymentReference: payment.paymentReference,
          description: payment.description,
          amount: Number(payment.amount),
          currency: payment.currency,
          expiresAt: payment.expiresAt,
        },
        {
          bankName: String(initialization.bankAccount.bankName),
          accountName: String(initialization.bankAccount.accountName),
          accountNumber: String(initialization.bankAccount.accountNumber),
        },
      ).catch((err) =>
        console.error('[PaymentService] Payment instructions email failed:', err),
      );
    }

    return {
      success: true,
      message: this.initializationMessage(payment),
      data: serializePaymentDetail(payment, initialization),
    };
  }

  async changePaymentMethod(
    payerId: string,
    dto: CreatePaymentDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const result = await this.createPayment(payerId, dto);
    await this.recordPaymentAuditById(
      String(result.data.paymentId),
      'PAYMENT_METHOD_CHANGED',
      { payerId },
    );

    return {
      ...result,
      message: 'Payment method updated successfully.',
    };
  }

  async retryPayment(
    payerId: string,
    paymentId: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const payment = await this.requirePayerPayment(paymentId, payerId);
    await this.markExpiredIfNeeded(payment);

    if (TERMINAL_PAYMENT_STATUSES.includes(payment.status)) {
      throw createError.conflict('This payment cannot be retried');
    }

    if (payment.provider?.requiresProof) {
      throw createError.badRequest('Manual payments cannot be retried through a gateway');
    }

    const { source, payer } = await this.resolvePaymentContext(
      payerId,
      payment.sourceType,
      payment.sourceId,
    );
    this.assertSourceStillMatchesPayment(payment, source);

    const provider = await this.getEligibleProvider(
      source,
      payer,
      payment.paymentMethod,
    );
    const initialization = await this.initializePayment(payment, provider, payer);

    await auditedUpdate(this.paymentRepo, payment.id, {
      status: PaymentStatus.PROCESSING,
      providerReference: initialization.providerReference ?? payment.providerReference,
      failureReason: null,
      expiresAt: this.expiryFor(provider, source),
    });

    const updated = await this.requirePaymentForDetail(payment.id);
    await this.paymentAttemptRepo.save(
      this.paymentAttemptRepo.create({
        paymentId: payment.id,
        providerId: provider.id,
        paymentMethod: provider.code,
        providerReference: initialization.providerReference ?? null,
        status: PaymentStatus.PROCESSING,
        initiatedAt: new Date(),
      }),
    );
    await this.recordPaymentAudit(updated, 'PAYMENT_RETRY_STARTED');

    return {
      success: true,
      message: 'Payment retry initialized.',
      data: serializePaymentDetail(updated, initialization),
    };
  }

  async uploadPaymentProof(
    payerId: string,
    paymentId: string,
    file: UploadedFile,
    fields: PaymentProofFieldsDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const payment = await this.requirePayerPayment(paymentId, payerId);
    await this.markExpiredIfNeeded(payment);

    if (!payment.provider?.requiresProof) {
      throw createError.badRequest('This payment method does not require proof upload');
    }

    if (
      payment.status === PaymentStatus.CONFIRMED ||
      payment.status === PaymentStatus.CANCELLED ||
      payment.status === PaymentStatus.EXPIRED
    ) {
      throw createError.conflict('Payment proof cannot be uploaded for this payment');
    }

    if (payment.status === PaymentStatus.REJECTED && !payment.canResubmitProof) {
      throw createError.conflict('Payment proof cannot be resubmitted for this payment');
    }

    let processedFile: ProcessedFile;
    try {
      processedFile = await processUpload(file, {
        allowedMimeTypes: PAYMENT_PROOF_MIME_TYPES,
        maxFileSizeMb: PAYMENT_PROOF_MAX_MB,
        pathPrefix: 'payment-proofs',
      });
    } catch (err) {
      if (err instanceof UploadValidationError) {
        throw createError.badRequest(err.message);
      }
      console.error('[PaymentService] Payment proof upload failed:', err);
      throw createError.internal('File storage upload failed');
    }

    const proofUploadedAt = new Date();
    await auditedUpdate(this.paymentRepo, payment.id, {
      status: PaymentStatus.PROOF_UPLOADED,
      paymentProofUrl: processedFile.url,
      payerTransactionReference: fields.transactionReference ?? null,
      payerNotes: fields.notes ?? null,
      proofUploadedAt,
      rejectionReason: null,
    });

    const updated = await this.requirePaymentForDetail(payment.id);
    await this.recordPaymentAudit(updated, 'PAYMENT_PROOF_UPLOADED', {
      metadata: {
        transactionReference: fields.transactionReference ?? null,
        proofUrl: processedFile.url,
      },
    });

    sendPaymentProofReceivedEmail(updated.payer.email, updated.payer.firstName, {
      paymentReference: updated.paymentReference,
      description: updated.description,
      purpose: updated.purpose,
      paymentMethod: updated.paymentMethod,
      amount: Number(updated.amount),
      currency: updated.currency,
      transactionReference: updated.payerTransactionReference,
      submittedAt: proofUploadedAt,
    }).catch((err) =>
      console.error('[PaymentService] Payment proof email failed:', err),
    );

    return {
      success: true,
      message: 'Payment proof uploaded successfully.',
      data: {
        paymentId: updated.id,
        status: updated.status,
        transactionReference: updated.payerTransactionReference,
        proofUploadedAt: updated.proofUploadedAt,
      },
    };
  }

  async listUserPayments(
    payerId: string,
    query: PaymentQueryDto,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
  }> {
    const qb = this.paymentRepo
      .createQueryBuilder('payment')
      .where('payment.payerId = :payerId', { payerId })
      .orderBy('payment.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    this.applyPaymentFilters(qb, query);

    const [payments, total] = await qb.getManyAndCount();
    await Promise.all(payments.map((payment) => this.markExpiredIfNeeded(payment)));

    return {
      success: true,
      data: payments.map(serializePaymentListItem),
      pagination: this.pagination(query.page, query.limit, total),
    };
  }

  async getPaymentById(
    payerId: string,
    paymentId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const payment = await this.requirePayerPayment(paymentId, payerId);
    await this.markExpiredIfNeeded(payment);
    const updated = await this.requirePaymentForDetail(payment.id);

    return {
      success: true,
      data: serializePaymentDetail(updated),
    };
  }

  async getAdminPaymentById(
    paymentId: string,
  ): Promise<{ success: true; data: Record<string, unknown> }> {
    const payment = await this.requirePaymentForDetail(paymentId);
    await this.markExpiredIfNeeded(payment);
    const updated = await this.requirePaymentForDetail(payment.id);

    return {
      success: true,
      data: serializePaymentDetail(updated),
    };
  }

  async cancelPayment(
    payerId: string,
    paymentId: string,
    dto: CancelPaymentDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const payment = await this.requirePayerPayment(paymentId, payerId);
    await this.markExpiredIfNeeded(payment);

    if (payment.status === PaymentStatus.CONFIRMED) {
      throw createError.conflict('Confirmed payments cannot be cancelled');
    }

    await auditedUpdate(this.paymentRepo, payment.id, {
      status: PaymentStatus.CANCELLED,
      failureReason: dto.reason ?? payment.failureReason,
    });
    const updated = await this.requirePaymentForDetail(payment.id);
    await this.recordPaymentAudit(updated, 'PAYMENT_CANCELLED', {
      metadata: { reason: dto.reason ?? null },
    });

    return {
      success: true,
      message: 'Payment cancelled successfully.',
      data: { paymentId: updated.id, status: updated.status },
    };
  }

  async listAdminPayments(
    query: PaymentQueryDto,
  ): Promise<{
    success: true;
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
  }> {
    const qb = this.paymentRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.payer', 'payer')
      .leftJoinAndSelect('payment.provider', 'provider')
      .orderBy('payment.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    this.applyPaymentFilters(qb, query);

    const [payments, total] = await qb.getManyAndCount();
    await Promise.all(payments.map((payment) => this.markExpiredIfNeeded(payment)));

    return {
      success: true,
      data: payments.map(serializeAdminPaymentListItem),
      pagination: this.pagination(query.page, query.limit, total),
    };
  }

  async startReview(
    paymentId: string,
    adminId: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const payment = await this.requirePaymentForDetail(paymentId);
    await this.markExpiredIfNeeded(payment);

    if (payment.status !== PaymentStatus.PROOF_UPLOADED) {
      throw createError.conflict('Only uploaded payment proofs can move under review');
    }

    await auditedUpdate(this.paymentRepo, payment.id, {
      status: PaymentStatus.UNDER_REVIEW,
    });
    const updated = await this.requirePaymentForDetail(payment.id);
    await this.recordPaymentAudit(updated, 'PAYMENT_REVIEW_STARTED', { adminId });

    return {
      success: true,
      message: 'Payment review started successfully.',
      data: { paymentId: updated.id, status: updated.status },
    };
  }

  async confirmPayment(
    paymentId: string,
    adminId: string | null,
    dto: AdminPaymentConfirmDto,
    idempotencyKey?: string,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    if (idempotencyKey) {
      const existing = await this.paymentAuditRepo.findOne({
        where: { idempotencyKey },
      });
      if (existing) {
        const payment = await this.requirePaymentForDetail(existing.paymentId);
        return {
          success: true,
          message: 'Payment confirmed successfully.',
          data: {
            paymentId: payment.id,
            status: payment.status,
            verifiedAt: payment.verifiedAt,
          },
        };
      }
    }

    const payment = await this.requirePaymentForDetail(paymentId);
    await this.markExpiredIfNeeded(payment);

    if (payment.status === PaymentStatus.CONFIRMED) {
      return {
        success: true,
        message: 'Payment confirmed successfully.',
        data: {
          paymentId: payment.id,
          status: payment.status,
          verifiedAt: payment.verifiedAt,
        },
      };
    }

    if (
      payment.status === PaymentStatus.CANCELLED ||
      payment.status === PaymentStatus.EXPIRED ||
      payment.status === PaymentStatus.FAILED
    ) {
      throw createError.conflict('This payment cannot be confirmed');
    }

    if (payment.provider?.requiresProof && !payment.proofUploadedAt) {
      throw createError.badRequest('Payment proof must be uploaded before confirmation');
    }

    const discrepancy = this.paymentDiscrepancy(payment, dto);
    if (discrepancy) {
      await auditedUpdate(this.paymentRepo, payment.id, {
        status: PaymentStatus.UNDER_REVIEW,
        metadata: {
          ...(payment.metadata ?? {}),
          discrepancy,
        },
      });
      throw createError.badRequest('Payment received does not match the expected amount or currency');
    }

    const verifiedAt = new Date();
    await auditedUpdate(this.paymentRepo, payment.id, {
      status: PaymentStatus.CONFIRMED,
      verifiedBy: adminId,
      verifiedAt,
      paidAt: verifiedAt,
      adminNotes: dto.notes ?? null,
      failureReason: null,
      rejectionReason: null,
      canResubmitProof: false,
    });

    const attemptUpdate = this.paymentAttemptRepo
      .createQueryBuilder()
      .update(PaymentAttempt)
      .set({ status: PaymentStatus.CONFIRMED, completedAt: verifiedAt })
      .where('paymentId = :paymentId', { paymentId: payment.id });

    if (payment.providerReference) {
      attemptUpdate.andWhere('providerReference = :providerReference', {
        providerReference: payment.providerReference,
      });
    } else {
      attemptUpdate.andWhere('providerReference IS NULL');
    }

    await attemptUpdate.execute();

    const updated = await this.requirePaymentForDetail(payment.id);
    await this.recordPaymentAudit(updated, 'PAYMENT_CONFIRMED', {
      adminId,
      idempotencyKey,
    });
    this.emitPaymentEvent('PAYMENT_CONFIRMED', updated);
    this.emitPaymentEvent('PAYMENT_READY_FOR_ORDER', updated);

    sendPaymentConfirmedEmail(updated.payer.email, updated.payer.firstName, {
      paymentReference: updated.paymentReference,
      description: updated.description,
      paymentMethod: updated.paymentMethod,
      amount: Number(updated.amount),
      currency: updated.currency,
      paidAt: verifiedAt,
      completionMessage: this.completionMessage(updated),
    }).catch((err) =>
      console.error('[PaymentService] Payment confirmation email failed:', err),
    );

    return {
      success: true,
      message: 'Payment confirmed successfully.',
      data: {
        paymentId: updated.id,
        status: updated.status,
        verifiedAt: updated.verifiedAt,
      },
    };
  }

  async rejectPayment(
    paymentId: string,
    adminId: string,
    dto: AdminPaymentRejectDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const payment = await this.requirePaymentForDetail(paymentId);
    await this.markExpiredIfNeeded(payment);

    if (
      payment.status !== PaymentStatus.PROOF_UPLOADED &&
      payment.status !== PaymentStatus.UNDER_REVIEW
    ) {
      throw createError.conflict('Only submitted payment proofs can be rejected');
    }

    await auditedUpdate(this.paymentRepo, payment.id, {
      status: PaymentStatus.REJECTED,
      rejectionReason: dto.reason,
      canResubmitProof: dto.allowResubmission,
      verifiedBy: adminId,
      verifiedAt: new Date(),
    });
    const updated = await this.requirePaymentForDetail(payment.id);
    await this.recordPaymentAudit(updated, 'PAYMENT_REJECTED', {
      adminId,
      metadata: {
        reason: dto.reason,
        allowResubmission: dto.allowResubmission,
      },
    });

    sendPaymentRejectedEmail(updated.payer.email, updated.payer.firstName, {
      paymentReference: updated.paymentReference,
      description: updated.description,
      paymentMethod: updated.paymentMethod,
      amount: Number(updated.amount),
      currency: updated.currency,
      rejectionReason: dto.reason,
      canResubmitProof: dto.allowResubmission,
    }).catch((err) =>
      console.error('[PaymentService] Payment rejection email failed:', err),
    );

    return {
      success: true,
      message: 'Payment proof rejected.',
      data: {
        paymentId: updated.id,
        status: updated.status,
        canResubmitProof: updated.canResubmitProof,
      },
    };
  }

  async handleGatewayWebhook(
    providerCode: string,
    dto: PaymentWebhookDto,
  ): Promise<{ success: true; message: string; data: Record<string, unknown> }> {
    const idempotencyKey = `${providerCode}:${dto.eventId ?? dto.providerReference}:${dto.status}`;
    const existing = await this.paymentAuditRepo.findOne({
      where: { idempotencyKey },
    });
    if (existing) {
      return {
        success: true,
        message: 'Webhook already processed.',
        data: { paymentId: existing.paymentId },
      };
    }

    const payment = await this.paymentRepo.findOne({
      where: {
        paymentMethod: providerCode,
        providerReference: dto.providerReference,
      },
      relations: ['payer', 'provider'],
    });
    if (!payment) throw createError.notFound('Payment not found');

    if (
      dto.paymentReference &&
      dto.paymentReference !== payment.paymentReference
    ) {
      throw createError.badRequest('Payment reference does not match provider transaction');
    }

    const webhookDiscrepancy = this.paymentDiscrepancy(payment, {
      receivedAmount: dto.amount,
      receivedCurrency: dto.currency,
    });

    if (webhookDiscrepancy) {
      await auditedUpdate(this.paymentRepo, payment.id, {
        status: PaymentStatus.UNDER_REVIEW,
        metadata: {
          ...(payment.metadata ?? {}),
          discrepancy: webhookDiscrepancy,
        },
      });
      throw createError.badRequest('Webhook amount or currency does not match payment');
    }

    if (dto.status === 'failed') {
      await auditedUpdate(this.paymentRepo, payment.id, {
        status: PaymentStatus.FAILED,
        failureReason: dto.failureReason ?? 'Payment provider reported failure',
      });
      const updated = await this.requirePaymentForDetail(payment.id);
      await this.recordPaymentAudit(updated, 'PAYMENT_FAILED', {
        idempotencyKey,
        metadata: { providerCode, failureReason: dto.failureReason ?? null },
      });
      return {
        success: true,
        message: 'Payment failure recorded.',
        data: { paymentId: updated.id, status: updated.status },
      };
    }

    return this.confirmPayment(
      payment.id,
      null,
      {
        notes: `Confirmed by ${providerCode} webhook`,
        receivedAmount: dto.amount,
        receivedCurrency: dto.currency,
      },
      idempotencyKey,
    );
  }

  private async resolvePaymentContext(
    payerId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<{ source: PayableDetails; payer: User }> {
    const payer = await this.userRepo.findOne({ where: { id: payerId } });
    if (!payer) throw createError.notFound('Payer not found');

    const source = await this.sourceResolver.getPayableDetails(
      sourceType,
      sourceId,
      payerId,
    );
    if (source.amount <= 0) {
      throw createError.badRequest('Payable source amount must be greater than zero');
    }

    return { source, payer };
  }

  private async ensureSourceHasNoConfirmedPayment(
    source: PayableDetails,
  ): Promise<void> {
    const confirmed = await this.paymentRepo.findOne({
      where: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        status: PaymentStatus.CONFIRMED,
      },
      select: ['id'],
    });
    if (confirmed) {
      throw createError.conflict('This source already has a confirmed payment');
    }
  }

  private async getEligibleProvider(
    source: PayableDetails,
    payer: User,
    paymentMethod: string,
  ): Promise<PaymentProvider> {
    const providers = await this.getEligibleProviders(source, payer);
    const provider = providers.find((item) => item.code === paymentMethod);
    if (!provider) {
      throw createError.badRequest('Selected payment method is not available for this payment');
    }
    return provider;
  }

  private async getEligibleProviders(
    source: PayableDetails,
    payer: User,
  ): Promise<PaymentProvider[]> {
    await requireActiveCurrency(source.currency);
    const methodConfigs=await AppDataSource.manager.find(PaymentMethodConfig,{where:{status:'active'}});
    const providers = await this.paymentProviderRepo.find({
      where: { status: PaymentProviderStatus.ACTIVE },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    const eligible: PaymentProvider[] = [];
    for (const provider of providers) {
      const method=methodConfigs.find(item=>item.code===provider.code);
      if(!method || !method.supportedCurrencies.includes(source.currency.toUpperCase()) || (method.paymentContext && !method.paymentContext.includes(source.sourceType)))continue;
      provider.name=method.displayName;provider.sortOrder=method.sortOrder;
      if (!this.providerSupportsPayment(provider, source, payer)) continue;
      if (this.requiresPaymentAccount(provider.code)) {
        const account = await this.getPaymentAccount(provider.code, source.currency);
        if (!account) continue;
      }
      eligible.push(provider);
    }

    return eligible.sort((a,b)=>a.sortOrder-b.sortOrder);
  }

  private providerSupportsPayment(
    provider: PaymentProvider,
    source: PayableDetails,
    payer: User,
  ): boolean {
    const currency = source.currency.toUpperCase();
    if (!this.asArray(provider.supportedCurrencies).includes(currency)) return false;

    const supportedSourceTypes = this.asNullableArray(provider.supportedSourceTypes);
    if (supportedSourceTypes && !supportedSourceTypes.includes(source.sourceType)) {
      return false;
    }

    const supportedPurposes = this.asNullableArray(provider.supportedPurposes);
    if (supportedPurposes && !supportedPurposes.includes(source.purpose)) {
      return false;
    }

    const supportedCountries = this.asNullableArray(provider.supportedCountries);
    if (supportedCountries && (!payer.country || !supportedCountries.includes(payer.country))) {
      return false;
    }

    if (provider.minAmount !== null && source.amount < Number(provider.minAmount)) {
      return false;
    }

    if (provider.maxAmount !== null && source.amount > Number(provider.maxAmount)) {
      return false;
    }

    return true;
  }

  private async initializePayment(
    payment: Payment,
    provider: PaymentProvider,
    payer: User,
  ): Promise<PaymentInitialization> {
    if (provider.requiresProof) {
      const account = this.requiresPaymentAccount(provider.code)
        ? await this.getPaymentAccount(provider.code, payment.currency)
        : null;
      if (this.requiresPaymentAccount(provider.code) && !account) {
        throw createError.badRequest('No active payment account is configured for this currency');
      }
      return {
        bankAccount: account ? serializePaymentAccount(account) : null,
      };
    }

    const adapter = getGatewayAdapter(provider.code);
    const initialized = await adapter.initializePayment({
      paymentId: payment.id,
      paymentReference: payment.paymentReference,
      amount: Number(payment.amount),
      currency: payment.currency,
      payerEmail: payer.email,
      description: payment.description,
      provider,
    });

    return {
      authorizationUrl: initialized.authorizationUrl,
      providerReference: initialized.providerReference,
    };
  }

  private async getPaymentAccount(
    paymentMethod: string,
    currency: string,
  ): Promise<PaymentAccount | null> {
    return this.paymentAccountRepo.findOne({
      where: {
        paymentMethod,
        currency,
        status: PaymentAccountStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });
  }

  private initialStatusFor(provider: PaymentProvider): PaymentStatus {
    if (provider.requiresProof || provider.type === PaymentProviderType.MANUAL) {
      return PaymentStatus.AWAITING_PAYMENT;
    }
    return PaymentStatus.PROCESSING;
  }

  private expiryFor(provider: PaymentProvider, source: PayableDetails): Date | null {
    if (source.expiresAt) return source.expiresAt;

    const hoursByMethod: Record<string, number> = {
      paystack: 1,
      flutterwave: 1,
      transactworld: 1,
      papss: 1,
      direct_bank_transfer: 24,
      telegraphic_transfer: 72,
      letter_of_credit: 720,
    };

    const hours = hoursByMethod[provider.code];
    return hours ? addHours(hours) : null;
  }

  private initializationMessage(payment: Payment): string {
    if (payment.sourceType === 'subscription') {
      return payment.status === PaymentStatus.AWAITING_PAYMENT
        ? 'Bank transfer payment created successfully.'
        : 'Subscription payment initialized successfully.';
    }

    return 'Payment initialized successfully.';
  }

  private recommendedProviderCode(providers: PaymentProvider[]): string | null {
    return (
      providers.find((provider) => provider.type === PaymentProviderType.GATEWAY)
        ?.code ??
      providers[0]?.code ??
      null
    );
  }

  private async requirePayerPayment(
    paymentId: string,
    payerId: string,
  ): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId, payerId },
      relations: ['payer', 'provider'],
    });
    if (!payment) throw createError.notFound('Payment not found');
    return payment;
  }

  private async requirePaymentForDetail(paymentId: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['payer', 'provider'],
    });
    if (!payment) throw createError.notFound('Payment not found');
    return payment;
  }

  private async markExpiredIfNeeded(payment: Payment): Promise<void> {
    if (!payment.expiresAt || payment.expiresAt.getTime() > Date.now()) return;
    if (TERMINAL_PAYMENT_STATUSES.includes(payment.status)) return;

    await auditedUpdate(this.paymentRepo, payment.id, {
      status: PaymentStatus.EXPIRED,
    });
    payment.status = PaymentStatus.EXPIRED;
    await this.recordPaymentAudit(payment, 'PAYMENT_EXPIRED');
    this.emitPaymentEvent('PAYMENT_EXPIRED', payment);

    if (payment.payer) {
      sendPaymentExpiredEmail(payment.payer.email, payment.payer.firstName, {
        paymentReference: payment.paymentReference,
        description: payment.description,
        amount: Number(payment.amount),
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
      }).catch((err) =>
        console.error('[PaymentService] Payment expiry email failed:', err),
      );
    }
  }

  private assertSourceStillMatchesPayment(
    payment: Payment,
    source: PayableDetails,
  ): void {
    if (Number(payment.amount) !== source.amount || payment.currency !== source.currency) {
      throw createError.conflict('Payment amount or currency has changed. Create a new payment.');
    }
  }

  private paymentDiscrepancy(
    payment: Payment,
    dto: { receivedAmount?: number; receivedCurrency?: string },
  ): Record<string, unknown> | null {
    if (dto.receivedCurrency && dto.receivedCurrency !== payment.currency) {
      return {
        type: 'wrong_currency',
        expectedCurrency: payment.currency,
        receivedCurrency: dto.receivedCurrency,
      };
    }

    if (dto.receivedAmount === undefined) return null;

    const expectedAmount = Number(payment.amount);
    if (dto.receivedAmount === expectedAmount) return null;

    const difference = Math.abs(expectedAmount - dto.receivedAmount);
    return {
      type: dto.receivedAmount < expectedAmount ? 'underpayment' : 'overpayment',
      expectedAmount,
      receivedAmount: dto.receivedAmount,
      difference,
    };
  }

  private applyPaymentFilters(
    qb: SelectQueryBuilder<Payment>,
    query: PaymentQueryDto,
  ): void {
    if (query.sourceType) {
      qb.andWhere('payment.sourceType = :sourceType', { sourceType: query.sourceType });
    }
    if (query.purpose) {
      qb.andWhere('payment.purpose = :purpose', { purpose: query.purpose });
    }
    if (query.status) {
      qb.andWhere('payment.status = :status', { status: query.status });
    }
    if (query.paymentMethod) {
      qb.andWhere('payment.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }
    if (query.currency) {
      qb.andWhere('payment.currency = :currency', { currency: query.currency });
    }
    if (query.search) {
      qb.andWhere(
        '(payment.paymentReference LIKE :search OR payment.sourceId LIKE :search OR payment.payerTransactionReference LIKE :search)',
        { search: `%${query.search}%` },
      );
    }
  }

  private async generatePaymentReference(): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      const paymentReference = `TOFA-PAY-${datePart}-${suffix}`;
      const existing = await this.paymentRepo.findOne({
        where: { paymentReference },
        select: ['id'],
      });
      if (!existing) return paymentReference;
    }
    throw createError.conflict('Unable to generate a unique payment reference');
  }

  private requiresPaymentAccount(paymentMethod: string): boolean {
    return paymentMethod === 'direct_bank_transfer' || paymentMethod === 'telegraphic_transfer';
  }

  private asArray(value: string[] | string): string[] {
    if (Array.isArray(value)) return value.map((item) => item.toUpperCase());
    try {
      return (JSON.parse(value) as string[]).map((item) => item.toUpperCase());
    } catch {
      return [];
    }
  }

  private asNullableArray(value: string[] | string | null): string[] | null {
    if (value === null) return null;
    if (Array.isArray(value)) return value;
    try {
      return JSON.parse(value) as string[];
    } catch {
      return null;
    }
  }

  private pagination(page: number, limit: number, total: number): Record<string, number> {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async recordPaymentAuditById(
    paymentId: string,
    action: string,
    input?: {
      payerId?: string | null;
      adminId?: string | null;
      idempotencyKey?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) return;
    await this.recordPaymentAudit(payment, action, input);
  }

  private async recordPaymentAudit(
    payment: Payment,
    action: string,
    input?: {
      payerId?: string | null;
      adminId?: string | null;
      idempotencyKey?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    await this.paymentAuditRepo.save(
      this.paymentAuditRepo.create({
        action,
        paymentId: payment.id,
        sourceType: payment.sourceType,
        sourceId: payment.sourceId,
        payerId: input?.payerId ?? payment.payerId ?? null,
        adminId: input?.adminId ?? null,
        idempotencyKey: input?.idempotencyKey ?? null,
        metadata: input?.metadata ?? null,
      }),
    );
  }

  private emitPaymentEvent(event: PaymentEventName, payment: Payment): void {
    publishPaymentEvent(event, payment);
    this.fastify?.log.info(
      {
        event,
        payment: serializePaymentEventPayload(payment),
      },
      `[PaymentService] ${event}`,
    );
  }

  private completionMessage(payment: Payment): string {
    if (payment.sourceType === 'checkout') {
      return 'Your marketplace transaction will now proceed to Order processing.';
    }
    if (payment.sourceType === 'subscription') {
      return 'Your subscription payment has been confirmed. Your subscription will now be activated.';
    }
    return 'The related TOFA service will now continue processing.';
  }
}

function serializePaymentListItem(payment: Payment): Record<string, unknown> {
  return {
    paymentId: payment.id,
    paymentReference: payment.paymentReference,
    source: {
      type: payment.sourceType,
      id: payment.sourceId,
    },
    purpose: payment.purpose,
    amount: Number(payment.amount),
    currency: payment.currency,
    paymentMethod: payment.paymentMethod,
    status: payment.status,
    description: payment.description,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt,
  };
}

function serializePaymentDetail(
  payment: Payment,
  initialization?: PaymentInitialization,
): Record<string, unknown> {
  return {
    paymentId: payment.id,
    paymentReference: payment.paymentReference,
    sourceType: payment.sourceType,
    sourceId: payment.sourceId,
    source: {
      type: payment.sourceType,
      id: payment.sourceId,
    },
    purpose: payment.purpose,
    description: payment.description,
    amount: Number(payment.amount),
    currency: payment.currency,
    paymentMethod: payment.paymentMethod,
    status: payment.status,
    provider: payment.provider
      ? {
          id: payment.provider.id,
          code: payment.provider.code,
          name: payment.provider.name,
          authorizationUrl: initialization?.authorizationUrl ?? null,
          providerReference:
            initialization?.providerReference ?? payment.providerReference,
        }
      : null,
    ...(initialization?.bankAccount
      ? { bankAccount: initialization.bankAccount }
      : {}),
    requiresProof: payment.provider?.requiresProof ?? false,
    metadata: payment.metadata,
    paymentProof: payment.paymentProofUrl
      ? {
          url: payment.paymentProofUrl,
          transactionReference: payment.payerTransactionReference,
          uploadedAt: payment.proofUploadedAt,
        }
      : null,
    failureReason: payment.failureReason,
    rejectionReason: payment.rejectionReason,
    canResubmitProof: payment.canResubmitProof,
    createdAt: payment.createdAt,
    expiresAt: payment.expiresAt,
    verifiedAt: payment.verifiedAt,
    paidAt: payment.paidAt,
  };
}

function serializeAdminPaymentListItem(payment: Payment): Record<string, unknown> {
  return {
    paymentId: payment.id,
    paymentReference: payment.paymentReference,
    payer: payment.payer
      ? {
          id: payment.payer.id,
          name: `${payment.payer.firstName} ${payment.payer.lastName}`.trim(),
          email: payment.payer.email,
        }
      : null,
    source: {
      type: payment.sourceType,
      id: payment.sourceId,
    },
    purpose: payment.purpose,
    paymentMethod: payment.paymentMethod,
    amount: Number(payment.amount),
    currency: payment.currency,
    status: payment.status,
    transactionReference: payment.payerTransactionReference,
    proofUrl: payment.paymentProofUrl,
    proofUploadedAt: payment.proofUploadedAt,
  };
}

function serializePaymentAccount(account: PaymentAccount): Record<string, unknown> {
  return {
    bankName: account.bankName,
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    swiftCode: account.swiftCode,
    iban: account.iban,
    bankAddress: account.bankAddress,
    country: account.country,
  };
}
