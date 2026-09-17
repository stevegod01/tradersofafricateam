import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
export type RefundBreakdown = {
  productAmount: string; logisticsAmount: string; otherAmount: string; totalRefundAmount: string;
};
export type RefundFinancialSnapshot = {
  orderCurrency: string; paymentCurrency: string; paymentAmount: string; orderTotal: string; productsSubtotal: string;
  fxApplied: boolean; fxRateSnapshot: number | null; fxSourceCurrency: string | null; fxTargetCurrency: string | null;
  fxSourceAmount: number | null; fxConvertedAmount: number | null; fxQuotedAt: Date | null; fxProvider: string | null;
  transactionFeeAmount: string; transactionFeePercentage: number | null; feeBaseAmount: number | null;
  orderProductRefundAmount: string; reverseTransactionFee: boolean; productPaymentAllocation: string;
  logisticsPaymentAllocation: string; deliveryType: string;
};
@Entity('refunds')
@Index(['refundNumber'], { unique: true })
@Index(['cancellationId'], { unique: true })
@Index(['returnId'], { unique: true })
@Index(['disputeId'], { unique: true })
@Index(['orderId', 'status'], { unique: false })
@Index(['paymentId', 'status'], { unique: false })
@Index(['gateway', 'gatewayRefundReference'], { unique: true })
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ type: 'varchar', length: 40 })
  refundNumber!: string;
  @Column({ type: 'varchar', length: 36 })
  paymentId!: string;
  @Column({ type: 'varchar', length: 36 })
  orderId!: string;
  @Column({ type: 'varchar', length: 36 })
  buyerId!: string;
  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;
  @Column({ type: 'varchar', length: 36 })
  requestedBy!: string;
  @Column({
    type: 'varchar', length: 36, nullable: true
  })
  cancellationId!: string | null;
  @Column({
    type: 'varchar', length: 36, nullable: true
  })
  returnId!: string | null;
  @Column({
    type: 'varchar', length: 36, nullable: true
  })
  disputeId!: string | null;
  @Column({
    type: 'varchar', length: 36, nullable: true
  })
  approvedBy!: string | null;
  @Column({ type: 'varchar', length: 30 })
  sourceType!: string;
  @Column({ type: 'varchar', length: 30 })
  refundType!: string;
  @Column({
    type: 'decimal', precision: 18, scale: 2
  })
  amount!: string;
  @Column({ type: 'varchar', length: 3 })
  currency!: string;
  @Column({
    type: 'varchar', length: 30, default: 'pending'
  })
  status!: string;
  @Column({ type: 'text' })
  reason!: string;
  @Column({ type: 'varchar', length: 80 })
  gateway!: string;
  @Column({
    type: 'varchar', length: 160, nullable: true
  })
  gatewayRefundReference!: string | null;
  @Column({ type: 'timestamp', nullable: true })
  processedAt!: Date | null;
  @Column({ type: 'timestamp', nullable: true })
  completedAt!: Date | null;
  @Column({ type: 'timestamp', nullable: true })
  failedAt!: Date | null;
  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;
  @Column({ type: 'json' })
  breakdown!: RefundBreakdown;
  @Column({ type: 'json' })
  financialSnapshot!: RefundFinancialSnapshot;
  @Column({
    type: 'varchar', length: 20, nullable: true
  })
  processingMode!: string | null;
  @Column({ type: 'int', default: 0 })
  attemptCount!: number;
  @CreateDateColumn()
  createdAt!: Date;
  @UpdateDateColumn()
  updatedAt!: Date;
}
