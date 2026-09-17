import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum SubscriptionAuditActorType {
  ADMIN = 'admin',
  USER = 'user',
  SYSTEM = 'system',
}

@Index('IDX_subscription_audit_events_eventType', ['eventType'])
@Index('IDX_subscription_audit_events_planId', ['planId'])
@Index('IDX_subscription_audit_events_subscriptionId', ['subscriptionId'])
@Index('IDX_subscription_audit_events_targetUserId', ['targetUserId'])
@Index('IDX_subscription_audit_events_createdAt', ['createdAt'])
@Entity('subscription_audit_events')
export class SubscriptionAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  eventType!: string;

  @Column({
    type: 'enum',
    enum: SubscriptionAuditActorType,
  })
  actorType!: SubscriptionAuditActorType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  targetUserId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  planId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  subscriptionId!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
