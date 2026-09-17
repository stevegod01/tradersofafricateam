import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TranslationMap } from './category.entity';

export enum SystemAnnouncementAudience {
  ALL = 'all',
  BUYERS = 'buyers',
  SELLERS = 'sellers',
  ADMINS = 'admins',
  SPECIFIC_USERS = 'specific_users',
}

export enum SystemAnnouncementStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENT = 'sent',
  CANCELLED = 'cancelled',
}

@Index('IDX_system_announcements_status_audience', ['status', 'audience'])
@Index('IDX_system_announcements_scheduledAt', ['scheduledAt'])
@Entity('system_announcements')
export class SystemAnnouncement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'json' })
  title!: TranslationMap;

  @Column({ type: 'json' })
  message!: TranslationMap;

  @Column({
    type: 'enum',
    enum: SystemAnnouncementAudience,
  })
  audience!: SystemAnnouncementAudience;

  @Column({ type: 'json', nullable: true })
  recipientUserIds!: string[] | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  actionUrl!: string | null;

  @Column({ type: 'boolean', default: true })
  sendInApp!: boolean;

  @Column({ type: 'boolean', default: false })
  sendEmail!: boolean;

  @Column({
    type: 'enum',
    enum: SystemAnnouncementStatus,
    default: SystemAnnouncementStatus.DRAFT,
  })
  status!: SystemAnnouncementStatus;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  sentAt!: Date | null;

  @Column({ type: 'varchar', length: 36 })
  createdBy!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
