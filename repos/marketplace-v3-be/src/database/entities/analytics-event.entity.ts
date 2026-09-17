import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('analytics_events')
@Index('UQ_analytics_events_source_event', ['sourceModule', 'eventName', 'sourceEventId'], {
  unique: true,
})
@Index('IDX_analytics_events_entity_created', ['entityType', 'entityId', 'createdAt'])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  sourceModule!: string;

  @Column({ type: 'varchar', length: 120 })
  eventName!: string;

  @Column({ type: 'varchar', length: 120 })
  sourceEventId!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entityType!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entityId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId!: string | null;

  @Column({ type: 'json', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
