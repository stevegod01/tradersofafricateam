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

export enum DisputeAuditActorType {
  BUYER = 'buyer',
  SELLER = 'seller',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

@Index('IDX_dispute_audit_events_dispute_created', ['disputeId', 'createdAt'])
@Index('IDX_dispute_audit_events_action', ['action'])
@Entity('dispute_audit_events')
export class DisputeAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  disputeId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId!: string | null;

  @Column({
    type: 'enum',
    enum: DisputeAuditActorType,
  })
  actorType!: DisputeAuditActorType;

  @Column({ type: 'varchar', length: 120 })
  action!: string;

  @Column({ type: 'json', nullable: true })
  previousValue!: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  newValue!: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Dispute, (dispute) => dispute.auditEvents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'disputeId' })
  dispute!: Dispute;
}
