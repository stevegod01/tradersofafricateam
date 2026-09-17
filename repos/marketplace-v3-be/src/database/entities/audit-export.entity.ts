import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
@Entity('audit_exports')
export class AuditExport {
 @PrimaryGeneratedColumn('uuid') id!:string;
 @Index() @Column({type:'varchar',length:36}) adminId!:string;
 @Column({type:'varchar',length:20,default:'processing'}) status!:string;
 @Column({type:'int',default:0}) attempts!:number;
 @Column({type:'json'}) filters!:Record<string,unknown>;
 @Column({type:'longtext',nullable:true,select:false}) content!:string|null;
 @Column({type:'varchar',length:255,nullable:true}) error!:string|null;
 @Column({type:'timestamp'}) expiresAt!:Date;
 @CreateDateColumn() createdAt!:Date;
}
