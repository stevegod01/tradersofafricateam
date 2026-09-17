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
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Product } from './product.entity';
import { User } from './user.entity';

export enum ReviewType {
  PRODUCT = 'product',
  SELLER = 'seller',
}

export enum ReviewEligibilityStatus {
  ELIGIBLE = 'eligible',
  SUBMITTED = 'submitted',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

@Index('UQ_review_eligibilities_key', ['eligibilityKey'], { unique: true })
@Index('IDX_review_eligibilities_buyer_status', ['buyerId', 'status'])
@Index('IDX_review_eligibilities_order_type', ['orderId', 'reviewType'])
@Entity('review_eligibilities')
export class ReviewEligibility {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 160 })
  eligibilityKey!: string;

  @Column({ type: 'varchar', length: 36 })
  orderId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  orderItemId!: string | null;

  @Column({ type: 'varchar', length: 36 })
  buyerId!: string;

  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  productId!: string | null;

  @Column({
    type: 'enum',
    enum: ReviewType,
  })
  reviewType!: ReviewType;

  @Column({
    type: 'enum',
    enum: ReviewEligibilityStatus,
    default: ReviewEligibilityStatus.ELIGIBLE,
  })
  status!: ReviewEligibilityStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewId!: string | null;

  @Column({ type: 'timestamp' })
  eligibleAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @ManyToOne(() => OrderItem, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderItemId' })
  orderItem!: OrderItem | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'buyerId' })
  buyer!: User;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;

  @ManyToOne(() => Product, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'productId' })
  product!: Product | null;
}
