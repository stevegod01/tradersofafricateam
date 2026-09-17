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
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { User } from './user.entity';

export enum MessageReportReason {
  SPAM = 'spam',
  ABUSIVE_CONTENT = 'abusive_content',
  FRAUD_ATTEMPT = 'fraud_attempt',
  PAYMENT_SCAM = 'payment_scam',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  OFF_PLATFORM_SOLICITATION = 'off_platform_solicitation',
  OTHER = 'other',
}

export enum MessageReportStatus {
  PENDING = 'pending',
  REVIEWING = 'reviewing',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum MessageReportAction {
  NO_ACTION = 'no_action',
  WARNING_ISSUED = 'warning_issued',
  MESSAGE_HIDDEN = 'message_hidden',
  CONVERSATION_BLOCKED = 'conversation_blocked',
  USER_RESTRICTED = 'user_restricted',
  ESCALATED = 'escalated',
}

@Index('UQ_message_reports_message_reportedBy', ['messageId', 'reportedById'], {
  unique: true,
})
@Index('IDX_message_reports_status_reason', ['status', 'reason'])
@Index('IDX_message_reports_reported_user', ['reportedUserId', 'status'])
@Entity('message_reports')
export class MessageReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  messageId!: string;

  @Column({ type: 'varchar', length: 36 })
  conversationId!: string;

  @Column({ type: 'varchar', length: 36 })
  reportedById!: string;

  @Column({ type: 'varchar', length: 36 })
  reportedUserId!: string;

  @Column({
    type: 'enum',
    enum: MessageReportReason,
  })
  reason!: MessageReportReason;

  @Column({ type: 'text', nullable: true })
  details!: string | null;

  @Column({
    type: 'enum',
    enum: MessageReportStatus,
    default: MessageReportStatus.PENDING,
  })
  status!: MessageReportStatus;

  @Column({
    type: 'enum',
    enum: MessageReportAction,
    nullable: true,
  })
  action!: MessageReportAction | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewedById!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Message, (message) => message.reports, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message!: Message;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation!: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reportedById' })
  reportedBy!: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reportedUserId' })
  reportedUser!: User;

  @ManyToOne(() => Admin, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'reviewedById' })
  reviewedBy!: Admin | null;
}
