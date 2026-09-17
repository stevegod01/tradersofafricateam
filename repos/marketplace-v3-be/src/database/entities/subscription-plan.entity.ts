import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Admin } from './admin.entity';
import { TranslationMap } from './category.entity';
import { SubscriptionPlanPrice } from './subscription-plan-price.entity';
import { SubscriptionPlanEntitlement } from './subscription-plan-entitlement.entity';
import { UserSubscription } from './user-subscription.entity';

export enum SubscriptionPlanAudience {
  SELLER = 'seller',
  BUYER = 'buyer',
  ALL = 'all',
}

export enum SubscriptionPlanStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
}

@Index('IDX_subscription_plans_status_audience', ['status', 'audience'])
@Index('IDX_subscription_plans_default', ['audience', 'isDefault'])
@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name_i18n', type: 'json' })
  name!: TranslationMap;

  @Column({ name: 'description_i18n', type: 'json', nullable: true })
  description!: TranslationMap | null;

  @Column({ type: 'varchar', length: 20, default: 'en' })
  sourceLanguage!: string;

  @Column({
    type: 'enum',
    enum: SubscriptionPlanAudience,
    default: SubscriptionPlanAudience.SELLER,
  })
  audience!: SubscriptionPlanAudience;

  @Column({
    type: 'enum',
    enum: SubscriptionPlanStatus,
    default: SubscriptionPlanStatus.DRAFT,
  })
  status!: SubscriptionPlanStatus;

  @Column({ type: 'boolean', default: false })
  isFree!: boolean;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Admin, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'createdBy' })
  creator!: Admin | null;

  @OneToMany(() => SubscriptionPlanPrice, (price) => price.plan)
  prices!: SubscriptionPlanPrice[];

  @OneToMany(() => SubscriptionPlanEntitlement, (entitlement) => entitlement.plan)
  entitlements!: SubscriptionPlanEntitlement[];

  @OneToMany(() => UserSubscription, (subscription) => subscription.plan)
  subscriptions!: UserSubscription[];
}
