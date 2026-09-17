import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum LanguageDirection {
  LTR = 'ltr',
  RTL = 'rtl',
}

export enum LanguageStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Index('UQ_languages_code', ['code'], { unique: true })
@Index('IDX_languages_status_sort', ['status', 'sortOrder'])
@Entity('languages')
export class Language {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 120 })
  nativeName!: string;

  @Column({
    type: 'enum',
    enum: LanguageDirection,
    default: LanguageDirection.LTR,
  })
  direction!: LanguageDirection;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({
    type: 'enum',
    enum: LanguageStatus,
    default: LanguageStatus.INACTIVE,
  })
  status!: LanguageStatus;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
