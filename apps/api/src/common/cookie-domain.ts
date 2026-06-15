import type { AppConfigService } from '../config/config.module.js';

/**
 * Cookie `domain` option shared by every auth cookie the API sets.
 *
 * Returns `{ domain }` when configured, else `{}` (host-only cookie).
 * Set COOKIE_DOMAIN to a parent domain (e.g. ".swistrade.com") when the
 * trade/admin UIs and the API are on different subdomains, so each app's
 * middleware can read the cookie the API issues. ADMIN_COOKIE_DOMAIN is a
 * deprecated alias honoured for already-deployed environments.
 */
export function cookieDomainOpt(cfg: AppConfigService): { domain?: string } {
  const domain = cfg.get('COOKIE_DOMAIN') ?? cfg.get('ADMIN_COOKIE_DOMAIN');
  return domain ? { domain } : {};
}
