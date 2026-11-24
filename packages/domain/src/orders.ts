export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'AWAITING_DISPATCH',
  'DISPATCHED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'DISPUTED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['AWAITING_DISPATCH', 'REFUND_PENDING', 'CANCELLED', 'DISPUTED'],
  AWAITING_DISPATCH: ['DISPATCHED', 'CANCELLED', 'DISPUTED', 'REFUND_PENDING'],
  DISPATCHED: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['COMPLETED', 'DISPUTED', 'REFUND_PENDING'],
  COMPLETED: ['DISPUTED'],
  REFUND_PENDING: ['REFUNDED', 'DISPUTED'],
  DISPUTED: ['REFUND_PENDING', 'COMPLETED', 'REFUNDED', 'DELIVERED'],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Order cannot move from ${from} to ${to}`);
  }
}
