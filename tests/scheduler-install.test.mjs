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
    { name: 'c', cron: '0 6 * * *', script: 'node x', adapterRequired: 'paperclip' },
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
  process.exit(1);
}
