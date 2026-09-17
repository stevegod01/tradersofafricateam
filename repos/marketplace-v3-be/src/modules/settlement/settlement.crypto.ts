import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createError } from '../../common/utils/http-error.util';
function keys(): Record<string, string> {
  try {
    const parsed = JSON.parse(process.env.PAYOUT_ENCRYPTION_KEYS || '{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
      throw new Error();
    return parsed;
  }
  catch {
    throw createError.internal('Payout encryption key configuration is invalid');
  }
}
function keyFor(id: string): Buffer {
  const value = keys()[id];
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw createError.internal('Payout encryption key is unavailable');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32)
    throw createError.internal('Payout encryption key is invalid');
  return key;
}
export function encryptAccount(number: string, accountId: string, sellerId: string): string {
  const kid = process.env.PAYOUT_ENCRYPTION_KEY_ID || '';
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(kid))
    throw createError.internal('Payout encryption must be configured');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', keyFor(kid), iv);
  cipher.setAAD(Buffer.from(`${sellerId}:${accountId}`));
  const data = Buffer.concat([cipher.update(number, 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, kid, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
}
export function decryptAccount(encrypted: string, accountId: string, sellerId: string): string {
  try {
    const e = JSON.parse(encrypted);
    if (e.v !== 1)
      throw new Error();
    const iv = Buffer.from(e.iv, 'base64'), tag = Buffer.from(e.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16)
      throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', keyFor(e.kid), iv);
    cipher.setAAD(Buffer.from(`${sellerId}:${accountId}`));
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(Buffer.from(e.data, 'base64')), cipher.final()]).toString('utf8');
  }
  catch {
    throw createError.internal('Payout account could not be decrypted');
  }
}
export const maskAccount = (number: string) => '*'.repeat(Math.max(6, number.length - 4)) + number.slice(-4);
