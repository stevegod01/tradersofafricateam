# Audit log management (Module 21)

The API now maintains a central, append-only `audit_logs` history alongside the existing module-specific histories. Run `npm run build` and `npm run migration:run` with the migration account before starting this version. Migration `1787520018000` creates the audit and export tables and seeds `audit_logs.view` and `audit_logs.export`. Assign these separately through existing admin roles; Super Admin retains access automatically.

## Admin API

All routes require an active admin JWT and the indicated permission. Swagger documents these under **Audit Logs** in the development `/docs` interface.

| Method and path | Permission | Result |
| --- | --- | --- |
| GET `/admin/audit-logs` | `audit_logs.view` | Filtered, paginated history, newest first |
| GET `/admin/audit-logs/:auditLogId` | `audit_logs.view` | Event details and safe before/after values |
| GET `/admin/audit-logs/entity/:entityType/:entityId` | `audit_logs.view` | Oldest-first entity history |
| GET `/admin/audit-logs/admin/:adminId` | `audit_logs.view` | Activity attributable to that admin |
| POST `/admin/audit-logs/export` | `audit_logs.export` | Durable export job, HTTP 202 |
| GET `/admin/audit-logs/exports/:reportId` | `audit_logs.export` | Owner-only job status |
| GET `/admin/audit-logs/exports/:reportId/download` | `audit_logs.export` | Owner-only, expiring CSV download |

List filters: `search`, `eventCode`, `actorId`, `actorType` (`user`, `admin`, `system`), `module`, `action`, `entityType`, `entityId`, `dateFrom`, `dateTo`, `page`, `limit`. Maximum page size is 100. Dates accept ISO dates or UTC timestamps; a date-only `dateTo` includes the entire day. Search treats `%` and `_` literally. Entity and admin history routes enforce their path scope even when conflicting query filters are supplied.

```json
{"format":"csv","filters":{"module":"payments","dateFrom":"2026-08-01","dateTo":"2026-08-31"}}
```

CSV is the supported export format for this implementation; XLSX/PDF are not advertised. Poll the status endpoint until `completed` or `failed`, then download using the same authenticated admin. A view-only administrator cannot export. Exports contain safe audit data, never the original business objects. Spreadsheet formula cells are neutralized. Downloads use `Cache-Control: no-store` and have no public storage URL.

## Integration and transaction guarantees

`AuditLogSubscriber` bridges inserted admin, payment, direct/market RFQ, subscription, review, dispute, after-sales, order-status and shipment-status records. It uses the source event ID as the central idempotency key. Source and central inserts use the same entity manager and participate in the same transaction. After-sales administrative mirror events are excluded to avoid mirroring the same outbox event twice. Delivery of notifications can fail independently after this commit.

Additional entity auditing covers users, admin state/roles/permission assignments, seller verification, products, categories, financial adjustments, delivery records, analytics reports/rebuilds, message reports and supported setting entities. User authentication outcomes and permission denials have explicit events. Delivery selections are recorded inside the selection transaction. Verified and rejected Paystack/refund webhook calls record safe gateway context; raw bodies and signatures are never copied.

`auditedUpdate` locks and loads the existing record and saves the mutation and central audit in one transaction. It is used by payment, user-authentication, admin, product, category and seller mutations that previously used standalone updates. A central audit-write failure rolls these mutations back. Existing transactional refund, cancellation and dispute resolution operations automatically include central audit writes. Existing specialized histories may also produce a contextual event in addition to an entity state event; these have separate durable identities.

For new code, use `writeAudit(manager, ...)` within the business transaction or the existing audited source event. Pass the transaction's manager, never the global manager from inside a transaction. Do not catch and discard audit-write errors. Do not bypass subscribers with raw SQL, `callListeners(false)`, repository bulk updates or external database writers: those require an explicit transactional audit insert. The subscriber cannot reconstruct full old values or IDs from arbitrary bulk criteria.

The writer stores only allowlisted scalar fields and bounded identifier lists. Changes to omitted content are represented by changed field names, not whole documents, message text, provider payloads or credentials. Reasons are bounded and obvious token assignments are redacted. Actor email is captured at event time; authenticated request context provides the request ID, actor, IP and bounded user agent. System events have no actor ID. Audit entries have no mutable timestamp or cascading relationships to business records.

## Operations, history and retention

Use a separate migration account. The runtime database account should have only `SELECT` and `INSERT` on `audit_logs`, with no `UPDATE`, `DELETE`, `DROP`, `ALTER` or `TRUNCATE` capability. MySQL grants are additive: broad database-level write grants must be replaced with appropriate per-table grants to enforce this. Other application tables, including `audit_exports`, still require their normal mutation grants. This migration does not create triggers or change database users. ORM updates/removes are blocked as an additional application safeguard; database administrators can still access the underlying table and must be controlled operationally.

No public audit create, edit or delete endpoints exist. Audit events remain after account deactivation or business-entity deletion. Export artifacts are separate transient records and are cleaned up after expiry.

Configuration:

- `AUDIT_EXPORT_MAX_ROWS`: 10,000 by default, maximum 100,000. Larger results fail explicitly; users must narrow filters. Results are never silently truncated.
- `AUDIT_EXPORT_TTL_HOURS`: 24 by default, maximum 168.
- `AUDIT_LOG_RETENTION_DAYS`, `AUDIT_FINANCIAL_RETENTION_DAYS`, `AUDIT_SECURITY_RETENTION_DAYS`: zero means indefinite retention. Nonzero values are archive policy settings for operators, not an automatic deletion schedule. Establish the applicable retention/hold policy before archiving; financial/security history may require longer retention.

The export worker polls durable jobs every five seconds, uses database row locks with skip-locked across replicas, and retries failures up to three times. A process crash releases its transaction so another worker can resume. Expired artifacts are deleted; central audit rows are never deleted by this worker. Monitor `AUDIT_EXPORT_FAILED`, `AUDIT_EXPORT_RETRY_FAILED` and `[AuditLog] Durable audit write failed` operational events.

After migration, `npm run audit:reconcile` reports missing central entries from existing dedicated histories without changing data. `npm run audit:backfill` explicitly copies missing events in bounded batches, using stable source IDs and original timestamps. It applies the same allowlist and exclusions as live ingestion; repeated runs do not duplicate events. Run reconciliation periodically and after backfill. Backfill can recover preserved source history, but cannot reconstruct events that were never recorded or that were already deleted; historical actor email is available only if still retained by the source account. Generic entity snapshots are intentionally not fabricated as past events.

This is audit infrastructure, separate from analytics and notification delivery. Existing report-generation and marketplace capabilities remain owned by their respective modules; this module records their actual persisted events and does not invent unsupported currency/country administration or new analytics jobs.

## Validation

- `npm run test:audit-log`: allowlisting, context isolation, CSV safety, validation, immutability, source integration and Swagger/auth routes.
- `npm run test:audit-log:mysql`: migration, rollback on injected audit failure, source transaction rollback, idempotency, history preservation, actual permissions and protected expiring exports.
- Existing `test:after-sales` and `test:after-sales:mysql` cover refund/return/cancellation regression behavior with central auditing enabled.

MySQL tests require `AFTER_SALES_TEST_SOCKET` pointing to an isolated `/tmp/tofa-after-sales-mysql-*` socket. They create and remove only their own uniquely named databases, and never load development/production credentials.
