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
import { Payment } from './payment.entity';
import { SubscriptionBillingPeriod } from './subscription-plan-price.entity';
import { SubscriptionPlan } from './subscription-plan.entity';
import { User } from './user.entity';

export enum UserSubscriptionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum UserSubscriptionAction {
  PURCHASE = 'purchase',
  RENEWAL = 'renewal',
  FREE_ASSIGNMENT = 'free_assignment',
}

@Index('IDX_user_subscriptions_user_status', ['userId', 'status'])
@Index('IDX_user_subscriptions_plan_status', ['planId', 'status'])
@Index('IDX_user_subscriptions_paymentId', ['paymentId'])
@Entity('user_subscriptions')
export class UserSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'varchar', length: 36 })
  planId!: string;

  @Column({
    type: 'enum',
    enum: UserSubscriptionStatus,
    default: UserSubscriptionStatus.PENDING,
  })
  status!: UserSubscriptionStatus;

  @Column({
    type: 'enum',
    enum: SubscriptionBillingPeriod,
  })
  billingPeriod!: SubscriptionBillingPeriod;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  pricePaid!: number;

  @Column({ type: 'timestamp', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'boolean', default: false })
  autoRenew!: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  paymentId!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.subscriptions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planId' })
  plan!: SubscriptionPlan;

  @ManyToOne(() => Payment, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'paymentId' })
  payment!: Payment | null;
}
