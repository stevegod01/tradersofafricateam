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
import { OrderStatus } from './order.enums';
import { Order } from './order.entity';

export { OrderActorType } from './order-actor-type';
import { OrderActorType } from './order-actor-type';

@Entity('order_status_histories')
export class OrderStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  orderId!: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    nullable: true,
  })
  fromStatus!: OrderStatus | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
  })
  toStatus!: OrderStatus;

  @Column({
    type: 'enum',
    enum: OrderActorType,
  })
  changedByType!: OrderActorType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  changedById!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Order, (order) => order.statusHistory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order!: Order;
}
