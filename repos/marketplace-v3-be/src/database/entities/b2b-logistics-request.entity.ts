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
import { B2BLogisticsQuote } from './b2b-logistics-quote.entity';
import { User } from './user.entity';

export enum B2BLogisticsRequestStatus {
  PENDING = 'pending',
  QUOTED = 'quoted',
  ACCEPTED = 'accepted',
  CANCELLED = 'cancelled',
}

@Entity('b2b_logistics_requests')
export class B2BLogisticsRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  requesterId!: string;

  @Column({ type: 'varchar', length: 80 })
  sourceType!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sourceId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  cargoType!: string;

  @Column({ type: 'decimal', precision: 18, scale: 3 })
  quantity!: number;

  @Column({ type: 'varchar', length: 40 })
  unit!: string;

  @Column({ type: 'decimal', precision: 18, scale: 3, nullable: true })
  weight!: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  weightUnit!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 3, nullable: true })
  volume!: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  volumeUnit!: string | null;

  @Column({ type: 'json' })
  pickupAddressSnapshot!: LogisticsAddressSnapshot;

  @Column({ type: 'json' })
  deliveryAddressSnapshot!: LogisticsAddressSnapshot;

  @Column({ type: 'text', nullable: true })
  specialInstructions!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: B2BLogisticsRequestStatus,
    default: B2BLogisticsRequestStatus.PENDING,
  })
  status!: B2BLogisticsRequestStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requesterId' })
  requester!: User;

  @OneToMany(() => B2BLogisticsQuote, (quote) => quote.request)
  quotes!: B2BLogisticsQuote[];
}
