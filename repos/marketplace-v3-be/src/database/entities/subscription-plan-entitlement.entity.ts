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

@Index('UQ_subscription_plan_entitlements_plan_code', ['planId', 'entitlementCode'], {
  unique: true,
})
@Index('IDX_subscription_plan_entitlements_code', ['entitlementCode'])
@Entity('subscription_plan_entitlements')
export class SubscriptionPlanEntitlement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  planId!: string;

  @Column({ type: 'varchar', length: 120 })
  entitlementCode!: string;

  @Column({ type: 'json' })
  value!: unknown;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.entitlements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planId' })
  plan!: SubscriptionPlan;
}
