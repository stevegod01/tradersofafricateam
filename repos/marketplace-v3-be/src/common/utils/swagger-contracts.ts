import { FastifyInstance, FastifySchema } from 'fastify';

// Streaming multipart handlers validate fields after consuming request.parts().
// Keeping a JSON body validator on these routes rejects the unparsed stream.
type StreamingSchema = FastifySchema & { 'x-streaming-body'?: unknown };

export function registerStreamingBodySchemas(app: FastifyInstance): void {
  app.addHook('onRoute', (route) => {
    const schema = route.schema as StreamingSchema | undefined;
    if (!schema?.consumes?.includes('multipart/form-data') || !schema.body) return;
    const { body, ...rest } = schema;
    route.schema = { ...rest, 'x-streaming-body': body } as StreamingSchema;
  });
}

export function documentedSchema(schema: FastifySchema): FastifySchema {
  const { 'x-streaming-body': body, ...rest } = schema as StreamingSchema;
  return body ? { ...rest, body } : rest;
}

export const BinaryDownloadResponse = {
  200: {
    description: 'File contents. Content-Type and Content-Disposition identify the file.',
    content: {
      'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
    },
  },
};

export const CsvDownloadResponse = {
  200: {
    description: 'CSV file contents',
    content: { 'text/csv': { schema: { type: 'string' } } },
  },
};
