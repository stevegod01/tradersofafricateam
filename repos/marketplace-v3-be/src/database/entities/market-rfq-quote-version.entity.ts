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
import { DeliveryType } from './checkout.enums';
import { MarketRFQQuote } from './market-rfq-quote.entity';

export enum MarketRFQActorType {
  BUYER = 'buyer',
  SELLER = 'seller',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

@Index('IDX_market_rfq_quote_versions_quote_version', ['quoteId', 'version'], {
  unique: true,
})
@Entity('market_rfq_quote_versions')
export class MarketRFQQuoteVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  quoteId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({
    type: 'enum',
    enum: MarketRFQActorType,
  })
  createdByType!: MarketRFQActorType;

  @Column({ type: 'varchar', length: 36 })
  createdById!: string;

  @Column({ type: 'decimal', precision: 18, scale: 3 })
  quantity!: number;

  @Column({ type: 'varchar', length: 40 })
  unit!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  pricePerUnit!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  productsTotal!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({
    type: 'enum',
    enum: DeliveryType,
  })
  deliveryType!: DeliveryType;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  logisticsAmount!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  quoteTotal!: number;

  @Column({ type: 'date', nullable: true })
  estimatedDeliveryDate!: string | null;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Index()
  @Column({ type: 'timestamp' })
  validUntil!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => MarketRFQQuote, (quote) => quote.versions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'quoteId' })
  quote!: MarketRFQQuote;
}
