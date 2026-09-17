import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TranslatableEntityType {
  PRODUCT = 'product',
  CATEGORY = 'category',
  DIRECT_RFQ = 'direct_rfq',
  MARKET_RFQ = 'market_rfq',
  SUBSCRIPTION_PLAN = 'subscription_plan',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
}

export enum TranslationSource {
  ORIGINAL = 'original',
  MACHINE = 'machine',
  MANUAL = 'manual',
}

export enum TranslationStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Index('IDX_translation_metadata_entity', ['entityType', 'entityId'])
@Index('IDX_translation_metadata_status_language', ['status', 'targetLanguage'])
@Index(
  'UQ_translation_metadata_target',
  ['entityType', 'entityId', 'fieldName', 'targetLanguage'],
  { unique: true },
)
@Entity('translation_metadata')
export class TranslationMetadata {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'enum',
    enum: TranslatableEntityType,
  })
  entityType!: TranslatableEntityType;

  @Column({ type: 'varchar', length: 36 })
  entityId!: string;

  @Column({ type: 'varchar', length: 120 })
  fieldName!: string;

  @Column({ type: 'varchar', length: 20 })
  sourceLanguage!: string;

  @Column({ type: 'varchar', length: 20 })
  targetLanguage!: string;

  @Column({
    type: 'enum',
    enum: TranslationStatus,
    default: TranslationStatus.PENDING,
  })
  status!: TranslationStatus;

  @Column({
    type: 'enum',
    enum: TranslationSource,
    default: TranslationSource.MACHINE,
  })
  translationSource!: TranslationSource;

  @Column({ type: 'boolean', default: false })
  stale!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastTranslatedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  manuallyUpdatedBy!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  manuallyUpdatedAt!: Date | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
