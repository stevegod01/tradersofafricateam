import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
@Entity('return_items')
@Index(['returnId', 'orderItemId'], { unique: true })
@Index(['orderItemId'], { unique: false })
export class ReturnItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ type: 'varchar', length: 36 })
  returnId!: string;
  @Column({ type: 'varchar', length: 36 })
  orderItemId!: string;
  @Column({
    type: 'decimal', precision: 18, scale: 3
  })
  quantity!: string;
  @Column({
    type: 'varchar', length: 160, nullable: true
  })
  reason!: string | null;
  @CreateDateColumn()
  createdAt!: Date;
  @UpdateDateColumn()
  updatedAt!: Date;
}
