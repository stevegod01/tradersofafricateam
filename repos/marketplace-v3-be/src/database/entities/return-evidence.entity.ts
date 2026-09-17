import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
@Entity('return_evidence')
@Index(['returnId'], { unique: false })
export class ReturnEvidence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ type: 'varchar', length: 36 })
  userId!: string;
  @Column({
    type: 'varchar', length: 36, nullable: true
  })
  returnId!: string | null;
  @Column({ type: 'varchar', length: 255 })
  fileName!: string;
  @Column({ type: 'varchar', length: 1000 })
  fileUrl!: string;
  @Column({ type: 'varchar', length: 500 })
  storedName!: string;
  @Column({ type: 'varchar', length: 120 })
  mimeType!: string;
  @Column({ type: 'int' })
  sizeBytes!: number;
  @Column({ type: 'timestamp' })
  expiresAt!: Date;
  @CreateDateColumn()
  createdAt!: Date;
  @UpdateDateColumn()
  updatedAt!: Date;
}
