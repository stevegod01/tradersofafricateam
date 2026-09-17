function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

const MYSQL_ERROR_NUMBERS = new Set([1054, 1062, 1146, 1265, 1364, 1366, 1406]);

export function databaseErrorCode(error: unknown): string | undefined {
  const record = asRecord(error);
  const driverError = asRecord(record?.driverError);

  return (
    stringValue(driverError?.code) ??
    stringValue(driverError?.errno) ??
    stringValue(record?.code) ??
    stringValue(record?.errno)
  );
}

export function databaseErrorNumber(error: unknown): number | undefined {
  const record = asRecord(error);
  const driverError = asRecord(record?.driverError);

  return numberValue(driverError?.errno) ?? numberValue(record?.errno);
}

export function databaseErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const record = asRecord(error);
  return stringValue(record?.message) ?? '';
}

export function isDatabaseQueryError(error: unknown): boolean {
  const code = databaseErrorCode(error);
  const errno = databaseErrorNumber(error);
  return (
    (error instanceof Error && error.name === 'QueryFailedError') ||
    Boolean(code?.startsWith('ER_')) ||
    code === 'WARN_DATA_TRUNCATED' ||
    (typeof errno === 'number' && MYSQL_ERROR_NUMBERS.has(errno))
  );
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    databaseErrorCode(error) === 'ER_DUP_ENTRY' ||
    databaseErrorNumber(error) === 1062
  );
}

export function isDuplicateKeyFor(error: unknown, keyFragment: string): boolean {
  return (
    isDuplicateKeyError(error) &&
    databaseErrorMessage(error).toLowerCase().includes(keyFragment.toLowerCase())
  );
}

export function isDatabaseSchemaError(error: unknown): boolean {
  const code = databaseErrorCode(error);
  const errno = databaseErrorNumber(error);
  return (
    code === 'ER_BAD_FIELD_ERROR' ||
    code === 'ER_NO_SUCH_TABLE' ||
    code === 'ER_NO_DEFAULT_FOR_FIELD' ||
    code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' ||
    code === 'WARN_DATA_TRUNCATED' ||
    code === 'ER_DATA_TOO_LONG' ||
    errno === 1054 ||
    errno === 1146 ||
    errno === 1364 ||
    errno === 1366 ||
    errno === 1265 ||
    errno === 1406
  );
}
