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
} from 'typeorm';
import { MarketRFQ } from './market-rfq.entity';
import { User } from './user.entity';

@Entity('market_rfq_seller_visibilities')
@Unique('UQ_market_rfq_visibility_rfq_seller', ['rfqId', 'sellerId'])
export class MarketRFQSellerVisibility {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  rfqId!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'json', nullable: true })
  matchedCategoryIds!: string[] | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  eligibilityReason!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  notifiedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => MarketRFQ, (rfq) => rfq.sellerVisibilities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'rfqId' })
  rfq!: MarketRFQ;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;
}
