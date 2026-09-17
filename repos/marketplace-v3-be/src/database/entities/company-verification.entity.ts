import 'reflect-metadata';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Admin } from './admin.entity';
import { User } from './user.entity';

export enum VerificationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('company_verifications')
export class CompanyVerification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  companyName!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  registrationNumber!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  businessType!: string | null;

  @Column({ type: 'int', nullable: true })
  yearsOfBusiness!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  companyAddress!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  pickupAddress!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  companyLogo!: string | null;

  @Column({ type: 'text', nullable: true })
  companyBio!: string | null;

  @Column({
    type: 'enum',
    enum: VerificationStatus,
    default: VerificationStatus.PENDING,
  })
  verificationStatus!: VerificationStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'text', nullable: true })
  adminNotes!: string | null;

  @CreateDateColumn()
  submittedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Relations
  @OneToOne(() => User, (u) => u.verification)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => Admin, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'reviewedBy' })
  reviewer!: Admin | null;
}
