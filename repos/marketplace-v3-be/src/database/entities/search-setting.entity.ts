import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('search_settings')
export class SearchSetting {
  @PrimaryColumn({ type: 'varchar', length: 120 })
  settingKey!: string;

  @Column({ type: 'json' })
  value!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
