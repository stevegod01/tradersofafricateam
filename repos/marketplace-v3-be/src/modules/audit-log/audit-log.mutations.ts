import { EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { createError } from '../../common/utils/http-error.util';

/** Save changed fields with an old snapshot; subscriber and mutation share one transaction. */
export async function auditedUpdate<T extends ObjectLiteral>(repo:Repository<T>,id:string,patch:Partial<T>):Promise<void> {
 await repo.manager.transaction(async manager=>{
  const target=repo.target as EntityTarget<T>;
  const row=await manager.getRepository(target).createQueryBuilder('entity').where('entity.id = :id',{id}).setLock('pessimistic_write').getOne();
  if(!row)throw createError.notFound('Record not found');
  Object.assign(row,patch);
  await manager.save(target,row);
 });
}
