import 'reflect-metadata';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { CompanyVerification } from './company-verification.entity';
import { RefreshToken } from './refresh-token.entity';

export enum UserType {
  BUYER = 'buyer',
  SELLER = 'seller',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISABLED = 'disabled',
  DELETED = 'deleted',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phoneNumber!: string | null;

  @Column({
    type: 'enum',
    enum: UserType,
    default: UserType.BUYER,
  })
  userType!: UserType;

  @Column({
    name: 'currentStatus',
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.INACTIVE,
  })
  status!: UserStatus;

  @Column({ type: 'boolean', default: false })
  termsOfUse!: boolean;

  @Column({ type: 'boolean', default: false })
  merchantTerms!: boolean;

  @Column({ type: 'boolean', default: false })
  isEmailVerified!: boolean;

  @Column({ type: 'boolean', default: false })
  isCompanyVerified!: boolean;

  @Column({ type: 'varchar', length: 20, default: 'en' })
  selectedLanguage!: string;

  // Seller-specific fields (populated after upgrade)
  @Column({ type: 'varchar', length: 255, nullable: true })
  storeName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  companyName!: string | null;

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

  @Column({ type: 'varchar', length: 500, nullable: true })
  deliveryAddress!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  companyLogo!: string | null;

  @Column({ type: 'text', nullable: true })
  companyBio!: string | null;

  @Column({ type: 'int', default: 0 })
  totalReviewCount!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  totalAverageReviews!: string;

  @Column({ type: 'int', default: 0 })
  totalPoints!: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  referral!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, unique: true })
  referralCode!: string | null;

  @Column({ type: 'text', nullable: true })
  statusReason!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  disabledBy!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  disabledAt!: Date | null;

  // Security
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  emailVerificationToken!: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false })
  emailVerificationExpiry!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordResetToken!: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false })
  passwordResetExpiry!: Date | null;

  @Column({ type: 'int', default: 0, select: false })
  failedLoginAttempts!: number;

  @Column({ type: 'timestamp', nullable: true, select: false })
  lockedUntil!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Relations
  @OneToOne(() => CompanyVerification, (v) => v.user)
  verification!: CompanyVerification;

  @OneToMany(() => RefreshToken, (t) => t.user)
  refreshTokens!: RefreshToken[];
}
