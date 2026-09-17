import { randomUUID } from 'crypto';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { SellerPayoutAccount as Account } from '../../database/entities/settlement.entities';
import { User } from '../../database/entities/user.entity';
import { createError } from '../../common/utils/http-error.util';
import { requireActiveCurrency, requireActiveCountry } from '../system-settings/settings.reader';
import { writeAudit } from '../audit-log/audit-log.writer';
import { accountSchema, accountUpdateSchema, accountVerifySchema } from './settlement.schemas';
import { decryptAccount, encryptAccount, maskAccount } from './settlement.crypto';
export function publicAccount(a: Account): Record<string, unknown> { return {
  id: a.id, sellerId: a.sellerId, accountType: a.accountType, accountName: a.accountName, maskedAccountNumber: a.maskedAccountNumber, bankCode: a.bankCode, bankName: a.bankName, country: a.country, currency: a.currency, status: a.status, isDefault: a.isDefault, version: a.version, verifiedAt: a.verifiedAt, createdAt: a.createdAt, updatedAt: a.updatedAt
}; }
export class PayoutAccountService {
  async verificationDetails(id: string, adminId: string, reason: string) {
    return AppDataSource.transaction(async (m) => {
      const account = await m.createQueryBuilder(Account, 'a').addSelect('a.accountNumberEncrypted').where('a.id=:id', { id }).getOne();
      if (!account)
        throw createError.notFound('Payout account not found');
      const accountNumber = decryptAccount(account.accountNumberEncrypted, id, account.sellerId);
      await writeAudit(m, {
        eventCode: 'PAYOUT_ACCOUNT_VERIFICATION_DETAILS_ACCESSED', module: 'settlements', entityType: 'payout_account', entityId: id, actorType: 'admin', actorId: adminId, reason, metadata: { sellerId: account.sellerId, accountVersion: account.version }
      });
      return { success: true, data: { ...publicAccount(account), accountNumber } };
    });
  }
  async list(sellerId: string) { return {
    success: true, data: (await AppDataSource.manager.find(Account, { where: { sellerId }, order: { createdAt: 'DESC' } })).map(publicAccount)
  }; }
  async create(sellerId: string, dto: z.infer<typeof accountSchema>) {
    return AppDataSource.transaction(async (m) => {
      await m.findOneOrFail(User, { where: { id: sellerId }, lock: { mode: 'pessimistic_write' } });
      await requireActiveCurrency(dto.currency, m);
      await requireActiveCountry(dto.country, m);
      const id = randomUUID();
      if (dto.isDefault)
        await m.update(Account, { sellerId, currency: dto.currency }, { isDefault: false });
      const { accountNumber, ...fields } = dto;
      const a = await m.save(Account, m.create(Account, {
        ...fields, id, sellerId, accountNumberEncrypted: encryptAccount(accountNumber, id, sellerId), maskedAccountNumber: maskAccount(accountNumber), bankCode: dto.bankCode ?? null, providerRecipientId: null, status: 'pending', version: 1, verifiedAt: null, verifiedBy: null
      }));
      await writeAudit(m, {
        eventCode: 'PAYOUT_ACCOUNT_CREATED', module: 'settlements', entityType: 'payout_account', entityId: id, actorId: sellerId, actorType: 'user', metadata: { sellerId, currency: a.currency, status: a.status }
      });
      return { success: true, data: publicAccount(a) };
    });
  }
  async update(sellerId: string, id: string, dto: z.infer<typeof accountUpdateSchema>) {
    return AppDataSource.transaction(async (m) => {
      await m.findOneOrFail(User, { where: { id: sellerId }, lock: { mode: 'pessimistic_write' } });
      const a = await m.findOne(Account, { where: { id, sellerId }, lock: { mode: 'pessimistic_write' } });
      if (!a)
        throw createError.notFound('Payout account not found');
      if (dto.currency)
        await requireActiveCurrency(dto.currency, m);
      if (dto.country)
        await requireActiveCountry(dto.country, m);
      const { accountNumber, status, ...fields } = dto;
      Object.assign(a, fields, { status: status ?? 'pending', version: a.version + 1, verifiedBy: null, verifiedAt: null, providerRecipientId: null, isDefault: false });
      if (accountNumber) {
        a.accountNumberEncrypted = encryptAccount(accountNumber, id, sellerId);
        a.maskedAccountNumber = maskAccount(accountNumber);
      }
      await m.save(a);
      await writeAudit(m, {
        eventCode: 'PAYOUT_ACCOUNT_UPDATED', module: 'settlements', entityType: 'payout_account', entityId: id, actorId: sellerId, actorType: 'user', metadata: { sellerId, status: a.status, changedFields: Object.keys(dto) }
      });
      return { success: true, data: publicAccount(a) };
    });
  }
  async setDefault(sellerId: string, id: string) {
    return AppDataSource.transaction(async (m) => {
      await m.findOneOrFail(User, { where: { id: sellerId }, lock: { mode: 'pessimistic_write' } });
      const a = await m.findOneBy(Account, { id, sellerId });
      if (!a)
        throw createError.notFound('Payout account not found');
      if (a.status !== 'verified')
        throw createError.conflict('Only a verified account can be the default');
      await m.update(Account, { sellerId, currency: a.currency }, { isDefault: false });
      await m.update(Account, id, { isDefault: true });
      await writeAudit(m, {
        eventCode: 'PAYOUT_ACCOUNT_DEFAULT_CHANGED', module: 'settlements', entityType: 'payout_account', entityId: id, actorId: sellerId, actorType: 'user', metadata: { sellerId, currency: a.currency }
      });
      return { success: true, data: publicAccount({ ...a, isDefault: true }) };
    });
  }
  async verify(id: string, adminId: string, dto: z.infer<typeof accountVerifySchema>) {
    return AppDataSource.transaction(async (m) => {
      const initial = await m.findOneBy(Account, { id });
      if (!initial)
        throw createError.notFound('Payout account not found');
      await m.findOneOrFail(User, { where: { id: initial.sellerId }, lock: { mode: 'pessimistic_write' } });
      const a = await m.findOneOrFail(Account, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (a.version !== dto.version || a.status === 'inactive')
        throw createError.conflict('Account changed; verify the current account version');
      await requireActiveCurrency(a.currency, m);
      await requireActiveCountry(a.country, m);
      Object.assign(a, { status: dto.status, verifiedBy: adminId, verifiedAt: dto.status === 'verified' ? new Date() : null });
      if (dto.status !== 'verified')
        a.isDefault = false;
      await m.save(a);
      await writeAudit(m, {
        eventCode: 'PAYOUT_ACCOUNT_VERIFICATION_UPDATED', module: 'settlements', entityType: 'payout_account', entityId: id, actorType: 'admin', actorId: adminId, reason: dto.reason, metadata: { sellerId: a.sellerId, status: a.status }
      });
      return { success: true, data: publicAccount(a) };
    });
  }
}
