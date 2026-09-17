import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Category } from './category.entity';
import { Product } from './product.entity';

@Entity('product_categories')
@Unique('UQ_product_categories_product_category', ['productId', 'categoryId'])
export class ProductCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  productId!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  categoryId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Product, (product) => product.productCategories, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category!: Category;
}
