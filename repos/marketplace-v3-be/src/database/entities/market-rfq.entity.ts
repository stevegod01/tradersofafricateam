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
import { TranslationMap } from './category.entity';
import { DeliveryType } from './checkout.enums';
import { AddressSnapshot } from './checkout-session.entity';
import { MarketRFQQuote } from './market-rfq-quote.entity';
import { MarketRFQSellerView } from './market-rfq-seller-view.entity';
import { MarketRFQSellerVisibility } from './market-rfq-seller-visibility.entity';
import { Product } from './product.entity';
import { ProductVariant } from './product-variant.entity';
import { User } from './user.entity';

export enum MarketRFQStatus {
  OPEN = 'open',
  QUOTED = 'quoted',
  NEGOTIATING = 'negotiating',
  AWARDED = 'awarded',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export type MarketRFQCategorySnapshot = {
  id: string;
  name: string | null;
  slug: string;
};

export type MarketRFQProductSnapshot = {
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
} | null;

@Index('IDX_market_rfqs_buyer_status', ['buyerId', 'status'])
@Index('IDX_market_rfqs_awarded_seller', ['awardedSellerId'])
@Entity('market_rfqs')
export class MarketRFQ {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  rfqReference!: string;

  @Column({ type: 'varchar', length: 36 })
  buyerId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  productId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  variantId!: string | null;

  @Column({ type: 'json' })
  categoryIds!: string[];

  @Column({ type: 'json' })
  categorySnapshots!: MarketRFQCategorySnapshot[];

  @Column({ type: 'json' })
  requirementTitle!: TranslationMap;

  @Column({ type: 'json' })
  description!: TranslationMap;

  @Column({ type: 'varchar', length: 20, default: 'en' })
  sourceLanguage!: string;

  @Column({ type: 'decimal', precision: 18, scale: 3 })
  quantity!: number;

  @Column({ type: 'varchar', length: 40 })
  unit!: string;

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

  @Column({ type: 'json', nullable: true })
  productSnapshot!: MarketRFQProductSnapshot;

  @Index()
  @Column({
    type: 'enum',
    enum: MarketRFQStatus,
    default: MarketRFQStatus.OPEN,
  })
  status!: MarketRFQStatus;

  @Column({ type: 'int', default: 0 })
  quotesCount!: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  awardedSellerId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  acceptedQuoteId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  acceptedQuoteVersionId!: string | null;

  @Index()
  @Column({ type: 'timestamp' })
  submissionDeadline!: Date;

  @Column({ type: 'timestamp', nullable: true })
  awardedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer!: User;

  @ManyToOne(() => Product, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'productId' })
  product!: Product | null;

  @ManyToOne(() => ProductVariant, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'variantId' })
  variant!: ProductVariant | null;

  @ManyToOne(() => User, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'awardedSellerId' })
  awardedSeller!: User | null;

  @OneToMany(() => MarketRFQQuote, (quote) => quote.rfq)
  quotes!: MarketRFQQuote[];

  @OneToMany(() => MarketRFQSellerVisibility, (visibility) => visibility.rfq)
  sellerVisibilities!: MarketRFQSellerVisibility[];

  @OneToMany(() => MarketRFQSellerView, (view) => view.rfq)
  sellerViews!: MarketRFQSellerView[];
}
