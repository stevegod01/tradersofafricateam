import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReviewType } from './review-eligibility.entity';

export enum ReviewAuditActorType {
  BUYER = 'buyer',
  SELLER = 'seller',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

@Index('IDX_review_audit_events_eventType', ['eventType'])
@Index('IDX_review_audit_events_review', ['reviewType', 'reviewId'])
@Index('IDX_review_audit_events_eligibilityId', ['eligibilityId'])
@Index('IDX_review_audit_events_createdAt', ['createdAt'])
@Entity('review_audit_events')
export class ReviewAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  eventType!: string;

  @Column({
    type: 'enum',
    enum: ReviewAuditActorType,
  })
  actorType!: ReviewAuditActorType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId!: string | null;

  @Column({
    type: 'enum',
    enum: ReviewType,
    nullable: true,
  })
  reviewType!: ReviewType | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  eligibilityId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  pointsTransactionId!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
