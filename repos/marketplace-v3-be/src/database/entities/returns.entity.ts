import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
@Entity('returns')
@Index(['returnNumber'], { unique: true })
@Index(['orderId', 'status'], { unique: false })
@Index(['buyerId', 'status'], { unique: false })
@Index(['sellerId', 'status'], { unique: false })
export class ReturnRequest {
  @Column({ type: 'boolean', default: true })
  refundRequired!: boolean;
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ type: 'varchar', length: 40 })
  returnNumber!: string;
  @Column({ type: 'varchar', length: 36 })
  orderId!: string;
  @Column({ type: 'varchar', length: 36 })
  buyerId!: string;
  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;
  @Column({ type: 'varchar', length: 160 })
  reason!: string;
  @Column({ type: 'text' })
  description!: string;
  @Column({
    type: 'varchar', length: 30, default: 'requested'
  })
  status!: string;
  @Column({
    type: 'varchar', length: 160, nullable: true
  })
  returnMethod!: string | null;
  @Column({
    type: 'varchar', length: 160, nullable: true
  })
  returnProviderName!: string | null;
  @Column({
    type: 'varchar', length: 160, nullable: true
  })
  returnTrackingId!: string | null;
  @Column({
    type: 'varchar', length: 160, nullable: true
  })
  deliveryContact!: string | null;
  @Column({
    type: 'varchar', length: 1000, nullable: true
  })
  returnTrackingUrl!: string | null;
  @Column({ type: 'text', nullable: true })
  shipmentNotes!: string | null;
  @Column({ type: 'text', nullable: true })
  responseNotes!: string | null;
  @Column({
    type: 'varchar', length: 36, nullable: true
  })
  approvedBy!: string | null;
  @Column({
    type: 'varchar', length: 36, nullable: true
  })
  refundId!: string | null;
  @Column({ type: 'timestamp', nullable: true })
  approvedAt!: Date | null;
  @Column({ type: 'timestamp', nullable: true })
  receivedAt!: Date | null;
  @Column({ type: 'json' })
  policySnapshot!: { returnWindowDays: number; allowChangedMind: boolean; reverseTransactionFee: boolean };
  @CreateDateColumn()
  createdAt!: Date;
  @UpdateDateColumn()
  updatedAt!: Date;
}
