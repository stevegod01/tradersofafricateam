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
import { AdminRoleEntity } from './admin-role.entity';
import { Permission } from './permission.entity';

@Index('UQ_admin_role_permissions_role_permission', ['roleId', 'permissionId'], {
  unique: true,
})
@Entity('admin_role_permissions')
export class AdminRolePermission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  roleId!: string;

  @Column({ type: 'varchar', length: 36 })
  permissionId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => AdminRoleEntity, (role) => role.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'roleId' })
  role!: AdminRoleEntity;

  @ManyToOne(() => Permission, (permission) => permission.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'permissionId' })
  permission!: Permission;
}
