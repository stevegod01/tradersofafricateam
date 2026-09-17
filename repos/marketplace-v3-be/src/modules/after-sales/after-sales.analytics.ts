import { decimal, units } from './after-sales.policy';
import { SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { Order } from '../../database/entities/order.entity';
import { Refund } from '../../database/entities/refunds.entity';
import { FinancialAdjustment } from '../../database/entities/financial-adjustments.entity';
import { ReturnRequest } from '../../database/entities/returns.entity';
import { OrderCancellationRequest } from '../../database/entities/order-cancellation-request.entity';
/** Uses the original order cohort and groups currency; never converts with today's FX. */
export async function afterSalesAnalytics(orders: SelectQueryBuilder<Order>) {
  const cohort = orders.clone().select('order.id').orderBy();
  const filter = (alias: string) => `${alias}.orderId IN (${cohort.getQuery()})`;
  const params = cohort.getParameters();
  const refunds = await AppDataSource.getRepository(Refund).createQueryBuilder('r')
    .select('r.currency', 'currency').addSelect('COUNT(*)', 'count').addSelect('COALESCE(SUM(r.amount), 0)', 'amount')
    .addSelect("COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.breakdown, '$.productAmount')) AS DECIMAL(18,2))), 0)", 'productAmount')
    .addSelect("COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.breakdown, '$.logisticsAmount')) AS DECIMAL(18,2))), 0)", 'logisticsAmount')
    .where(filter('r')).setParameters(params).andWhere("r.status = 'successful'").groupBy('r.currency').getRawMany();
  const orderCurrencyRefunds = await AppDataSource.getRepository(Refund).createQueryBuilder('r')
    .select("JSON_UNQUOTE(JSON_EXTRACT(r.financialSnapshot, '$.orderCurrency'))", 'currency')
    .addSelect("COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.financialSnapshot, '$.orderProductRefundAmount')) AS DECIMAL(18,2))), 0)", 'productAmount')
    .where(filter('r')).setParameters(params).andWhere("r.status = 'successful'").groupBy("JSON_UNQUOTE(JSON_EXTRACT(r.financialSnapshot, '$.orderCurrency'))").getRawMany();
  const feeReversals = await AppDataSource.getRepository(FinancialAdjustment).createQueryBuilder('a')
    .select('a.currency', 'currency').addSelect('COALESCE(SUM(a.amount), 0)', 'amount')
    .where(filter('a')).setParameters(params).andWhere("a.adjustmentType = 'transaction_fee_reversal'").groupBy('a.currency').getRawMany();
  const cancellations = await AppDataSource.getRepository(OrderCancellationRequest).createQueryBuilder('c')
    .select('c.requestedByType', 'requestedByType').addSelect('COUNT(*)', 'count')
    .where(filter('c')).setParameters(params).andWhere("c.status IN ('approved', 'completed')").groupBy('c.requestedByType').getRawMany();
  const returns = await AppDataSource.getRepository(ReturnRequest).createQueryBuilder('r')
    .select('r.status', 'status').addSelect('COUNT(*)', 'count').where(filter('r')).setParameters(params).groupBy('r.status').getRawMany();
  const orderCount = await orders.clone().getCount();
  const cancelledOrders = cancellations.reduce((sum, row) => sum + Number(row.count), 0);
  const returnedOrders = await AppDataSource.getRepository(ReturnRequest).createQueryBuilder('r').select('COUNT(DISTINCT r.orderId)', 'count')
    .where(filter('r')).setParameters(params).andWhere("r.status = 'completed'").getRawOne();
  const refundedOrders = await AppDataSource.getRepository(Refund).createQueryBuilder('r').select('COUNT(DISTINCT r.orderId)', 'count')
    .where(filter('r')).setParameters(params).andWhere("r.status = 'successful'").getRawOne();
  const gross = await orders.clone().select('order.orderCurrency', 'currency').addSelect('SUM(order.productsSubtotal)', 'grossGMV').orderBy().groupBy('order.orderCurrency').getRawMany();
  const gmv = gross.map(row => {
    const refunded = orderCurrencyRefunds.find(r => r.currency === row.currency)?.productAmount ?? '0.00';
    const net = units(row.grossGMV) - units(refunded);
    return {
      currency: row.currency, grossGMV: row.grossGMV, refundedProductAmount: refunded, netGMV: net >= 0n ? decimal(net) : `-${decimal(-net)}`
    };
  });
  const rate = (count: number) => orderCount ? Number((count / orderCount * 100).toFixed(2)) : 0;
  return {
    orderCount, cancellationRate: rate(cancelledOrders), finalizedReturnRate: rate(Number(returnedOrders?.count ?? 0)), refundRate: rate(Number(refundedOrders?.count ?? 0)), gmv, refunds, orderCurrencyRefunds, feeReversals, cancellations, returns, reportingBasis: 'Original order creation-date cohort; refunds include only successful money movement. Counts do not imply seller fault.'
  };
}
