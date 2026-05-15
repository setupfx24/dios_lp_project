# audit module

Append-only `audit_logs`. Same three-layer enforcement (repository surface,
role grants, trigger).

Sources:

- HMAC guard rejections (invalid signature, stale, replayed)
- JWT guard rejections (expired, invalid, missing role)
- successful logins / logouts
- admin actions (broker created, key revoked)
- order placement (success + failure)

Subscribed via the in-process `EventEmitter2`. Workers archive entries
older than N days to S3 with object lock.
