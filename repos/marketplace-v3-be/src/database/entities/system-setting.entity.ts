import {Column,CreateDateColumn,Entity,PrimaryGeneratedColumn,UpdateDateColumn} from 'typeorm';
@Entity('system_settings')
export class SystemSetting {
 @PrimaryGeneratedColumn('uuid') id!:string;
 @Column({type:'varchar',length:120,unique:true}) key!:string;
 @Column({type:'varchar',length:40}) category!:string;
 @Column({type:'json',nullable:true}) value!:unknown;
 @Column({type:'enum',enum:['string','number','boolean','array','object']}) valueType!:string;
 @Column({type:'text',nullable:true}) description!:string|null;
 @Column({type:'boolean',default:false}) isPublic!:boolean;
 @Column({type:'boolean',default:true}) isEditable!:boolean;
 @Column({type:'varchar',length:36,nullable:true}) updatedBy!:string|null;
 @CreateDateColumn() createdAt!:Date;
 @UpdateDateColumn() updatedAt!:Date;
}
