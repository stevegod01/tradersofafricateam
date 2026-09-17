import { z } from 'zod';
const currency = z.string().regex(/^[A-Z]{3}$/);
export const reasonSchema = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();
export const accountSchema = z.object({
  accountType: z.literal('bank').default('bank'), accountName: z.string().trim().min(2).max(160), accountNumber: z.string().regex(/^[A-Za-z0-9]{6,34}$/), bankCode: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(), bankName: z.string().trim().min(2).max(160), country: z.string().regex(/^[A-Z]{2}$/), currency, isDefault: z.boolean().default(false)
}).strict();
export const accountUpdateSchema = accountSchema.omit({ isDefault: true }).partial().extend({ status: z.enum(['inactive']).optional() }).strict().refine(v => Object.keys(v).length > 0, 'At least one field is required');
export const accountVerifySchema = reasonSchema.extend({ status: z.enum(['verified', 'invalid']), version: z.number().int().positive() });
export const adjustmentSchema = reasonSchema.extend({
  adjustmentType: z.enum(['manual_credit', 'manual_debit']), amount: z.string().regex(/^(0|[1-9]\d{0,15})\.\d{2}$/).refine(v => v !== '0.00'), currency, idempotencyKey: z.string().uuid()
});
export const confirmSchema = z.object({ reference: z.string().trim().regex(/^[A-Za-z0-9_:/.-]{6,160}$/), notes: z.string().trim().min(5).max(1000) }).strict();
export const listSchema = z.object({
  status: z.string().regex(/^[a-z_]{1,30}$/).optional(), sellerId: z.string().uuid().optional(), orderId: z.string().uuid().optional(), sellerOrderId: z.string().uuid().optional(), currency: currency.optional(), search: z.string().trim().max(80).optional(), dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional(), eligibleFrom: z.coerce.date().optional(), eligibleTo: z.coerce.date().optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20)
}).strict();
export const idSchema = z.string().uuid();
