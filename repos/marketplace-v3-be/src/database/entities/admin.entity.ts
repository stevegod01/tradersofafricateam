import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AdminRoleEntity } from './admin-role.entity';

export enum AdminStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phoneNumber!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  roleId!: string | null;

  @Column({ type: 'boolean', default: false })
  isSuperAdmin!: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  deactivatedBy!: string | null;

  @Column({
    type: 'enum',
    enum: AdminStatus,
    default: AdminStatus.PENDING,
  })
  status!: AdminStatus;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: 'int', default: 0, select: false })
  failedLoginAttempts!: number;

  @Column({ type: 'timestamp', nullable: true, select: false })
  lockedUntil!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deactivatedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  deactivationReason!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  setupTokenHash!: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false })
  setupTokenExpiry!: Date | null;

  @Column({ type: 'timestamp', nullable: true, select: false })
  setupTokenUsedAt!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordResetToken!: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false })
  passwordResetExpiry!: Date | null;

  @Column({ type: 'int', default: 0, select: false })
  authVersion!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => AdminRoleEntity, (role) => role.admins, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'roleId' })
  role!: AdminRoleEntity | null;

  @ManyToOne(() => Admin, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'createdBy' })
  creator!: Admin | null;

  @ManyToOne(() => Admin, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'deactivatedBy' })
  deactivator!: Admin | null;
}
