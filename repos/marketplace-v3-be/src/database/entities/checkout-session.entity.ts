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
import { User } from './user.entity';
import { CheckoutSellerGroup } from './checkout-seller-group.entity';
export { DeliveryType } from './checkout.enums';

export enum CheckoutSourceType {
  CART = 'cart',
  DIRECT_RFQ = 'direct_rfq',
  MARKET_RFQ = 'market_rfq',
}

export enum CheckoutStatus {
  ACTIVE = 'active',
  CONVERTED = 'converted',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export type AddressSnapshot = {
  recipientName: string;
  phoneNumber: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  country: string;
  postalCode: string | null;
};

@Entity('checkout_sessions')
export class CheckoutSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({
    type: 'enum',
    enum: CheckoutSourceType,
    default: CheckoutSourceType.CART,
  })
  sourceType!: CheckoutSourceType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sourceId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  quoteId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  quoteVersionId!: string | null;

  @Column({ type: 'varchar', length: 36 })
  deliveryAddressId!: string;

  @Column({ type: 'json' })
  deliveryAddressSnapshot!: AddressSnapshot;

  @Column({ type: 'varchar', length: 60 })
  paymentMethod!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  productsTotal!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  logisticsTotal!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  totalAmount!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({
    type: 'enum',
    enum: CheckoutStatus,
    default: CheckoutStatus.ACTIVE,
  })
  status!: CheckoutStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @OneToMany(() => CheckoutSellerGroup, (group) => group.checkout)
  sellerGroups!: CheckoutSellerGroup[];
}
