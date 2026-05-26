/**
 * Generate a 6-digit TOTP code from a base32 secret, no phone needed.
 *
 *   node infra/scripts/totp-code.mjs DJ7CQUJZGUWSMG2Y
 *
 * Useful for local testing the admin 2FA flow without an authenticator app.
 * DO NOT run this against a real production secret — defeats the whole
 * "second factor on a separate device" point.
 */
import { authenticator } from 'otplib';

const secret = process.argv[2];
if (!secret) {
  console.error('usage: node totp-code.mjs <BASE32_SECRET>');
  process.exit(1);
}
const code = authenticator.generate(secret);
const remaining = authenticator.timeRemaining();
console.log(`code: ${code}   (valid for ${remaining}s)`);
