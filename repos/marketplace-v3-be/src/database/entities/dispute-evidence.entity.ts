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

@Index('IDX_dispute_evidence_dispute_created', ['disputeId', 'createdAt'])
@Index('IDX_dispute_evidence_uploaded_by', ['uploadedBy'])
@Entity('dispute_evidence')
export class DisputeEvidence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  disputeId!: string;

  @Column({ type: 'varchar', length: 36 })
  uploadedBy!: string;

  @Column({ type: 'varchar', length: 120 })
  fileType!: string;

  @Column({ type: 'varchar', length: 1000 })
  fileUrl!: string;

  @Column({ type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  storedName!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  uploadId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Dispute, (dispute) => dispute.evidence, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'disputeId' })
  dispute!: Dispute;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploadedBy' })
  uploader!: User;
}
