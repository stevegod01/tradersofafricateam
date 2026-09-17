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
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { MarketRFQ } from './market-rfq.entity';
import { MarketRFQQuoteVersion } from './market-rfq-quote-version.entity';
import { User } from './user.entity';

export enum MarketRFQQuoteStatus {
  ACTIVE = 'active',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  CLOSED = 'closed',
}

@Entity('market_rfq_quotes')
@Unique('UQ_market_rfq_quotes_rfq_seller', ['rfqId', 'sellerId'])
export class MarketRFQQuote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  rfqId!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  currentVersionId!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: MarketRFQQuoteStatus,
    default: MarketRFQQuoteStatus.ACTIVE,
  })
  status!: MarketRFQQuoteStatus;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  rejectedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  closedAt!: Date | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  closedReason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => MarketRFQ, (rfq) => rfq.quotes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rfqId' })
  rfq!: MarketRFQ;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;

  @OneToMany(() => MarketRFQQuoteVersion, (version) => version.quote)
  versions!: MarketRFQQuoteVersion[];
}
