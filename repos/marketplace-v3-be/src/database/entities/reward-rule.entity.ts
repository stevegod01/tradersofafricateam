import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
@Entity('reward_rules')
export class RewardRule {
    @PrimaryGeneratedColumn('uuid')
    id!: string;
    @Index({ unique: true })
    @Column({ length: 80 })
    eventCode!: string;
    @Column({ length: 150 })
    name!: string;
    @Column({ type: 'text', nullable: true })
    description!: string | null;
    @Column({ type: 'int' })
    points!: number;
    @Column({ type: 'enum', enum: ['active', 'inactive'], default: 'active' })
    status!: 'active' | 'inactive';
    @Column({ type: 'int', nullable: true })
    maxPerUser!: number | null;
    @Column({ type: 'int', nullable: true })
    maxPerPeriod!: number | null;
    @Column({ type: 'enum', enum: ['day', 'week', 'month', 'lifetime'], nullable: true })
    periodType!: 'day' | 'week' | 'month' | 'lifetime' | null;
    @Column({ type: 'varchar', length: 36, nullable: true })
    createdBy!: string | null;
    @CreateDateColumn()
    createdAt!: Date;
    @UpdateDateColumn()
    updatedAt!: Date;
}
