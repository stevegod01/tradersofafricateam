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
import { DirectRFQ } from './direct-rfq.entity';
import { DirectRFQActorType } from './direct-rfq-quote-version.entity';

@Entity('direct_rfq_audit_events')
export class DirectRFQAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  rfqId!: string;

  @Column({ type: 'varchar', length: 120 })
  eventType!: string;

  @Column({
    type: 'enum',
    enum: DirectRFQActorType,
  })
  actorType!: DirectRFQActorType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => DirectRFQ, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rfqId' })
  rfq!: DirectRFQ;
}
