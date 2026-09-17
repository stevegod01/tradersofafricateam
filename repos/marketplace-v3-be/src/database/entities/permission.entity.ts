import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AdminRolePermission } from './admin-role-permission.entity';

export enum PermissionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 80 })
  module!: string;

  @Column({
    type: 'enum',
    enum: PermissionStatus,
    default: PermissionStatus.ACTIVE,
  })
  status!: PermissionStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(
    () => AdminRolePermission,
    (rolePermission) => rolePermission.permission,
  )
  rolePermissions!: AdminRolePermission[];
}
