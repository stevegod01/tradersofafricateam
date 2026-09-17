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
import { MessageAttachmentType } from './message-attachment.entity';
import { User } from './user.entity';

export enum MessageUploadStatus {
  UPLOADED = 'uploaded',
  ATTACHED = 'attached',
  DELETED = 'deleted',
}

@Index('IDX_message_uploads_user_status', ['userId', 'status'])
@Entity('message_uploads')
export class MessageUpload {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ type: 'varchar', length: 1000 })
  fileUrl!: string;

  @Column({ type: 'varchar', length: 500 })
  storedName!: string;

  @Column({
    type: 'enum',
    enum: MessageAttachmentType,
  })
  attachmentType!: MessageAttachmentType;

  @Column({ type: 'varchar', length: 120 })
  mimeType!: string;

  @Column({ type: 'int' })
  fileSize!: number;

  @Column({
    type: 'enum',
    enum: MessageUploadStatus,
    default: MessageUploadStatus.UPLOADED,
  })
  status!: MessageUploadStatus;

  @Column({ type: 'timestamp', nullable: true })
  usedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
