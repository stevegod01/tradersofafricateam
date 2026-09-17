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
import { ReviewEligibility } from './review-eligibility.entity';
import { ReviewStatus } from './product-review.entity';
import { User } from './user.entity';

@Index('UQ_seller_reviews_eligibility', ['eligibilityId'], { unique: true })
@Index('IDX_seller_reviews_seller_status', ['sellerId', 'status'])
@Index('IDX_seller_reviews_buyer_status', ['buyerId', 'status'])
@Entity('seller_reviews')
export class SellerReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  eligibilityId!: string;

  @Column({ type: 'varchar', length: 36 })
  orderId!: string;

  @Column({ type: 'varchar', length: 36 })
  buyerId!: string;

  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'int' })
  overallRating!: number;

  @Column({ type: 'int', nullable: true })
  communicationRating!: number | null;

  @Column({ type: 'int', nullable: true })
  fulfillmentRating!: number | null;

  @Column({ type: 'int', nullable: true })
  reliabilityRating!: number | null;

  @Column({ type: 'text' })
  comment!: string;

  @Column({
    type: 'enum',
    enum: ReviewStatus,
    default: ReviewStatus.PUBLISHED,
  })
  status!: ReviewStatus;

  @Column({ type: 'boolean', default: true })
  isVerifiedTransaction!: boolean;

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

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'buyerId' })
  buyer!: User;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;
}
