import 'reflect-metadata';
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Payment } from './payment.entity';

@Entity('letter_of_credit_details')
export class LetterOfCreditDetail {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36, unique: true })
  paymentId!: string;

  @Column({ type: 'varchar', length: 160 })
  issuingBank!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  advisingBank!: string | null;

  @Column({ type: 'varchar', length: 160 })
  lcReference!: string;

  @Column({ type: 'varchar', length: 80 })
  lcType!: string;

  @Column({ type: 'date' })
  issueDate!: string;

  @Column({ type: 'date' })
  expiryDate!: string;

  @Column({ type: 'varchar', length: 500 })
  documentUrl!: string;

  @Column({ type: 'varchar', length: 80 })
  status!: string;

  @Column({ type: 'text', nullable: true })
  reviewNotes!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToOne(() => Payment, (payment) => payment.letterOfCreditDetail, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'paymentId' })
  payment!: Payment;
}
