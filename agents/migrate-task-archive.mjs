#!/usr/bin/env node
/**
 * migrate-task-archive — one-shot restore of the legacy tasks/completed/ into tasks/queue/ (RS-REQ-022).
 *
 *   absent in queue        -> copy into queue (archived_at stamped if missing)
 *   present, identical     -> no-op
 *   present, different     -> queue copy wins; the other is saved under
 *                             <stateDir>/migration/task-archive-conflicts/
 *
 * Never deletes or modifies tasks/completed/ (it may be root-owned). Prints the
 * command a human can run to remove it. Idempotent. Node stdlib only.
 *
 * Usage: node agents/migrate-task-archive.mjs [--dry-run] [--json] [--project-dir <p>] [--state-dir <p>]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/** Byte-identical, or identical once the migration's own archived_at stamp is ignored (keeps reruns no-ops). */
function sameTask(a, b) {
  if (a.equals(b)) return true;
  try {
    const strip = buf => { const t = JSON.parse(buf.toString('utf8')); delete t.archived_at; return JSON.stringify(t); };
    return strip(a) === strip(b);
  } catch { return false; }
}

export function migrateTaskArchive({ queueDir, legacyDir, stateDir, dryRun = false, now = new Date() }) {
  const report = { restored: [], identical: [], conflicts: [], unreadable: false, dryRun, legacyDir, removeCommand: null };
  if (!existsSync(legacyDir)) return report;
  let files;
  try {
    files = readdirSync(legacyDir).filter(f => f.endsWith('.json')).sort();
    for (const f of files) readFileSync(join(legacyDir, f)); // surface permission problems before any write
  } catch {
    report.unreadable = true;
    report.restored = []; report.conflicts = [];
    return report;
  }
  const conflictDir = join(stateDir, 'migration', 'task-archive-conflicts');
  for (const f of files) {
    const legacy = readFileSync(join(legacyDir, f));
    const target = join(queueDir, f);
    if (!existsSync(target)) {
      report.restored.push(f);
      if (!dryRun) {
        let out = legacy;
        try {
          const t = JSON.parse(legacy.toString('utf8'));
          if (!t.archived_at) { t.archived_at = now.toISOString(); out = Buffer.from(JSON.stringify(t, null, 2)); }
        } catch { /* keep bytes verbatim */ }
        writeFileSync(target, out);
      }
    } else if (sameTask(readFileSync(target), legacy)) {
      report.identical.push(f);
    } else {
      report.conflicts.push(f);
      if (!dryRun) {
        mkdirSync(conflictDir, { recursive: true });
        writeFileSync(join(conflictDir, f), legacy);
      }
    }
  }
  try {
    const owner = statSync(legacyDir).uid;
    report.removeCommand = owner === process.getuid?.()
      ? `rm -r ${legacyDir}`
      : `sudo rm -r ${legacyDir}   # owned by uid ${owner}`;
  } catch { report.removeCommand = `sudo rm -r ${legacyDir}`; }
  return report;
}

const __isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (__isMainModule) {
  const argv = process.argv.slice(2);
  const opt = n => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : undefined; };
  const projectDir = resolve(opt('--project-dir') || process.env.SDLC_PROJECT_DIR || process.cwd());
  const stateDir = resolve(opt('--state-dir') || process.env.SDLC_STATE_DIR || join(homedir(), '.local/state/sdlc'));
  const r = migrateTaskArchive({
    queueDir: join(projectDir, 'tasks/queue'), legacyDir: join(projectDir, 'tasks/completed'),
    stateDir, dryRun: argv.includes('--dry-run'),
  });
  if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else if (r.unreadable) console.log(`Cannot read ${r.legacyDir}; nothing was written.`);
  else {
    console.log(`${r.dryRun ? '[dry-run] ' : ''}restored ${r.restored.length}, identical ${r.identical.length}, conflicts ${r.conflicts.length}`);
    if (r.conflicts.length) console.log(`conflict copies: ${join(stateDir, 'migration/task-archive-conflicts')}`);
    if (r.removeCommand) console.log(`A human can remove the legacy directory with: ${r.removeCommand}`);
  }
  process.exitCode = r.unreadable ? 1 : 0;
}
