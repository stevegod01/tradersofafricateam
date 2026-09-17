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
import { User } from './user.entity';

export enum NotificationCategory {
  ACCOUNT = 'account',
  SELLER = 'seller',
  PRODUCT = 'product',
  RFQ = 'rfq',
  PAYMENT = 'payment',
  ORDER = 'order',
  LOGISTICS = 'logistics',
  SUBSCRIPTION = 'subscription',
  REVIEW = 'review',
  REWARD = 'reward',
  MESSAGE = 'message',
  DISPUTE = 'dispute',
  SYSTEM = 'system',
  MARKETING = 'marketing',
}

export enum NotificationActionType {
  NONE = 'none',
  PRODUCT = 'product',
  SELLER = 'seller',
  DIRECT_RFQ = 'direct_rfq',
  MARKET_RFQ = 'market_rfq',
  QUOTE = 'quote',
  PAYMENT = 'payment',
  ORDER = 'order',
  SUBSCRIPTION = 'subscription',
  REVIEW = 'review',
  MESSAGE = 'message',
  DISPUTE = 'dispute',
  EXTERNAL = 'external',
}

@Index('IDX_notifications_user_read_deleted', ['userId', 'isRead', 'deletedAt'])
@Index('IDX_notifications_user_category_created', ['userId', 'category', 'createdAt'])
@Index('UQ_notifications_user_deduplication', ['userId', 'deduplicationKey'], {
  unique: true,
})
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'varchar', length: 120 })
  type!: string;

  @Column({
    type: 'enum',
    enum: NotificationCategory,
  })
  category!: NotificationCategory;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({
    type: 'enum',
    enum: NotificationActionType,
    default: NotificationActionType.NONE,
  })
  actionType!: NotificationActionType;

  @Column({ type: 'varchar', length: 120, nullable: true })
  actionId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  actionUrl!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  imageUrl!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  eventId!: string | null;

  @Column({ type: 'varchar', length: 220, nullable: true })
  deduplicationKey!: string | null;

  @Column({ type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
