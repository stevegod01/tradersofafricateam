import { FastifySchema } from 'fastify';
import { z } from 'zod';
/** Convert only the Zod types used by this module; runtime Zod parsing remains authoritative. */
export function requestSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodEffects)
    return requestSchema(schema.innerType());
  if (schema instanceof z.ZodOptional)
    return requestSchema(schema.unwrap());
  if (schema instanceof z.ZodDefault)
    return { ...requestSchema(schema.removeDefault()), default: schema._def.defaultValue() };
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {}, required: string[] = [];
    for (const [key, value] of Object.entries(schema.shape) as [
      string,
      z.ZodTypeAny
    ][]) {
      properties[key] = requestSchema(value);
      if (!value.isOptional())
        required.push(key);
    }
    return { type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) };
  }
  if (schema instanceof z.ZodEnum)
    return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodLiteral)
    return { type: typeof schema.value, enum: [schema.value] };
  if (schema instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: 'string' };
    for (const check of schema._def.checks) {
      if (check.kind === 'min')
        out.minLength = check.value;
      if (check.kind === 'max')
        out.maxLength = check.value;
      if (check.kind === 'regex')
        out.pattern = check.regex.source;
      if (check.kind === 'uuid')
        out.format = 'uuid';
    }
    return out;
  }
  if (schema instanceof z.ZodNumber) {
    const out: Record<string, unknown> = { type: 'number' };
    for (const check of schema._def.checks) {
      if (check.kind === 'int')
        out.type = 'integer';
      if (check.kind === 'min')
        out.minimum = check.value;
      if (check.kind === 'max')
        out.maximum = check.value;
    }
    return out;
  }
  if (schema instanceof z.ZodBoolean)
    return { type: 'boolean' };
  if (schema instanceof z.ZodDate)
    return { type: 'string', format: 'date-time' };
  throw new Error('Unsupported settlement request schema');
}
export function settlementSwagger(summary: string, description: string, options: {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  param?: string;
} = {}): FastifySchema {
  return {
    tags: ['Seller settlements & payouts'], summary, description, security: [{ bearerAuth: [] }], ...(options.body ? { body: requestSchema(options.body) } : {}), ...(options.query ? { querystring: requestSchema(options.query) } : {}), ...(options.param ? { params: { type: 'object', required: [options.param], properties: { [options.param]: { type: 'string', format: 'uuid' } } } } : {}), response: {
      200: {
        description: 'Amounts are decimal strings in the recorded commercial currency. Bank details are masked except the audited processor destination endpoint.', type: 'object', properties: { success: { type: 'boolean' }, data: {}, pagination: { type: 'object', additionalProperties: true } }
      }, 400: { description: 'Invalid input', type: 'object', additionalProperties: true }, 401: { description: 'Authentication required', type: 'object', additionalProperties: true }, 403: { description: 'Permission or seller role required', type: 'object', additionalProperties: true }, 404: { description: 'Resource not found within requester scope', type: 'object', additionalProperties: true }, 409: { description: 'Financial state, approval, or reconciliation conflict', type: 'object', additionalProperties: true }
    }
  };
}
