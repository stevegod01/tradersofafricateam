import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum EntitlementValueType {
  BOOLEAN = 'boolean',
  INTEGER = 'integer',
  DECIMAL = 'decimal',
  STRING = 'string',
  ENUM = 'enum',
}

export enum EntitlementStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Index('UQ_entitlement_definitions_code', ['code'], { unique: true })
@Index('IDX_entitlement_definitions_status_category', ['status', 'category'])
@Entity('entitlement_definitions')
export class EntitlementDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: EntitlementValueType,
  })
  valueType!: EntitlementValueType;

  @Column({ type: 'json', nullable: true })
  defaultValue!: unknown | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  category!: string | null;

  @Column({
    type: 'enum',
    enum: EntitlementStatus,
    default: EntitlementStatus.ACTIVE,
  })
  status!: EntitlementStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
