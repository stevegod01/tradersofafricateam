import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('UQ_message_settings_key', ['settingKey'], { unique: true })
@Entity('message_settings')
export class MessageSetting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  settingKey!: string;

  @Column({ type: 'json' })
  settingValue!: unknown;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
