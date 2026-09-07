#!/usr/bin/env node
/**
 * drain-supervisor.mjs — keep the board draining continuously.
 *
 * The per-project systemd timers fire on a fixed minute and contend for one
 * host-global mutex on a SKIP-if-locked basis. Two consequences, both observed
 * live on 2026-09-07:
 *
 *   - Ready work waits for the next tick even when the machine is idle.
 *   - A project scheduled shortly behind a long-running one starves silently
 *     and indefinitely (nels-workshop sat on minute :01, one minute behind the
 *     framework's every-15-minutes drain, and never ran once until it was moved).
 *
 * This replaces "many timers racing" with one supervisor that runs drains
 * back-to-back, round-robin, for as long as there is ready work.
 *
 * Round-robin rather than priority order is deliberate: a project with a deep
 * queue must not starve every other project behind it.
 *
 * Usage:
 *   node agents/drain-supervisor.mjs            # loop forever (systemd)
 *   node agents/drain-supervisor.mjs --once     # one full pass, then exit
 *   node agents/drain-supervisor.mjs --dry-run  # report, spawn nothing
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAMEWORK = resolve(HERE, '..');
const PORTFOLIO = join(FRAMEWORK, 'portfolio.json');
const DRAIN_SH = join(HERE, 'hermes-drain.sh');
const BUDGET = join(HERE, 'budget.json');

const IDLE_SLEEP_MS = Number(process.env.SUPERVISOR_IDLE_MS || 60_000);
const BETWEEN_MS = Number(process.env.SUPERVISOR_GAP_MS || 5_000);
const BUSY_SLEEP_MS = Number(process.env.SUPERVISOR_BUSY_MS || 30_000);
const DRAIN_TIMEOUT_MS = Number(process.env.SUPERVISOR_DRAIN_TIMEOUT_MS || 3_900_000);

const argv = process.argv.slice(2);
const ONCE = argv.includes('--once');
const DRY = argv.includes('--dry-run');

const log = (...a) => console.log('[supervisor]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Projects the supervisor may drain: enabled, on disk, and holding a queue. */
export function drainableProjects(portfolioPath = PORTFOLIO) {
  let projects = [];
  try {
    projects = JSON.parse(readFileSync(portfolioPath, 'utf8')).projects || [];
  } catch (e) {
    log(`portfolio unreadable (${e.message}) — nothing to drain`);
    return [];
  }
  return projects.filter((p) => {
    if (!p.enabled || !p.path) return false;
    if (!existsSync(p.path)) return false;
    return existsSync(join(p.path, 'tasks', 'queue'));
  });
}

/**
 * Conservation mode is a hard stop. A supervisor that drains continuously can
 * spend continuously, so the budget switch must be able to halt it outright.
 */
export function conservationMode(budgetPath = BUDGET) {
  try { return !!JSON.parse(readFileSync(budgetPath, 'utf8')).conservationMode; }
  catch { return false; }   // a missing budget must not wedge the loop
}

/** Ready (unblocked) task count. A cheap read — no model is invoked. */
export function readyCount(projectPath) {
  const r = spawnSync('node', [join(HERE, 'queue-drainer.mjs'), 'status', '--project-dir', projectPath],
    { encoding: 'utf8', timeout: 120_000 });
  if (r.status !== 0) {
    // Never launder a broken status check into "nothing to do" — that is how a
    // failure hides for as long as you care to look.
    log(`status FAILED for ${projectPath} (rc=${r.status}) — skipping this pass`);
    return -1;
  }
  const m = /Ready \(unblocked\):\s*(\d+)/i.exec(r.stdout || '');
  if (!m) { log(`could not parse a ready count for ${projectPath} — treating as error`); return -1; }
  return Number(m[1]);
}

const LOCK_DIR = join(FRAMEWORK, 'pm', '.sdlc-autonomous.lock.d');

/**
 * Is the host-global drain mutex held by a process that is still alive?
 *
 * Without this the supervisor spawns a drain that immediately skips on the
 * mutex, returns 0, and is counted as work done — so the loop never reaches its
 * idle sleep and spins every few seconds. Cheap to check, and it also lets a
 * genuinely orphaned lock (holder dead) fall through to the drain script, which
 * owns the stale-lock reclaim.
 */
export function mutexHeldByLiveProcess(lockDir = LOCK_DIR) {
  if (!existsSync(lockDir)) return false;
  let pid = 0;
  try { pid = Number((readFileSync(join(lockDir, 'holder'), 'utf8').match(/(\d+)/) || [])[1] || 0); }
  catch { return false; }             // unreadable holder: let the drain script decide
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }   // signal 0 = liveness probe only
  catch { return false; }                      // holder is gone — orphaned lock
}

function runDrain(project) {
  const env = { ...process.env, SDLC_REPO: project.path };
  if (project.baseBranch) env.SDLC_BASE_BRANCH = project.baseBranch;
  const r = spawnSync('bash', [DRAIN_SH], { env, stdio: 'inherit', timeout: DRAIN_TIMEOUT_MS });
  return r.status === 0;
}

export async function pass() {
  if (conservationMode()) { log('conservation mode ON — not draining'); return 0; }
  const projects = drainableProjects();
  if (!projects.length) { log('no drainable projects'); return 0; }

  let drained = 0;
  for (const p of projects) {                       // round-robin: one each, in order
    const ready = readyCount(p.path);
    if (ready < 0) continue;
    if (ready === 0) continue;
    if (mutexHeldByLiveProcess()) {
      log(`${p.name}: ${ready} ready, but a drain is already running — waiting`);
      return -1;                       // signal "busy", not "idle" and not "worked"
    }
    log(`${p.name}: ${ready} ready`);
    if (DRY) { drained++; continue; }
    const ok = runDrain(p);
    log(`${p.name}: drain ${ok ? 'finished' : 'FAILED'}`);
    drained++;
    if (conservationMode()) { log('conservation mode switched ON mid-pass — stopping'); break; }
    await sleep(BETWEEN_MS);
  }
  return drained;
}

async function main() {
  log(`starting (once=${ONCE} dry-run=${DRY})`);
  for (;;) {
    const drained = await pass();
    if (ONCE || DRY) { log(`pass complete — ${Math.max(drained, 0)} project(s) drained`); return; }
    if (drained < 0) await sleep(BUSY_SLEEP_MS);     // someone else holds the mutex
    else if (drained === 0) await sleep(IDLE_SLEEP_MS); // nothing ready: cheap reads only
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('[supervisor] fatal:', e.message); process.exit(1); });
}
