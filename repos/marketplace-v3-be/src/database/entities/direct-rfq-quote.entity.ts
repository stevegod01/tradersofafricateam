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
import { DirectRFQ } from './direct-rfq.entity';
import { DirectRFQQuoteVersion } from './direct-rfq-quote-version.entity';
import { User } from './user.entity';

export enum DirectRFQQuoteStatus {
  ACTIVE = 'active',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  SUPERSEDED = 'superseded',
}

@Entity('direct_rfq_quotes')
export class DirectRFQQuote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  rfqId!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  currentVersionId!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: DirectRFQQuoteStatus,
    default: DirectRFQQuoteStatus.ACTIVE,
  })
  status!: DirectRFQQuoteStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => DirectRFQ, (rfq) => rfq.quotes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rfqId' })
  rfq!: DirectRFQ;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;

  @OneToMany(() => DirectRFQQuoteVersion, (version) => version.quote)
  versions!: DirectRFQQuoteVersion[];
}
