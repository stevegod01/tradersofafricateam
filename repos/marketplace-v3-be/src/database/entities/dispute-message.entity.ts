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
import { Dispute } from './dispute.entity';
import { User } from './user.entity';

export enum DisputeMessageSenderType {
  BUYER = 'buyer',
  SELLER = 'seller',
  ADMIN = 'admin',
}

export type DisputeMessageAttachmentSnapshot = {
  evidenceId: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
};

@Index('IDX_dispute_messages_dispute_created', ['disputeId', 'createdAt'])
@Entity('dispute_messages')
export class DisputeMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  disputeId!: string;

  @Column({ type: 'varchar', length: 36 })
  senderId!: string;

  @Column({
    type: 'enum',
    enum: DisputeMessageSenderType,
  })
  senderType!: DisputeMessageSenderType;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'json', nullable: true })
  attachments!: DisputeMessageAttachmentSnapshot[] | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Dispute, (dispute) => dispute.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'disputeId' })
  dispute!: Dispute;

  @ManyToOne(() => User, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'senderId' })
  sender!: User | null;
}
