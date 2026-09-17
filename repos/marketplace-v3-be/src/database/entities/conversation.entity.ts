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
import { ConversationParticipant } from './conversation-participant.entity';
import { Message } from './message.entity';
import { User } from './user.entity';

export enum ConversationStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

@Index('UQ_conversations_reference', ['conversationReference'], { unique: true })
@Index('UQ_conversations_participant_pair', ['participantPairKey'], { unique: true })
@Index('IDX_conversations_status_lastMessageAt', ['status', 'lastMessageAt'])
@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40 })
  conversationReference!: string;

  @Column({ type: 'varchar', length: 80, select: false })
  participantPairKey!: string;

  @Column({
    type: 'enum',
    enum: ConversationStatus,
    default: ConversationStatus.ACTIVE,
  })
  status!: ConversationStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  lastMessageId!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt!: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  initiatedById!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  blockedBy!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  blockedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  blockReason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => ConversationParticipant, (participant) => participant.conversation)
  participants!: ConversationParticipant[];

  @OneToMany(() => Message, (message) => message.conversation)
  messages!: Message[];

  @ManyToOne(() => Message, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'lastMessageId' })
  lastMessage!: Message | null;

  @ManyToOne(() => User, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'initiatedById' })
  initiatedBy!: User | null;
}
