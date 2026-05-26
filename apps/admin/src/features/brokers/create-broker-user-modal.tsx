'use client';

import { AlertTriangle, Check, Copy, UserPlus, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateBrokerUser } from '@/features/brokers/use-brokers';

interface Props {
  brokerId: string;
  onClose: () => void;
}

interface IssuedUser {
  email: string;
  displayName: string;
  temporaryPassword: string;
  passwordWasGenerated: boolean;
}

export function CreateBrokerUserModal({ brokerId, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [setOwnPassword, setSetOwnPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [issued, setIssued] = useState<IssuedUser | null>(null);
  const [copied, setCopied] = useState<'email' | 'password' | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const create = useCreateBrokerUser(brokerId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !displayName.trim()) return;
    if (setOwnPassword && password.length < 12) return;
    try {
      const result = await create.mutateAsync({
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        ...(setOwnPassword && password ? { temporaryPassword: password } : {}),
      });
      setIssued({
        email: result.email,
        displayName: result.displayName,
        temporaryPassword: result.temporaryPassword,
        passwordWasGenerated: result.passwordWasGenerated,
      });
    } catch {
      // surfaced via create.error
    }
  }

  async function copy(text: string, kind: 'email' | 'password') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // ignore clipboard failures
    }
  }

  function handleClose() {
    if (issued && !acknowledged) {
      const ok = window.confirm(
        'The temporary password will be permanently destroyed when you close this dialog. Have you saved it to a secure location?',
      );
      if (!ok) return;
    }
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border bg-card text-card-foreground shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">
              {issued ? 'Dashboard user created' : 'Add dashboard user'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!issued ? (
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="space-y-4 p-5"
          >
            <p className="text-sm text-muted-foreground">
              Creates a dashboard login for the broker{' '}
              <span className="font-mono text-foreground">{brokerId}</span>. The user will be
              prompted to change their password on first sign-in.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@broker.com"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="user-name">Display name</Label>
              <Input
                id="user-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Trader"
                maxLength={120}
                required
              />
            </div>

            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={setOwnPassword}
                  onChange={(e) => setSetOwnPassword(e.target.checked)}
                />
                <span>Set a specific temporary password (otherwise auto-generated)</span>
              </label>
              {setOwnPassword ? (
                <div className="space-y-1.5 pt-1">
                  <Input
                    id="user-password"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 12 characters"
                    minLength={12}
                    maxLength={256}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum 12 characters. The broker will be forced to change this on first
                    sign-in.
                  </p>
                </div>
              ) : null}
            </div>

            {create.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                {create.error instanceof Error ? create.error.message : 'Failed to create user'}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create user'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 p-5">
            <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  Save these credentials now — password is hashed on save and cannot be recovered.
                </p>
                <p className="mt-0.5 text-xs">
                  Hand them to the broker via a secure channel (1Password / Bitwarden one-time
                  link). They will be prompted to change the password on first sign-in.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Login email</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                  {issued.email}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void copy(issued.email, 'email');
                  }}
                >
                  {copied === 'email' ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                Temporary password
                {issued.passwordWasGenerated ? ' (auto-generated)' : ' (admin-supplied)'}
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                  {issued.temporaryPassword}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void copy(issued.temporaryPassword, 'password');
                  }}
                >
                  {copied === 'password' ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Broker logs in at <span className="font-mono">http://localhost:3001/login</span>{' '}
                using this email + password.
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I have copied the credentials and understand they cannot be retrieved again.
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" onClick={onClose} disabled={!acknowledged}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
