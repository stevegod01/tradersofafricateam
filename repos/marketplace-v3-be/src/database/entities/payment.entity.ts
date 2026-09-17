import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Admin } from './admin.entity';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentProvider } from './payment-provider.entity';
import { User } from './user.entity';
import { LetterOfCreditDetail } from './letter-of-credit-detail.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  AWAITING_PAYMENT = 'awaiting_payment',
  PROCESSING = 'processing',
  PROOF_UPLOADED = 'proof_uploaded',
  UNDER_REVIEW = 'under_review',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Index('IDX_payments_source', ['sourceType', 'sourceId'])
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  paymentReference!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  payerId!: string;

  @Column({ type: 'varchar', length: 80 })
  sourceType!: string;

  @Column({ type: 'varchar', length: 80 })
  sourceId!: string;

  @Column({ type: 'varchar', length: 80 })
  purpose!: string;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 80 })
  paymentMethod!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  providerId!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  providerReference!: string | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status!: PaymentStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  paymentProofUrl!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  payerTransactionReference!: string | null;

  @Column({ type: 'text', nullable: true })
  payerNotes!: string | null;

  @Column({ type: 'text', nullable: true })
  adminNotes!: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'boolean', default: true })
  canResubmitProof!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  proofUploadedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  verifiedBy!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt!: Date | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payerId' })
  payer!: User;

  @ManyToOne(() => PaymentProvider, (provider) => provider.payments, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'providerId' })
  provider!: PaymentProvider | null;

  @ManyToOne(() => Admin, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'verifiedBy' })
  verifier!: Admin | null;

  @OneToMany(() => PaymentAttempt, (attempt) => attempt.payment)
  attempts!: PaymentAttempt[];

  @OneToOne(() => LetterOfCreditDetail, (detail) => detail.payment)
  letterOfCreditDetail!: LetterOfCreditDetail | null;
}
