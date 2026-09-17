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
import { FeaturedPromotionStatus } from './featured-product.entity';
import { User } from './user.entity';

@Index('IDX_featured_stores_seller_status', ['sellerId', 'status'])
@Entity('featured_stores')
export class FeaturedStore {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;
}
