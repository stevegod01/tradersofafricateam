'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_URL: 'http://127.0.0.1:3000/api',
  FRONTEND_URL: 'http://127.0.0.1:5173',
  CORS_ORIGINS: 'http://localhost:3001,http://localhost:5173',
  DB_HOST: '127.0.0.1',
  DB_USERNAME: 'test',
  DB_PASSWORD: 'test',
  DB_NAME: 'test',
  DB_SSL: 'true',
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough',
  EMAIL_DELIVERY_ENABLED: 'false',
  SWAGGER_ENABLED: 'true',
  SWAGGER_REQUIRE_AUTH: 'true',
  SWAGGER_USERNAME: 'docs-user',
  SWAGGER_PASSWORD: 'docs-password',
  AZURE_STORAGE_ACCOUNT_NAME: 'teststorageaccount',
});

const fastifyPath = require.resolve('fastify');
const Fastify = require(fastifyPath);
const registered = [];
require.cache[fastifyPath].exports = (...args) => {
  const app = Fastify(...args);
  app.addHook('onRoute', route => registered.push(route));
  return app;
};
const { buildApp } = require('../dist/app');
const schemas = require('../dist/common/utils/swagger.schemas');
const { registerStreamingBodySchemas, documentedSchema } = require('../dist/common/utils/swagger-contracts');
const { errorHandler } = require('../dist/common/filters/error.handler');
const { createError } = require('../dist/common/utils/http-error.util');

function applicationRoutes() {
  return registered.filter(r => r.method !== 'HEAD' && r.method !== 'OPTIONS' && !r.url.startsWith('/api/docs'));
}

test('every application operation resolves from Swagger and has response and parameter documentation', async t => {
  const app = await buildApp();
  try {
    await app.ready();
    const docs = app.swagger();
    const basePath = new URL(docs.servers[0].url).pathname.replace(/\/$/, '');
    const operations = new Set();
    for (const route of applicationRoutes()) {
      assert.ok(route.url.startsWith(`${basePath}/`), `Route outside Swagger base URL: ${route.method} ${route.url}`);
      const url = route.url.slice(basePath.length).replace(/:([^/]+)/g, '{$1}').replace('*', '{*}');
      for (const method of [route.method].flat()) {
        const operation = docs.paths[url]?.[method.toLowerCase()];
        assert.ok(operation, `Missing documentation: ${method} ${route.url}`);
        assert.ok(Object.keys(route.schema?.response ?? {}).some(code => /^2\d\d$/.test(code)), `Missing success response: ${method} ${route.url}`);
        assert.ok(operation.summary, `Missing summary: ${method} ${route.url}`);
        for (const match of url.matchAll(/\{([^}]+)\}/g)) {
          assert.ok(operation.parameters?.some(p => p.in === 'path' && p.name === match[1] && p.required), `Missing path parameter: ${method} ${route.url} ${match[1]}`);
        }
        const protectedRoute = [route.preHandler].flat().some(h => typeof h === 'function');
        if (protectedRoute) assert.ok(operation.security?.length, `Missing authentication documentation: ${method} ${route.url}`);
        for (const status of route.handler.toString().matchAll(/(?:status|code)\((\d+)\)/g)) {
          assert.ok(operation.responses[status[1]], `Missing status ${status[1]}: ${method} ${route.url}`);
        }
        operations.add(`${method.toLowerCase()} ${url}`);
      }
    }
    for (const [url, methods] of Object.entries(docs.paths)) {
      for (const method of Object.keys(methods)) assert.ok(operations.has(`${method} ${url}`), `Swagger has no registered route: ${method} ${url}`);
    }
    t.diagnostic(`${operations.size} application operations matched in both directions`);
    for (const url of ['/referrals/me', '/rewards/balance', '/saved-products', '/seller/payout-accounts']) {
      const response = await app.inject({ method: 'GET', url: `${basePath}${url}` });
      assert.equal(response.statusCode, 401, `${url} should reach authentication, not return 404`);
    }
    for (const route of applicationRoutes().filter(r => r.schema?.consumes?.includes('multipart/form-data'))) {
      assert.equal(route.schema.body, undefined, `Streaming request must not have a JSON body validator: ${route.url}`);
      const url = route.url.slice(basePath.length).replace(/:([^/]+)/g, '{$1}');
      assert.ok(docs.paths[url][route.method.toLowerCase()].requestBody?.content['multipart/form-data'], route.url);
    }
  } finally {
    await app.close();
  }
});

test('shared responses preserve service results, error details and safe own-account fields', async () => {
  const app = Fastify({ ajv: { customOptions: { strictSchema: false } } });
  const cases = [
    [schemas.DisableUserSchema, 200, { success: true, message: 'Disabled', data: { userId: 'user-id', status: 'disabled' } }],
    [schemas.ActivateUserSchema, 200, { success: true, message: 'Activated' }],
    [schemas.RefreshTokenSchema, 200, { token: 'access', accessToken: 'access', refreshToken: 'refresh' }],
    [schemas.AdminForgotPasswordSchema, 200, { success: true, message: 'Reset requested' }],
    [schemas.LoginSchema, 200, { accessToken: 'access', user: { id: 'user-id', companyBio: 'Exporter', companyLogo: null, termsOfUse: true, referralCode: 'CODE', totalAverageReviews: 4.5 } }],
    [schemas.GetMyProfileSchema, 200, { id: 'user-id', companyBio: 'Exporter', companyLogo: null, termsOfUse: true, referralCode: 'CODE', totalAverageReviews: 4.5 }],
  ];
  try {
    cases.forEach(([schema, status, payload], i) => app.get(`/response-${i}`, { schema: { response: schema.response } }, async (_, reply) => reply.code(status).send(payload)));
    app.setErrorHandler(errorHandler);
    app.get('/error', { schema: { response: schemas.LoginSchema.response } }, async () => { throw createError.conflict('Already exists', 'RESOURCE_ALREADY_EXISTS'); });
    app.post('/invalid', { schema: schemas.LoginSchema }, async () => ({ token: 'unused' }));
    app.get('/private-fields', { schema: schemas.GetMyProfileSchema }, async () => ({ id: 'user-id', passwordHash: 'secret', passwordResetToken: 'secret', refreshTokens: ['secret'] }));
    for (const [i, [, status, payload]] of cases.entries()) {
      const response = await app.inject(`/response-${i}`);
      assert.equal(response.statusCode, status);
      assert.deepEqual(response.json(), payload);
    }
    const error = await app.inject('/error');
    assert.equal(error.statusCode, 409);
    assert.deepEqual(error.json(), { success: false, statusCode: 409, error: 'Conflict', message: 'Already exists', code: 'RESOURCE_ALREADY_EXISTS' });
    const invalid = await app.inject({ method: 'POST', url: '/invalid', payload: {} });
    assert.equal(invalid.statusCode, 400);
    assert.ok(invalid.json().details.length > 0);
    assert.deepEqual((await app.inject('/private-fields')).json(), { id: 'user-id' });
  } finally { await app.close(); }
});

test('documented password aliases pass both Fastify and the handler validator', async () => {
  const app = Fastify({ ajv: { customOptions: { strictSchema: false } } });
  const validators = require('../dist/common/utils/validation.schemas');
  app.setErrorHandler(errorHandler);
  app.post('/reset', { schema: { body: schemas.ResetPasswordSchema.body } }, async req => validators.ResetPasswordSchema.parse(req.body));
  app.post('/change', { schema: { body: schemas.ChangePasswordSchema.body } }, async req => validators.ChangePasswordSchema.parse(req.body));
  try {
    for (const payload of [{ otp: '123456', password: 'NewStr0ng@Pass!' }, { token: 'reset-token', password: 'NewStr0ng@Pass!' }]) {
      assert.equal((await app.inject({ method: 'POST', url: '/reset', payload })).statusCode, 200);
    }
    for (const field of ['oldPassword', 'currentPassword']) {
      assert.equal((await app.inject({ method: 'POST', url: '/change', payload: { [field]: 'old-secret', newPassword: 'NewStr0ng@Pass!' } })).statusCode, 200);
    }
    assert.equal((await app.inject({ method: 'POST', url: '/reset', payload: { password: 'NewStr0ng@Pass!' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/change', payload: { newPassword: 'NewStr0ng@Pass!' } })).statusCode, 400);
  } finally { await app.close(); }
});

test('multipart upload consumes the file stream while Swagger retains its file input', async () => {
  const app = Fastify({ ajv: { customOptions: { strictSchema: false } } });
  registerStreamingBodySchemas(app);
  await app.register(require('@fastify/multipart'));
  await app.register(require('@fastify/swagger'), { openapi: { info: { title: 'Test', version: '1' }, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } }, transform: ({ schema, url }) => ({ schema: documentedSchema(schema), url }) });
  app.post('/upload', { schema: schemas.UploadMediaSwaggerSchema }, async req => {
    const fields = {};
    for await (const part of req.parts()) {
      if (part.type === 'file') fields.file = (await part.toBuffer()).toString();
      else fields[part.fieldname] = part.value;
    }
    return { success: true, data: fields };
  });
  try {
    const response = await app.inject({ method: 'POST', url: '/upload', headers: { 'content-type': 'multipart/form-data; boundary=test-boundary' }, payload: '--test-boundary\r\nContent-Disposition: form-data; name="purpose"\r\n\r\ngeneral\r\n--test-boundary\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nfile contents\r\n--test-boundary--\r\n' });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { success: true, data: { purpose: 'general', file: 'file contents' } });
    assert.equal(app.swagger().paths['/upload'].post.requestBody.content['multipart/form-data'].schema.properties.file.format, 'binary');
  } finally { await app.close(); }
});

test('imported request schemas document handler fields and required inputs', t => {
  const { importedRequestContracts } = require('./helpers/swagger-contracts.cjs');
  const contracts = importedRequestContracts(path.resolve(__dirname, '..'));
  const differences = [];
  // These fields are deliberately unavailable or are consumed outside the Zod parser.
  const allowedMissing = {
    UpdateRewardSettingsSwaggerSchema: ['productReviewPoints', 'sellerReviewPoints'], // service rejects legacy base-point configuration
    GetPublicCategoriesSchema: ['status'], // public service forces active categories
  };
  const allowedExtra = {
    GetOrdersSchema: ['lang'], GetAdminOrdersSchema: ['lang'], GetSubscriptionHistorySwaggerSchema: ['lang'], // I18nService reads the original request
    SellerAnalyticsProductsSwaggerSchema: ['lang'], BuyerAnalyticsSpendingSwaggerSchema: ['lang'], AdminAnalyticsProductsSwaggerSchema: ['lang'], AdminAnalyticsCategoriesSwaggerSchema: ['lang'], // I18nService reads the original request
  };
  // A oneOf/anyOf alternative documents its own object shape (e.g. a bare-uuid
  // shorthand alongside the full object); check nested fields against whichever
  // alternative actually declares them instead of the union wrapper.
  function objectAlternatives(schema) {
    if (!schema) return [];
    if (schema.properties || schema.required) return [schema];
    return [...(schema.oneOf ?? []), ...(schema.anyOf ?? [])].flatMap(objectAlternatives);
  }
  function inspectNested(validator, schema, location, depth = 0) {
    if (!schema) return;
    const def = validator._def;
    if (['ZodOptional', 'ZodNullable', 'ZodDefault'].includes(def.typeName)) return inspectNested(def.innerType, schema, location, depth);
    if (def.typeName === 'ZodEffects') return inspectNested(def.schema, schema, location, depth);
    if (def.typeName === 'ZodPipeline') return inspectNested(def.in, schema, location, depth);
    if (def.typeName === 'ZodObject') {
      const alternatives = objectAlternatives(schema);
      for (const [key, value] of Object.entries(validator.shape)) {
        const alternative = alternatives.find(a => a.properties?.[key]);
        if (depth > 0) {
          if (!alternative) differences.push(`${location}.${key} missing nested field`);
          if (!value.isOptional() && !alternatives.some(a => a.required?.includes(key))) differences.push(`${location}.${key} missing required nested field`);
        }
        inspectNested(value, alternative?.properties?.[key], `${location}.${key}`, depth + 1);
      }
    }
    if (def.typeName === 'ZodArray') inspectNested(def.type, schema.items, `${location}[]`, depth + 1);
  }
  for (const { schemaName, schema, validator, section } of contracts) {
    inspectNested(validator, schema, `${schemaName}.${section}`);
    const shape = validator.shape || validator._def?.schema?.shape;
    if (!shape) continue;
    assert.ok(schema, `${schemaName}.${section} is missing`);
    const runtimeKeys = Object.keys(shape), docsKeys = Object.keys(schema.properties ?? {});
    const required = runtimeKeys.filter(k => !shape[k].isOptional());
    for (const key of runtimeKeys) if (!docsKeys.includes(key) && !allowedMissing[schemaName]?.includes(key)) differences.push(`${schemaName}.${section} missing ${key}`);
    for (const key of docsKeys) if (!runtimeKeys.includes(key) && !allowedExtra[schemaName]?.includes(key)) differences.push(`${schemaName}.${section} unsupported ${key}`);
    for (const key of required) if (!schema.required?.includes(key)) differences.push(`${schemaName}.${section} missing required ${key}`);
    for (const key of schema.required ?? []) if (!required.includes(key)) differences.push(`${schemaName}.${section} incorrectly requires ${key}`);
  }
  assert.deepEqual(differences, []);
  assert.ok(contracts.length > 150);
  t.diagnostic(`${contracts.length} imported body/query/parameter validator bindings checked`);
});
