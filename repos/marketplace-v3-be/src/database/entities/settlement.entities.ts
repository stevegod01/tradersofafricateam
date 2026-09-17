import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
export type PayoutDestination = Record<string, unknown> & { providerRecipientId?: string | null };
export type SettlementEventPayload = Record<string, unknown> & { amount: string; currency: string; orderId: string };

@Entity('seller_payout_accounts')
@Index(['sellerId','currency'])
export class SellerPayoutAccount {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type:'varchar',length:36}) sellerId!: string;
 @Column({type:'varchar',length:30}) accountType!: string;
 @Column({type:'varchar',length:160}) accountName!: string;
 @Column({type:'text',select:false}) accountNumberEncrypted!: string;
 @Column({type:'varchar',length:40}) maskedAccountNumber!: string;
 @Column({type:'varchar',length:40,nullable:true}) bankCode!: string | null;
 @Column({type:'varchar',length:160}) bankName!: string;
 @Column({type:'varchar',length:2}) country!: string;
 @Column({type:'varchar',length:3}) currency!: string;
 @Column({type:'varchar',length:100,nullable:true}) providerRecipientId!: string | null;
 @Column({type:'boolean',default:false}) isDefault!: boolean;
 @Column({type:'varchar',length:20,default:'pending'}) status!: string;
 @Column({type:'int',default:1}) version!: number;
 @Column({type:'timestamp',nullable:true}) verifiedAt!: Date | null;
 @Column({type:'varchar',length:36,nullable:true}) verifiedBy!: string | null;
 @CreateDateColumn() createdAt!: Date;
 @UpdateDateColumn() updatedAt!: Date;
}

@Entity('seller_settlements')
@Index(['sellerId','status'])
@Index(['status','eligibleAt'])
export class SellerSettlement {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type:'varchar',length:50,unique:true}) settlementNumber!: string;
 @Column({type:'varchar',length:36}) sellerId!: string;
 @Column({type:'varchar',length:36}) orderId!: string;
 @Column({type:'varchar',length:36,unique:true}) sellerOrderId!: string;
 @Column({type:'varchar',length:36}) paymentId!: string;
 @Column({type:'varchar',length:20,default:'pending'}) status!: string;
 @Column({type:'decimal',precision:18,scale:2}) grossProductAmount!: string;
 @Column({type:'decimal',precision:18,scale:2}) logisticsAmount!: string;
 @Column({type:'decimal',precision:18,scale:2}) transactionFeePercentage!: string;
 @Column({type:'decimal',precision:18,scale:2}) transactionFeeAmount!: string;
 @Column({type:'decimal',precision:18,scale:2,default:'0.00'}) refundAmount!: string;
 @Column({type:'decimal',precision:18,scale:2,default:'0.00'}) adjustmentAmount!: string;
 @Column({type:'decimal',precision:18,scale:2}) netSettlementAmount!: string;
 @Column({type:'varchar',length:3}) settlementCurrency!: string;
 @Column({type:'int'}) holdDays!: number;
 @Column({type:'timestamp',nullable:true}) eligibleAt!: Date | null;
 @Column({type:'varchar',length:36,nullable:true}) payoutId!: string | null;
 @Column({type:'json'}) financialSnapshot!: Record<string,unknown>;
 @CreateDateColumn() createdAt!: Date;
 @UpdateDateColumn() updatedAt!: Date;
}

@Entity('settlement_holds')
@Index(['settlementId','holdCode'],{unique:true})
export class SettlementHold {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type:'varchar',length:36}) settlementId!: string;
 @Column({type:'varchar',length:60}) holdCode!: string;
 @Column({type:'text',nullable:true}) reason!: string | null;
 @Column({type:'varchar',length:30}) sourceType!: string;
 @Column({type:'varchar',length:36,nullable:true}) sourceId!: string | null;
 @Column({type:'varchar',length:20,default:'active'}) status!: string;
 @Column({type:'varchar',length:36,nullable:true}) heldBy!: string | null;
 @Column({type:'timestamp'}) heldAt!: Date;
 @Column({type:'varchar',length:36,nullable:true}) releasedBy!: string | null;
 @Column({type:'timestamp',nullable:true}) releasedAt!: Date | null;
 @CreateDateColumn() createdAt!: Date;
 @UpdateDateColumn() updatedAt!: Date;
}

@Entity('seller_settlement_adjustments')
@Index(['sellerId','currency','settlementId'])
export class SellerSettlementAdjustment {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type:'varchar',length:36}) sellerId!: string;
 @Column({type:'varchar',length:36,nullable:true}) settlementId!: string | null;
 @Column({type:'varchar',length:36}) sellerOrderId!: string;
 @Column({type:'varchar',length:40}) adjustmentType!: string;
 @Column({type:'decimal',precision:18,scale:2}) amount!: string;
 @Column({type:'varchar',length:3}) currency!: string;
 @Column({type:'varchar',length:10}) direction!: string;
 @Column({type:'varchar',length:40}) sourceType!: string;
 @Column({type:'varchar',length:80,nullable:true}) sourceId!: string | null;
 @Column({type:'text'}) reason!: string;
 @Column({type:'varchar',length:20,default:'active'}) status!: string;
 @Column({type:'varchar',length:191,unique:true}) idempotencyKey!: string;
 @Column({type:'varchar',length:36,nullable:true}) createdBy!: string | null;
 @CreateDateColumn() createdAt!: Date;
}

@Entity('seller_payouts')
@Index(['sellerId','status'])
export class SellerPayout {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type:'varchar',length:50,unique:true}) payoutNumber!: string;
 @Column({type:'varchar',length:36}) sellerId!: string;
 @Column({type:'varchar',length:36,unique:true}) settlementId!: string;
 @Column({type:'varchar',length:36}) payoutAccountId!: string;
 @Column({type:'int'}) accountVersion!: number;
 @Column({type:'text',select:false}) destinationEncrypted!: string;
 @Column({type:'json'}) destination!: PayoutDestination;
 @Column({type:'json'}) financialSnapshot!: Record<string,unknown>;
 @Column({type:'decimal',precision:18,scale:2}) amount!: string;
 @Column({type:'varchar',length:3}) currency!: string;
 @Column({type:'varchar',length:20,default:'pending'}) status!: string;
 @Column({type:'varchar',length:30}) method!: string;
 @Column({type:'varchar',length:40,nullable:true}) provider!: string | null;
 @Column({type:'varchar',length:160,nullable:true,unique:true}) providerReference!: string | null;
 @Column({type:'varchar',length:36,nullable:true}) approvedBy!: string | null;
 @Column({type:'timestamp',nullable:true}) approvedAt!: Date | null;
 @Column({type:'varchar',length:36,nullable:true}) processingBy!: string | null;
 @Column({type:'timestamp',nullable:true}) processingAt!: Date | null;
 @Column({type:'timestamp',nullable:true}) completedAt!: Date | null;
 @Column({type:'timestamp',nullable:true}) failedAt!: Date | null;
 @Column({type:'text',nullable:true}) failureReason!: string | null;
 @Column({type:'int',default:0}) attemptCount!: number;
 @CreateDateColumn() createdAt!: Date;
 @UpdateDateColumn() updatedAt!: Date;
}

@Entity('payout_attempts')
@Index(['payoutId','attemptNumber'],{unique:true})
export class PayoutAttempt {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type:'varchar',length:36}) payoutId!: string;
 @Column({type:'int'}) attemptNumber!: number;
 @Column({type:'varchar',length:100,unique:true}) reference!: string;
 @Column({type:'varchar',length:20}) status!: string;
 @Column({type:'decimal',precision:18,scale:2}) amount!: string;
 @Column({type:'varchar',length:3}) currency!: string;
 @Column({type:'varchar',length:100,nullable:true}) recipientId!: string | null;
 @Column({type:'json'}) destination!: PayoutDestination;
 @Column({type:'varchar',length:40}) provider!: string;
 @Column({type:'varchar',length:160,nullable:true}) providerReference!: string | null;
 @Column({type:'varchar',length:36,nullable:true}) initiatedBy!: string | null;
 @Column({type:'timestamp',nullable:true}) completedAt!: Date | null;
 @Column({type:'text',nullable:true}) failureReason!: string | null;
 @CreateDateColumn() createdAt!: Date;
 @UpdateDateColumn() updatedAt!: Date;
}

@Entity('settlement_adjustment_allocations')
@Index(['adjustmentId','payoutId'],{unique:true})
export class SettlementAdjustmentAllocation {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type:'varchar',length:36}) adjustmentId!: string;
 @Column({type:'varchar',length:36}) payoutId!: string;
 @Column({type:'decimal',precision:18,scale:2}) amount!: string;
 @Column({type:'varchar',length:20}) status!: string;
 @CreateDateColumn() createdAt!: Date;
 @UpdateDateColumn() updatedAt!: Date;
}

@Entity('settlement_events')
@Index(['deliveredAt','createdAt'])
export class SettlementEvent {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type:'varchar',length:36}) sellerId!: string;
 @Column({type:'varchar',length:36,nullable:true}) settlementId!: string | null;
 @Column({type:'varchar',length:36,nullable:true}) payoutId!: string | null;
 @Column({type:'varchar',length:100}) eventCode!: string;
 @Column({type:'varchar',length:36,nullable:true}) actorId!: string | null;
 @Column({type:'json'}) payload!: SettlementEventPayload;
 @Column({type:'timestamp',nullable:true}) deliveredAt!: Date | null;
 @CreateDateColumn() createdAt!: Date;
}
