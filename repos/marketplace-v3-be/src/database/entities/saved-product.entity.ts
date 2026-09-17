import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';
import { User } from './user.entity';
@Entity('saved_products')
@Index('UQ_saved_products_user_product', ['userId', 'productId'], { unique: true })
@Index('IDX_saved_products_owner_created', ['userId', 'createdAt', 'id'])
@Index('IDX_saved_products_product', ['productId'])
export class SavedProduct {
    @PrimaryGeneratedColumn('uuid')
    id!: string;
    @Column({ type: 'varchar', length: 36 })
    userId!: string;
    @Column({ type: 'varchar', length: 36 })
    productId!: string;
    @CreateDateColumn()
    createdAt!: Date;
    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user!: User;
    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product!: Product;
}
