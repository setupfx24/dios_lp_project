# Incident: trade mismatch with broker reconciliation

## Symptoms

- Broker's daily reconciliation file disagrees with our `trading.trades`
  for the same `clientOrderId` / time window.
- Customer ticket: "I see X executed but you show Y."

## Severity

**P1** — financial discrepancy. Affects settlement.

## Triage (15 minutes)

1. Pull the trade from our side:
   ```sql
   SELECT * FROM trading.trades
   WHERE broker_id = $1 AND order_id = (
     SELECT order_id FROM trading.orders
     WHERE broker_id = $1 AND client_order_id = $2
   );
   ```
2. Pull the matching `audit.audit_logs` entries for `order.placed` and
   any subsequent rejections.
3. Compare prices/quantities/times. Any rounding difference is a `Money`
   bug — they should not exist (banker's rounding to 4dp).

## Common causes

- **Reference price drift in MARKET orders**: workers use a fallback when
  no quote is injected. Production must wire a real reference-price
  source. Until then, a market-order discrepancy is expected and the
  fix is out-of-scope of this runbook.
- **Timezone / time window**: the broker may report in IST while our
  `executed_at` is UTC. Re-aggregate over the same UTC window before
  asserting a mismatch.
- **Charges treated as fills**: occasionally brokers expect charges
  itemized on the trade row; we keep them in `trading.charges`. Confirm
  the integration contract.

## Repair

If our trade is wrong (rare — chain protects insertion-time integrity but
not the _correctness_ of the input), insert a reversal + correct trade
following the [chain-broken runbook's repair pattern](incident-hash-chain-broken.md#repair).

## Postmortem

Same as chain-broken — file within 5 business days, add a regression test.
