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
import { User } from './user.entity';

export type DeliveryDraftQuote = {
  quoteId: string;
  sellerId: string;
  type: 'integrated_logistics';
  providerId: string;
  providerName: string;
  serviceName: string;
  amount: number;
  currency: string;
  estimatedDelivery: { min: number; max: number; unit: string };
  expiresAt: string;
};

export type DeliveryDraftSelection = {
  sellerId: string;
  type: 'integrated_logistics' | 'seller_arranged' | 'buyer_arranged';
  quoteId: string | null;
};

@Entity('checkout_drafts')
export class CheckoutDraft {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  deliveryAddressId!: string | null;

  @Column({ type: 'json', nullable: true })
  deliveryQuotes!: DeliveryDraftQuote[] | null;

  @Column({ type: 'json', nullable: true })
  deliverySelections!: DeliveryDraftSelection[] | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  paymentMethod!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
