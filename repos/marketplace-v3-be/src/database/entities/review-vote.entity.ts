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

export enum ReviewVoteValue {
  HELPFUL = 'helpful',
  NOT_HELPFUL = 'not_helpful',
}

@Index('UQ_review_votes_review_user', ['reviewType', 'reviewId', 'userId'], {
  unique: true,
})
@Index('IDX_review_votes_review', ['reviewType', 'reviewId'])
@Entity('review_votes')
export class ReviewVote {
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
  userId!: string;

  @Column({
    type: 'enum',
    enum: ReviewVoteValue,
  })
  vote!: ReviewVoteValue;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
