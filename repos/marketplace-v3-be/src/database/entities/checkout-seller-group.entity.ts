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
import { DeliveryType } from './checkout.enums';
import { CheckoutSession } from './checkout-session.entity';
import { User } from './user.entity';

export type CheckoutItemSnapshot = {
  productId: string;
  variantId: string | null;
  productNameSnapshot: string | null;
  productImageSnapshot: string | null;
  skuSnapshot: string | null;
  attributesSnapshot: Record<string, unknown> | null;
  unitPrice: number;
  discount: number | null;
  finalUnitPrice: number;
  quantity: number;
  unit: string | null;
  subtotal: number;
  currency: string;
};

export type CheckoutDeliverySnapshot = {
  type: DeliveryType;
  providerId?: string | null;
  providerName?: string | null;
  serviceName?: string | null;
  quoteId?: string | null;
  amount?: number | null;
  currency?: string | null;
  estimatedDelivery?: Record<string, unknown> | null;
};

@Entity('checkout_seller_groups')
export class CheckoutSellerGroup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  checkoutId!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  productsSubtotal!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  logisticsAmount!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  sellerTotal!: number;

  @Column({
    type: 'enum',
    enum: DeliveryType,
  })
  deliveryType!: DeliveryType;

  @Column({ type: 'varchar', length: 120, nullable: true })
  logisticsQuoteId!: string | null;

  @Column({ type: 'json', nullable: true })
  itemsSnapshot!: CheckoutItemSnapshot[] | null;

  @Column({ type: 'json', nullable: true })
  deliverySnapshot!: CheckoutDeliverySnapshot | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => CheckoutSession, (checkout) => checkout.sellerGroups, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'checkoutId' })
  checkout!: CheckoutSession;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;
}
