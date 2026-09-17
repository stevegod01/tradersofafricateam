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
import { Product } from './product.entity';
import { User } from './user.entity';

export enum FeaturedPromotionStatus {
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Index('IDX_featured_products_seller_status', ['sellerId', 'status'])
@Index('IDX_featured_products_product_status', ['productId', 'status'])
@Entity('featured_products')
export class FeaturedProduct {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  productId!: string;

  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({
    type: 'enum',
    enum: FeaturedPromotionStatus,
    default: FeaturedPromotionStatus.ACTIVE,
  })
  status!: FeaturedPromotionStatus;

  @Column({ type: 'timestamp' })
  startAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  endAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;
}
