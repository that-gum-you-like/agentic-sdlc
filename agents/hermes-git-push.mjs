#!/usr/bin/env node
/**
 * hermes-git-push.mjs — two-gate, least-privilege GitHub push for autonomous
 * Hermes cycles (openspec change: hermes-github-write-access).
 *
 * Gate 1 (GitHub-side): a fine-grained PAT whose repo selection is Bryce's
 * designation list. Gate 2 (client-side): ~/.hermes/github-write-allowlist.json
 * — the helper refuses any repo not listed and any branch that is protected or
 * outside the `hermes/auto/` namespace. Never force-pushes. Never targets main.
 *
 *   node agents/hermes-git-push.mjs init                       # scaffold allowlist (never overwrites)
 *   node agents/hermes-git-push.mjs check --repo <dir>         # dry-run the gates, no writes
 *   node agents/hermes-git-push.mjs push  --repo <dir> --id <cycle-id>
 *        [--title <t>] [--body <b>] [--base main]              # commit -> push -> draft PR
 *
 * Env: GITHUB_WRITE_TOKEN (preferred) or GITHUB_TOKEN, from the environment or
 * ~/.hermes/.env. Overrides for tests: HERMES_ALLOWLIST_PATH, HERMES_ENV_PATH.
 * Zero npm deps (git subprocess + global fetch). The token is never printed.
 *
 * Exports (for tests): parseOrigin, sanitizeId, guard, redact, loadAllowlist,
 * findToken, pushCycle, initAllowlist
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const ALLOWLIST_PATH = () => process.env.HERMES_ALLOWLIST_PATH || join(homedir(), '.hermes', 'github-write-allowlist.json');
const ENV_PATH = () => process.env.HERMES_ENV_PATH || join(homedir(), '.hermes', '.env');

// ---------------------------------------------------------------------------
// pure guards
// ---------------------------------------------------------------------------

/** Parse "owner/name" out of an https or ssh GitHub origin URL. Null if not GitHub. */
export function parseOrigin(url) {
  const m = String(url || '').trim().match(/^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:)([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  return m ? { owner: m[1], name: m[2], full: `${m[1]}/${m[2]}` } : null;
}

/** Cycle ids become branch suffixes: strip anything outside [A-Za-z0-9._-]. */
export function sanitizeId(id) {
  return String(id || '').replace(/[^A-Za-z0-9._-]/g, '');
}

/** Scrub any tokenized remote out of text before it can reach a log. */
export function redact(text) {
  return String(text || '').replace(/x-access-token:[^@\s]*@/g, 'x-access-token:***@');
}

/**
 * Gate 2: refuse unless repo is designated AND the branch is namespaced and
 * unprotected. Returns { ok, branch } or { ok:false, reason }. Fail closed.
 */
export function guard({ repoFull, cycleId, allowlist }) {
  if (!allowlist || !Array.isArray(allowlist.repos)) return { ok: false, reason: 'allowlist missing or unparseable — refusing (fail closed). Run: hermes-git-push.mjs init' };
  if (!repoFull) return { ok: false, reason: 'origin is not a github.com remote' };
  if (!allowlist.repos.includes(repoFull)) return { ok: false, reason: `repo not allowlisted: ${repoFull} (edit ${ALLOWLIST_PATH()} to designate it)` };
  const prefix = allowlist.branchPrefix ?? 'hermes/auto/'; // ?? not ||: an explicit "" prefix must not silently widen to the default
  const id = sanitizeId(cycleId);
  if (!id) return { ok: false, reason: `cycle id sanitizes to empty: ${JSON.stringify(String(cycleId || ''))}` };
  const branch = `${prefix}${id}`;
  const protectedBranches = allowlist.protectedBranches || ['main', 'master'];
  if (protectedBranches.includes(branch)) return { ok: false, reason: `branch is protected: ${branch}` };
  if (!branch.startsWith(prefix)) return { ok: false, reason: `branch outside namespace ${prefix}: ${branch}` };
  return { ok: true, branch };
}

// ---------------------------------------------------------------------------
// config + token
// ---------------------------------------------------------------------------

export function loadAllowlist() {
  try { return JSON.parse(fs.readFileSync(ALLOWLIST_PATH(), 'utf8')); } catch { return null; }
}

/** GITHUB_WRITE_TOKEN > GITHUB_TOKEN, from env first then ~/.hermes/.env. Null if absent. */
export function findToken(env = process.env) {
  if (env.GITHUB_WRITE_TOKEN) return env.GITHUB_WRITE_TOKEN;
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  let raw = '';
  try { raw = fs.readFileSync(ENV_PATH(), 'utf8'); } catch { return null; }
  const grab = (key) => {
    const m = raw.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*"?([^"\\n#]+)"?\\s*$`, 'm'));
    return m ? m[1].trim() : null;
  };
  return grab('GITHUB_WRITE_TOKEN') || grab('GITHUB_TOKEN');
}

export function initAllowlist() {
  const p = ALLOWLIST_PATH();
  if (fs.existsSync(p)) return { created: false, path: p };
  fs.mkdirSync(dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({
    repos: ['that-gum-you-like/agentic-sdlc'],
    branchPrefix: 'hermes/auto/',
    protectedBranches: ['main', 'master'],
  }, null, 2) + '\n', { mode: 0o600 });
  return { created: true, path: p };
}

// ---------------------------------------------------------------------------
// effects (injectable for tests)
// ---------------------------------------------------------------------------

function defaultRunGit(args, { cwd }) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.error) throw new Error(redact(`git ${args[0]} failed to spawn: ${r.error.message}`));
  if (r.status !== 0) throw new Error(redact(`git ${args[0]} failed: ${(r.stderr || r.stdout || '').trim().slice(0, 400)}`));
  return (r.stdout || '').trim();
}

/**
 * The full pipeline: gates -> commit-if-dirty -> push -> draft PR.
 * Effects are injectable: { runGit, fetchImpl } — tests fake both.
 */
export async function pushCycle({ repoDir, cycleId, title, body, base = 'main', dryRun = false,
  runGit = defaultRunGit, fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const allowlist = loadAllowlist();
  const originUrl = runGit(['remote', 'get-url', 'origin'], { cwd: repoDir });
  const origin = parseOrigin(originUrl);
  const gate = guard({ repoFull: origin && origin.full, cycleId, allowlist });
  if (!gate.ok) throw new Error(gate.reason);

  const token = findToken(env);
  if (!token) throw new Error('no GitHub token: set GITHUB_WRITE_TOKEN (preferred) or GITHUB_TOKEN in the environment or ~/.hermes/.env');
  if (dryRun) return { branch: gate.branch, repo: origin.full, pushed: false, dryRun: true };

  // Commit anything dirty; a clean tree with nothing new is a graceful no-op.
  const dirty = runGit(['status', '--porcelain'], { cwd: repoDir });
  if (dirty) {
    runGit(['add', '-A'], { cwd: repoDir });
    runGit(['commit', '-m', title || `hermes auto cycle ${sanitizeId(cycleId)}`], { cwd: repoDir });
  } else {
    let remoteSha = '';
    try { remoteSha = runGit(['ls-remote', 'origin', `refs/heads/${gate.branch}`], { cwd: repoDir }).split('\t')[0]; } catch { /* remote branch may not exist yet */ }
    const headSha = runGit(['rev-parse', 'HEAD'], { cwd: repoDir });
    if (remoteSha && remoteSha === headSha) return { branch: gate.branch, repo: origin.full, pushed: false, reason: 'nothing to push' };
  }

  // Tokenized push — the URL is a git argument only; never force, never main.
  const pushUrl = `https://x-access-token:${token}@github.com/${origin.full}.git`;
  try {
    runGit(['push', pushUrl, `HEAD:refs/heads/${gate.branch}`], { cwd: repoDir });
  } catch (e) {
    throw new Error(redact(e.message));
  }

  // Draft PR into the review gate. Duplicate (422) is success.
  const res = await fetchImpl(`https://api.github.com/repos/${origin.full}/pulls`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'agentic-sdlc-hermes-git-push',
    },
    body: JSON.stringify({
      title: title || `Hermes auto cycle ${sanitizeId(cycleId)}`,
      head: gate.branch,
      base,
      draft: true,
      body: (body || `Autonomous Hermes cycle output on \`${gate.branch}\`. Review before merge.`)
        + '\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    }),
  });
  if (res.status === 422) {
    return { branch: gate.branch, repo: origin.full, pushed: true, pr: 'exists' };
  }
  if (!res.ok) {
    const detail = redact(await res.text().catch(() => ''));
    throw new Error(`pushed ${gate.branch} but PR creation failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
  const pr = await res.json();
  return { branch: gate.branch, repo: origin.full, pushed: true, pr: pr.number, url: pr.html_url };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : null;
}

const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (__isMainModule) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  (async () => {
    if (cmd === 'init') {
      const r = initAllowlist();
      console.log(r.created ? `✅ created ${r.path} (edit it to designate repos)` : `already exists: ${r.path} (left untouched)`);
    } else if (cmd === 'check' || cmd === 'push') {
      const repoDir = argValue(argv, '--repo') || process.cwd();
      const cycleId = argValue(argv, '--id') || (cmd === 'check' ? 'dry-run-check' : null);
      if (!cycleId) throw new Error('push requires --id <cycle-id>');
      const r = await pushCycle({
        repoDir, cycleId,
        title: argValue(argv, '--title') || undefined,
        body: argValue(argv, '--body') || undefined,
        base: argValue(argv, '--base') || 'main',
        dryRun: cmd === 'check',
      });
      if (r.dryRun) console.log(`✅ gates pass: would push ${r.repo} HEAD → ${r.branch}`);
      else if (!r.pushed) console.log(`✅ ${r.reason || 'nothing to push'} (${r.repo} ${r.branch})`);
      else console.log(`✅ pushed ${r.repo} → ${r.branch}${r.pr === 'exists' ? ' (draft PR already open)' : ` — draft PR #${r.pr} ${r.url || ''}`}`);
    } else {
      console.error('Usage: hermes-git-push.mjs <init | check [--repo <dir>] | push --repo <dir> --id <cycle-id> [--title t] [--body b] [--base main]>');
      process.exit(1);
    }
  })().catch((e) => {
    console.error(`✗ ${redact(e.message)}`);
    process.exit(1);
  });
}
