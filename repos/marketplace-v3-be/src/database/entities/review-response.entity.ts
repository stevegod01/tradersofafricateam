import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ReviewType } from './review-eligibility.entity';

export enum ReviewResponseStatus {
  PUBLISHED = 'published',
  HIDDEN = 'hidden',
  DELETED = 'deleted',
}

@Index('UQ_review_responses_review_seller', ['reviewType', 'reviewId', 'sellerId'], {
  unique: true,
})
@Index('IDX_review_responses_review', ['reviewType', 'reviewId'])
@Entity('review_responses')
export class ReviewResponse {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'enum',
    enum: ReviewType,
  })
  reviewType!: ReviewType;

  @Column({ type: 'varchar', length: 36 })
  reviewId!: string;

  @Column({ type: 'varchar', length: 36 })
  sellerId!: string;

  @Column({ type: 'text' })
  comment!: string;

  @Column({
    type: 'enum',
    enum: ReviewResponseStatus,
    default: ReviewResponseStatus.PUBLISHED,
  })
  status!: ReviewResponseStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
