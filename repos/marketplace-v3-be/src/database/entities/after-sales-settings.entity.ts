import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
@Entity('after_sales_settings')
export class AfterSalesSetting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ type: 'int', default: 7 })
  returnWindowDays!: number;
  @Column({ type: 'boolean', default: false })
  allowChangedMind!: boolean;
  @Column({ type: 'boolean', default: false })
  refundLogisticsOnCancellation!: boolean;
  @Column({ type: 'boolean', default: true })
  reverseTransactionFee!: boolean;
  @Column({ type: 'json' })
  nonReturnableProductIds!: string[];
  @CreateDateColumn()
  createdAt!: Date;
  @UpdateDateColumn()
  updatedAt!: Date;
}
