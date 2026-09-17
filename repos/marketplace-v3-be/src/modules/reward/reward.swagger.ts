const uuid = { type: 'string', format: 'uuid' };
const date = { type: 'string', format: 'date-time' };
const integer = { type: 'integer' };
const string = { type: 'string' };
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties });
const referral = object({
    id: uuid, referrerId: uuid, referralCode: string, referredUser: object({ id: uuid, displayName: string }), status: { type: 'string', enum: ['pending', 'qualified', 'rewarded', 'invalid'] }, qualifiedAt: { ...date, nullable: true }, rewardedAt: { ...date, nullable: true }, createdAt: date
});
const transaction = object({
    id: uuid, userId: uuid, eventCode: string, transactionType: { type: 'string', enum: ['credit', 'debit'] }, points: {
        type: 'integer', minimum: 1, description: 'Absolute points; transactionType indicates the direction.'
    }, balanceBefore: integer, balanceAfter: integer, description: string, createdAt: date, sourceType: string, sourceId: uuid, createdBy: { ...uuid, nullable: true }
});
const rule = object({
    id: uuid, eventCode: string, name: string, description: { ...string, nullable: true }, points: integer, status: { type: 'string', enum: ['active', 'inactive'] }, maxPerUser: { ...integer, nullable: true }, maxPerPeriod: { ...integer, nullable: true }, periodType: { ...string, nullable: true }, createdBy: { ...uuid, nullable: true }, createdAt: date, updatedAt: date
});
const policy = object({
    referralQualificationEvent: { type: 'string', enum: ['email_verified', 'company_verified', 'first_successful_trade'] }, tradeRewardBeneficiary: { type: 'string', enum: ['buyer', 'seller', 'both'] }, reverseTradeRewardsOnRefund: { type: 'boolean' }
});
const array = (items: unknown) => ({ type: 'array', items });
export function rewardResponse(summary: string) {
    const data: Record<string, unknown> = {
        'Get my referral code and statistics': object({
            referralCode: { ...string, example: 'VIC83AF2' }, referralLink: {
                type: 'string', format: 'uri', example: 'https://marketplace.example/signup?ref=VIC83AF2'
            }, statistics: object({
                totalReferrals: integer, pending: integer, qualified: integer, rewarded: integer, invalid: integer
            })
        }),
        'Get my referrals': array(referral), 'List referrals': array(referral),
        'Get reward balance': object({ totalPoints: integer }),
        'Get reward history': array(transaction), 'List reward transactions': array(transaction),
        'Adjust reward points': object({
            userId: uuid, points: integer, transactionType: { type: 'string', enum: ['credit', 'debit'] }, newBalance: integer
        }),
        'List reward rules': array(rule), 'Create reward rule': rule, 'Update reward rule': rule,
        'Get referral and trade reward policy': policy, 'Update referral and trade reward policy': policy,
        'Invalidate referral and reverse its reward': { type: 'object', additionalProperties: true },
        'Correct pending referral attribution': { type: 'object', additionalProperties: true },
        'Retry referral qualification': { type: 'object', additionalProperties: true },
        'Get referral analytics': object({
            totalReferrals: integer, pendingReferrals: integer, qualifiedReferrals: { ...integer, description: 'Includes rewarded referrals.' }, rewardedReferrals: integer, invalidReferrals: integer, totalReferralPointsIssued: { ...integer, description: 'Gross referral credits, before reversals.' }
        }),
        'Reconcile reward balances': array(object({
            userId: uuid, totalPoints: integer, ledgerBalance: { type: 'string', description: 'Database SUM value represented as a string.' }
        })),
    };
    return {
        type: 'object', properties: {
            success: { type: 'boolean' }, message: string, data: data[summary] ?? { type: 'object', additionalProperties: true }, pagination: object({ page: integer, limit: integer, total: integer, totalPages: integer }), page: integer, limit: integer
        }
    };
}
