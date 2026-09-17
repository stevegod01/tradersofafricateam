import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
@Entity('referrals')
@Index(['referredUserId'], { unique: true })
@Index(['referrerId', 'status'])
export class Referral {
    @PrimaryGeneratedColumn('uuid')
    id!: string;
    @Column({ length: 36 })
    referrerId!: string;
    @Column({ length: 36 })
    referredUserId!: string;
    @Column({ length: 50 })
    referralCode!: string;
    @Column({ type: 'enum', enum: ['pending', 'qualified', 'rewarded', 'invalid'], default: 'pending' })
    status!: 'pending' | 'qualified' | 'rewarded' | 'invalid';
    @Column({ type: 'timestamp', nullable: true })
    qualifiedAt!: Date | null;
    @Column({ type: 'timestamp', nullable: true })
    rewardedAt!: Date | null;
    @CreateDateColumn()
    createdAt!: Date;
    @UpdateDateColumn()
    updatedAt!: Date;
}
