import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PaymentAccountStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('payment_accounts')
export class PaymentAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  paymentMethod!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 160 })
  bankName!: string;

  @Column({ type: 'varchar', length: 160 })
  accountName!: string;

  @Column({ type: 'varchar', length: 80 })
  accountNumber!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  swiftCode!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  iban!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  bankAddress!: string | null;

  @Column({ type: 'varchar', length: 100 })
  country!: string;

  @Column({
    type: 'enum',
    enum: PaymentAccountStatus,
    default: PaymentAccountStatus.ACTIVE,
  })
  status!: PaymentAccountStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
