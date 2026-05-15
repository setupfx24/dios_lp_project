export const OrderSide = { BUY: 'BUY', SELL: 'SELL' } as const;
export const OrderType = {
  MARKET: 'MARKET',
  LIMIT: 'LIMIT',
  STOP: 'STOP',
  STOP_LIMIT: 'STOP_LIMIT',
} as const;
export const TimeInForce = {
  DAY: 'DAY',
  IOC: 'IOC',
  FOK: 'FOK',
  GTC: 'GTC',
} as const;
export const OrderStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  FILLED: 'FILLED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export const ALL_ORDER_SIDES = Object.values(OrderSide);
export const ALL_ORDER_TYPES = Object.values(OrderType);
export const ALL_TIME_IN_FORCE = Object.values(TimeInForce);
export const ALL_ORDER_STATUSES = Object.values(OrderStatus);
