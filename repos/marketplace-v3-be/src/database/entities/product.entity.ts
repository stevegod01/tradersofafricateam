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
import { TranslationMap } from './category.entity';
import { ProductCategory } from './product-category.entity';
import { ProductImage } from './product-image.entity';
import { ProductVariantOption } from './product-variant-option.entity';
import { ProductVariant } from './product-variant.entity';

export enum ProductStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

export enum ProductType {
  SIMPLE = 'simple',
  VARIABLE = 'variable',
}

export enum InventoryStatus {
  IN_STOCK = 'in_stock',
  OUT_OF_STOCK = 'out_of_stock',
}

@Index('IDX_products_rating', ['averageRating', 'totalReviews'])
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'json' })
  productName!: TranslationMap;

  @Column({ type: 'json' })
  productDescription!: TranslationMap;

  @Column({ type: 'varchar', length: 20, default: 'en' })
  sourceLanguage!: string;

  @Column({ type: 'varchar', length: 100 })
  countryOfOrigin!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  price!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discount!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 3, nullable: true })
  quantity!: number | null;

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

  @Column({
    type: 'enum',
    enum: ProductType,
  })
  productType!: ProductType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 3 })
  supplyCapacity!: number;

  @Column({ type: 'varchar', length: 40 })
  unitForSupplyCapacity!: string;

  @Column({ type: 'decimal', precision: 18, scale: 3 })
  minOrdersAllowed!: number;

  @Column({ type: 'varchar', length: 40 })
  unitForMinOrder!: string;

  @Column({ type: 'int' })
  minDuration!: number;

  @Column({ type: 'int' })
  maxDuration!: number;

  @Column({ type: 'varchar', length: 40 })
  durationUnit!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.DRAFT,
  })
  status!: ProductStatus;

  @Column({
    type: 'enum',
    enum: InventoryStatus,
    default: InventoryStatus.OUT_OF_STOCK,
  })
  inventoryStatus!: InventoryStatus;

  @Column({ type: 'decimal', precision: 18, scale: 3, default: 0 })
  totalStock!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  averageRating!: number;

  @Column({ type: 'int', default: 0 })
  totalReviews!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;

  @OneToMany(() => ProductCategory, (productCategory) => productCategory.product)
  productCategories!: ProductCategory[];

  @OneToMany(() => ProductImage, (image) => image.product)
  images!: ProductImage[];

  @OneToMany(() => ProductVariantOption, (option) => option.product)
  variantOptions!: ProductVariantOption[];

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants!: ProductVariant[];
}
