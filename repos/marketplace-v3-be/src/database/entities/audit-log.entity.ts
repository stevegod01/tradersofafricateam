import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
@Index('UQ_audit_event', ['eventId'], { unique: true })
@Index('IDX_audit_entity', ['entityType', 'entityId', 'createdAt'])
@Index('IDX_audit_actor', ['actorId', 'createdAt'])
@Index('IDX_audit_module', ['module', 'createdAt'])
export class AuditLog {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type:'varchar',length:160}) eventId!: string;
 @Index() @Column({type:'varchar',length:120}) eventCode!: string;
 @Column({type:'varchar',length:36,nullable:true}) actorId!: string|null;
 @Index() @Column({type:'enum',enum:['user','admin','system']}) actorType!: 'user'|'admin'|'system';
 @Column({type:'varchar',length:255,nullable:true}) actorEmail!: string|null;
 @Column({type:'varchar',length:80}) module!: string;
 @Column({type:'varchar',length:120}) action!: string;
 @Column({type:'varchar',length:80,nullable:true}) entityType!: string|null;
 @Column({type:'varchar',length:36,nullable:true}) entityId!: string|null;
 @Column({type:'text'}) description!: string;
 @Column({type:'text',nullable:true}) reason!: string|null;
 @Column({type:'json',nullable:true}) oldValue!: Record<string,unknown>|null;
 @Column({type:'json',nullable:true}) newValue!: Record<string,unknown>|null;
 @Column({type:'json',nullable:true}) metadata!: Record<string,unknown>|null;
 @Column({type:'varchar',length:64,nullable:true}) ipAddress!: string|null;
 @Column({type:'text',nullable:true}) userAgent!: string|null;
 @Index() @Column({type:'varchar',length:128,nullable:true}) requestId!: string|null;
 @Index() @CreateDateColumn() createdAt!: Date;
}
