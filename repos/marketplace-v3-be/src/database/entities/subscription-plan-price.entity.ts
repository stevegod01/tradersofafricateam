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
import { SubscriptionPlan } from './subscription-plan.entity';

export enum SubscriptionBillingPeriod {
  FREE = 'free',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

export enum SubscriptionPriceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Index('UQ_subscription_plan_prices_plan_currency_period', ['planId', 'currency', 'billingPeriod'], {
  unique: true,
})
@Index('IDX_subscription_plan_prices_status', ['status'])
@Entity('subscription_plan_prices')
export class SubscriptionPlanPrice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  planId!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: number;

  @Column({
    type: 'enum',
    enum: SubscriptionBillingPeriod,
  })
  billingPeriod!: SubscriptionBillingPeriod;

  @Column({
    type: 'enum',
    enum: SubscriptionPriceStatus,
    default: SubscriptionPriceStatus.ACTIVE,
  })
  status!: SubscriptionPriceStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planId' })
  plan!: SubscriptionPlan;
}
