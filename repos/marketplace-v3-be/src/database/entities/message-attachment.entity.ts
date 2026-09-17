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
import { Message } from './message.entity';

export enum MessageAttachmentType {
  IMAGE = 'image',
  FILE = 'file',
}

@Index('IDX_message_attachments_messageId', ['messageId'])
@Entity('message_attachments')
export class MessageAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  messageId!: string;

  @Column({ type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ type: 'varchar', length: 1000 })
  fileUrl!: string;

  @Column({
    type: 'enum',
    enum: MessageAttachmentType,
  })
  attachmentType!: MessageAttachmentType;

  @Column({ type: 'varchar', length: 120 })
  mimeType!: string;

  @Column({ type: 'int' })
  fileSize!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Message, (message) => message.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message!: Message;
}
