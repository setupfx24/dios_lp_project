export default function AuditPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Audit log</h1>
      <p className="text-sm text-muted-foreground">
        Read-only. Filter by actor, action, date range. CSV export. Click a row for the before/after
        state diff.
      </p>
    </div>
  );
}
