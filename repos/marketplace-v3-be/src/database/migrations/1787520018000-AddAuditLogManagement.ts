import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddAuditLogManagement1787520018000 implements MigrationInterface {
 async up(q:QueryRunner):Promise<void> {
  await q.query(`CREATE TABLE audit_logs (
   id varchar(36) NOT NULL PRIMARY KEY, eventId varchar(160) NOT NULL, eventCode varchar(120) NOT NULL,
   actorId varchar(36) NULL, actorType enum('user','admin','system') NOT NULL, actorEmail varchar(255) NULL,
   module varchar(80) NOT NULL, action varchar(120) NOT NULL, entityType varchar(80) NULL, entityId varchar(36) NULL,
   description text NOT NULL, reason text NULL, oldValue json NULL, newValue json NULL, metadata json NULL,
   ipAddress varchar(64) NULL, userAgent text NULL, requestId varchar(128) NULL,
   createdAt timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
   UNIQUE KEY UQ_audit_event(eventId), KEY IDX_audit_entity(entityType,entityId,createdAt),
   KEY IDX_audit_actor(actorId,createdAt), KEY IDX_audit_module(module,createdAt),
   KEY IDX_audit_code(eventCode), KEY IDX_audit_actor_type(actorType), KEY IDX_audit_created(createdAt), KEY IDX_audit_request(requestId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await q.query(`CREATE TABLE audit_exports (id varchar(36) NOT NULL PRIMARY KEY, adminId varchar(36) NOT NULL, status varchar(20) NOT NULL DEFAULT 'processing', attempts int NOT NULL DEFAULT 0, filters json NOT NULL, content longtext NULL, error varchar(255) NULL, expiresAt timestamp NOT NULL, createdAt timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), KEY IDX_audit_export_admin(adminId), KEY IDX_audit_export_pending(status,createdAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  for(const action of ['view','export']) await q.query('INSERT IGNORE INTO permissions (id,code,name,description,module) VALUES (UUID(),?,?,?,?)',[`audit_logs.${action}`,`Audit logs ${action}`,`Audit logs ${action}`,'audit_logs']);
 }
 async down():Promise<void> { throw new Error('Audit history must be retained; use a reviewed forward migration.'); }
}
