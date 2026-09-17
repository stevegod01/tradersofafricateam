export function periodStart(period: string | null, now = new Date()): Date | null {
    if (!period || period === 'lifetime')
        return null;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (period === 'week')
        start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    if (period === 'month')
        start.setUTCDate(1);
    return start;
}
export function checkedBalance(balance: number, points: number): number {
    const next = balance + points;
    if (!Number.isSafeInteger(next) || next < 0 || next > 2147483647)
        throw new Error('Reward balance would be out of range');
    return next;
}
export function normalizeReferralCode(code: string): string { return code.trim().toUpperCase(); }
export const rewardPermissions = ['referrals.view', 'referrals.manage', 'referrals.analytics.view', 'rewards.view', 'rewards.adjust', 'rewards.rules.view', 'rewards.rules.manage'];
