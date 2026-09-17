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

export enum DisputeEvidenceUploadStatus {
  UPLOADED = 'uploaded',
  ATTACHED = 'attached',
  DELETED = 'deleted',
}

@Index('IDX_dispute_evidence_uploads_user_status', ['userId', 'status'])
@Entity('dispute_evidence_uploads')
export class DisputeEvidenceUpload {
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

  @Column({ type: 'varchar', length: 120 })
  fileType!: string;

  @Column({ type: 'int' })
  fileSize!: number;

  @Column({
    type: 'enum',
    enum: DisputeEvidenceUploadStatus,
    default: DisputeEvidenceUploadStatus.UPLOADED,
  })
  status!: DisputeEvidenceUploadStatus;

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
