import {Column,CreateDateColumn,Entity,PrimaryGeneratedColumn,UpdateDateColumn} from 'typeorm';
@Entity('payment_method_configs')
export class PaymentMethodConfig {
 @PrimaryGeneratedColumn('uuid') id!:string;
 @Column({type:'varchar',length:80,unique:true}) code!:string;
 @Column({type:'varchar',length:120}) displayName!:string;
 @Column({type:'enum',enum:['active','inactive'],default:'active'}) status!:'active'|'inactive';
 @Column({type:'json'}) supportedCurrencies!:string[];
 @Column({type:'json',nullable:true}) paymentContext!:string[]|null;
 @Column({type:'int',default:0}) sortOrder!:number;
 @CreateDateColumn() createdAt!:Date;
 @UpdateDateColumn() updatedAt!:Date;
}
