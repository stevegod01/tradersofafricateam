import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
@Entity('financial_adjustments')
@Index(['refundId', 'adjustmentType'], { unique: true })
export class FinancialAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ type: 'varchar', length: 36 })
  orderId!: string;
  @Column({ type: 'varchar', length: 36 })
  paymentId!: string;
  @Column({ type: 'varchar', length: 36 })
  refundId!: string;
  @Column({ type: 'varchar', length: 40 })
  adjustmentType!: string;
  @Column({
    type: 'decimal', precision: 18, scale: 2
  })
  amount!: string;
  @Column({ type: 'varchar', length: 3 })
  currency!: string;
  @Column({ type: 'varchar', length: 10 })
  direction!: string;
  @Column({ type: 'text' })
  reason!: string;
  @CreateDateColumn()
  createdAt!: Date;
  @UpdateDateColumn()
  updatedAt!: Date;
}
