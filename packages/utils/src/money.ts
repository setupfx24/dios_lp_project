import { Decimal } from 'decimal.js';

type DecimalInstance = InstanceType<typeof Decimal>;

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -20,
  toExpPos: 30,
});

export type MoneyInput = string | number | DecimalInstance | Money;

/**
 * Money wraps decimal.js with a strict, validated API. All arithmetic stays
 * in arbitrary precision; serialization is always a canonical decimal string.
 *
 * Construction never accepts a JS Number (except when an integer literal
 * is unambiguous), to avoid float drift. Pass strings everywhere.
 */
export class Money {
  private readonly value: DecimalInstance;

  constructor(input: MoneyInput) {
    if (input instanceof Money) {
      this.value = input.value;
      return;
    }
    if (input instanceof Decimal) {
      this.value = input;
      return;
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) {
        throw new TypeError(`Money: refusing non-finite number: ${input}`);
      }
      if (!Number.isInteger(input)) {
        throw new TypeError(
          `Money: refusing fractional Number ${input} — pass a string to preserve precision`,
        );
      }
      this.value = new Decimal(input);
      return;
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
        throw new TypeError(`Money: invalid decimal string: ${JSON.stringify(input)}`);
      }
      this.value = new Decimal(trimmed);
      return;
    }
    throw new TypeError(`Money: unsupported input type: ${typeof input}`);
  }

  static zero(): Money {
    return new Money('0');
  }

  static from(input: MoneyInput): Money {
    return input instanceof Money ? input : new Money(input);
  }

  /**
   * Build from a paise (or cent) integer. Used to compare against env-supplied
   * thresholds like `ADMIN_4EYES_THRESHOLD_PAISE` without ever parsing
   * a fractional JS Number.
   */
  static fromPaise(paise: string | number | bigint): Money {
    if (typeof paise === 'bigint') {
      return new Money(paise.toString()).div('100');
    }
    if (typeof paise === 'number') {
      if (!Number.isInteger(paise)) {
        throw new TypeError(`Money.fromPaise: expected integer, got ${paise}`);
      }
      return new Money(paise).div('100');
    }
    if (!/^-?\d+$/.test(paise)) {
      throw new TypeError(`Money.fromPaise: expected integer string, got ${JSON.stringify(paise)}`);
    }
    return new Money(paise).div('100');
  }

  /**
   * Convert to a paise (or cent) integer string. Loses anything below 2dp
   * (banker's rounding). Useful at the edge when handing off to systems
   * that expect integer minor units.
   */
  toPaise(): string {
    return this.mul('100').round(0).toString();
  }

  add(other: MoneyInput): Money {
    return new Money(this.value.plus(Money.from(other).value));
  }
  sub(other: MoneyInput): Money {
    return new Money(this.value.minus(Money.from(other).value));
  }
  mul(other: MoneyInput): Money {
    return new Money(this.value.times(Money.from(other).value));
  }
  div(other: MoneyInput): Money {
    const d = Money.from(other).value;
    if (d.isZero()) {
      throw new RangeError('Money: division by zero');
    }
    return new Money(this.value.dividedBy(d));
  }
  neg(): Money {
    return new Money(this.value.negated());
  }
  abs(): Money {
    return new Money(this.value.abs());
  }

  lt(other: MoneyInput): boolean {
    return this.value.lessThan(Money.from(other).value);
  }
  lte(other: MoneyInput): boolean {
    return this.value.lessThanOrEqualTo(Money.from(other).value);
  }
  gt(other: MoneyInput): boolean {
    return this.value.greaterThan(Money.from(other).value);
  }
  gte(other: MoneyInput): boolean {
    return this.value.greaterThanOrEqualTo(Money.from(other).value);
  }
  eq(other: MoneyInput): boolean {
    return this.value.equals(Money.from(other).value);
  }

  isZero(): boolean {
    return this.value.isZero();
  }
  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }
  isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  /**
   * Round to N decimal places using bankers' rounding (half-even). DB stores
   * 4dp, so most callers pass 4. UI display passes 2. Pass 0 to round to a
   * whole number — used by `toPaise`.
   */
  round(decimals = 4): Money {
    return new Money(this.value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_EVEN));
  }

  /**
   * Indian-grouped currency formatting: ₹1,23,456.78
   * (lakh/crore commas, not Western thousands).
   */
  format(decimals = 2, currencySymbol = '₹'): string {
    const rounded = this.value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_EVEN);
    const sign = rounded.isNegative() ? '-' : '';
    const abs = rounded.abs().toFixed(decimals);
    const dotIdx = abs.indexOf('.');
    const intPart = dotIdx === -1 ? abs : abs.slice(0, dotIdx);
    const fracPart = dotIdx === -1 ? '' : abs.slice(dotIdx);
    let grouped: string;
    if (intPart.length <= 3) {
      grouped = intPart;
    } else {
      const last3 = intPart.slice(-3);
      const rest = intPart.slice(0, -3);
      grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
    }
    return `${sign}${currencySymbol}${grouped}${fracPart}`;
  }

  /** Canonical string used for hashing & wire format. Never localized. */
  toString(): string {
    return this.value.toFixed();
  }

  /** JSON serialization is always the canonical string — never a number. */
  toJSON(): string {
    return this.toString();
  }
}
