export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Admin users</h1>
      <p className="text-sm text-muted-foreground">
        Super-admin only. Create / suspend / force-reset 2FA for other admins.
      </p>
    </div>
  );
}
