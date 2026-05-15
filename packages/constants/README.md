# @lp/constants

Centralized error codes, order enums, demo symbol universe, and charge rates.

## Charge rates

- Tracked by `effectiveFrom` so historical trades use the correct rate.
- All rates are decimal _strings_ (proportions, not percentages).
- New rates: append a new entry, never edit a committed one.
