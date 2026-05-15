import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * AES-256-GCM at-rest encryption for small secrets (e.g., a TOTP shared
 * secret). The wire format is `version|salt|iv|tag|ciphertext` (each
 * length-prefixed by a single byte) base64-encoded — versioned so we can
 * rotate the algorithm later.
 *
 * The `key` argument is a passphrase (typically `TOTP_ENCRYPTION_KEY` from
 * env). It is hardened to 32 bytes via scrypt with a per-record salt; do
 * not pass random bytes directly — use a high-entropy passphrase from a
 * secret manager.
 */
const VERSION = 1;
const SALT_LEN = 16;
const IV_LEN = 12; // GCM standard
const TAG_LEN = 16;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32);
}

export function encrypt(plaintext: string, passphrase: string): string {
  if (!passphrase) {
    throw new TypeError('encrypt: passphrase must be non-empty');
  }
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([Buffer.from([VERSION]), salt, iv, tag, enc]);
  return out.toString('base64');
}

export function decrypt(payload: string, passphrase: string): string {
  if (!passphrase) {
    throw new TypeError('decrypt: passphrase must be non-empty');
  }
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 1 + SALT_LEN + IV_LEN + TAG_LEN) {
    throw new TypeError('decrypt: payload too short');
  }
  const version = buf.readUInt8(0);
  if (version !== VERSION) {
    throw new TypeError(`decrypt: unsupported version ${version}`);
  }
  let offset = 1;
  const salt = buf.subarray(offset, offset + SALT_LEN);
  offset += SALT_LEN;
  const iv = buf.subarray(offset, offset + IV_LEN);
  offset += IV_LEN;
  const tag = buf.subarray(offset, offset + TAG_LEN);
  offset += TAG_LEN;
  const enc = buf.subarray(offset);

  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}
