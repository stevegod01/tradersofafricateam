import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { MarketRFQ } from './market-rfq.entity';
import { User } from './user.entity';

@Entity('market_rfq_seller_views')
@Unique('UQ_market_rfq_seller_views_rfq_seller', ['rfqId', 'sellerId'])
export class MarketRFQSellerView {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  rfqId!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'timestamp' })
  firstViewedAt!: Date;

  @Column({ type: 'timestamp' })
  lastViewedAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => MarketRFQ, (rfq) => rfq.sellerViews, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'rfqId' })
  rfq!: MarketRFQ;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;
}
