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
import { MarketRFQ } from './market-rfq.entity';
import { MarketRFQActorType } from './market-rfq-quote-version.entity';

@Entity('market_rfq_audit_events')
export class MarketRFQAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  rfqId!: string;

  @Column({ type: 'varchar', length: 120 })
  eventType!: string;

  @Column({
    type: 'enum',
    enum: MarketRFQActorType,
  })
  actorType!: MarketRFQActorType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => MarketRFQ, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rfqId' })
  rfq!: MarketRFQ;
}
