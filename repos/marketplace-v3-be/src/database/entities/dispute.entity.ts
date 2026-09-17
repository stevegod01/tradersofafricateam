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
import { Admin } from './admin.entity';
import { DisputeAuditEvent } from './dispute-audit-event.entity';
import { DisputeEvidence } from './dispute-evidence.entity';
import { DisputeItem } from './dispute-item.entity';
import { DisputeMessage } from './dispute-message.entity';
import { Order } from './order.entity';
import { User } from './user.entity';

export enum DisputeRaisedByType {
  BUYER = 'buyer',
  SELLER = 'seller',
}

export enum DisputeStatus {
  OPEN = 'open',
  UNDER_REVIEW = 'under_review',
  AWAITING_BUYER = 'awaiting_buyer',
  AWAITING_SELLER = 'awaiting_seller',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum DisputeResolutionType {
  BUYER_FAVOUR = 'buyer_favour',
  SELLER_FAVOUR = 'seller_favour',
  PARTIAL_RESOLUTION = 'partial_resolution',
  MUTUAL_RESOLUTION = 'mutual_resolution',
  NO_ACTION = 'no_action',
}

export type DisputeFinancialAction = {
  type: 'none' | 'refund' | 'partial_refund';
  amount?: number;
  currency?: string;
  [key: string]: unknown;
};

@Index('UQ_disputes_disputeNumber', ['disputeNumber'], { unique: true })
@Index('IDX_disputes_order_status', ['orderId', 'status'])
@Index('IDX_disputes_seller_order_status', ['sellerOrderId', 'status'])
@Index('IDX_disputes_buyer_status', ['buyerId', 'status'])
@Index('IDX_disputes_seller_status', ['sellerId', 'status'])
@Index('IDX_disputes_assigned_admin_status', ['assignedAdminId', 'status'])
@Entity('disputes')
export class Dispute {
  @Column({ type: 'varchar', length: 36, nullable: true })
  returnId!: string | null;

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40 })
  disputeNumber!: string;

  @Column({ type: 'varchar', length: 36 })
  orderId!: string;

  @Column({ type: 'varchar', length: 36 })
  sellerOrderId!: string;

  @Column({ type: 'varchar', length: 36 })
  raisedBy!: string;

  @Column({
    type: 'enum',
    enum: DisputeRaisedByType,
  })
  raisedByType!: DisputeRaisedByType;

  @Column({ type: 'varchar', length: 36 })
  buyerId!: string;

  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'varchar', length: 160 })
  reason!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    default: DisputeStatus.OPEN,
  })
  status!: DisputeStatus;

  @Column({
    type: 'enum',
    enum: DisputeResolutionType,
    nullable: true,
  })
  resolutionType!: DisputeResolutionType | null;

  @Column({ type: 'text', nullable: true })
  resolutionNotes!: string | null;

  @Column({ type: 'json', nullable: true })
  financialAction!: DisputeFinancialAction | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  assignedAdminId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  resolvedBy!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  closedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'raisedBy' })
  raiser!: User;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer!: User;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;

  @ManyToOne(() => Admin, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'assignedAdminId' })
  assignedAdmin!: Admin | null;

  @ManyToOne(() => Admin, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'resolvedBy' })
  resolver!: Admin | null;

  @OneToMany(() => DisputeItem, (item) => item.dispute)
  items!: DisputeItem[];

  @OneToMany(() => DisputeEvidence, (evidence) => evidence.dispute)
  evidence!: DisputeEvidence[];

  @OneToMany(() => DisputeMessage, (message) => message.dispute)
  messages!: DisputeMessage[];

  @OneToMany(() => DisputeAuditEvent, (event) => event.dispute)
  auditEvents!: DisputeAuditEvent[];
}
