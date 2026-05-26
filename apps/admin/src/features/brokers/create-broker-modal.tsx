'use client';

import { AlertTriangle, Check, Eye, EyeOff, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateBroker } from '@/features/brokers/use-brokers';

interface Props {
  onClose: () => void;
  onCreated?: (brokerId: string) => void;
}

/**
 * Pure client-side mirror of `apps/api/src/common/passwords/strong-password.schema.ts`.
 * Returns the list of failing rules so the form can show inline checklists.
 * Server-side Zod is still the source of truth.
 */
function checkPasswordStrength(pw: string): { rule: string; passed: boolean }[] {
  return [
    { rule: 'At least 12 characters', passed: pw.length >= 12 },
    { rule: 'One uppercase letter (A-Z)', passed: /[A-Z]/.test(pw) },
    { rule: 'One lowercase letter (a-z)', passed: /[a-z]/.test(pw) },
    { rule: 'One number (0-9)', passed: /[0-9]/.test(pw) },
    { rule: 'One special character (!@#$…)', passed: /[^A-Za-z0-9]/.test(pw) },
  ];
}

export function CreateBrokerModal({ onClose, onCreated }: Props) {
  const [brokerId, setBrokerId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // First-user fields are optional but strongly encouraged. If left blank the
  // admin can create the user later from the broker detail page.
  const [provisionUser, setProvisionUser] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const create = useCreateBroker();

  const passwordChecks = useMemo(() => checkPasswordStrength(userPassword), [userPassword]);
  const passwordOk = passwordChecks.every((c) => c.passed);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brokerId.trim() || !displayName.trim() || !contactEmail.trim()) return;
    if (provisionUser) {
      if (!userEmail.trim() || !userDisplayName.trim() || !userPassword) return;
      if (!passwordOk) return;
    }
    try {
      const result = await create.mutateAsync({
        brokerId: brokerId.trim().toLowerCase(),
        displayName: displayName.trim(),
        contactEmail: contactEmail.trim().toLowerCase(),
        ...(provisionUser
          ? {
              firstUser: {
                email: userEmail.trim().toLowerCase(),
                displayName: userDisplayName.trim(),
                password: userPassword,
              },
            }
          : {}),
      });
      onCreated?.(result.brokerId);
      onClose();
    } catch {
      // surfaced via create.error
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card text-card-foreground shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Create new broker</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-5 p-5"
        >
          {/* ───── Broker entity ───── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Broker
            </h3>

            <div className="space-y-1.5">
              <Label htmlFor="broker-id">Broker ID</Label>
              <Input
                id="broker-id"
                value={brokerId}
                onChange={(e) => setBrokerId(e.target.value)}
                placeholder="dios-broker-1"
                pattern="[a-z0-9][a-z0-9_\-]*"
                maxLength={64}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, digits, <code>_</code> or <code>-</code> only. Cannot be changed
                later.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="DIOS Derivative Pvt Ltd"
                maxLength={120}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Contact email (organization)</Label>
              <Input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="ops@diosderivative.com"
                required
              />
              <p className="text-xs text-muted-foreground">
                For LP-side correspondence, not a login.
              </p>
            </div>
          </section>

          {/* ───── First dashboard user (optional but recommended) ───── */}
          <section className="space-y-3 rounded-md border bg-muted/20 p-4">
            <header className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  First dashboard user
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Creates a login at <code>localhost:3001</code> the broker can use immediately.
                  Skip to add users later from the broker detail page.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={provisionUser}
                  onChange={(e) => setProvisionUser(e.target.checked)}
                />
                <span>Provision now</span>
              </label>
            </header>

            {provisionUser ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="user-email">Login email</Label>
                  <Input
                    id="user-email"
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="trader@diosderivative.com"
                    required={provisionUser}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-display">User display name</Label>
                  <Input
                    id="user-display"
                    value={userDisplayName}
                    onChange={(e) => setUserDisplayName(e.target.value)}
                    placeholder="Operations Trader"
                    maxLength={120}
                    required={provisionUser}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-pw">Password</Label>
                  <div className="relative">
                    <Input
                      id="user-pw"
                      type={showPw ? 'text' : 'password'}
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      autoComplete="new-password"
                      required={provisionUser}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <ul className="mt-2 space-y-0.5 text-xs">
                    {passwordChecks.map((c) => (
                      <li
                        key={c.rule}
                        className={
                          c.passed
                            ? 'flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400'
                            : 'flex items-center gap-1.5 text-muted-foreground'
                        }
                      >
                        {c.passed ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <span className="inline-block h-3 w-3 rounded-full border border-current opacity-40" />
                        )}
                        {c.rule}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    Hand the password to the broker via a secure channel (1Password / Bitwarden) —
                    never email, Slack, or screenshot. Server stores only an Argon2 hash.
                  </p>
                </div>
              </>
            ) : null}
          </section>

          {create.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
            >
              {create.error instanceof Error ? create.error.message : 'Failed to create broker'}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                create.isPending ||
                !brokerId.trim() ||
                !displayName.trim() ||
                !contactEmail.trim() ||
                (provisionUser && (!userEmail.trim() || !userDisplayName.trim() || !passwordOk))
              }
            >
              {create.isPending
                ? 'Creating…'
                : provisionUser
                  ? 'Create broker + first user'
                  : 'Create broker'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
