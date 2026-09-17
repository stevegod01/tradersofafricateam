function integer(name:string,fallback:number,min:number,max:number):number {
 const value=Number(process.env[name] ?? fallback);
 if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer between ${min} and ${max}`);
 return value;
}
export const auditConfig={
 exportMaxRows:integer('AUDIT_EXPORT_MAX_ROWS',10000,1,100000),
 exportTtlHours:integer('AUDIT_EXPORT_TTL_HOURS',24,1,168),
 // Zero retains indefinitely. These are archive eligibility policies, never automatic deletion.
 retentionDays:integer('AUDIT_LOG_RETENTION_DAYS',0,0,36500),
 financialRetentionDays:integer('AUDIT_FINANCIAL_RETENTION_DAYS',0,0,36500),
 securityRetentionDays:integer('AUDIT_SECURITY_RETENTION_DAYS',0,0,36500),
};
