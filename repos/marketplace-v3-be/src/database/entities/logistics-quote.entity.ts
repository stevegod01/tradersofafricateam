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
import { LogisticsProvider } from './logistics-provider.entity';
import { User } from './user.entity';

export enum LogisticsQuoteStatus {
  ACTIVE = 'active',
  SELECTED = 'selected',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum LogisticsQuoteSourceType {
  CART = 'cart',
  DIRECT_RFQ = 'direct_rfq',
  MARKET_RFQ = 'market_rfq',
  B2B_LOGISTICS = 'b2b_logistics',
  OTHER = 'other',
}

export type LogisticsAddressSnapshot = Record<string, unknown>;

@Index('IDX_logistics_quotes_source', ['sourceType', 'sourceId'])
@Entity('logistics_quotes')
export class LogisticsQuote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  providerId!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  buyerId!: string;

  @Column({
    type: 'enum',
    enum: LogisticsQuoteSourceType,
  })
  sourceType!: LogisticsQuoteSourceType;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sourceId!: string | null;

  @Column({ type: 'json' })
  pickupAddressSnapshot!: LogisticsAddressSnapshot;

  @Column({ type: 'json' })
  deliveryAddressSnapshot!: LogisticsAddressSnapshot;

  @Column({ type: 'json', nullable: true })
  itemsSnapshot!: Record<string, unknown>[] | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 160 })
  serviceName!: string;

  @Column({ type: 'int' })
  estimatedDeliveryMin!: number;

  @Column({ type: 'int' })
  estimatedDeliveryMax!: number;

  @Column({ type: 'varchar', length: 40 })
  estimatedDeliveryUnit!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  providerQuoteReference!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: LogisticsQuoteStatus,
    default: LogisticsQuoteStatus.ACTIVE,
  })
  status!: LogisticsQuoteStatus;

  @Index()
  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => LogisticsProvider, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'providerId' })
  provider!: LogisticsProvider;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer!: User;
}
