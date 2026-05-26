'use client';

import { AlertTriangle, Check, Copy, KeyRound, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIssueApiKey } from '@/features/brokers/use-brokers';

interface Props {
  brokerId: string;
  onClose: () => void;
}

export function IssueKeyModal({ brokerId, onClose }: Props) {
  const [label, setLabel] = useState('');
  const [ipAllowlist, setIpAllowlist] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const issue = useIssueApiKey(brokerId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    const ips = ipAllowlist
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const result = await issue.mutateAsync({
        label: label.trim(),
        // exactOptionalPropertyTypes: omit the field entirely when empty,
        // rather than passing `undefined` for an optional property.
        ...(ips.length > 0 ? { ipAllowlist: ips } : {}),
      });
      setPlaintext(result.plaintextApiKey);
    } catch {
      // mutation error surfaced via issue.error
    }
  }

  async function handleCopy() {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked; user can still select-and-copy
    }
  }

  function handleClose() {
    if (plaintext && !acknowledged) {
      const ok = window.confirm(
        'The plaintext API key will be permanently destroyed when you close this dialog. Have you saved it to a secure location?',
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
            <KeyRound className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">
              {plaintext ? 'API key issued' : 'Issue new API key'}
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

        {!plaintext ? (
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="space-y-4 p-5"
          >
            <p className="text-sm text-muted-foreground">
              Issuing an HMAC API key for broker{' '}
              <span className="font-mono text-foreground">{brokerId}</span>. The plaintext secret
              will be shown <strong>exactly once</strong> on the next screen.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="key-label">Label</Label>
              <Input
                id="key-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. dios-prod-primary"
                maxLength={80}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Human-readable identifier shown in the keys list. Cannot be changed.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ip-allowlist">IP allowlist (optional)</Label>
              <Input
                id="ip-allowlist"
                value={ipAllowlist}
                onChange={(e) => setIpAllowlist(e.target.value)}
                placeholder="comma-separated, e.g. 203.0.113.5, 203.0.113.6"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to allow any source IP. Restricting later requires re-issuing.
              </p>
            </div>

            {issue.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                {issue.error instanceof Error ? issue.error.message : 'Failed to issue key'}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={issue.isPending || !label.trim()}>
                {issue.isPending ? 'Issuing…' : 'Issue API key'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 p-5">
            <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Copy this now — it will never be shown again.</p>
                <p className="mt-0.5 text-xs">
                  The server stores only an Argon2 hash. If you lose this value, you must revoke
                  this key and issue a new one.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Plaintext API key</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                  {plaintext}
                </code>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void handleCopy();
                  }}
                  variant="outline"
                >
                  {copied ? (
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
                Drop this into the broker&apos;s <code>.env</code> as <code>NEW_LP_API_KEY</code>{' '}
                (or push it directly to their secret store).
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
                I have copied the API key to a secure location and understand it cannot be retrieved
                again.
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
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
