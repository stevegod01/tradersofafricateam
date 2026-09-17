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
import { DeliveryType } from './checkout.enums';
import { AddressSnapshot } from './checkout-session.entity';
import { TranslationMap } from './category.entity';
import { DirectRFQQuote } from './direct-rfq-quote.entity';
import { Product } from './product.entity';
import { ProductVariant } from './product-variant.entity';
import { User } from './user.entity';

export enum DirectRFQStatus {
  OPEN = 'open',
  VIEWED = 'viewed',
  QUOTED = 'quoted',
  NEGOTIATING = 'negotiating',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export type DirectRFQProductSnapshot = {
  productId: string;
  productName: string | null;
  productImage: string | null;
  sellerId: string;
  sellerStoreName: string | null;
  variant: {
    variantId: string;
    sku: string | null;
    attributes: Record<string, unknown> | null;
  } | null;
};

@Index('IDX_direct_rfqs_buyer_status', ['buyerId', 'status'])
@Index('IDX_direct_rfqs_seller_status', ['sellerId', 'status'])
@Entity('direct_rfqs')
export class DirectRFQ {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  rfqReference!: string;

  @Column({ type: 'varchar', length: 36 })
  buyerId!: string;

  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'varchar', length: 36 })
  productId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  variantId!: string | null;

  @Column({
    type: 'enum',
    enum: DirectRFQStatus,
    default: DirectRFQStatus.OPEN,
  })
  status!: DirectRFQStatus;

  @Column({ type: 'decimal', precision: 18, scale: 3 })
  quantity!: number;

  @Column({ type: 'varchar', length: 40 })
  unit!: string;

  @Column({ name: 'description_i18n', type: 'json' })
  description!: TranslationMap;

  @Column({ type: 'varchar', length: 20, default: 'en' })
  sourceLanguage!: string;

  @Column({ type: 'date', nullable: true })
  expectedDeliveryDate!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  deliveryAddressId!: string | null;

  @Column({ type: 'json' })
  deliveryAddressSnapshot!: AddressSnapshot;

  @Column({
    type: 'enum',
    enum: DeliveryType,
  })
  deliveryType!: DeliveryType;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currencyPreference!: string | null;

  @Column({ name: 'buyerNotes_i18n', type: 'json', nullable: true })
  buyerNotes!: TranslationMap | null;

  @Column({ type: 'json' })
  productSnapshot!: DirectRFQProductSnapshot;

  @Column({ type: 'varchar', length: 36, nullable: true })
  currentQuoteId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  acceptedQuoteId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  acceptedQuoteVersionId!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  viewedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  rejectedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer!: User;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @ManyToOne(() => ProductVariant, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'variantId' })
  variant!: ProductVariant | null;

  @OneToMany(() => DirectRFQQuote, (quote) => quote.rfq)
  quotes!: DirectRFQQuote[];
}
