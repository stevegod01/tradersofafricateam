import { AppDataSource } from '../../database/data-source';
import { AnalyticsReport, AnalyticsReportStatus } from '../../database/entities/analytics-report.entity';
import { createError } from '../../common/utils/http-error.util';
import { listSchema } from './settlement.schemas';
import { SettlementService } from './settlement.service';
export const financialReportTypes = ['seller_settlements', 'seller_payouts', 'admin_settlements', 'admin_payouts'];
export function financialReportPermission(type: string) { return type.endsWith('_payouts') ? 'payouts.view' : 'settlements.view'; }
export function csvCell(value: unknown): string { let s = value == null ? '' : value instanceof Date ? value.toISOString() : String(value); if (/^[\s]*[=+@-]/.test(s))
  s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
/** Reuses AnalyticsReport ownership/status/expiry. Content is a durable CSV snapshot, never a public URL. */
export async function generateFinancialReport(report: AnalyticsReport) {
  const query = listSchema.parse(report.filters), payout = report.reportType.endsWith('_payouts');
  const sellerId = report.requestedByType === 'user' ? report.requestedBy : undefined;
  const columns = payout ? [
    'id', 'payoutNumber', 'settlementId', 'sellerId', 'amount', 'currency', 'status', 'method', 'providerReference', 'approvedAt', 'processingAt', 'completedAt'
  ] : [
    'id', 'settlementNumber', 'sellerOrderId', 'sellerId', 'grossProductAmount', 'logisticsAmount', 'transactionFeeAmount', 'refundAmount', 'adjustmentAmount', 'netSettlementAmount', 'settlementCurrency', 'status', 'eligibleAt'
  ];
  const lines = [columns.map(csvCell).join(',')];
  try {
    const result = await new SettlementService().list(payout ? 'payout' : 'settlement', { ...query, page: 1, limit: 10001 }, sellerId);
    if (result.data.length > 10000)
      throw createError.badRequest('Limit export to 10,000 rows using date or seller filters');
    for (const row of result.data)
      lines.push(columns.map(c => csvCell((row as unknown as Record<string, unknown>)[c])).join(','));
    await AppDataSource.transaction(async (m) => {
      await m.query('INSERT INTO analytics_report_contents(reportId,content) VALUES(?,?)', [report.id, lines.join('\r\n') + '\r\n']);
      await m.update(AnalyticsReport, report.id, { status: AnalyticsReportStatus.COMPLETED, fileUrl: `/reports/${report.id}/download`, completedAt: new Date() });
    });
  }
  catch {
    await AppDataSource.manager.update(AnalyticsReport, report.id, {
      status: AnalyticsReportStatus.FAILED, errorMessage: 'Financial export failed. Narrow the filters and request another export.'
    });
  }
}
export async function downloadFinancialReport(requesterType: 'admin' | 'user', requesterId: string, id: string) {
  const report = await AppDataSource.manager.findOneBy(AnalyticsReport, { id, requestedByType: requesterType, requestedBy: requesterId });
  if (!report || !financialReportTypes.includes(report.reportType))
    throw createError.notFound('Report not found');
  if (report.status !== 'completed' || !report.expiresAt || report.expiresAt <= new Date())
    throw createError.conflict('Report is not available or has expired');
  const rows = await AppDataSource.manager.query('SELECT content FROM analytics_report_contents WHERE reportId=?', [id]);
  if (!rows.length)
    throw createError.notFound('Report content unavailable');
  return { report, content: rows[0].content as string };
}
