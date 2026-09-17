import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AddressSnapshot,
  CheckoutSession,
} from './checkout-session.entity';
import { DeliveryType } from './checkout.enums';
import { Payment } from './payment.entity';
import { User } from './user.entity';
import { OrderCancellationRequest } from './order-cancellation-request.entity';
import { OrderDelivery } from './order-delivery.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatusHistory } from './order-status-history.entity';
import { SubscriptionPlan } from './subscription-plan.entity';
import { UserSubscription } from './user-subscription.entity';
import { OrderSourceType, OrderStatus } from './order.enums';
export { OrderSourceType, OrderStatus } from './order.enums';

@Index('IDX_orders_payment_seller', ['paymentId', 'sellerId'], { unique: true })
@Index('IDX_orders_buyer_status', ['buyerId', 'status'])
@Index('IDX_orders_seller_status', ['sellerId', 'status'])
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  orderReference!: string;

  @Column({ type: 'varchar', length: 36 })
  paymentId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  checkoutId!: string | null;

  @Column({ type: 'varchar', length: 36 })
  buyerId!: string;

  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({
    type: 'enum',
    enum: OrderSourceType,
    default: OrderSourceType.CART,
  })
  sourceType!: OrderSourceType;

  @Column({ type: 'varchar', length: 80, nullable: true })
  sourceId!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  quoteId!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  quoteVersionId!: string | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PAID,
  })
  status!: OrderStatus;

  @Column({ type: 'varchar', length: 3 })
  orderCurrency!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  productsSubtotal!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  logisticsAmount!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  orderTotal!: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  subscriptionId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  subscriptionPlanId!: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  transactionFeePercentage!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  feeBaseAmount!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  transactionFeeAmount!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  sellerNetProductAmount!: number | null;

  @Column({ type: 'varchar', length: 3 })
  paymentCurrency!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  paymentAmount!: number;

  @Column({ type: 'boolean', default: false })
  fxApplied!: boolean;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  fxRateSnapshot!: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  fxSourceCurrency!: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  fxTargetCurrency!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  fxSourceAmount!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  fxConvertedAmount!: number | null;

  @Column({ type: 'timestamp', nullable: true })
  fxQuotedAt!: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  fxProvider!: string | null;

  @Column({
    type: 'enum',
    enum: DeliveryType,
  })
  deliveryType!: DeliveryType;

  @Column({ type: 'json' })
  deliveryAddressSnapshot!: AddressSnapshot;

  @Column({ type: 'text', nullable: true })
  buyerNotes!: string | null;

  @Column({ type: 'text', nullable: true })
  sellerBuyerNote!: string | null;

  @Column({ type: 'text', nullable: true })
  sellerInternalNote!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Payment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentId' })
  payment!: Payment;

  @ManyToOne(() => CheckoutSession, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'checkoutId' })
  checkout!: CheckoutSession | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer!: User;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;

  @ManyToOne(() => UserSubscription, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'subscriptionId' })
  subscription!: UserSubscription | null;

  @ManyToOne(() => SubscriptionPlan, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'subscriptionPlanId' })
  subscriptionPlan!: SubscriptionPlan | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items!: OrderItem[];

  @OneToOne(() => OrderDelivery, (delivery) => delivery.order)
  delivery!: OrderDelivery | null;

  @OneToMany(() => OrderStatusHistory, (history) => history.order)
  statusHistory!: OrderStatusHistory[];

  @OneToMany(() => OrderCancellationRequest, (request) => request.order)
  cancellationRequests!: OrderCancellationRequest[];
}
