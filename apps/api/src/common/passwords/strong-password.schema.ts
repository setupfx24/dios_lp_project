import { z } from 'zod';

/**
 * Shared strong-password rule for ALL admin-issued credentials:
 *   - admin user temporary passwords (admin-users.controller)
 *   - broker dashboard user passwords (brokers-admin.controller)
 *   - any future password-accepting endpoint
 *
 * Rule (matches OWASP Application Security Verification Standard L2):
 *   length 12-256
 *   ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special character
 *
 * Length-only checks (e.g. min 12) accept `aaaaaaaaaaaa` and other low-entropy
 * strings that show up in real "12345678 was accepted" complaints. The
 * complexity rules don't replace a dictionary check or zxcvbn — those should
 * be added later if needed — but they raise the bar from "trivially weak" to
 * "needs effort to guess".
 *
 * Frontend should mirror these messages so the operator sees inline feedback
 * before submit.
 */
export const strongPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(256, 'Password must be at most 256 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * Pure helper for client-side / generator validation. Mirrors the Zod schema.
 * Returns array of human-readable failure reasons, or [] when password passes.
 */
export function checkPasswordStrength(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 12) issues.push('Must be at least 12 characters');
  if (pw.length > 256) issues.push('Must be at most 256 characters');
  if (!/[A-Z]/.test(pw)) issues.push('Must contain at least one uppercase letter');
  if (!/[a-z]/.test(pw)) issues.push('Must contain at least one lowercase letter');
  if (!/[0-9]/.test(pw)) issues.push('Must contain at least one number');
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push('Must contain at least one special character');
  return issues;
}
