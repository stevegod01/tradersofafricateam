export enum OrderSourceType {
  CART = 'cart',
  DIRECT_RFQ = 'direct_rfq',
  MARKET_RFQ = 'market_rfq',
}

export enum OrderStatus {
  PAID = 'paid',
  PROCESSING = 'processing',
  READY_FOR_SHIPMENT = 'ready_for_shipment',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  RECEIVED = 'received',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}
