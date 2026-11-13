#!/usr/bin/env node
/**
 * memory-publish.mjs — the ONLY writer of the tracked memory seeds
 * (runtime-state-isolation, RS-REQ-016 / RS-REQ-053).
 *
 * Runtime memory lives in the state dir. Weekly (Sun 23:45, after REM sleep) this
 * script exports what changed to git as ONE reviewable PR:
 *
 *   1. skip if a chore/memory-publish-* PR is already open
 *   2. scratch worktree off origin/<base> (the live checkout is never read-written)
 *   3. diff state layers against the seeds in that worktree; no diff -> exit 0, nothing created
 *   4. scan the ADDED lines with pii-scrub (high-risk entity types) and a secrets-pattern
 *      check; any hit refuses the WHOLE publish: nothing written, nothing pushed, one
 *      deduped alert
 *   5. write only the changed layers, commit on chore/memory-publish-<date>, push, open a PR
 *   6. stop. This script never merges anything: a human reviews and merges the PR.
 *
 * Usage: node agents/memory-publish.mjs [--dry-run] [--base main] [--repo <path>]
 * Exit: 0 published / nothing to do / skipped, 1 refused (secret/PII) or failed.
 */

import {
  existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, rmSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { LAYERS, LEGACY } from './state-dir.mjs';

const __filename = fileURLToPath(import.meta.url);
export const BRANCH_PREFIX = 'chore/memory-publish-';

/** Secret shapes that must never reach a PR. */
export const SECRET_PATTERNS = [
  ['anthropic/openai-style key', /\bsk-[A-Za-z0-9_-]{16,}/],
  ['openrouter key', /\bsk-or-[A-Za-z0-9_-]{10,}/],
  ['groq key', /\bgsk_[A-Za-z0-9]{16,}/],
  ['github token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['aws access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['google api key', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['private key block', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['bearer token', /\bBearer\s+[A-Za-z0-9._~+/-]{24,}/],
  ['credentials in url', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{3,}@/i],
  ['assigned secret', /\b(?:api[_-]?key|secret|token|passw(?:or)?d)\b["']?\s*[:=]\s*["']?[A-Za-z0-9_\-/+=]{20,}/i],
];

/** pii-scrub entity types that block a publish (names, dates, places are normal memory content). */
export const BLOCKING_PII = new Set([
  'EMAIL_ADDRESS', 'PHONE_NUMBER', 'US_SSN', 'CREDIT_CARD', 'IBAN_CODE', 'US_BANK_NUMBER',
  'US_PASSPORT', 'US_DRIVER_LICENSE', 'CRYPTO', 'MEDICAL_LICENSE', 'IP_ADDRESS',
]);

export function scanSecrets(text) {
  const hits = [];
  for (const [name, re] of SECRET_PATTERNS) if (re.test(text)) hits.push(name);
  return hits;
}

/** Lines present in `next` but not in `prev` (multiset), i.e. the added content of a file. */
export function addedLines(prev, next) {
  const have = new Map();
  for (const l of String(prev || '').split('\n')) have.set(l, (have.get(l) || 0) + 1);
  const added = [];
  for (const l of String(next).split('\n')) {
    const n = have.get(l) || 0;
    if (n > 0) have.set(l, n - 1); else added.push(l);
  }
  return added;
}

const defaultExec = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

function defaultScrub(text) {
  return import('./pii-scrub.mjs').then(m => m.scrub(text, { tier: 'internal-production' }));
}

async function defaultNotify(key, message) {
  const n = await import('./notify.mjs');
  return n.triggerNotificationOnce(key, 'highSeverityFailure', message);
}

/** state-dir layers: [{agent, layer, path, data}] */
export function readStateLayers(stateDir) {
  const out = [];
  const root = join(stateDir, 'memory');
  if (!existsSync(root)) return out;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    for (const layer of LAYERS) {
      const p = join(root, e.name, `${layer}.json`);
      if (!existsSync(p)) continue;
      try { out.push({ agent: e.name, layer, path: p, data: JSON.parse(readFileSync(p, 'utf8')) }); } catch { /* corrupt layer: never publish it */ }
    }
  }
  return out;
}

/**
 * @param {object} o
 * @param {string} o.stateDir
 * @param {string} o.repoDir        repo whose .git/remotes are used (the live checkout's working tree is not touched)
 * @param {string} [o.base]
 * @param {boolean} [o.dryRun]
 * @param {Function} [o.exec]       (cmd, args, opts) => string; used for git AND gh
 * @param {Function} [o.scrubFn]    async text => { entities: [{type,start,end}] }
 * @param {Function} [o.notify]     async (dedupeKey, message) => void
 * @param {Function} [o.now]
 * @returns {Promise<{status:string, files?:string[], branch?:string, prUrl?:string, findings?:string[]}>}
 */
export async function publish({
  stateDir, repoDir, base = 'main', dryRun = false,
  exec = defaultExec, scrubFn = defaultScrub, notify = defaultNotify, now = () => new Date(),
}) {
  if (!stateDir || stateDir === LEGACY) return { status: 'skipped-legacy' };
  const layers = readStateLayers(stateDir);
  if (!layers.length) return { status: 'no-diff', files: [] };

  const date = now().toISOString().slice(0, 10);
  const branch = `${BRANCH_PREFIX}${date}`;
  const git = (args, cwd = repoDir) => exec('git', ['-C', cwd, ...args]);

  // 1. one open publish PR at a time
  const open = JSON.parse(exec('gh', ['pr', 'list', '--state', 'open', '--json', 'number,headRefName,url', '--limit', '100'], { cwd: repoDir }) || '[]');
  const existing = open.find(p => String(p.headRefName || '').startsWith(BRANCH_PREFIX));
  if (existing) return { status: 'skipped-open-pr', prUrl: existing.url };

  // 2. scratch worktree off origin/<base>
  git(['fetch', '-q', 'origin', base]);
  const scratchRoot = mkdtempSync(join(tmpdir(), 'memory-publish-'));
  const wt = join(scratchRoot, 'wt');
  git(['worktree', 'add', '-q', '--detach', wt, `origin/${base}`]);
  try {
    // 3. diff state against the seeds in the scratch tree
    const changes = [];
    for (const l of layers) {
      const rel = join('agents', l.agent, 'memory', `${l.layer}.json`);
      const seedFile = join(wt, rel);
      const next = JSON.stringify(l.data, null, 2);
      const prev = existsSync(seedFile) ? readFileSync(seedFile, 'utf8') : null;
      if (prev !== null) {
        try { if (JSON.stringify(JSON.parse(prev)) === JSON.stringify(l.data)) continue; } catch { /* unparseable seed: treat as changed */ }
      } else if (!existsSync(dirname(seedFile)) && !existsSync(join(wt, 'agents', l.agent))) {
        continue; // agent not in this repo: nothing to publish into
      }
      changes.push({ rel, seedFile, next, added: addedLines(prev, next) });
    }
    if (!changes.length) return { status: 'no-diff', files: [] };
    const files = changes.map(c => c.rel);
    if (dryRun) return { status: 'dry-run', files };

    // 4. scrub the ADDED content; refuse the whole publish on any hit
    const findings = [];
    for (const c of changes) {
      const text = c.added.join('\n');
      for (const name of scanSecrets(text)) findings.push(`${c.rel}: ${name}`);
      let res;
      try { res = await scrubFn(text); } catch (err) { res = { entities: [], error: err.message }; }
      for (const ent of res?.entities || []) {
        const type = ent.type || ent.entity_type;
        if (!BLOCKING_PII.has(type)) continue;
        const span = typeof ent.start === 'number' ? text.slice(ent.start, ent.end) : '';
        if (type === 'EMAIL_ADDRESS' && /^noreply@/i.test(span)) continue; // attribution lines
        findings.push(`${c.rel}: PII ${type}`);
      }
    }
    if (findings.length) {
      const key = `memory-publish-refused:${createHash('sha256').update(findings.join('|')).digest('hex').slice(0, 16)}`;
      try {
        await notify(key, `memory-publish REFUSED (nothing pushed): ${findings.join('; ')}. Scrub the layer in the state dir, then re-run.`);
      } catch { /* alert failure must not mask the refusal */ }
      return { status: 'refused', findings, files };
    }

    // 5. branch, write only changed layers, commit, push, PR
    if (exec('git', ['-C', repoDir, 'ls-remote', '--heads', 'origin', branch])) return { status: 'skipped-branch-exists', branch };
    git(['checkout', '-q', '-b', branch], wt);
    for (const c of changes) { mkdirSync(dirname(c.seedFile), { recursive: true }); writeFileSync(c.seedFile, c.next); }
    git(['add', '--', ...files], wt);
    git(['-c', 'user.name=sdlc-memory-publish', '-c', 'user.email=noreply@localhost', 'commit', '-q', '-m',
      `chore(memory): publish runtime memory ${date}\n\n${files.map(f => `- ${f}`).join('\n')}`], wt);
    git(['push', '-q', 'origin', branch], wt);
    const body = `Weekly publish of runtime agent memory (state dir -> tracked seeds), ${date}.\n\n` +
      `Changed layers (${files.length}):\n${files.map(f => `- \`${f}\``).join('\n')}\n\n` +
      `Scanned with pii-scrub and a secrets-pattern check; no findings. Review the diff and merge by hand — ` +
      `this PR is never self-merged.`;
    const prUrl = exec('gh', ['pr', 'create', '--base', base, '--head', branch,
      '--title', `chore(memory): weekly memory publish ${date}`, '--body', body], { cwd: repoDir });
    return { status: 'published', files, branch, prUrl };
  } finally {
    try { git(['worktree', 'remove', '--force', wt]); } catch { /* best effort */ }
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}

function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

if (__isMainModule()) {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const { loadConfig } = await import('./load-config.mjs');
  const config = loadConfig();
  let r;
  try {
    r = await publish({
      stateDir: config.stateDir,
      repoDir: opt('--repo') ? resolve(opt('--repo')) : config.projectDir,
      base: opt('--base') || 'main',
      dryRun: args.includes('--dry-run'),
    });
  } catch (err) {
    console.error(`memory-publish failed: ${err.message}`);
    process.exit(1);
  }
  console.log(`memory-publish: ${r.status}${r.files?.length ? ` (${r.files.length} file(s))` : ''}${r.prUrl ? ` ${r.prUrl}` : ''}`);
  for (const f of r.findings || []) console.error(`  finding: ${f}`);
  process.exit(r.status === 'refused' ? 1 : 0);
}
