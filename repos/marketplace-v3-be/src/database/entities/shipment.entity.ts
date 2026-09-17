import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LogisticsAddressSnapshot } from './logistics-quote.entity';
import { LogisticsProvider } from './logistics-provider.entity';
import { Order } from './order.entity';
import { ShipmentStatusHistory } from './shipment-status-history.entity';
import { ShipmentStatus } from './shipment.enums';
export { ShipmentStatus } from './shipment.enums';

@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 60, unique: true })
  shipmentReference!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  orderId!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  providerId!: string;

  @Column({ type: 'varchar', length: 160 })
  providerNameSnapshot!: string;

  @Column({ type: 'varchar', length: 160 })
  serviceNameSnapshot!: string;

  @Index()
  @Column({ type: 'varchar', length: 160, nullable: true })
  externalShipmentId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 160, nullable: true })
  trackingId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  trackingUrl!: string | null;

  @Column({ type: 'json' })
  pickupAddressSnapshot!: LogisticsAddressSnapshot;

  @Column({ type: 'json' })
  deliveryAddressSnapshot!: LogisticsAddressSnapshot;

  @Index()
  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    default: ShipmentStatus.PENDING,
  })
  status!: ShipmentStatus;

  @Column({ type: 'timestamp', nullable: true })
  estimatedPickupAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  pickedUpAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  estimatedDeliveryAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @ManyToOne(() => LogisticsProvider, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'providerId' })
  provider!: LogisticsProvider;

  @OneToMany(() => ShipmentStatusHistory, (history) => history.shipment)
  statusHistory!: ShipmentStatusHistory[];
}
