import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum SearchEventType {
  SEARCH = 'search',
  RESULT_CLICK = 'result_click',
  NO_RESULT = 'no_result',
}

export enum SearchEntityType {
  PRODUCT = 'product',
  SELLER = 'seller',
  MARKET_RFQ = 'market_rfq',
  CATEGORY = 'category',
}

@Index('IDX_search_events_type_created', ['eventType', 'createdAt'])
@Index('IDX_search_events_query_created', ['query', 'createdAt'])
@Entity('search_events')
export class SearchEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sessionId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  query!: string | null;

  @Column({
    type: 'enum',
    enum: SearchEntityType,
    nullable: true,
  })
  entityType!: SearchEntityType | null;

  @Column({
    type: 'enum',
    enum: SearchEventType,
  })
  eventType!: SearchEventType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  entityId!: string | null;

  @Column({ type: 'int', nullable: true })
  resultPosition!: number | null;

  @Column({ type: 'json', nullable: true })
  filters!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
