# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in this project, **do not file a public issue**. Email the maintainers at `security@<your-org>` with:

- A description of the vulnerability
- Steps to reproduce
- Affected version / commit SHA
- Potential impact

Expect an acknowledgement within 48 hours and a triage update within 7 days.

## Scope

In scope:

- HMAC verification (replay, tampering, key handling)
- JWT issuance and validation
- SQL injection / NoSQL injection
- Authorization / IDOR
- Append-only enforcement bypass
- Hash chain forgery
- Dependency vulnerabilities (`pnpm audit`)

Out of scope (do not test):

- Social engineering of project members
- Physical attacks against infrastructure
- Denial of service against shared environments
- Findings from automated tools without proof of exploitability

## Hardening summary

- All money in DB is `NUMERIC(20, 4)` and in code is `Money` (`decimal.js`)
- `trading.trades`, `ledger.ledger_entries`, `audit.audit_logs` are append-only — runtime role `lp_app` lacks `UPDATE` / `DELETE`; triggers raise if attempted
- HMAC uses SHA-256, 30s replay window, timing-safe comparison
- JWT in httpOnly cookies, short expiry (default 15m), refresh via separate endpoint
- Passwords hashed with Argon2id (memory-hard)
- Secrets only via env, validated by Zod at boot
- CORS allowlist via `CORS_ORIGINS` env
- Audit log captures every guard rejection, login, admin action

See [docs/security.md](docs/security.md) for the full threat model.
