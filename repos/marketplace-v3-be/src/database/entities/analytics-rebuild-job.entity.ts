import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Admin } from './admin.entity';

export enum AnalyticsRebuildJobStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('analytics_rebuild_jobs')
@Index('IDX_analytics_rebuild_jobs_status_created', ['status', 'createdAt'])
export class AnalyticsRebuildJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  entityType!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  entityId!: string | null;

  @Column({ type: 'date', nullable: true })
  dateFrom!: string | null;

  @Column({ type: 'date', nullable: true })
  dateTo!: string | null;

  @Column({ type: 'varchar', length: 36 })
  requestedByAdminId!: string;

  @Column({
    type: 'enum',
    enum: AnalyticsRebuildJobStatus,
    default: AnalyticsRebuildJobStatus.PROCESSING,
  })
  status!: AnalyticsRebuildJobStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @ManyToOne(() => Admin, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requestedByAdminId' })
  requestedByAdmin!: Admin;
}
