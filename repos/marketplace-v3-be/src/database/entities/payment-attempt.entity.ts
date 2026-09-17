import 'reflect-metadata';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Payment } from './payment.entity';
import { PaymentProvider } from './payment-provider.entity';

@Entity('payment_attempts')
export class PaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  paymentId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  providerId!: string | null;

  @Column({ type: 'varchar', length: 80 })
  paymentMethod!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  providerReference!: string | null;

  @Column({ type: 'varchar', length: 80 })
  status!: string;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ type: 'timestamp' })
  initiatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @ManyToOne(() => Payment, (payment) => payment.attempts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'paymentId' })
  payment!: Payment;

  @ManyToOne(() => PaymentProvider, (provider) => provider.attempts, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'providerId' })
  provider!: PaymentProvider | null;
}
