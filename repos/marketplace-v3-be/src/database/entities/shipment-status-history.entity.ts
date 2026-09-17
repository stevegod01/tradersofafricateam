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
import { ShipmentStatus } from './shipment.enums';
import { Shipment } from './shipment.entity';

@Entity('shipment_status_histories')
export class ShipmentStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  shipmentId!: string;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    nullable: true,
  })
  fromStatus!: ShipmentStatus | null;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
  })
  toStatus!: ShipmentStatus;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 160, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  location!: string | null;

  @Column({ type: 'json', nullable: true })
  rawPayload!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Shipment, (shipment) => shipment.statusHistory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'shipmentId' })
  shipment!: Shipment;
}
