import { describe, it, expect } from 'vitest';

import { decrypt, encrypt } from './encryption.js';

const PASSPHRASE = 'test-passphrase-with-some-entropy';

describe('encryption (AES-256-GCM)', () => {
  it('round-trips a plaintext', () => {
    const enc = encrypt('hello world', PASSPHRASE);
    expect(decrypt(enc, PASSPHRASE)).toBe('hello world');
  });

  it('produces a different ciphertext each call (random IV+salt)', () => {
    const a = encrypt('same input', PASSPHRASE);
    const b = encrypt('same input', PASSPHRASE);
    expect(a).not.toBe(b);
    expect(decrypt(a, PASSPHRASE)).toBe('same input');
    expect(decrypt(b, PASSPHRASE)).toBe('same input');
  });

  it('rejects wrong passphrase', () => {
    const enc = encrypt('secret', PASSPHRASE);
    expect(() => decrypt(enc, 'wrong-passphrase')).toThrow();
  });

  it('rejects tampered ciphertext (auth tag failure)', () => {
    const enc = encrypt('secret', PASSPHRASE);
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] = (buf[buf.length - 1]! ^ 0xff) & 0xff;
    const tampered = buf.toString('base64');
    expect(() => decrypt(tampered, PASSPHRASE)).toThrow();
  });

  it('rejects empty passphrase', () => {
    expect(() => encrypt('x', '')).toThrow(TypeError);
    expect(() => decrypt('x', '')).toThrow(TypeError);
  });

  it('rejects payload too short', () => {
    expect(() => decrypt('AAA=', PASSPHRASE)).toThrow(TypeError);
  });
});
