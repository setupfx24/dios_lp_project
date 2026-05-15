# @lp/validators

Single source of truth for request/response shapes. Schemas are Zod; runtime
validation and TS types are both inferred from the same definition (`z.infer<>`).

## Money rule

Every monetary field is `decimalString` (or `positiveDecimalString`) — a
validated decimal-string primitive. Schemas reject `quantity: 10` (number)
and accept `quantity: "10"` (string). Server-side: pass to `Money.from(...)`.

## Adding a schema

1. Compose from primitives in `primitives.ts` so validation rules stay
   uniform across the codebase.
2. Export the schema and the inferred type next to it.
3. Re-export from `index.ts`.
