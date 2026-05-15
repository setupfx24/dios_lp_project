/**
 * lint-staged config. Two concerns:
 *
 * 1. ESLint v9 flat config does NOT cascade — there is no auto-discovery
 *    walking up from a source file to find its eslint.config.js. Each
 *    workspace package has its own eslint.config.{js,mjs} with its own
 *    tsconfig project reference. So we must invoke eslint from inside
 *    each workspace, with the relative paths it expects.
 *
 * 2. typescript-eslint's projectService loads the entire tsconfig when
 *    asked about any one file. A single eslint process trying to handle
 *    files across many workspaces will OOM. So we always invoke per-workspace.
 *
 * The function form groups staged files by their workspace root and emits
 * one `pnpm --filter <workspace> exec eslint <files>` per group.
 */
const path = require('node:path');
const fs = require('node:fs');

const REPO_ROOT = __dirname;

function workspaceHasEslintConfig(workspaceDir) {
  return ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs'].some((name) =>
    fs.existsSync(path.join(REPO_ROOT, workspaceDir, name)),
  );
}

function quote(s) {
  return `"${s.replace(/"/g, '\\"')}"`;
}

/**
 * Map an absolute path to its workspace root and the relative path within it.
 * Returns null if the file does not belong to a recognized workspace.
 */
function locateWorkspace(absPath) {
  const rel = path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
  // apps/<name>/... or packages/<name>/... or packages/config/<name>/...
  let match = rel.match(/^(apps\/[^/]+)\/(.+)$/);
  if (match) {
    return { workspaceDir: match[1], fileInside: match[2] };
  }
  match = rel.match(/^(packages\/config\/[^/]+)\/(.+)$/);
  if (match) {
    return { workspaceDir: match[1], fileInside: match[2] };
  }
  match = rel.match(/^(packages\/[^/]+)\/(.+)$/);
  if (match) {
    return { workspaceDir: match[1], fileInside: match[2] };
  }
  return null;
}

function groupByWorkspace(files) {
  const groups = new Map();
  for (const abs of files) {
    const loc = locateWorkspace(abs);
    if (!loc) {
      // Root-level file — skip eslint (root has no lintable JS code we own).
      continue;
    }
    if (!groups.has(loc.workspaceDir)) {
      groups.set(loc.workspaceDir, []);
    }
    groups.get(loc.workspaceDir).push(loc.fileInside);
  }
  return groups;
}

module.exports = {
  // Prettier handles everything (single process, no projectService).
  '*.{ts,tsx,js,jsx,mjs,cjs}': (files) => {
    const cmds = [`prettier --write ${files.map(quote).join(' ')}`];
    const groups = groupByWorkspace(files);
    for (const [workspace, inside] of groups.entries()) {
      // Skip config-only workspaces (packages/config/*) that have no
      // eslint config of their own — they don't lint.
      if (!workspaceHasEslintConfig(workspace)) {
        continue;
      }
      // --no-warn-ignored: each workspace's eslint.config.{js,mjs} ignores
      // its OWN config files (and similar — vitest.config.ts, etc.). When
      // we hand those files in explicitly, eslint emits a warning per
      // ignored file, and --max-warnings=0 turns that into a failure.
      const args = inside.map(quote).join(' ');
      cmds.push(
        `pnpm --dir ${quote(workspace)} exec eslint --fix --max-warnings=0 --no-warn-ignored ${args}`,
      );
    }
    return cmds;
  },
  '*.{json,md,yml,yaml}': (files) => [`prettier --write ${files.map(quote).join(' ')}`],
};
