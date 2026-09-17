import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Payment } from './payment.entity';
import { PaymentAttempt } from './payment-attempt.entity';

export enum PaymentProviderType {
  GATEWAY = 'gateway',
  MANUAL = 'manual',
  BANK_RAIL = 'bank_rail',
}

export enum PaymentProviderStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('payment_providers')
export class PaymentProvider {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({
    type: 'enum',
    enum: PaymentProviderType,
  })
  type!: PaymentProviderType;

  @Column({ type: 'json' })
  supportedCurrencies!: string[];

  @Column({ type: 'json', nullable: true })
  supportedCountries!: string[] | null;

  @Column({ type: 'json', nullable: true })
  supportedSourceTypes!: string[] | null;

  @Column({ type: 'json', nullable: true })
  supportedPurposes!: string[] | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  minAmount!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  maxAmount!: number | null;

  @Column({ type: 'boolean', default: false })
  requiresProof!: boolean;

  @Column({ type: 'boolean', default: false })
  supportsAutoVerification!: boolean;

  @Column({
    type: 'enum',
    enum: PaymentProviderStatus,
    default: PaymentProviderStatus.ACTIVE,
  })
  status!: PaymentProviderStatus;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Payment, (payment) => payment.provider)
  payments!: Payment[];

  @OneToMany(() => PaymentAttempt, (attempt) => attempt.provider)
  attempts!: PaymentAttempt[];
}
