#!/usr/bin/env node
/**
 * deploy-runner.mjs
 * Agentic SDLC Framework — reconciling, approval-gated production deploy runner
 * (openspec: autonomous-deploy-pipeline).
 *
 * Each tick, per project: compare origin/<base> HEAD against pm/.last-deployed
 * and drive the delta through approval → test → deploy → verify → notify.
 * Idempotent — the 30-min reconcile timer is the correctness mechanism; the
 * post-merge kick from pr-auto-review is only a latency optimization. Crashes,
 * skipped ticks, and manual merges all converge on the next tick.
 *
 * Approval: sha-bound, single-use, deterministic. The runner does ONE
 * non-blocking getUpdates poll of the dedicated deploy bot
 * (TELEGRAM_DEPLOY_BOT_TOKEN) per invocation and records APPROVE|REJECT <sha8>
 * messages from TELEGRAM_CHAT_ID as token files in the project's pm/. No LLM,
 * no gateway in the approval path.
 *
 * Deploys run in an isolated clone (~/.sdlc-deploy-clone-<project>) of
 * origin/<base> — never the working tree, never the drain clone. A failed
 * deploy is TERMINAL for that sha (.deploy-failed-<sha8>): no retry loops on
 * an expired CLI login; a human clears the token or lands a new commit.
 *
 * Usage:
 *   node agents/deploy-runner.mjs --project-dir <dir> [--project-dir <dir>...] [--dry-run]
 *
 * Exit codes: 0 nothing-to-do/success/waiting-on-approval; 1 a project errored.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, unlinkSync, cpSync, statSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import http from 'http';
import https from 'https';
import { basename, dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

// env-guard imports parseApprovalCommand from THIS module, so importing it at
// the top level would create an evaluation cycle. Both sides only need each
// other inside function bodies, so resolve lazily and the cycle never forms.
const __req = createRequire(import.meta.url);
const guardModule = () => __req('./env-guard.mjs');
const checkAccess = (args) => guardModule().checkAccess(args);
const recordAccess = (r, o) => guardModule().recordAccess(r, o);
const portfolioLoad = (path) => __req('./portfolio.mjs').load(path);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRAMEWORK_REPO = resolve(__dirname, '..');

function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const DEFAULTS = {
  expectStatus: 200,
  timeoutSeconds: 60,
  cooldownSeconds: 600,
  approval: 'telegram',
};

/** Read + normalize a project's deploy config. Returns null when absent/disabled. */
export function loadDeployConfig(projectDir) {
  const path = join(projectDir, 'agents', 'project.json');
  if (!existsSync(path)) return { error: `no agents/project.json under ${projectDir}` };
  let project;
  try { project = JSON.parse(readFileSync(path, 'utf8')); } catch (err) {
    return { error: `unparseable project.json: ${err.message}` };
  }
  const d = project.deploy;
  if (!d || d.enabled !== true) return { disabled: true, project };
  if (!d.deployCmd) return { error: 'deploy.enabled is true but deploy.deployCmd is missing' };
  return {
    project,
    deploy: {
      deployCmd: d.deployCmd,
      rollbackCmd: d.rollbackCmd || project.rollbackCmd || null,
      baseBranch: d.baseBranch || null, // null → detect from origin/HEAD
      approval: d.approval || DEFAULTS.approval,
      verifyTests: d.verifyTests !== false,
      cooldownSeconds: d.cooldownSeconds ?? DEFAULTS.cooldownSeconds,
      verify: {
        smokeUrl: d.verify?.smokeUrl || null,
        expectStatus: d.verify?.expectStatus ?? DEFAULTS.expectStatus,
        timeoutSeconds: d.verify?.timeoutSeconds ?? DEFAULTS.timeoutSeconds,
      },
    },
    testCmd: project.testCmd || 'npm test',
  };
}

/**
 * Which portfolio environment does this project deploy to?
 * `--environment` wins; otherwise the entry's defaultDeploy environment;
 * otherwise the literal name "production". Pure so it is unit-testable.
 */
export function environmentFor(projectName, deploy = {}, portfolioDoc = null) {
  if (deploy.environment) return deploy.environment;
  if (process.env.DEPLOY_ENVIRONMENT) return process.env.DEPLOY_ENVIRONMENT;
  try {
    const doc = portfolioDoc || portfolioLoad();
    const proj = (doc.projects || []).find((p) => p && p.name === projectName);
    const def = (proj && proj.environments || []).find((e) => e && e.defaultDeploy);
    if (def) return def.name;
  } catch { /* fall through — the guard will deny on an unknown environment */ }
  return 'production';
}

// ---------------------------------------------------------------------------
// Approval commands (pure — unit tested)
// ---------------------------------------------------------------------------

/** Parse one Telegram message text into an approval command, or null. */
export function parseApprovalCommand(text) {
  const m = /^\s*(APPROVE|REJECT)\s+([0-9a-f]{8})\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  return { action: m[1].toUpperCase() === 'APPROVE' ? 'approve' : 'reject', sha8: m[2].toLowerCase() };
}

/**
 * Pure per-tick decision. All filesystem/git state is passed in so the state
 * machine is deterministic and unit-testable.
 * @returns one of: 'disabled' | 'up-to-date' | 'terminal' | 'request-approval'
 *          | 'wait-approval' | 'cooldown' | 'deploy'
 */
export function decide({ enabled, targetSha, lastDeployedSha, failed, rejected, approved, pending, approvalMode, cooldownOk }) {
  if (!enabled) return 'disabled';
  if (!targetSha) return 'terminal'; // cannot resolve a target → never guess a deploy
  if (targetSha === lastDeployedSha) return 'up-to-date';
  if (failed || rejected) return 'terminal';
  if (approvalMode !== 'none' && !approved) return pending ? 'wait-approval' : 'request-approval';
  if (!cooldownOk) return 'cooldown';
  return 'deploy';
}

// ---------------------------------------------------------------------------
// Telegram deploy-bot poll (Bot B — dedicated getUpdates stream)
// ---------------------------------------------------------------------------

function telegramGet(token, method, params) {
  return new Promise((resolvePromise) => {
    const qs = new URLSearchParams(params).toString();
    const req = https.request(
      { hostname: 'api.telegram.org', path: `/bot${token}/${method}?${qs}`, method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolvePromise(JSON.parse(data)); } catch { resolvePromise(null); }
        });
      }
    );
    req.on('error', () => resolvePromise(null));
    req.end();
  });
}

// Resolved deploy-bot handle: undefined = not yet looked up, null = lookup
// failed, '@name' = resolved. Memoised for the process lifetime — the runner is
// a oneshot unit, so each 30-min tick re-resolves.
let _deployBotHandle;

/**
 * The deploy bot's '@username', derived from the token we actually poll — so the
 * bot we name is by construction the bot that can approve. Returns null on any
 * failure; callers fall back to generic wording. Never throws, never blocks
 * deploy state (same contract as notify()).
 */
export async function deployBotHandle(token) {
  if (_deployBotHandle !== undefined) return _deployBotHandle;
  _deployBotHandle = null;
  if (!token) return _deployBotHandle;
  try {
    // telegramGet has no timeout of its own; don't let a hung request stall the tick.
    const resp = await Promise.race([
      telegramGet(token, 'getMe', {}),
      new Promise((r) => setTimeout(() => r(null), 5000)),
    ]);
    const username = resp?.ok && resp.result?.username;
    if (username) _deployBotHandle = `@${username}`;
  } catch { /* stays null */ }
  return _deployBotHandle;
}

/** Test seam: reset the memoised handle. */
export function _resetDeployBotHandle() { _deployBotHandle = undefined; }

/**
 * Build the approval request. Pure so the wording is testable offline — the
 * previous message said only "Reply to the DEPLOY bot" without naming it, which
 * made every request unactionable (openspec: deploy-approval-usability).
 * Plain text, no parse mode: commit subjects can't break rendering or inject markup.
 */
export function buildApprovalMessage({ projectName, baseBranch, sha8, subject, handle }) {
  const head = `🚀 Deploy ${projectName}? origin/${baseBranch}@${sha8} — "${subject}"`;
  const where = handle
    ? `Approve in the deploy bot ${handle} — https://t.me/${handle.replace(/^@/, '')}`
    : 'Approve in the dedicated DEPLOY bot (TELEGRAM_DEPLOY_BOT_TOKEN) — NOT this chat.';
  return [
    head,
    '',
    where,
    'Send exactly:',
    `APPROVE ${sha8}`,
    `(or: REJECT ${sha8})`,
    '',
    'Note: that is a DIFFERENT bot from the one sending this message. Replying here does nothing.',
  ].join('\n');
}

/**
 * One non-blocking poll of the deploy bot. Writes sha-bound token files into
 * each project's pm/ dir. The offset cursor lives in the FRAMEWORK pm/ — one
 * consumer stream, one writer (projects are processed sequentially in a single
 * invocation, so there is no cursor race).
 */
export async function pollApprovals({ token, chatId, projectDirs, log = () => {} }) {
  if (!token || !chatId) return { polled: false, reason: 'deploy bot not configured' };
  const offsetFile = join(FRAMEWORK_REPO, 'pm', '.deploy-bot-offset');
  let offset = 0;
  try { offset = parseInt(readFileSync(offsetFile, 'utf8').trim(), 10) || 0; } catch { /* first run */ }

  const resp = await telegramGet(token, 'getUpdates', { offset: String(offset), timeout: '0' });
  if (!resp?.ok || !Array.isArray(resp.result)) return { polled: false, reason: 'getUpdates failed' };

  let maxUpdateId = offset - 1;
  const commands = [];
  for (const upd of resp.result) {
    if (upd.update_id > maxUpdateId) maxUpdateId = upd.update_id;
    const msg = upd.message;
    if (!msg?.text) continue;
    // Hard filter: only the owner's chat may approve or reject.
    if (String(msg.chat?.id) !== String(chatId)) continue;
    const cmd = parseApprovalCommand(msg.text);
    if (cmd) commands.push(cmd);
  }

  for (const { action, sha8 } of commands) {
    for (const projectDir of projectDirs) {
      const pmDir = join(projectDir, 'pm');
      // A token only means something for a project whose pending marker names
      // this sha — that is what binds the reply to the request.
      if (!existsSync(join(pmDir, `.deploy-pending-${sha8}`))) continue;
      const tokenFile = join(pmDir, action === 'approve' ? `.deploy-approved-${sha8}` : `.deploy-rejected-${sha8}`);
      mkdirSync(pmDir, { recursive: true });
      writeFileSync(tokenFile, new Date().toISOString() + '\n');
      log(`${action.toUpperCase()} ${sha8} recorded for ${basename(projectDir)}`);
    }
  }

  mkdirSync(dirname(offsetFile), { recursive: true });
  writeFileSync(offsetFile, String(maxUpdateId + 1) + '\n');
  return { polled: true, commands };
}

// ---------------------------------------------------------------------------
// Smoke verify
// ---------------------------------------------------------------------------

function httpStatus(url) {
  return new Promise((resolvePromise) => {
    try {
      const lib = String(url).startsWith('http://') ? http : https;
      const req = lib.request(url, { method: 'GET', timeout: 10_000 }, (res) => {
        res.resume();
        resolvePromise(res.statusCode);
      });
      req.on('error', () => resolvePromise(null));
      req.on('timeout', () => { req.destroy(); resolvePromise(null); });
      req.end();
    } catch { resolvePromise(null); }
  });
}

/** Poll smokeUrl until expectStatus or timeout. Injectable for tests. */
export async function smokeVerify({ smokeUrl, expectStatus, timeoutSeconds, fetchStatus = httpStatus, sleepMs = 5000, now = Date.now }) {
  if (!smokeUrl) return { ok: true, skipped: true };
  const deadline = now() + timeoutSeconds * 1000;
  let last = null;
  for (;;) {
    last = await fetchStatus(smokeUrl);
    if (last === expectStatus) return { ok: true, status: last };
    if (now() >= deadline) return { ok: false, status: last };
    await new Promise((r) => setTimeout(r, sleepMs));
  }
}

// ---------------------------------------------------------------------------
// Git + clone helpers
// ---------------------------------------------------------------------------

function git(repoDir, args, opts = {}) {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8', ...opts }).trim();
}

function detectBaseBranch(cloneDir) {
  try {
    return git(cloneDir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '');
  } catch { return null; }
}

/**
 * Strip credentials from a git remote before it is ever logged.
 *
 * Hermes writes push-capable remotes as
 * `https://x-access-token:gho_…@github.com/owner/repo.git`, so logging the URL
 * verbatim writes a live GitHub token into the systemd journal and pm/ logs on
 * every first clone of a new project. Redact at the boundary rather than
 * trusting each call site to remember.
 */
export function redactRemote(remote) {
  return String(remote).replace(/\/\/[^/@]*@/, '//***@');
}

/** Provision/refresh the dedicated deploy clone at origin/<base>; returns { cloneDir, baseBranch, targetSha }. */
function refreshDeployClone(projectDir, configuredBase, log) {
  const projectName = basename(projectDir);
  const cloneDir = process.env.SDLC_DEPLOY_CLONE || join(homedir(), `.sdlc-deploy-clone-${projectName}`);
  if (!existsSync(join(cloneDir, '.git'))) {
    const remote = git(projectDir, ['remote', 'get-url', 'origin']);
    log(`cloning ${redactRemote(remote)} → ${cloneDir}`);
    execFileSync('git', ['clone', '--quiet', remote, cloneDir], { encoding: 'utf8' });
  }
  git(cloneDir, ['fetch', 'origin', '--quiet']);
  let base = configuredBase || detectBaseBranch(cloneDir);
  if (!base) {
    try { git(cloneDir, ['remote', 'set-head', 'origin', '-a']); } catch { /* offline */ }
    base = detectBaseBranch(cloneDir);
  }
  if (!base) throw new Error('cannot resolve base branch (set deploy.baseBranch)');
  git(cloneDir, ['checkout', '-q', '-f', '-B', base, `origin/${base}`]);
  git(cloneDir, ['reset', '--hard', `origin/${base}`, '--quiet']);
  git(cloneDir, ['clean', '-fdq']);
  // Vercel project linking is file-based and usually gitignored — carry it over
  // so `vercel --prod --yes` runs headless in the clone.
  const vercelLink = join(projectDir, '.vercel');
  if (existsSync(vercelLink)) cpSync(vercelLink, join(cloneDir, '.vercel'), { recursive: true });
  const targetSha = git(cloneDir, ['rev-parse', `origin/${base}`]);
  return { cloneDir, baseBranch: base, targetSha };
}

// ---------------------------------------------------------------------------
// Notification (via the project's own config — same pattern as hermes-drain)
// ---------------------------------------------------------------------------

function notify(projectDir, message) {
  try {
    execFileSync('node', [join(__dirname, 'notify.mjs'), 'send', message], {
      env: { ...process.env, SDLC_PROJECT_DIR: projectDir },
      stdio: 'pipe', timeout: 30_000,
    });
  } catch { /* best-effort — a notify failure never changes deploy state */ }
}

// ---------------------------------------------------------------------------
// Per-project tick
// ---------------------------------------------------------------------------

function tokenPath(projectDir, kind, sha8) {
  return join(projectDir, 'pm', `.deploy-${kind}-${sha8}`);
}

function markerPath(projectDir) { return join(projectDir, 'pm', '.last-deployed'); }
function attemptPath(projectDir) { return join(projectDir, 'pm', '.last-deploy-attempt'); }

function readTrim(path) {
  try { return readFileSync(path, 'utf8').trim(); } catch { return null; }
}

/**
 * Deploy receipt → outbox (openspec: operator-desktop-launcher REQ-003).
 * Best-effort: a receipt failure never affects deploy state.
 */
export function writeDeployReceipt({ projectName, targetSha, baseBranch, verifyStatus, smokeUrl, outboxDir }) {
  try {
    const outbox = outboxDir || process.env.HERMES_OUTBOX || join(homedir(), 'hermes-outbox');
    mkdirSync(outbox, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').slice(0, 15);
    const path = join(outbox, `${stamp}-deploy-${projectName}-${targetSha.slice(0, 8)}.txt`);
    writeFileSync(path, [
      `project:  ${projectName}`,
      `commit:   ${targetSha} (origin/${baseBranch})`,
      `verified: HTTP ${verifyStatus ?? '(skipped)'}${smokeUrl ? ` — ${smokeUrl}` : ''}`,
      `deployed: ${new Date().toISOString()}`,
    ].join('\n') + '\n');
    return path;
  } catch {
    return false;
  }
}

export async function runProject(projectDir, { dryRun = false, log = (m) => console.log(`[deploy-runner] ${m}`) } = {}) {
  const projectName = basename(projectDir);
  const cfg = loadDeployConfig(projectDir);
  if (cfg.error) { log(`${projectName}: ERROR — ${cfg.error}`); return { project: projectName, action: 'error', error: cfg.error }; }
  if (cfg.disabled) { log(`${projectName}: deploy disabled — skip`); return { project: projectName, action: 'disabled' }; }
  const { deploy, testCmd } = cfg;

  // Single-flight per project (atomic mkdir; stale after 2h).
  // pm/ must exist first: mkdir with recursive:false throws ENOENT when the
  // parent is missing, which used to land in the catch below and return
  // 'locked' with NO log — so a project with no pm/ directory (i.e. every
  // freshly bootstrapped one) was skipped silently and forever, exit 0.
  const lockDir = join(projectDir, 'pm', '.sdlc-deploy.lock.d');
  mkdirSync(join(projectDir, 'pm'), { recursive: true });
  try {
    mkdirSync(lockDir, { recursive: false });
  } catch {
    let age = Infinity;
    try { age = Date.now() - statSync(lockDir).mtimeMs; } catch { /* stale */ }
    if (age < 2 * 60 * 60 * 1000) { log(`${projectName}: another deploy holds the lock — skip`); return { project: projectName, action: 'locked' }; }
    rmSync(lockDir, { recursive: true, force: true });
    try { mkdirSync(lockDir); } catch (err) {
      // Never return silently: an unexplained skip is indistinguishable from
      // "nothing to do", which is how a dead pipeline hides.
      log(`${projectName}: cannot acquire deploy lock — ${err && err.message ? err.message : err}`);
      return { project: projectName, action: 'locked' };
    }
  }

  try {
    const { cloneDir, baseBranch, targetSha } = refreshDeployClone(projectDir, deploy.baseBranch, log);
    const sha8 = targetSha.slice(0, 8);
    const lastDeployedSha = readTrim(markerPath(projectDir));
    const lastAttempt = readTrim(attemptPath(projectDir));
    const cooldownOk = !lastAttempt || (Date.now() - Date.parse(lastAttempt)) / 1000 >= deploy.cooldownSeconds;

    const action = decide({
      enabled: true,
      targetSha,
      lastDeployedSha,
      failed: existsSync(tokenPath(projectDir, 'failed', sha8)),
      rejected: existsSync(tokenPath(projectDir, 'rejected', sha8)),
      approved: existsSync(tokenPath(projectDir, 'approved', sha8)),
      pending: existsSync(tokenPath(projectDir, 'pending', sha8)),
      approvalMode: deploy.approval,
      cooldownOk,
    });

    // --- Environment guard (openspec: business-os / environment-tiering REQ-005)
    //
    // Runs BEFORE the action is honoured and independently of deploy.approval.
    // That independence is the point (REQ-004a): a project can set
    // approval:"none" for speed, but the TIER still governs, so speed can never
    // be configured onto a customer's database. A project absent from the
    // portfolio has no known tier and is therefore denied.
    if (action === 'deploy' || action === 'request-approval') {
      const envName = environmentFor(projectName, deploy);
      const guard = checkAccess({
        project: projectName,
        environment: envName,
        operation: 'deploy',
        approval: existsSync(tokenPath(projectDir, 'approved', sha8)) ? sha8 : undefined,
      });
      if (!guard.allowed) {
        await recordAccess(guard);
        log(`${projectName}: BLOCKED by env-guard (${envName}) — ${guard.reason}`);
        return { project: projectName, action: 'blocked', sha8, reason: guard.reason, tier: guard.tier };
      }
      if (guard.notify) await recordAccess(guard);
    }

    log(`${projectName}: origin/${baseBranch}@${sha8} — ${action}${dryRun ? ' (dry-run)' : ''}`);
    if (dryRun || action === 'up-to-date' || action === 'terminal' || action === 'cooldown' || action === 'wait-approval') {
      return { project: projectName, action, sha8 };
    }

    if (action === 'request-approval') {
      const subject = git(cloneDir, ['log', '-1', '--format=%s', targetSha]);
      writeFileSync(tokenPath(projectDir, 'pending', sha8), new Date().toISOString() + '\n');
      const handle = await deployBotHandle(process.env.TELEGRAM_DEPLOY_BOT_TOKEN);
      notify(projectDir, buildApprovalMessage({ projectName, baseBranch, sha8, subject, handle }));
      log(`${projectName}: approval requested for ${sha8}`);
      return { project: projectName, action, sha8 };
    }

    // action === 'deploy'
    writeFileSync(attemptPath(projectDir), new Date().toISOString() + '\n');

    // Test gate — manual merges get the same bar as reviewed PRs.
    if (deploy.verifyTests) {
      log(`${projectName}: running test gate in deploy clone…`);
      if (existsSync(join(cloneDir, 'package.json'))) {
        const ci = spawnSync('npm', [existsSync(join(cloneDir, 'package-lock.json')) ? 'ci' : 'install', '--silent'], { cwd: cloneDir, encoding: 'utf8' });
        if (ci.status !== 0) {
          writeFileSync(tokenPath(projectDir, 'failed', sha8), 'dependency install failed\n');
          notify(projectDir, `❌ Deploy ${projectName} ${sha8}: dependency install failed — deploy NOT run. Clear pm/.deploy-failed-${sha8} after fixing.`);
          return { project: projectName, action: 'failed-tests', sha8 };
        }
      }
      const t = spawnSync(testCmd, { shell: true, cwd: cloneDir, encoding: 'utf8' });
      if (t.status !== 0) {
        writeFileSync(tokenPath(projectDir, 'failed', sha8), 'test gate failed\n');
        const tail = ((t.stdout || '') + (t.stderr || '')).split('\n').slice(-15).join('\n');
        notify(projectDir, `❌ Deploy ${projectName} ${sha8}: TESTS FAILED — deploy NOT run.\n${tail}`);
        return { project: projectName, action: 'failed-tests', sha8 };
      }
    }

    // Deploy. A failure here (including an expired Vercel login) is terminal
    // for this sha — notified once, never auto-retried.
    log(`${projectName}: deploying ${sha8} — ${deploy.deployCmd}`);
    const d = spawnSync(deploy.deployCmd, { shell: true, cwd: cloneDir, encoding: 'utf8', timeout: 15 * 60 * 1000 });
    if (d.status !== 0) {
      writeFileSync(tokenPath(projectDir, 'failed', sha8), `deployCmd exited ${d.status}\n`);
      const tail = ((d.stdout || '') + (d.stderr || '')).split('\n').slice(-15).join('\n');
      notify(projectDir, `❌ Deploy ${projectName} ${sha8} FAILED (deployCmd exit ${d.status}) — will not retry.\n${tail}`);
      return { project: projectName, action: 'failed-deploy', sha8 };
    }

    // Smoke verify → rollback on failure.
    const v = await smokeVerify(deploy.verify);
    if (!v.ok) {
      writeFileSync(tokenPath(projectDir, 'failed', sha8), `smoke verify failed (status ${v.status})\n`);
      log(`${projectName}: smoke verify FAILED (status ${v.status}) — rolling back`);
      try {
        execFileSync('node', [join(__dirname, 'deploy-rollback.mjs'), '--reason', `smoke verify failed for ${sha8} (status ${v.status})`], {
          cwd: cloneDir,
          env: { ...process.env, SDLC_PROJECT_DIR: projectDir },
          stdio: 'pipe', timeout: 10 * 60 * 1000,
        });
      } catch (err) {
        notify(projectDir, `❌ Deploy ${projectName} ${sha8}: verify failed AND rollback errored (${err.message}) — manual intervention required.`);
      }
      return { project: projectName, action: 'rolled-back', sha8 };
    }

    // Success — advance the marker, clear this sha's tokens.
    writeFileSync(markerPath(projectDir), targetSha + '\n');
    for (const kind of ['pending', 'approved']) {
      try { unlinkSync(tokenPath(projectDir, kind, sha8)); } catch { /* already gone */ }
    }
    writeDeployReceipt({ projectName, targetSha, baseBranch, verifyStatus: v.status, smokeUrl: deploy.verify.smokeUrl });
    const url = deploy.verify.smokeUrl ? ` — ${deploy.verify.smokeUrl}` : '';
    notify(projectDir, `✅ Deployed ${projectName} ${sha8} and verified (HTTP ${v.status ?? 'skip'})${url}`);
    log(`${projectName}: deployed + verified ${sha8}`);
    return { project: projectName, action: 'deployed', sha8 };
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const projectDirs = [];
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project-dir') { projectDirs.push(resolve(argv[++i])); continue; }
    if (argv[i] === '--dry-run') { dryRun = true; continue; }
  }
  return { projectDirs, dryRun };
}

async function main() {
  const { projectDirs, dryRun } = parseArgs(process.argv.slice(2));
  if (projectDirs.length === 0) {
    console.error('Usage: deploy-runner.mjs --project-dir <dir> [--project-dir <dir>...] [--dry-run]');
    process.exit(1);
  }
  const log = (m) => console.log(`[deploy-runner] ${m}`);

  // One poll per invocation, before any per-project decision — approvals sent
  // since the last tick become visible to every project processed below.
  if (!dryRun) {
    const polled = await pollApprovals({
      token: process.env.TELEGRAM_DEPLOY_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
      projectDirs,
      log,
    });
    if (!polled.polled) log(`approval poll skipped: ${polled.reason}`);
  }

  let anyError = false;
  for (const dir of projectDirs) {
    try {
      const result = await runProject(dir, { dryRun, log });
      if (result.action === 'error') anyError = true;
    } catch (err) {
      anyError = true;
      log(`${basename(dir)}: UNEXPECTED ERROR — ${err.message}`);
    }
  }
  process.exit(anyError ? 1 : 0);
}

if (__isMainModule()) {
  main().catch((err) => { console.error(`[deploy-runner] fatal: ${err.message}`); process.exit(1); });
}
