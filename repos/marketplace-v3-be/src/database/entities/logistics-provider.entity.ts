import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum LogisticsProviderType {
  DOMESTIC = 'domestic',
  INTERNATIONAL = 'international',
  FREIGHT = 'freight',
  AGGREGATOR = 'aggregator',
}

export enum LogisticsProviderStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('logistics_providers')
export class LogisticsProvider {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logo!: string | null;

  @Column({
    type: 'enum',
    enum: LogisticsProviderType,
  })
  type!: LogisticsProviderType;

  @Column({ type: 'json' })
  supportedCountries!: string[];

  @Column({ type: 'json' })
  supportedCurrencies!: string[];

  @Column({ type: 'boolean', default: true })
  supportsDomestic!: boolean;

  @Column({ type: 'boolean', default: false })
  supportsInternational!: boolean;

  @Column({ type: 'boolean', default: true })
  supportsTracking!: boolean;

  @Column({ type: 'boolean', default: false })
  supportsWebhook!: boolean;

  @Column({ type: 'boolean', default: false })
  supportsCancellation!: boolean;

  @Index()
  @Column({
    type: 'enum',
    enum: LogisticsProviderStatus,
    default: LogisticsProviderStatus.ACTIVE,
  })
  status!: LogisticsProviderStatus;

  @Index()
  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
