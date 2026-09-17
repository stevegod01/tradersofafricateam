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
import { User } from './user.entity';

export enum PointsTransactionType {
  EARNED = 'earned',
  REDEEMED = 'redeemed',
  ADJUSTED = 'adjusted',
  EXPIRED = 'expired',
  REVERSED = 'reversed',
}

export enum PointsSourceType {
  PRODUCT_REVIEW = 'product_review',
  SELLER_REVIEW = 'seller_review',
  ADMIN_ADJUSTMENT = 'admin_adjustment',
  REFERRAL = 'referral',
  ORDER = 'order',
}

@Index('UQ_points_transactions_source_reward', ['sourceType', 'sourceId', 'rewardType'], {
  unique: true,
})
@Index('IDX_points_transactions_user_type', ['userId', 'type'])
@Index('IDX_points_transactions_source', ['sourceType', 'sourceId'])
@Entity('reward_transactions')
export class PointsTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({
    type: 'enum',
    enum: PointsTransactionType,
  })
  type!: PointsTransactionType;

  @Column({ type: 'int' })
  points!: number;

  @Column({
    type: 'enum',
    enum: PointsSourceType,
  })
  sourceType!: PointsSourceType;

  @Column({ type: 'varchar', length: 36 })
  sourceId!: string;

  @Column({ type: 'varchar', length: 80 })
  rewardType!: string;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({ type: 'int' })
  balanceAfter!: number;

  @Column({type:'varchar',length:80}) eventCode!: string;
  @Column({type:'varchar',length:6}) transactionType!: 'credit'|'debit';
  @Column({type:'int'}) balanceBefore!: number;
  @Index({unique:true}) @Column({type:'varchar',length:191}) idempotencyKey!: string;
  @Column({type:'varchar',length:36,nullable:true}) createdBy!: string|null;

  @Column({type:'varchar',length:36,nullable:true}) orderId!: string|null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
