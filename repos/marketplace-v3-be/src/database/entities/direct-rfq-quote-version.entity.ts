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
import { DirectRFQQuote } from './direct-rfq-quote.entity';

export enum DirectRFQActorType {
  BUYER = 'buyer',
  SELLER = 'seller',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

@Index('IDX_direct_rfq_quote_versions_quote_version', ['quoteId', 'version'], { unique: true })
@Entity('direct_rfq_quote_versions')
export class DirectRFQQuoteVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  quoteId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({
    type: 'enum',
    enum: DirectRFQActorType,
  })
  createdByType!: DirectRFQActorType;

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

  @Column({ type: 'timestamp' })
  validUntil!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => DirectRFQQuote, (quote) => quote.versions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'quoteId' })
  quote!: DirectRFQQuote;
}
