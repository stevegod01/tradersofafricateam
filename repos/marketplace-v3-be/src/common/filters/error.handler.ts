import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config';
import { HttpError } from '../utils/http-error.util';
import {
  databaseErrorCode,
  databaseErrorNumber,
  isDatabaseQueryError,
  isDatabaseSchemaError,
  isDuplicateKeyError,
} from '../utils/database-error.util';

export function errorHandler(
  error: FastifyError | HttpError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // Our custom HttpError (from services / utilities)
  if (error instanceof HttpError) {
    reply.status(error.statusCode).send({
      success: false,
      statusCode: error.statusCode,
      error: httpStatusText(error.statusCode),
      ...(error.code ? { code: error.code } : {}),
      message: error.message,
    });
    return;
  }

  const fastifyError = error as FastifyError;
  const statusCode = fastifyError.statusCode || 500;

  if (isDatabaseQueryError(error)) {
    console.error('[ErrorHandler] Database query failed', {
      url: request.url,
      method: request.method,
      code: databaseErrorCode(error),
      errno: databaseErrorNumber(error),
      error: config.isDev ? error.message : undefined,
      stack: config.isDev ? error.stack : undefined,
    });

    if (isDuplicateKeyError(error)) {
      reply.status(409).send({
        success: false,
        statusCode: 409,
        error: 'Conflict',
        code: 'RESOURCE_ALREADY_EXISTS',
        message: 'A resource with the same unique value already exists.',
      });
      return;
    }

    reply.status(500).send({
      success: false,
      statusCode: 500,
      error: 'Internal Server Error',
      code: isDatabaseSchemaError(error)
        ? 'DATABASE_SCHEMA_MISMATCH'
        : 'DATABASE_OPERATION_FAILED',
      message: 'A database operation failed. Please try again later.',
    });
    return;
  }

  // Log all 5xx errors
  if (statusCode >= 500) {
    console.error('[ErrorHandler]', {
      url: request.url,
      method: request.method,
      error: config.isDev ? error.message : undefined,
      stack: config.isDev ? error.stack : undefined,
    });
  }

  // Fastify schema validation errors
  if (fastifyError.validation) {
    reply.status(400).send({
      statusCode: 400,
      error: 'Validation Error',
      message: 'Request validation failed',
      details: fastifyError.validation,
    });
    return;
  }

  // Zod errors bubble up as plain Error with a JSON message
  if (error.name === 'ZodError') {
    reply.status(400).send({
      statusCode: 400,
      error: 'Validation Error',
      message: 'Request validation failed',
      details: JSON.parse(error.message),
    });
    return;
  }

  // JWT errors from @fastify/jwt
  if (
    fastifyError.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED' ||
    fastifyError.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER'
  ) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
    return;
  }

  reply.status(statusCode).send({
    success: false,
    statusCode,
    error:
      config.isProd && statusCode >= 500
        ? 'Internal Server Error'
        : fastifyError.name || 'Internal Server Error',
    message:
      config.isProd && statusCode >= 500
        ? 'An unexpected error occurred'
        : error.message,
    ...(config.isDev && statusCode >= 500 ? { stack: error.stack } : {}),
  });
}

function httpStatusText(code: number): string {
  const map: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
  };
  return map[code] || 'Error';
}
