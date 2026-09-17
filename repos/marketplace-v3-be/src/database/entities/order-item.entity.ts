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
import { Order } from './order.entity';
import { Product } from './product.entity';
import { ProductVariant } from './product-variant.entity';

export type OrderProductNameSnapshot =
  | string
  | {
      displayName: string | null;
      [key: string]: unknown;
    };

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  orderId!: string;

  @Column({ type: 'varchar', length: 36 })
  productId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  variantId!: string | null;

  @Column({ type: 'json' })
  productNameSnapshot!: OrderProductNameSnapshot;

  @Column({ type: 'varchar', length: 500, nullable: true })
  productImageSnapshot!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  skuSnapshot!: string | null;

  @Column({ type: 'json', nullable: true })
  attributesSnapshot!: Record<string, unknown> | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  unitPrice!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  discount!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  finalUnitPrice!: number;

  @Column({ type: 'decimal', precision: 18, scale: 3 })
  quantity!: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  unit!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  subtotal!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @ManyToOne(() => Product, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'productId' })
  product!: Product | null;

  @ManyToOne(() => ProductVariant, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'variantId' })
  variant!: ProductVariant | null;
}
