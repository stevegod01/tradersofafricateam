import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Product } from './product.entity';
import { ReviewEligibility } from './review-eligibility.entity';
import { User } from './user.entity';

export enum ReviewStatus {
  PUBLISHED = 'published',
  PENDING_MODERATION = 'pending_moderation',
  HIDDEN = 'hidden',
  REJECTED = 'rejected',
  DELETED = 'deleted',
}

@Index('UQ_product_reviews_eligibility', ['eligibilityId'], { unique: true })
@Index('IDX_product_reviews_product_status', ['productId', 'status'])
@Index('IDX_product_reviews_buyer_status', ['buyerId', 'status'])
@Index('IDX_product_reviews_seller_status', ['sellerId', 'status'])
@Entity('product_reviews')
export class ProductReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  eligibilityId!: string;

  @Column({ type: 'varchar', length: 36 })
  orderId!: string;

  @Column({ type: 'varchar', length: 36 })
  orderItemId!: string;

  @Column({ type: 'varchar', length: 36 })
  buyerId!: string;

  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'varchar', length: 36 })
  productId!: string;

  @Column({ type: 'int' })
  rating!: number;

  @Column({ type: 'varchar', length: 160, nullable: true })
  title!: string | null;

  @Column({ type: 'text' })
  comment!: string;

  @Column({ type: 'json' })
  images!: string[];

  @Column({
    type: 'enum',
    enum: ReviewStatus,
    default: ReviewStatus.PUBLISHED,
  })
  status!: ReviewStatus;

  @Column({ type: 'boolean', default: true })
  isVerifiedPurchase!: boolean;

  @Column({ type: 'int', default: 0 })
  pointsAwarded!: number;

  @Column({ type: 'int', default: 0 })
  helpfulCount!: number;

  @Column({ type: 'int', default: 0 })
  notHelpfulCount!: number;

  @Column({ type: 'text', nullable: true })
  moderationReason!: string | null;

  @Column({ type: 'json', nullable: true })
  moderationFlags!: string[] | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToOne(() => ReviewEligibility, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'eligibilityId' })
  eligibility!: ReviewEligibility;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @ManyToOne(() => OrderItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderItemId' })
  orderItem!: OrderItem;

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
