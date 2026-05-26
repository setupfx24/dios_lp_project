'use client';

import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  KeyRound,
  PauseCircle,
  Play,
  Plus,
  RefreshCw,
  Shield,
  ShieldOff,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateBrokerUserModal } from '@/features/brokers/create-broker-user-modal';
import { DeleteBrokerModal } from '@/features/brokers/delete-broker-modal';
import { IssueKeyModal } from '@/features/brokers/issue-key-modal';
import {
  useApiKeys,
  useBroker,
  useBrokerUsers,
  useReactivateBroker,
  useRevokeApiKey,
  useSuspendBroker,
  useSuspendBrokerUser,
} from '@/features/brokers/use-brokers';

const STATUS_PILL: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  closed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export default function BrokerDetailPage() {
  const params = useParams<{ brokerId: string }>();
  const router = useRouter();
  const brokerId = decodeURIComponent(params.brokerId);
  const broker = useBroker(brokerId);
  const keys = useApiKeys(brokerId);
  const dashUsers = useBrokerUsers(brokerId);
  const suspend = useSuspendBroker();
  const reactivate = useReactivateBroker();
  const revoke = useRevokeApiKey(brokerId);
  const suspendUser = useSuspendBrokerUser(brokerId);

  const [showIssue, setShowIssue] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [confirmSuspendUserId, setConfirmSuspendUserId] = useState<string | null>(null);

  async function handleRevoke(apiKeyId: string) {
    try {
      await revoke.mutateAsync(apiKeyId);
      setConfirmRevokeId(null);
    } catch {
      // surfaced below
    }
  }

  async function handleSuspendUser(userId: string) {
    try {
      await suspendUser.mutateAsync(userId);
      setConfirmSuspendUserId(null);
    } catch {
      // surfaced below
    }
  }

  const b = broker.data;
  const isActive = b?.status === 'active';

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/brokers"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to brokers
        </Link>
      </div>

      {broker.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading broker…</p>
      ) : broker.error ? (
        <p className="text-sm text-destructive">
          Failed to load broker: {broker.error instanceof Error ? broker.error.message : 'Unknown'}
        </p>
      ) : !b ? null : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
                  {b.displayName}
                </h1>
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium capitalize ${
                    STATUS_PILL[b.status] ?? 'bg-muted text-muted-foreground'
                  }`}
                >
                  {b.status === 'active' ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : b.status === 'suspended' ? (
                    <PauseCircle className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  {b.status}
                </span>
              </div>
              <p className="mt-1 font-mono text-sm text-muted-foreground">{b.brokerId}</p>
              <p className="text-sm text-muted-foreground">{b.contactEmail}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isActive ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => suspend.mutate(b.brokerId)}
                  disabled={suspend.isPending}
                >
                  <PauseCircle className="mr-2 h-4 w-4" />
                  {suspend.isPending ? 'Suspending…' : 'Suspend'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => reactivate.mutate(b.brokerId)}
                  disabled={reactivate.isPending}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {reactivate.isPending ? 'Reactivating…' : 'Reactivate'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDelete(true)}
                className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="Permanently delete this broker — refused if any history exists"
              >
                <ShieldOff className="mr-2 h-4 w-4" />
                Delete permanently
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  HMAC API keys
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Used by the broker&apos;s server (e.g. DIOS) to sign{' '}
                  <code>POST /api/v1/broker/orders</code> and connect to the WebSocket. Plaintext
                  shown once at issuance.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void keys.refetch();
                  }}
                  disabled={keys.isFetching}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${keys.isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowIssue(true)}
                  disabled={!isActive}
                  title={isActive ? '' : 'Reactivate broker before issuing new keys'}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Issue new key
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {keys.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading keys…</p>
              ) : keys.error ? (
                <p className="text-sm text-destructive">
                  Failed to load keys:{' '}
                  {keys.error instanceof Error ? keys.error.message : 'Unknown'}
                </p>
              ) : keys.data && keys.data.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No API keys yet. Click <strong>Issue new key</strong> to create one — you&apos;ll
                  see the plaintext exactly once.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Label</th>
                        <th className="px-3 py-2 font-medium">Prefix</th>
                        <th className="px-3 py-2 font-medium">IP allowlist</th>
                        <th className="px-3 py-2 font-medium">Issued</th>
                        <th className="px-3 py-2 font-medium">Last used</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.data?.map((k) => {
                        const active = k.status === 'active';
                        return (
                          <tr key={k.apiKeyId} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium">{k.label}</td>
                            <td className="px-3 py-2 font-mono text-xs">{k.keyPrefix}.*****</td>
                            <td className="px-3 py-2">
                              {k.ipAllowlist.length === 0 ? (
                                <span className="text-xs text-muted-foreground">any IP</span>
                              ) : (
                                <span className="font-mono text-xs">
                                  {k.ipAllowlist.join(', ')}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {fmtDate(k.createdAt)}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {fmtDate(k.lastUsedAt)}
                            </td>
                            <td className="px-3 py-2">
                              {active ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                                  <XCircle className="h-3 w-3" />
                                  Revoked {fmtDate(k.revokedAt)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {active ? (
                                confirmRevokeId === k.apiKeyId ? (
                                  <span className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleRevoke(k.apiKeyId);
                                      }}
                                      disabled={revoke.isPending}
                                      className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                                    >
                                      {revoke.isPending ? 'Revoking…' : 'Confirm'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmRevokeId(null)}
                                      className="rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
                                    >
                                      Cancel
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRevokeId(k.apiKeyId)}
                                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-background px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Revoke
                                  </button>
                                )
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {revoke.error ? (
                <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                  Revoke failed:{' '}
                  {revoke.error instanceof Error ? revoke.error.message : 'Unknown error'}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Dashboard users
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Human logins for the broker&apos;s web dashboard at{' '}
                  <span className="font-mono">http://localhost:3001</span>. Each user logs in with
                  email + password and is scoped to this broker only.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void dashUsers.refetch();
                  }}
                  disabled={dashUsers.isFetching}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${dashUsers.isFetching ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowAddUser(true)}
                  disabled={!isActive}
                  title={isActive ? '' : 'Reactivate broker before adding users'}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add user
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {dashUsers.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading users…</p>
              ) : dashUsers.error ? (
                <p className="text-sm text-destructive">
                  Failed to load:{' '}
                  {dashUsers.error instanceof Error ? dashUsers.error.message : 'Unknown'}
                </p>
              ) : dashUsers.data && dashUsers.data.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No dashboard users yet. Click <strong>Add user</strong> to create the
                  broker&apos;s first login — you&apos;ll see the temporary password exactly once.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Display name</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Created</th>
                        <th className="px-3 py-2 font-medium">First login</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashUsers.data?.map((u) => {
                        const active = u.status === 'active';
                        return (
                          <tr key={u.userId} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium">{u.displayName}</td>
                            <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {fmtDate(u.createdAt)}
                            </td>
                            <td className="px-3 py-2">
                              {u.mustChangePassword ? (
                                <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  Password reset required
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">complete</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {active ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                                  <Ban className="h-3 w-3" />
                                  Suspended {fmtDate(u.suspendedAt)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {active ? (
                                confirmSuspendUserId === u.userId ? (
                                  <span className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleSuspendUser(u.userId);
                                      }}
                                      disabled={suspendUser.isPending}
                                      className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                                    >
                                      {suspendUser.isPending ? 'Suspending…' : 'Confirm'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmSuspendUserId(null)}
                                      className="rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
                                    >
                                      Cancel
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmSuspendUserId(u.userId)}
                                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-background px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                  >
                                    <Ban className="h-3 w-3" />
                                    Suspend
                                  </button>
                                )
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {suspendUser.error ? (
                <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                  Suspend failed:{' '}
                  {suspendUser.error instanceof Error ? suspendUser.error.message : 'Unknown error'}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Onboarding checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ChecklistRow label="Broker record created" done={true} hint="status = active" />
              <ChecklistRow
                label="HMAC API key issued"
                done={(keys.data?.filter((k) => k.status === 'active').length ?? 0) > 0}
                hint="needed for POST /api/v1/broker/orders and WebSocket connect"
              />
              <ChecklistRow
                label="Dashboard user invited"
                done={(dashUsers.data?.filter((u) => u.status === 'active').length ?? 0) > 0}
                hint="email + temporary password for the broker's web dashboard login"
              />
              <p className="pt-2 text-xs text-muted-foreground">
                Hand the plaintext API key + dashboard login credentials to the broker via a secure
                channel (1Password / Bitwarden / your team&apos;s password manager). Do not paste it
                into Slack, email, or anywhere it would be retained.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {showIssue ? <IssueKeyModal brokerId={brokerId} onClose={() => setShowIssue(false)} /> : null}
      {showAddUser ? (
        <CreateBrokerUserModal brokerId={brokerId} onClose={() => setShowAddUser(false)} />
      ) : null}
      {showDelete && b ? (
        <DeleteBrokerModal
          brokerId={b.brokerId}
          brokerName={b.displayName}
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            setShowDelete(false);
            router.push('/brokers');
          }}
        />
      ) : null}
    </div>
  );
}

function ChecklistRow({ label, done, hint }: { label: string; done: boolean; hint?: string }) {
  return (
    <div className="flex items-start gap-2">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/40" />
      )}
      <div>
        <p className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
