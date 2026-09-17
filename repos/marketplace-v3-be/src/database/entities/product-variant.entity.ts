import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';

export type VariantAttributes = Record<string, string>;

@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  productId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  sku!: string;

  @Column({ type: 'json' })
  attributes!: VariantAttributes;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  price!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discount!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 3 })
  quantity!: number;

  @Column({ type: 'decimal', precision: 18, scale: 3, nullable: true })
  weight!: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  weightUnit!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 3, nullable: true })
  length!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 3, nullable: true })
  width!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 3, nullable: true })
  height!: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  dimensionUnit!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product!: Product;
}
