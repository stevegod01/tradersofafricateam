import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { MessageAttachment } from './message-attachment.entity';
import { MessageReport } from './message-report.entity';
import { User } from './user.entity';

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  MIXED = 'mixed',
}

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  DELETED = 'deleted',
}

@Index('UQ_messages_sender_clientMessageId', ['senderId', 'clientMessageId'], {
  unique: true,
})
@Index('IDX_messages_conversation_sentAt', ['conversationId', 'sentAt'])
@Index('IDX_messages_sender_status', ['senderId', 'status'])
@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  conversationId!: string;

  @Column({ type: 'varchar', length: 36 })
  senderId!: string;

  @Column({ type: 'varchar', length: 80 })
  clientMessageId!: string;

  @Column({
    type: 'enum',
    enum: MessageType,
  })
  messageType!: MessageType;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  replyToMessageId!: string | null;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.SENT,
  })
  status!: MessageStatus;

  @Column({ type: 'timestamp' })
  sentAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  readAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  editedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation!: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderId' })
  sender!: User;

  @ManyToOne(() => Message, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'replyToMessageId' })
  replyToMessage!: Message | null;

  @OneToMany(() => MessageAttachment, (attachment) => attachment.message)
  attachments!: MessageAttachment[];

  @OneToMany(() => MessageReport, (report) => report.message)
  reports!: MessageReport[];
}
