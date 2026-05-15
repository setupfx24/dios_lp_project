/**
 * Indian equity / F&O charge rates as of 2024-Q4. Values are decimal strings
 * (proportions, not percentages — 0.001 means 0.1%).
 *
 * Authoritative reference: SEBI / NSE / BSE circulars. When rates change,
 * add a new entry with `effectiveFrom` and let the charges service pick the
 * right one for `executedAt`.
 */
export type ProductSegment = 'EQ_DELIVERY' | 'EQ_INTRADAY' | 'FUT' | 'OPT';

export interface ChargeRate {
  readonly effectiveFrom: string; // ISO date
  readonly segment: ProductSegment;
  readonly brokerageRate: string; // proportion of turnover
  readonly brokerageMin: string; // floor in INR per order
  readonly brokerageMax: string; // ceiling in INR per order
  readonly sttBuyRate: string; // proportion, applied to buy turnover
  readonly sttSellRate: string; // proportion, applied to sell turnover
  readonly exchangeFeeRate: string; // proportion of turnover (NSE)
  readonly sebiFeeRate: string; // proportion of turnover
  readonly stampDutyBuyRate: string; // proportion, only on buy
  readonly gstRate: string; // proportion applied to brokerage + exchange + sebi
}

export const CHARGE_RATES: readonly ChargeRate[] = [
  {
    effectiveFrom: '2024-10-01',
    segment: 'EQ_DELIVERY',
    brokerageRate: '0',
    brokerageMin: '0',
    brokerageMax: '0',
    sttBuyRate: '0.001',
    sttSellRate: '0.001',
    exchangeFeeRate: '0.0000297',
    sebiFeeRate: '0.000001',
    stampDutyBuyRate: '0.00015',
    gstRate: '0.18',
  },
  {
    effectiveFrom: '2024-10-01',
    segment: 'EQ_INTRADAY',
    brokerageRate: '0.0003',
    brokerageMin: '0',
    brokerageMax: '20',
    sttBuyRate: '0',
    sttSellRate: '0.00025',
    exchangeFeeRate: '0.0000297',
    sebiFeeRate: '0.000001',
    stampDutyBuyRate: '0.00003',
    gstRate: '0.18',
  },
  {
    effectiveFrom: '2024-10-01',
    segment: 'FUT',
    brokerageRate: '0.0003',
    brokerageMin: '0',
    brokerageMax: '20',
    sttBuyRate: '0',
    sttSellRate: '0.0002',
    exchangeFeeRate: '0.0000173',
    sebiFeeRate: '0.000001',
    stampDutyBuyRate: '0.00002',
    gstRate: '0.18',
  },
  {
    effectiveFrom: '2024-10-01',
    segment: 'OPT',
    brokerageRate: '0',
    brokerageMin: '20',
    brokerageMax: '20',
    sttBuyRate: '0',
    sttSellRate: '0.001', // on premium
    exchangeFeeRate: '0.0003503',
    sebiFeeRate: '0.000001',
    stampDutyBuyRate: '0.00003',
    gstRate: '0.18',
  },
] as const;

export function getActiveRate(segment: ProductSegment, executedAt: Date): ChargeRate {
  const candidates = CHARGE_RATES.filter(
    (r) => r.segment === segment && new Date(r.effectiveFrom) <= executedAt,
  ).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const first = candidates[0];
  if (!first) {
    throw new Error(`No active charge rate for ${segment} at ${executedAt.toISOString()}`);
  }
  return first;
}
