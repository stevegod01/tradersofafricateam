/**
 * Standalone HTTP error helpers.
 *
 * Services receive a FastifyInstance so they CAN use fastify.httpErrors,
 * but these thin wrappers give us the same API without the instance,
 * which is useful in utility functions and makes testing easier.
 *
 * Fastify's error handler reads the `statusCode` property and uses it
 * as the HTTP response status automatically.
 */

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
    // Ensure instanceof checks work after transpilation
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const createError = {
  badRequest: (message: string, code?: string) => new HttpError(400, message, code),
  unauthorized: (message: string, code?: string) => new HttpError(401, message, code),
  forbidden: (message: string, code?: string) => new HttpError(403, message, code),
  notFound: (message: string, code?: string) => new HttpError(404, message, code),
  conflict: (message: string, code?: string) => new HttpError(409, message, code),
  tooManyRequests: (message: string, code?: string) => new HttpError(429, message, code),
  internal: (message: string, code?: string) => new HttpError(500, message, code),
  serviceUnavailable: (message: string, code?: string) => new HttpError(503, message, code),
};
