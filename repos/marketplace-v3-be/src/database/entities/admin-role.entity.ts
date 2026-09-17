import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Admin } from './admin.entity';
import { AdminRolePermission } from './admin-role-permission.entity';

export enum AdminRoleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('admin_roles')
export class AdminRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: AdminRoleStatus,
    default: AdminRoleStatus.ACTIVE,
  })
  status!: AdminRoleStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Admin, (admin) => admin.role)
  admins!: Admin[];

  @OneToMany(() => AdminRolePermission, (rolePermission) => rolePermission.role)
  rolePermissions!: AdminRolePermission[];

  @ManyToOne(() => Admin, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'createdBy' })
  creator!: Admin | null;
}
