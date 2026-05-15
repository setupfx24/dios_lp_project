# @lp/types

Pure TypeScript domain, API, and event types. **No runtime dependencies.**

Consumers: every other package and app in the monorepo.

## Modules

- `@lp/types/domain` — `OrderRecord`, `TradeRecord`, `ChargeRecord`, `PositionRecord`, `WalletRecord`, `LedgerEntryRecord`, `UserRecord`, `ApiKeyRecord`
- `@lp/types/api` — `ApiSuccess<T>`, `ApiError`, `ApiResponse<T>`, `PaginatedResponse<T>`
- `@lp/types/events` — `TradeExecutedEvent`, `OrderUpdatedEvent`, `PositionUpdatedEvent`, `DomainEvent`

## Money convention

Every monetary field is `string` (canonical decimal). Never `number`. Wrap in `Money` from `@lp/utils` for arithmetic and formatting.
