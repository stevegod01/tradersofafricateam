import { AppDataSource } from '../../database/data-source';
import { writeAudit } from './audit-log.writer';
export async function auditPaymentWebhook(gateway:string,suspicious=false):Promise<void> {
 // Tests and health-only startup may build routes without opening a database.
 if(!AppDataSource.isInitialized)return;
 await writeAudit(AppDataSource.manager,{eventCode:suspicious?'SUSPICIOUS_PAYMENT_WEBHOOK':'PAYMENT_WEBHOOK_RECEIVED',module:suspicious?'security':'payments',actorType:'system',metadata:{gateway}});
}
