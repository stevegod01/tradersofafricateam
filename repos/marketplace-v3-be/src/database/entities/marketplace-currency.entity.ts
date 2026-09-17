import {Column,CreateDateColumn,Entity,PrimaryGeneratedColumn,UpdateDateColumn} from 'typeorm';
@Entity('currencies')
export class MarketplaceCurrency {
 @PrimaryGeneratedColumn('uuid') id!:string;
 @Column({type:'varchar',length:3,unique:true}) code!:string;
 @Column({type:'varchar',length:120}) name!:string;
 @Column({type:'varchar',length:8,nullable:true}) symbol!:string|null;
 @Column({type:'int',default:2}) decimalPlaces!:number;
 @Column({type:'enum',enum:['active','inactive'],default:'active'}) status!:'active'|'inactive';
 @CreateDateColumn() createdAt!:Date;
 @UpdateDateColumn() updatedAt!:Date;
}
