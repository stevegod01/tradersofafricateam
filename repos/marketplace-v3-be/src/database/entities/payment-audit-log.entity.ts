import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Index('IDX_payment_audit_logs_payment_action', ['paymentId', 'action'])
@Index('UQ_payment_audit_logs_idempotencyKey', ['idempotencyKey'], {
  unique: true,
})
@Entity('payment_audit_logs')
export class PaymentAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  action!: string;

  @Column({ type: 'varchar', length: 36 })
  paymentId!: string;

  @Column({ type: 'varchar', length: 80 })
  sourceType!: string;

  @Column({ type: 'varchar', length: 80 })
  sourceId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  payerId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  adminId!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
