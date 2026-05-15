# Deploy rollback

## When to roll back

- Spike in 5xx on `/orders` post-deploy
- Spike in HMAC rejections (could be auth bug or could be a real attack;
  inspect audit before rolling back)
- Chain-verifier alert immediately after deploy
- Any panic in worker logs

## How (production-ish)

1. Identify the previous good image tag from the GHCR registry:
   ```sh
   gh api -H "Accept: application/vnd.github+json" \
     /orgs/<org>/packages/container/lp-platform%2Fapi/versions \
     --jq '.[].metadata.container.tags' | head -10
   ```
2. Re-pin the deployment to the prior tag and re-roll:
   ```sh
   # k8s example
   kubectl set image deploy/api api=ghcr.io/<org>/lp-platform/api:<sha>
   kubectl rollout status deploy/api
   ```
3. Roll the workers and frontends to matching tags. They share the SDK
   contract from `@lp/sdk` so cross-version is usually safe within a
   minor, but match major versions.
4. Confirm health: `curl https://api.<env>/health` returns `status: ok`.
5. Run a chain verification on the impacted brokers:
   ```sh
   pnpm tsx infra/scripts/verify-chain.ts <brokerId>
   ```

## What you must NOT do during a rollback

- Do not roll back a migration. Migrations are forward-only — the new
  schema must be backward-compatible with the previous code (this is
  enforced by review). If a migration is the problem, write a forward
  patch migration and deploy again.
- Do not bypass HMAC checks or any other safety control to "let the
  broker get back online faster." Broker downtime is preferable to
  silent data corruption.

## Postmortem

- Within 24h of any production rollback. Include: timeline, customer impact,
  root cause, fix, and what test/safeguard would have caught it.
