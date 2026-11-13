#!/usr/bin/env node
/**
 * Hermes config guard (RS-REQ-063, RS-REQ-060/061).
 *
 * Fails loudly (rc 1) when ~/.hermes/config.yaml would give a Docker sandbox
 * read-write access to the human home, an ancestor of it, or a live project
 * checkout: `terminal.docker_mount_cwd_to_workspace: true` while cwd resolves
 * to one of those, or a `terminal.docker_volumes` entry mounting one rw.
 * Read-only: it never edits the config. Node stdlib only (no YAML dependency;
 * the `terminal:` block is read with a small indentation-aware parser).
 *
 * Usage: node agents/hermes-config-guard.mjs [config.yaml] [--cwd <dir>]
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIX = 'set terminal.docker_mount_cwd_to_workspace: false and mount only ~/.hermes/workspaces/<project> at /workspace';

/** Parse the top-level `terminal:` mapping: scalars and `- item` lists. */
export function parseTerminalBlock(text) {
  const out = {};
  let inBlock = false;
  let listKey = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\S/.test(line)) { inBlock = /^terminal:\s*$/.test(line); listKey = null; continue; }
    if (!inBlock) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) { out[listKey].push(unquote(item[1])); continue; }
    const kv = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    if (kv[2] === '') { listKey = kv[1]; out[listKey] = []; continue; }
    listKey = null;
    out[kv[1]] = parseScalar(kv[2]);
  }
  return out;
}
function unquote(s) { return s.trim().replace(/^(['"])(.*)\1$/, '$2'); }
function parseScalar(s) {
  const v = unquote(s);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

/** Live checkouts = directories directly under home that own a real `.git` directory (worktrees have a .git file). */
export function discoverCheckouts(home = homedir()) {
  const found = [];
  try {
    for (const name of readdirSync(home)) {
      if (name.startsWith('.')) continue;
      try { if (statSync(join(home, name, '.git')).isDirectory()) found.push(join(home, name)); } catch { /* not a checkout */ }
    }
  } catch { /* unreadable home */ }
  return found;
}

const within = (child, parent) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);

/** Why a host path must never be mounted rw into a sandbox, or null if it is safe. */
export function exposureReason(path, { home = homedir(), checkouts = discoverCheckouts(home) } = {}) {
  const p = resolve(path);
  if (within(home, p)) return p === resolve(home) ? 'the human home' : 'an ancestor of the human home';
  for (const c of checkouts) if (within(p, resolve(c))) return `the live checkout ${c}`;
  return null;
}

/**
 * @returns {{ok: boolean, notes: string[], failures: Array<{key: string, value: string, reason: string}>}}
 */
export function checkHermesConfig({ configPath = join(homedir(), '.hermes/config.yaml'), cwd = process.cwd(), home = homedir(), checkouts, allowRoVolumes = [] } = {}) {
  const notes = [];
  const failures = [];
  if (!existsSync(configPath)) return { ok: true, notes: [`no Hermes config at ${configPath}; nothing to guard`], failures };
  const t = parseTerminalBlock(readFileSync(configPath, 'utf8'));
  const opts = { home, checkouts: checkouts ?? discoverCheckouts(home) };

  if (t.docker_mount_cwd_to_workspace === true) {
    const base = typeof t.cwd === 'string' && t.cwd ? resolve(cwd, t.cwd.replace(/^~(?=$|\/)/, home)) : resolve(cwd);
    const why = exposureReason(base, opts);
    if (why) failures.push({ key: 'terminal.docker_mount_cwd_to_workspace', value: `true (cwd ${base} is ${why})`, reason: why });
  }
  for (const key of ['docker_volumes', 'docker_volume']) {
    const vols = Array.isArray(t[key]) ? t[key] : typeof t[key] === 'string' ? [t[key]] : [];
    for (const v of vols) {
      const [src, , mode] = String(v).split(':');
      const ro = mode === 'ro' || String(v).endsWith(':ro');
      const why = exposureReason(src.replace(/^~(?=$|\/)/, home), opts);
      if (!why) continue;
      if (ro && allowRoVolumes.includes(src)) { notes.push(`read-only mount of ${src} permitted (listed)`); continue; }
      failures.push({ key: `terminal.${key}`, value: v, reason: `${ro ? 'read-only mount not in the allow list of' : 'read-write mount of'} ${why}` });
    }
  }
  return { ok: failures.length === 0, notes, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--cwd');
  const cwd = ci >= 0 ? args.splice(ci, 2)[1] : process.cwd();
  const r = checkHermesConfig({ configPath: args[0] || undefined, cwd });
  for (const n of r.notes) console.log(`hermes-config-guard: ${n}`);
  for (const f of r.failures) {
    console.error(`FAIL ${f.key}: ${f.value} (${f.reason})`);
    console.error(`  fix: ${FIX}`);
  }
  if (r.ok) console.log('hermes-config-guard: ok');
  process.exit(r.ok ? 0 : 1);
}
