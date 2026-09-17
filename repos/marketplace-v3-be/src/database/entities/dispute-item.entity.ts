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
import { Dispute } from './dispute.entity';
import { OrderItem } from './order-item.entity';

@Index('UQ_dispute_items_dispute_order_item', ['disputeId', 'orderItemId'], {
  unique: true,
})
@Index('IDX_dispute_items_order_item', ['orderItemId'])
@Entity('dispute_items')
export class DisputeItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  disputeId!: string;

  @Column({ type: 'varchar', length: 36 })
  orderItemId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 3 })
  quantityAffected!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Dispute, (dispute) => dispute.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'disputeId' })
  dispute!: Dispute;

  @ManyToOne(() => OrderItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderItemId' })
  orderItem!: OrderItem;
}
