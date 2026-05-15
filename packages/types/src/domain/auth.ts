export type UserRole = 'broker_user' | 'lp_admin' | 'lp_operator' | 'lp_readonly';

export interface UserRecord {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly brokerId: string | null;
  readonly createdAt: string;
}

export interface ApiKeyRecord {
  readonly apiKeyId: string;
  readonly brokerId: string;
  readonly label: string;
  readonly keyPrefix: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
}
