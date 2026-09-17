export enum ShipmentStatus {
  PENDING = 'pending',
  SHIPMENT_CREATED = 'shipment_created',
  AWAITING_PICKUP = 'awaiting_pickup',
  PICKED_UP = 'picked_up',
  IN_TRANSIT = 'in_transit',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  DELIVERY_FAILED = 'delivery_failed',
  CANCELLED = 'cancelled',
}
