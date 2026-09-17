import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum AnalyticsReportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
  PDF = 'pdf',
}

export enum AnalyticsReportStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

@Entity('analytics_reports')
@Index('IDX_analytics_reports_requestedBy_created', ['requestedBy', 'createdAt'])
@Index('IDX_analytics_reports_status', ['status'])
export class AnalyticsReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  requestedBy!: string;

  @Column({ type: 'varchar', length: 20, default: 'user' })
  requestedByType!: 'user' | 'admin';

  @Column({ type: 'varchar', length: 80 })
  reportType!: string;

  @Column({
    type: 'enum',
    enum: AnalyticsReportFormat,
  })
  format!: AnalyticsReportFormat;

  @Column({ type: 'json' })
  filters!: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: AnalyticsReportStatus,
    default: AnalyticsReportStatus.PROCESSING,
  })
  status!: AnalyticsReportStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  fileUrl!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @ManyToOne(() => User, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'requestedBy' })
  requester!: User | null;
}
