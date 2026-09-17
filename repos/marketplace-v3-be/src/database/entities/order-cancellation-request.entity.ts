import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { OrderActorType } from './order-actor-type';

export enum OrderCancellationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
}

@Entity('order_cancellation_requests')
export class OrderCancellationRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  cancellationNumber!: string;

  @Column({ type: 'boolean', default: false })
  refundRequired!: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  refundId!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt!: Date | null;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  orderId!: string;

  @Column({
    type: 'enum',
    enum: OrderActorType,
  })
  requestedByType!: OrderActorType;

  @Column({ type: 'varchar', length: 36 })
  requestedById!: string;

  @Column({ type: 'varchar', length: 500 })
  reason!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({
    type: 'enum',
    enum: OrderCancellationStatus,
    default: OrderCancellationStatus.PENDING,
  })
  status!: OrderCancellationStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewedBy!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewNotes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Order, (order) => order.cancellationRequests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order!: Order;
}
