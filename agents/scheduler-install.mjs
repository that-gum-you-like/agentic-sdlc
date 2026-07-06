#!/usr/bin/env node
/**
 * scheduler-install — turn the framework's cron-schedule into live systemd
 * **user** timers, so the automated iteration cycles + Hermes cron scripts run
 * for as long as the machine is online (and catch up missed runs after downtime
 * via `Persistent=true`). No always-on daemon to crash: each job is a oneshot
 * service fired by its own timer, managed by the user systemd manager.
 *
 * Zero npm dependencies. Reads `agents/cron-schedule.json` (falls back to
 * `agents/templates/cron-schedule.json.template`). Jobs whose `agentRequired`
 * agent isn't configured, or whose `adapterRequired` adapter isn't active, are
 * skipped — the install set always matches reality.
 *
 * Usage:
 *   node agents/scheduler-install.mjs list             # Show the jobs that would be installed
 *   node agents/scheduler-install.mjs install [--dry-run]
 *   node agents/scheduler-install.mjs status            # systemctl --user list-timers for sdlc-*
 *   node agents/scheduler-install.mjs uninstall         # Disable + remove all sdlc-* units
 *
 * Requires: systemd user manager (Linux). Enable `loginctl enable-linger` so
 * timers run without an active login session (already on for this host).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { execFileSync } from 'child_process';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Namespaced so uninstall can never touch unrelated user units (e.g. a
// pre-existing sdlc-update.timer). Only sdlc-sched-* units are ever managed here.
const UNIT_PREFIX = 'sdlc-sched-';
const UNIT_DIR = join(homedir(), '.config', 'systemd', 'user');

// ---------------------------------------------------------------------------
// Schedule loading + selection
// ---------------------------------------------------------------------------

/** Load the schedule list (real config first, then the shipped template). */
export function loadSchedule(agentsDir = __dirname) {
  const candidates = [
    resolve(agentsDir, 'cron-schedule.json'),
    resolve(agentsDir, 'templates', 'cron-schedule.json.template'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      return { source: path, jobs: parsed.schedules || [] };
    }
  }
  throw new Error(`no cron-schedule.json or template found under ${agentsDir}`);
}

/** Keep only jobs whose required agent / adapter is actually present. */
export function selectJobs(jobs, { agents = [], adapter = 'file-based' } = {}) {
  const kept = [];
  const skipped = [];
  for (const job of jobs) {
    if (job.agentRequired && !agents.includes(job.agentRequired)) {
      skipped.push({ ...job, skipReason: `agent '${job.agentRequired}' not configured` });
      continue;
    }
    if (job.adapterRequired && job.adapterRequired !== adapter) {
      skipped.push({ ...job, skipReason: `adapter '${job.adapterRequired}' not active (using '${adapter}')` });
      continue;
    }
    kept.push(job);
  }
  return { kept, skipped };
}

// ---------------------------------------------------------------------------
// cron → systemd OnCalendar
// ---------------------------------------------------------------------------

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function calField(f) {
  if (f === '*') return '*';
  if (f.includes('/')) {
    const [start, step] = f.split('/');
    return `${start === '*' ? '0' : start}/${step}`;
  }
  return String(f).padStart(2, '0');
}

function dowName(f) {
  if (f === '*') return null;
  const n = parseInt(f, 10);
  if (Number.isNaN(n)) throw new Error(`unsupported day-of-week field: "${f}"`);
  return DOW[n % 7];
}

/**
 * Translate a 5-field cron expression (`min hour dom mon dow`) into a systemd
 * OnCalendar spec. Supports wildcards, integers, and step forms (star-slash-N
 * and A-slash-N) — the full range used by the framework's schedule template.
 */
export function cronToOnCalendar(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`unsupported cron expression: "${expr}"`);
  const [min, hour, dom, mon, dow] = parts;
  const time = `${calField(hour)}:${calField(min)}:00`;
  const date = `*-${calField(mon)}-${calField(dom)}`;
  const dw = dowName(dow);
  return `${dw ? dw + ' ' : ''}${date} ${time}`;
}

// ---------------------------------------------------------------------------
// systemd unit rendering
// ---------------------------------------------------------------------------

/** Expand a schedule `script` string into an absolute ExecStart command. */
function toExecStart(script, { nodeBin, home }) {
  return script
    .replace(/^node\s+/, `${nodeBin} `)
    .replace(/~\//g, `${home}/`);
}

/**
 * Resolve extra PATH directories units need beyond node's own bin dir.
 * Scheduled jobs shell out to `gh` and `hermes`, which often live outside the
 * default systemd user PATH (observed: timer-run drains died rc=127 because
 * `hermes` sits in ~/.local/bin and `gh` in the brew prefix). Resolved at
 * install time from the installer's environment.
 */
export function extraPathDirs({ home, whichFn } = {}) {
  const h = home || homedir();
  const dirs = [];
  const which = whichFn || ((bin) => {
    // Explicit null = "binary not found" (an empty-string default would be a
    // silent fallback — the Layer-3 scan rightly flags that pattern).
    try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim(); } catch { return null; }
  });
  for (const bin of ['gh', 'hermes']) {
    const p = which(bin);
    if (p) dirs.push(dirname(p));
  }
  dirs.push(join(h, '.local', 'bin'));
  return [...new Set(dirs)];
}

/** Render the .service + .timer unit pair for one job. */
export function buildUnits(job, { repoDir, nodeBin, home, pathDirs }) {
  const name = `${UNIT_PREFIX}${job.name}`;
  const onCalendar = cronToOnCalendar(job.cron);
  const execStart = toExecStart(job.script, { nodeBin, home });
  const nodeDir = dirname(nodeBin);
  const path = [...new Set([nodeDir, ...(pathDirs || []), '/usr/local/bin', '/usr/bin', '/bin'])].join(':');

  const service = `[Unit]
Description=Agentic SDLC — ${job.description || job.name}
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${repoDir}
Environment=PATH=${path}
Environment=SDLC_PROJECT_DIR=${repoDir}
ExecStart=${execStart}
`;

  const timer = `[Unit]
Description=Agentic SDLC timer — ${job.name}

[Timer]
OnCalendar=${onCalendar}
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
`;

  return { name, serviceName: `${name}.service`, timerName: `${name}.timer`, service, timer, onCalendar, execStart };
}

// ---------------------------------------------------------------------------
// systemctl helpers
// ---------------------------------------------------------------------------

function systemctl(args, { check = true } = {}) {
  try {
    return execFileSync('systemctl', ['--user', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (check) throw err;
    return (err.stdout || '') + (err.stderr || '');
  }
}

function planInstall() {
  const { config, projectDir } = (() => {
    const cfg = loadConfig();
    return { config: cfg, projectDir: cfg.projectDir || process.cwd() };
  })();
  const agents = config.agents ? Object.keys(config.agents) : [];
  const adapter = (config.orchestration && config.orchestration.adapter) || 'file-based';
  const { jobs, source } = loadSchedule(__dirname);
  const { kept, skipped } = selectJobs(jobs, { agents, adapter });
  return { source, kept, skipped, repoDir: resolve(__dirname, '..'), projectDir };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdList() {
  const { source, kept, skipped } = planInstall();
  console.log(`📅 Schedule source: ${source}\n`);
  console.log(`Will install ${kept.length} timer(s):`);
  for (const job of kept) {
    console.log(`  • ${UNIT_PREFIX}${job.name}`);
    console.log(`      cron ${job.cron}  →  OnCalendar ${cronToOnCalendar(job.cron)}`);
    console.log(`      ${job.script}`);
  }
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length}:`);
    for (const job of skipped) console.log(`  • ${job.name} — ${job.skipReason}`);
  }
}

function cmdInstall(dryRun) {
  const { kept, repoDir } = planInstall();
  const nodeBin = process.execPath;
  const home = homedir();
  const pathDirs = extraPathDirs({ home });

  if (dryRun) {
    for (const job of kept) {
      const u = buildUnits(job, { repoDir, nodeBin, home, pathDirs });
      console.log(`# ${u.timerName}\n${u.timer}\n# ${u.serviceName}\n${u.service}\n${'─'.repeat(50)}`);
    }
    console.log(`(dry-run) ${kept.length} timer(s) would be installed to ${UNIT_DIR}`);
    return;
  }

  if (!existsSync(UNIT_DIR)) mkdirSync(UNIT_DIR, { recursive: true });
  const installed = [];
  for (const job of kept) {
    const u = buildUnits(job, { repoDir, nodeBin, home, pathDirs });
    writeFileSync(join(UNIT_DIR, u.serviceName), u.service);
    writeFileSync(join(UNIT_DIR, u.timerName), u.timer);
    installed.push(u);
  }

  systemctl(['daemon-reload']);
  for (const u of installed) systemctl(['enable', '--now', u.timerName]);

  logCapabilityUsage('schedulerInstall', 'system', 'scheduler-install', 'scheduler-install.mjs', 'install');
  console.log(`✅ Installed + enabled ${installed.length} timer(s) in ${UNIT_DIR}`);
  for (const u of installed) console.log(`  • ${u.timerName}  (${u.onCalendar})`);
  console.log(`\nVerify:  node ${resolve(__dirname, 'scheduler-install.mjs')} status`);
}

function cmdStatus() {
  const out = systemctl(['list-timers', `${UNIT_PREFIX}*`, '--all'], { check: false });
  console.log(out.trim() || 'No sdlc-* timers found.');
}

function cmdUninstall() {
  if (!existsSync(UNIT_DIR)) { console.log('Nothing to uninstall.'); return; }
  const timers = readdirSync(UNIT_DIR).filter(f => f.startsWith(UNIT_PREFIX) && f.endsWith('.timer'));
  for (const t of timers) systemctl(['disable', '--now', t], { check: false });
  let removed = 0;
  for (const f of readdirSync(UNIT_DIR)) {
    if (f.startsWith(UNIT_PREFIX) && (f.endsWith('.timer') || f.endsWith('.service'))) {
      unlinkSync(join(UNIT_DIR, f));
      removed++;
    }
  }
  systemctl(['daemon-reload'], { check: false });
  console.log(`🧹 Removed ${removed} unit file(s), disabled ${timers.length} timer(s).`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

if (__isMainModule()) {
  const cmd = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  switch (cmd) {
    case 'list': cmdList(); break;
    case 'install': cmdInstall(dryRun); break;
    case 'status': cmdStatus(); break;
    case 'uninstall': cmdUninstall(); break;
    default:
      console.log(`scheduler-install — live systemd user timers for the SDLC schedule

Usage:
  node agents/scheduler-install.mjs list                Show jobs that would be installed
  node agents/scheduler-install.mjs install [--dry-run] Install + enable timers
  node agents/scheduler-install.mjs status              List installed sdlc-* timers
  node agents/scheduler-install.mjs uninstall           Disable + remove sdlc-* units`);
  }
}
