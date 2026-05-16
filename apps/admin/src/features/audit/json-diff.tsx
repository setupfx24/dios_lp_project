/**
 * Tiny side-by-side JSON diff renderer. Handles:
 *   - both sides primitive  → equal / changed coloring
 *   - both sides object     → recurse on union of keys
 *   - one side missing      → added / removed coloring
 *   - arrays                → index-aligned recursion
 *
 * Designed for audit-log before/after state diffs. Not optimized for
 * massive JSON payloads — admin audit metadata is < 5 KB in practice.
 */
import { Fragment } from 'react';

type JSONValue = string | number | boolean | null | JSONValue[] | { [k: string]: JSONValue };

interface Props {
  before?: JSONValue | undefined;
  after?: JSONValue | undefined;
}

export function JsonDiff({ before, after }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 font-mono text-xs">
      <div>
        <h4 className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">before</h4>
        <pre className="overflow-x-auto rounded border bg-muted/40 p-2">
          {renderTree(before, after, 'before')}
        </pre>
      </div>
      <div>
        <h4 className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">after</h4>
        <pre className="overflow-x-auto rounded border bg-muted/40 p-2">
          {renderTree(after, before, 'after')}
        </pre>
      </div>
    </div>
  );
}

type Side = 'before' | 'after';

function renderTree(
  self: JSONValue | undefined,
  other: JSONValue | undefined,
  side: Side,
  depth = 0,
): JSX.Element {
  if (self === undefined) {
    return (
      <span className={side === 'after' ? 'text-emerald-700' : 'text-rose-700'}>
        {side === 'after' ? '(added)' : '(removed)'}
      </span>
    );
  }
  if (self === null || typeof self !== 'object') {
    const changed = !deepEqual(self, other);
    const cls = changed
      ? side === 'after'
        ? 'bg-emerald-100 text-emerald-900'
        : 'bg-rose-100 text-rose-900'
      : 'text-foreground';
    return <span className={cls}>{JSON.stringify(self)}</span>;
  }
  if (Array.isArray(self)) {
    const otherArr = Array.isArray(other) ? other : [];
    return (
      <span>
        {'['}
        {self.map((item, i) => (
          <Fragment key={i}>
            {'\n'}
            {indent(depth + 1)}
            {renderTree(item, otherArr[i], side, depth + 1)}
            {i < self.length - 1 ? ',' : ''}
          </Fragment>
        ))}
        {'\n'}
        {indent(depth)}
        {']'}
      </span>
    );
  }
  // object
  const obj = self as Record<string, JSONValue>;
  const otherObj =
    other && typeof other === 'object' && !Array.isArray(other)
      ? (other as Record<string, JSONValue>)
      : {};
  const keys = Object.keys(obj);
  return (
    <span>
      {'{'}
      {keys.map((key, i) => {
        const hasOther = Object.prototype.hasOwnProperty.call(otherObj, key);
        return (
          <Fragment key={key}>
            {'\n'}
            {indent(depth + 1)}
            <span
              className={
                !hasOther
                  ? side === 'after'
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                  : 'text-muted-foreground'
              }
            >
              {JSON.stringify(key)}
            </span>
            {': '}
            {renderTree(obj[key], otherObj[key], side, depth + 1)}
            {i < keys.length - 1 ? ',' : ''}
          </Fragment>
        );
      })}
      {'\n'}
      {indent(depth)}
      {'}'}
    </span>
  );
}

function indent(n: number): string {
  return '  '.repeat(n);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) {
      return false;
    }
    return ak.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}
