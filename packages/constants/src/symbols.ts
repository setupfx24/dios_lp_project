/**
 * Hard-coded demo universe. Real deployments resolve symbols from the
 * `market.instruments` table — this list is for seed/dev convenience.
 */
export interface InstrumentMeta {
  readonly symbol: string;
  readonly exchange: 'NSE' | 'BSE';
  readonly segment: 'EQ' | 'FUT' | 'OPT';
  readonly lotSize: number;
  readonly tickSize: string;
}

export const DEMO_INSTRUMENTS: readonly InstrumentMeta[] = [
  { symbol: 'RELIANCE', exchange: 'NSE', segment: 'EQ', lotSize: 1, tickSize: '0.05' },
  { symbol: 'TCS', exchange: 'NSE', segment: 'EQ', lotSize: 1, tickSize: '0.05' },
  { symbol: 'HDFCBANK', exchange: 'NSE', segment: 'EQ', lotSize: 1, tickSize: '0.05' },
  { symbol: 'INFY', exchange: 'NSE', segment: 'EQ', lotSize: 1, tickSize: '0.05' },
  { symbol: 'ICICIBANK', exchange: 'NSE', segment: 'EQ', lotSize: 1, tickSize: '0.05' },
  { symbol: 'NIFTY24DECFUT', exchange: 'NSE', segment: 'FUT', lotSize: 25, tickSize: '0.05' },
] as const;

export const SYMBOL_SET: ReadonlySet<string> = new Set(DEMO_INSTRUMENTS.map((i) => i.symbol));
