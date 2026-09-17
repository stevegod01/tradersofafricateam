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
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { User } from './user.entity';

@Index('UQ_conversation_participants_conversation_user', ['conversationId', 'userId'], {
  unique: true,
})
@Index('IDX_conversation_participants_user_unread', ['userId', 'unreadCount'])
@Entity('conversation_participants')
export class ConversationParticipant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  conversationId!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  lastReadMessageId!: string | null;

  @Column({ type: 'int', default: 0 })
  unreadCount!: number;

  @Column({ type: 'timestamp' })
  joinedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  leftAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastUnreadEmailSentAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Conversation, (conversation) => conversation.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation!: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => Message, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'lastReadMessageId' })
  lastReadMessage!: Message | null;
}
