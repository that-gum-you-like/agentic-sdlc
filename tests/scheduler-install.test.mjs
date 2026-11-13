#!/usr/bin/env node
/**
 * Tests for scheduler-install.mjs — cron→OnCalendar translation, job selection
 * (agent/adapter gating), and systemd unit rendering. Pure functions only; no
 * systemctl calls, no unit files written — importing the module is
 * side-effect-free (guarded by __isMainModule).
 *
 * Run: node tests/scheduler-install.test.mjs
 */

import {
  cronToOnCalendar,
  selectJobs,
  buildUnits,
  loadSchedule,
  extraPathDirs,
  applyInstall,
  buildGatewayGuardDropIn,
  installGatewayGuard,
} from '../agents/scheduler-install.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    fn();
    console.log('OK');
    passed++;
  } catch (err) {
    console.log('FAIL');
    failures.push({ name, err: err.message });
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

import { readFileSync, mkdtempSync, writeFileSync, existsSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

console.log('scheduler-install tests');

// --- cron → OnCalendar (every form the schedule template uses) ---
test('cronToOnCalendar translates daily / weekly / monthly / step forms', () => {
  const cases = [
    ['0 6 * * *', '*-*-* 06:00:00'],
    ['15 6 * * *', '*-*-* 06:15:00'],
    ['0 23 * * 0', 'Sun *-*-* 23:00:00'],
    ['30 23 * * 0', 'Sun *-*-* 23:30:00'],
    ['0 22 * * 0', 'Sun *-*-* 22:00:00'],
    ['0 6 1 * *', '*-*-01 06:00:00'],
    ['*/15 * * * *', '*-*-* *:0/15:00'],
    ['0 */4 * * *', '*-*-* 0/4:00:00'],
    ['17 */6 * * *', '*-*-* 0/6:17:00'],
    ['7,27,47 * * * *', '*-*-* *:7,27,47:00'],
  ];
  for (const [cron, expected] of cases) {
    const got = cronToOnCalendar(cron);
    assert(got === expected, `${cron} → "${got}", expected "${expected}"`);
  }
});

test('cronToOnCalendar rejects malformed expressions', () => {
  let threw = false;
  try { cronToOnCalendar('0 6 * *'); } catch { threw = true; }
  assert(threw, 'expected a throw on a 4-field expression');
});

// --- job selection gating ---
test('selectJobs skips unmet agentRequired / adapterRequired', () => {
  const jobs = [
    { name: 'a', cron: '0 6 * * *', script: 'node x' },
    { name: 'b', cron: '0 6 * * *', script: 'node x', agentRequired: 'dependency-auditor' },
    { name: 'c', cron: '0 6 * * *', script: 'node x', adapterRequired: 'orchestration-adapter' },
    { name: 'd', cron: '0 6 * * *', script: 'node x', agentRequired: 'sdlc-developer' },
  ];
  const { kept, skipped } = selectJobs(jobs, { agents: ['sdlc-developer'], adapter: 'file-based' });
  const keptNames = kept.map(j => j.name).sort();
  assert(JSON.stringify(keptNames) === JSON.stringify(['a', 'd']), `kept ${keptNames}`);
  assert(skipped.length === 2, `expected 2 skipped, got ${skipped.length}`);
  assert(skipped.every(j => typeof j.skipReason === 'string'), 'skips must carry a reason');
});

// --- unit rendering ---
test('buildUnits renders a oneshot service + persistent timer with absolute paths', () => {
  const job = { name: 'health-check-daily', cron: '0 6 * * *', script: 'node ~/agentic-sdlc/agents/health-check.mjs --notify', description: 'health' };
  const u = buildUnits(job, { repoDir: '/home/x/agentic-sdlc', nodeBin: '/opt/node/bin/node', home: '/home/x' });

  assert(u.serviceName === 'sdlc-sched-health-check-daily.service', `service name ${u.serviceName}`);
  assert(u.timerName === 'sdlc-sched-health-check-daily.timer', `timer name ${u.timerName}`);

  // ExecStart: node token → absolute nodeBin; ~ → home; args preserved.
  assert(u.execStart === '/opt/node/bin/node /home/x/agentic-sdlc/agents/health-check.mjs --notify', `execStart "${u.execStart}"`);
  assert(!/(^|\s)~\//.test(u.execStart), 'ExecStart must not contain an unexpanded ~');

  assert(/Type=oneshot/.test(u.service), 'service must be oneshot');
  assert(/WorkingDirectory=\/home\/x\/agentic-sdlc/.test(u.service), 'service must set WorkingDirectory');
  assert(/SDLC_PROJECT_DIR=\/home\/x\/agentic-sdlc/.test(u.service), 'service must pin SDLC_PROJECT_DIR');
  assert(/OnCalendar=\*-\*-\* 06:00:00/.test(u.timer), 'timer must carry OnCalendar');
  assert(/Persistent=true/.test(u.timer), 'timer must be Persistent (catch up missed runs)');
  assert(/WantedBy=timers\.target/.test(u.timer), 'timer must install into timers.target');

  // Secrets: scheduled jobs must be able to read host tokens (telegram, github)
  // from ~/.hermes/.env. The leading '-' keeps hosts without the file working.
  assert(u.service.includes('EnvironmentFile=-%h/.hermes/.env'),
    'service must load optional ~/.hermes/.env so timer-run scripts see host secrets');
});

// --- unit PATH resolves the tools scheduled jobs shell out to ---
test('extraPathDirs resolves gh/hermes dirs + ~/.local/bin (deduped)', () => {
  const whichFn = (bin) => ({ gh: '/opt/brew/bin/gh', hermes: '/home/x/.local/bin/hermes' }[bin] || '');
  const dirs = extraPathDirs({ home: '/home/x', whichFn });
  assert(JSON.stringify(dirs) === JSON.stringify(['/opt/brew/bin', '/home/x/.local/bin']),
    `dirs ${JSON.stringify(dirs)}`);
  // Tools missing from the installer PATH still leave ~/.local/bin covered.
  const fallback = extraPathDirs({ home: '/home/x', whichFn: () => '' });
  assert(JSON.stringify(fallback) === JSON.stringify(['/home/x/.local/bin']), `fallback ${JSON.stringify(fallback)}`);
});

test('buildUnits bakes pathDirs into the unit PATH (rc=127 hermes/gh fix)', () => {
  const job = { name: 'pr-auto-review', cron: '7,27,47 * * * *', script: 'node ~/agentic-sdlc/agents/pr-auto-review.mjs' };
  const u = buildUnits(job, {
    repoDir: '/home/x/agentic-sdlc', nodeBin: '/opt/node/bin/node', home: '/home/x',
    pathDirs: ['/opt/brew/bin', '/home/x/.local/bin'],
  });
  assert(/Environment=PATH=\/opt\/node\/bin:\/opt\/brew\/bin:\/home\/x\/\.local\/bin:\/usr\/local\/bin:\/usr\/bin:\/bin/.test(u.service),
    `unit PATH wrong:\n${u.service}`);
  assert(u.onCalendar === '*-*-* *:7,27,47:00', `comma-list OnCalendar, got ${u.onCalendar}`);
});

test('service unit waits for network/DNS at boot', () => {
  const u = buildUnits({ name: 'x', cron: '0 6 * * *', script: 'node ~/a.mjs' }, { repoDir: '/r', nodeBin: '/n/node', home: '/h' });
  assert(/^Wants=network-online\.target$/m.test(u.service), 'missing Wants=network-online.target');
  assert(/^After=network-online\.target$/m.test(u.service), 'missing After=network-online.target');
  assert(/^ExecStartPre=-.*getent hosts/m.test(u.service), 'missing DNS-wait ExecStartPre');
});

// --- schedule loads and every entry translates ---
test('loadSchedule returns jobs and all cron exprs translate', () => {
  const { jobs, source } = loadSchedule();
  assert(Array.isArray(jobs) && jobs.length > 0, 'no jobs loaded');
  assert(typeof source === 'string', 'missing source path');
  for (const job of jobs) {
    assert(typeof job.name === 'string' && job.name.length > 0, 'job missing name');
    const oc = cronToOnCalendar(job.cron); // throws if any expr is unsupported
    assert(oc.length > 0, `empty OnCalendar for ${job.name}`);
  }
});

// --- supersededBy / enabled:false (CV-114) ---
test('selectJobs routes supersededBy entries away from kept', () => {
  const jobs = [
    { name: 'a', cron: '0 6 * * *', script: 'node x' },
    { name: 'old', cron: '0 6 * * *', script: 'node y', supersededBy: 'a' },
  ];
  const { kept, superseded } = selectJobs(jobs, {});
  assert(kept.length === 1 && kept[0].name === 'a', 'superseded entry must not be kept');
  assert(superseded.length === 1 && superseded[0].name === 'old', 'superseded entry reported');
});

test('applyInstall: superseded -> disable + unit removal, no install; enabled:false -> installed, not enabled', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sched-'));
  try {
    writeFileSync(join(dir, 'sdlc-sched-old.timer'), 'x');
    writeFileSync(join(dir, 'sdlc-sched-old.service'), 'x');
    const calls = [];
    const kept = [
      { name: 'on', cron: '0 6 * * *', script: 'node x' },
      { name: 'off', cron: '0 7 * * *', script: 'node x', enabled: false },
    ];
    const superseded = [{ name: 'old', cron: '0 6 * * *', script: 'node y', supersededBy: 'on' }];
    applyInstall({ kept, superseded, repoDir: '/r', nodeBin: '/n/node', home: '/h', pathDirs: [], unitDir: dir,
      systemctlFn: (args) => { calls.push(args.join(' ')); return ''; } });
    assert(calls.includes('disable --now sdlc-sched-old.timer'), `no disable call: ${calls}`);
    assert(!existsSync(join(dir, 'sdlc-sched-old.timer')) && !existsSync(join(dir, 'sdlc-sched-old.service')), 'old units removed');
    assert(calls.includes('enable --now sdlc-sched-on.timer'), 'enabled job is enabled');
    assert(!calls.some(c => c.includes('enable') && c.includes('sdlc-sched-off')), 'enabled:false must not be enabled');
    assert(existsSync(join(dir, 'sdlc-sched-off.timer')) && existsSync(join(dir, 'sdlc-sched-off.service')), 'enabled:false unit still written');
    assert(!readdirSync(dir).some(f => f.includes('old')), 'superseded installs nothing');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('RS-REQ-063: gateway guard drop-in is ExecStartPre of the config guard, written only when the gateway unit exists, idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sched-gw-'));
  try {
    const body = buildGatewayGuardDropIn({ repoDir: '/r', nodeBin: '/n/node' });
    assert(/^\[Service\]\nExecStartPre=\/n\/node \/r\/agents\/hermes-config-guard\.mjs$/m.test(body), body);
    assert(installGatewayGuard({ repoDir: '/r', nodeBin: '/n/node', unitDir: dir }) === null, 'no gateway unit -> nothing written');
    assert(!existsSync(join(dir, 'hermes-gateway.service.d')), 'no drop-in dir created');
    writeFileSync(join(dir, 'hermes-gateway.service'), '[Service]\nExecStart=/x\n');
    const file = installGatewayGuard({ repoDir: '/r', nodeBin: '/n/node', unitDir: dir });
    assert(file && existsSync(file), 'drop-in written');
    assert(readFileSync(join(dir, 'hermes-gateway.service'), 'utf8') === '[Service]\nExecStart=/x\n', 'gateway unit itself untouched');
    assert(installGatewayGuard({ repoDir: '/r', nodeBin: '/n/node', unitDir: dir }) === null, 'unchanged -> null (idempotent)');
    const calls = [];
    const r = applyInstall({ kept: [], repoDir: '/r', nodeBin: '/n/node', home: '/h', pathDirs: [], unitDir: dir, systemctlFn: a => { calls.push(a.join(' ')); return ''; } });
    assert(!calls.some(c => /restart|hermes-gateway/.test(c)), `gateway must never be restarted from the installer: ${calls}`);
    assert(r.gatewayGuard === null, 'already current');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

console.log(`\n${passed} passed,${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}

test('cron schedule declares the research timer and supersedes the legacy weekly timers (CV-REQ-014)', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { homedir } = await import('node:os');
  const d = JSON.parse(readFileSync(new URL('../agents/cron-schedule.json', import.meta.url), 'utf8'));
  const by = Object.fromEntries(d.schedules.map(j => [j.name, j]));
  assert(by['model-manager-research'] && !by['model-manager-research'].supersededBy, 'research timer declared');
  for (const n of ['pattern-hunt-weekly', 'rem-sleep-weekly']) assert(by[n] && by[n].supersededBy === 'weekly-pattern-hunt', n);
  for (const j of d.schedules) {
    const m = /(?:~\/agentic-sdlc|\/home\/bryce\/agentic-sdlc)\/(agents\/[\w./-]+\.(?:mjs|sh))/.exec(j.script);
    if (m) assert(existsSync(new URL(`../${m[1]}`, import.meta.url)), `${j.name}: ${m[1]} must exist`);
  }
});
