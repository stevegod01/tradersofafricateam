import {Column,CreateDateColumn,Entity,PrimaryGeneratedColumn,UpdateDateColumn} from 'typeorm';
@Entity('countries')
export class MarketplaceCountry {
 @PrimaryGeneratedColumn('uuid') id!:string;
 @Column({type:'varchar',length:2,unique:true}) code!:string;
 @Column({type:'varchar',length:120}) name!:string;
 @Column({type:'varchar',length:8,nullable:true}) phoneCode!:string|null;
 @Column({type:'enum',enum:['active','inactive'],default:'active'}) status!:'active'|'inactive';
 @CreateDateColumn() createdAt!:Date;
 @UpdateDateColumn() updatedAt!:Date;
}
