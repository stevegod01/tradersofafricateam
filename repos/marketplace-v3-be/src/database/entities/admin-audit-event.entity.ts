import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('admin_audit_events')
export class AdminAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  eventType!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorAdminId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  targetAdminId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  targetUserId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  targetRoleId!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
