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
import { B2BLogisticsRequest } from './b2b-logistics-request.entity';
import { LogisticsProvider } from './logistics-provider.entity';

export enum B2BLogisticsQuoteStatus {
  ACTIVE = 'active',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Entity('b2b_logistics_quotes')
export class B2BLogisticsQuote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  requestId!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  providerId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'int' })
  estimatedTransitMin!: number;

  @Column({ type: 'int' })
  estimatedTransitMax!: number;

  @Column({ type: 'varchar', length: 40 })
  estimatedTransitUnit!: string;

  @Column({ type: 'timestamp' })
  validUntil!: Date;

  @Index()
  @Column({
    type: 'enum',
    enum: B2BLogisticsQuoteStatus,
    default: B2BLogisticsQuoteStatus.ACTIVE,
  })
  status!: B2BLogisticsQuoteStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => B2BLogisticsRequest, (request) => request.quotes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'requestId' })
  request!: B2BLogisticsRequest;

  @ManyToOne(() => LogisticsProvider, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'providerId' })
  provider!: LogisticsProvider;
}
