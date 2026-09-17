import { FastifySchema } from 'fastify';
import { cancellationReasons, returnReasons, returnStatuses, refundStatuses } from './after-sales.policy';
export const uuid = { type: 'string', format: 'uuid' };
const text = (maxLength = 4000) => ({
  type: 'string', minLength: 1, maxLength
});
export const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object', additionalProperties: false, properties, required
});
const money = { anyOf: [{ type: 'string', pattern: '^[0-9]{1,16}(\\.[0-9]{1,2})?$' }, {
      type: 'number', minimum: 0, maximum: 90071992547409, multipleOf: 0.01
    }], description: 'Original buyer payment currency. Decimal strings are recommended.' };
export const cancellationBody = (actor: 'buyer' | 'seller' | 'admin') => object({ reason: { type: 'string', enum: cancellationReasons[actor] }, description: text() }, ['reason']);
export const reviewBody = object({ decision: { type: 'string', enum: ['approve', 'reject'] }, notes: text() }, ['decision', 'notes']);
export const adminReturnReviewBody = object({
  decision: { type: 'string', enum: ['approve', 'reject'] }, notes: text(), refundRequired: { type: 'boolean', description: 'Admin-authorized replacement or other non-refund resolution; default true.' }
}, ['decision', 'notes']);
export const returnBody = object({
  sellerOrderId: uuid, reason: { type: 'string', enum: returnReasons }, description: text(),
  items: {
    type: 'array', minItems: 1, maxItems: 100, items: object({
      orderItemId: uuid, quantity: { anyOf: [{
            type: 'number', exclusiveMinimum: 0, maximum: 9007199254740, multipleOf: 0.001
          }, { type: 'string', pattern: '^[0-9]{1,15}(\\.[0-9]{1,3})?$' }] }, reason: { type: 'string', enum: returnReasons }
    }, ['orderItemId', 'quantity'])
  },
  evidence: {
    type: 'array', maxItems: 10, uniqueItems: true, items: uuid, default: []
  },
}, ['sellerOrderId', 'reason', 'description', 'items']);
export const shipmentBody = object({
  providerName: text(160), trackingId: text(160), trackingUrl: { anyOf: [{
        type: 'string', maxLength: 1000, pattern: '^https://[^\\s]+$'
      }, { type: 'null' }] }, deliveryContact: text(160), notes: text()
}, ['providerName', 'trackingId']);
export const refundBody = object({
  sellerOrderId: uuid, sourceType: { type: 'string', enum: ['cancellation', 'return', 'dispute', 'payment_adjustment', 'admin'] }, cancellationId: uuid, returnId: uuid, disputeId: uuid,
  refundType: { type: 'string', enum: ['full', 'partial'] }, amount: money, reason: text(),
  breakdown: object({
    productAmount: money, logisticsAmount: money, otherAmount: money
  }, ['productAmount', 'logisticsAmount', 'otherAmount']),
}, ['sellerOrderId', 'sourceType', 'refundType', 'reason']);
export const confirmBody = object({ reference: text(160), notes: text() }, ['reference', 'notes']);
export const notesBody = object({ notes: text() }, ['notes']);
export const settingsBody = object({
  returnWindowDays: {
    type: 'integer', minimum: 1, maximum: 365
  }, allowChangedMind: { type: 'boolean' }, refundLogisticsOnCancellation: { type: 'boolean' }, reverseTransactionFee: { type: 'boolean' }, nonReturnableProductIds: {
    type: 'array', maxItems: 10000, uniqueItems: true, items: uuid
  }
});
export const queryFor = (kind: string) => object({
  page: {
    type: 'integer', minimum: 1, maximum: 100000, default: 1
  }, limit: {
    type: 'integer', minimum: 1, maximum: 100, default: 20
  },
  status: { type: 'string', enum: kind === 'refunds' ? refundStatuses : kind === 'returns' ? returnStatuses : ['pending', 'approved', 'rejected', 'completed'] },
  orderId: uuid, sellerOrderId: uuid, paymentId: uuid, currency: { type: 'string', pattern: '^[A-Z]{3}$' },
  search: text(120), sourceType: { type: 'string', enum: ['cancellation', 'return', 'dispute', 'payment_adjustment', 'admin'] }, refundType: { type: 'string', enum: ['full', 'partial'] }, dateFrom: { type: 'string', format: 'date-time' }, dateTo: { type: 'string', format: 'date-time' },
});
const timestamp = { type: ['string', 'null'], format: 'date-time' };
const recordBase = {
  id: uuid, orderId: uuid, sellerOrderId: uuid, createdAt: timestamp, updatedAt: timestamp
};
export const RefundRecordSchema = {
  type: 'object', additionalProperties: true, properties: {
    ...recordBase, refundNumber: { type: 'string', example: 'REF-2026-93C69167A8B743F0A204851E' }, paymentId: uuid,
    sourceType: { type: 'string', enum: ['cancellation', 'return', 'dispute', 'payment_adjustment', 'admin'] },
    refundType: { type: 'string', enum: ['full', 'partial'] }, amount: { type: 'string', example: '200000.00' }, currency: { type: 'string', example: 'NGN' },
    status: { type: 'string', enum: refundStatuses }, reason: { type: 'string' }, completedAt: timestamp,
    breakdown: { type: 'object', properties: {
        productAmount: { type: 'string' }, logisticsAmount: { type: 'string' }, otherAmount: { type: 'string' }, totalRefundAmount: { type: 'string' }
      } },
  }
};
export const ReturnRecordSchema = {
  type: 'object', additionalProperties: true, properties: {
    ...recordBase, returnNumber: { type: 'string' }, reason: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: returnStatuses },
    refundId: { type: ['string', 'null'] }, approvedAt: timestamp, receivedAt: timestamp,
    returnProviderName: { type: ['string', 'null'] }, returnTrackingId: { type: ['string', 'null'] }, returnTrackingUrl: { type: ['string', 'null'] },
  }
};
export const CancellationRecordSchema = {
  type: 'object', additionalProperties: true, properties: {
    ...recordBase, cancellationNumber: { type: 'string' }, requestedByType: { type: 'string', enum: ['buyer', 'seller', 'admin'] }, reason: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'completed'] }, refundRequired: { type: 'boolean' }, refundId: { type: ['string', 'null'] }, cancelledAt: timestamp,
  }
};
const errorResponse = {
  type: 'object', additionalProperties: true, properties: {
    success: { type: 'boolean' }, message: { type: 'string' }, code: { type: 'string' }
  }
};
export function schema(summary: string, path: string, body?: unknown, querystring?: unknown, permission?: string): FastifySchema {
  const names = path.split('/').filter(p => p.startsWith(':')).map(p => p.slice(1));
  const record = path.includes('refunds') ? RefundRecordSchema : path.includes('cancellation') ? CancellationRecordSchema : path.includes('returns') && !path.includes('settings') && !path.includes('evidence-uploads') ? ReturnRecordSchema : { type: 'object', additionalProperties: true };
  const success = {
    type: 'object', additionalProperties: true, properties: {
      success: { type: 'boolean' }, message: { type: 'string' }, data: { anyOf: [record, { type: 'array', items: record }] }, pagination: { type: 'object', properties: {
          page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' }
        } }
    }
  };
  return {
    tags: ['Cancellation, Returns & Refunds'], summary,
    description: `${permission ? `Required permission: ${permission}. ` : ''}sellerOrderId and orderId refer to the existing seller-scoped orders.id. Monetary responses use exact decimal strings. Original order/payment/FX values are preserved. Refund success requires financial confirmation.`,
    security: [{ bearerAuth: [] }], ...(names.length ? { params: object(Object.fromEntries(names.map(n => [n, uuid])), names) } : {}),
    ...(body ? { body } : {}), ...(querystring ? { querystring } : {}),
    response: {
      200: success, 201: success, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse
    },
  };
}
