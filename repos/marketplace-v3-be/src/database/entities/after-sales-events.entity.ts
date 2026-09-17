import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
@Entity('after_sales_events')
@Index(['deliveredAt', 'createdAt'], { unique: false })
@Index(['entityId'], { unique: false })
export class AfterSalesEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ type: 'varchar', length: 36 })
  orderId!: string;
  @Column({ type: 'varchar', length: 36 })
  entityId!: string;
  @Column({ type: 'varchar', length: 36 })
  actorId!: string;
  @Column({ type: 'varchar', length: 20 })
  actorType!: string;
  @Column({ type: 'varchar', length: 120 })
  eventType!: string;
  @Column({ type: 'json' })
  payload!: Record<string, unknown>;
  @Column({ type: 'timestamp', nullable: true })
  deliveredAt!: Date | null;
  @CreateDateColumn()
  createdAt!: Date;
  @UpdateDateColumn()
  updatedAt!: Date;
}
