import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeliveryType } from './checkout.enums';
import { AddressSnapshot } from './checkout-session.entity';
import { Order } from './order.entity';

export type PickupAddressSnapshot = {
  sellerName: string;
  storeName: string | null;
  phoneNumber: string | null;
  pickupAddress: string | null;
  country: string | null;
};

@Entity('order_deliveries')
export class OrderDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36, unique: true })
  orderId!: string;

  @Column({
    type: 'enum',
    enum: DeliveryType,
  })
  deliveryType!: DeliveryType;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerId!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  providerNameSnapshot!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  serviceNameSnapshot!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  logisticsQuoteId!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  logisticsAmount!: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  logisticsCurrency!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  trackingId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  trackingUrl!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  deliveryContact!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  buyerLogisticsContactName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  buyerLogisticsEmail!: string | null;

  @Column({ type: 'date', nullable: true })
  expectedPickupDate!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  handoverTo!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  handoverReference!: string | null;

  @Column({ type: 'json' })
  pickupAddressSnapshot!: PickupAddressSnapshot;

  @Column({ type: 'json' })
  deliveryAddressSnapshot!: AddressSnapshot;

  @Column({ type: 'json', nullable: true })
  estimatedDelivery!: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true })
  shippedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  sellerDeliveryNotes!: string | null;

  @Column({ type: 'text', nullable: true })
  buyerLogisticsNotes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToOne(() => Order, (order) => order.delivery, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;
}
