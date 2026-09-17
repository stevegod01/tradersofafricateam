import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SearchIndexJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum SearchIndexEntityType {
  PRODUCT = 'product',
  SELLER = 'seller',
  MARKET_RFQ = 'market_rfq',
  CATEGORY = 'category',
  PRODUCTS = 'products',
  SELLERS = 'sellers',
  MARKET_RFQS = 'market_rfqs',
  CATEGORIES = 'categories',
}

@Index('IDX_search_index_jobs_status_created', ['status', 'createdAt'])
@Index('IDX_search_index_jobs_entity', ['entityType', 'entityId'])
@Entity('search_index_jobs')
export class SearchIndexJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'enum',
    enum: SearchIndexEntityType,
  })
  entityType!: SearchIndexEntityType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  entityId!: string | null;

  @Column({
    type: 'enum',
    enum: SearchIndexJobStatus,
    default: SearchIndexJobStatus.PENDING,
  })
  status!: SearchIndexJobStatus;

  @Column({ type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  requestedBy!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
