'use client';

import { AlertTriangle, KeyRound, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { SdkError } from '@lp/sdk';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi, setReauthToken } from '@/lib/sdk';

/**
 * Reauth flow:
 *
 *   sensitive call → 403 "Reauth token required" → catch + `requestReauth()`
 *   → modal asks for password → POST /admin/auth/reauth → store token →
 *   resolve → caller retries the original mutation
 *
 * The token is module-level (see lib/sdk.ts), so retried mutations pick it
 * up automatically through `getAdminClient()`.
 *
 * Usage in a mutation hook:
 *
 *   const { requestReauth } = useReauth();
 *   const mut = useMutation({
 *     mutationFn: async (input) => {
 *       try { return await getAdminClient().issueApiKey(brokerId, input); }
 *       catch (err) {
 *         if (SdkError.isReauthRequired(err)) {
 *           const ok = await requestReauth();
 *           if (!ok) throw err;
 *           return await getAdminClient().issueApiKey(brokerId, input);
 *         }
 *         throw err;
 *       }
 *     },
 *   });
 */

interface ReauthCtx {
  /** Resolves true if reauth succeeded, false if user cancelled. Never rejects. */
  requestReauth: () => Promise<boolean>;
  /** True while modal is open. */
  isOpen: boolean;
}

const Ctx = createContext<ReauthCtx | null>(null);

export function useReauth(): ReauthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useReauth must be used inside <ReauthProvider>');
  }
  return ctx;
}

export function ReauthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Stable pending-resolver across renders.
  const pendingRef = useRef<((ok: boolean) => void) | null>(null);

  const requestReauth = useCallback((): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      pendingRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    setOpen(false);
    const resolver = pendingRef.current;
    pendingRef.current = null;
    resolver?.(ok);
  }, []);

  const value = useMemo<ReauthCtx>(() => ({ requestReauth, isOpen: open }), [requestReauth, open]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {open ? <ReauthModal onResolve={close} /> : null}
    </Ctx.Provider>
  );
}

// ───────────────── Modal ─────────────────

interface ModalProps {
  onResolve: (ok: boolean) => void;
}

function ReauthModal({ onResolve }: ModalProps) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await adminApi.reauth(password);
      setReauthToken(result.reauthToken);
      onResolve(true);
    } catch (err) {
      let msg = 'Reauth failed';
      if (err instanceof SdkError) {
        // 401 = wrong password (admin login required)
        // 403 = TOTP / locked / other
        msg = err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setErrorMessage(msg);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    if (submitting) return;
    onResolve(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg border bg-card text-card-foreground shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h2 id="reauth-title" className="text-base font-semibold">
              Confirm your password
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-accent disabled:opacity-50"
            disabled={submitting}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4 p-5"
        >
          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This action is sensitive (issue / revoke API key, suspend broker, wallet adjust).
              Confirm your password to continue. Your session will remain reauthenticated for the
              next 5 minutes.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reauth-password">Password</Label>
            <Input
              id="reauth-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              disabled={submitting}
            />
          </div>

          {errorMessage ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !password}>
              {submitting ? 'Verifying…' : 'Confirm'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
