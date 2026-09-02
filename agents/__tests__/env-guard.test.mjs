/**
 * env-guard — the boundary between an autonomous agent and a customer's data.
 *
 * Spec: openspec/changes/business-os/specs/environment-tiering.md
 * All 13 scenarios are transcribed here, plus one test per cell of the REQ-003
 * decision table. This file is deliberately adversarial: it is the thing
 * standing between a cheap fallback model and Texas Olive Ranch's rows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkAccess, verifyApproval, consumeApproval, parseApprovalCommand, OPERATIONS,
} from '../env-guard.mjs';
import { parseApprovalCommand as runnerParser } from '../deploy-runner.mjs';

const OPS = ['read', 'write', 'migrate', 'deploy'];
const MUTATING = ['write', 'migrate', 'deploy'];

/** Build a temp portfolio and run fn with its path. */
function withPortfolio(projects, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'envguard-'));
  const p = join(dir, 'portfolio.json');
  writeFileSync(p, JSON.stringify({ version: 1, projects }));
  try { return fn(p, dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const project = (envs, extra = {}) => ({
  name: 'demo', owner: 'self', stage: 'build', environments: envs, ...extra,
});

// =========================================================================
// Scenario 1 — scratch permits everything
// =========================================================================
test('Scenario 1: scratch permits every operation, with no approval and no notification', () => {
  withPortfolio([project([{ name: 'dev', tier: 'scratch' }])], (path) => {
    for (const operation of OPS) {
      const r = checkAccess({ project: 'demo', environment: 'dev', operation, portfolioPath: path });
      assert.equal(r.allowed, true, `${operation} should be allowed on scratch`);
      assert.equal(r.tier, 'scratch');
      assert.equal(r.requiresApproval, false);
      assert.equal(r.notify, null, 'scratch activity must not generate noise');
    }
  });
});

// =========================================================================
// Scenario 2 — internal-production permits writes but records them
// =========================================================================
test('Scenario 2: internal-production allows writes and records each one', () => {
  withPortfolio([project([{ name: 'production', tier: 'internal-production' }])], (path) => {
    for (const operation of MUTATING) {
      const r = checkAccess({ project: 'demo', environment: 'production', operation, portfolioPath: path });
      assert.equal(r.allowed, true);
      assert.ok(r.notify, `${operation} on internal-production must be recorded`);
      assert.equal(r.notify.project, 'demo');
      assert.equal(r.notify.environment, 'production');
      assert.equal(r.notify.operation, operation);
      assert.equal(r.notify.tier, 'internal-production');
    }
    const read = checkAccess({ project: 'demo', environment: 'production', operation: 'read', portfolioPath: path });
    assert.equal(read.allowed, true);
    assert.equal(read.notify, null, 'reads on internal-production are not noteworthy');
  });
});

// =========================================================================
// Scenario 3 — customer-production denies an unapproved write
// =========================================================================
test('Scenario 3: customer-production denies an unapproved write and names project, env, tier', () => {
  withPortfolio([project([{ name: 'production', tier: 'customer-production' }])], (path) => {
    for (const operation of MUTATING) {
      const r = checkAccess({ project: 'demo', environment: 'production', operation, portfolioPath: path });
      assert.equal(r.allowed, false, `${operation} must be denied`);
      assert.equal(r.requiresApproval, true);
      assert.equal(r.tier, 'customer-production');
      assert.match(r.reason, /demo/);
      assert.match(r.reason, /production/);
      assert.match(r.reason, /customer-production/);
      assert.equal(r.notify.level, 'denied');
    }
  });
});

test('decision table: customer-production still ALLOWS reads, and records them', () => {
  withPortfolio([project([{ name: 'production', tier: 'customer-production' }])], (path) => {
    const r = checkAccess({ project: 'demo', environment: 'production', operation: 'read', portfolioPath: path });
    assert.equal(r.allowed, true);
    assert.equal(r.notify.level, 'record');
  });
});

// =========================================================================
// Scenario 4 — portfolio file missing
// =========================================================================
test('Scenario 4: a missing portfolio denies every operation, throws nothing, creates nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'envguard-'));
  const missing = join(dir, 'portfolio.json');
  try {
    for (const operation of OPS) {
      const r = checkAccess({ project: 'demo', environment: 'dev', operation, portfolioPath: missing });
      assert.equal(r.allowed, false);
      assert.match(r.reason, /portfolio unavailable/);
      assert.match(r.reason, /not found/);
    }
    assert.equal(fs.existsSync(missing), false, 'the guard must not create the file it failed to read');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// =========================================================================
// Scenario 5 — portfolio unparseable, distinguished from missing
// =========================================================================
test('Scenario 5: an unparseable portfolio denies, and says unparseable rather than not-found', () => {
  const dir = mkdtempSync(join(tmpdir(), 'envguard-'));
  const p = join(dir, 'portfolio.json');
  try {
    for (const bad of ['{ not json', '[]', '{"version":1}']) {
      writeFileSync(p, bad);
      const r = checkAccess({ project: 'demo', environment: 'dev', operation: 'read', portfolioPath: p });
      assert.equal(r.allowed, false);
      assert.match(r.reason, /portfolio unavailable/);
      assert.doesNotMatch(r.reason, /not found/, `"${bad}" must not be reported as a missing file`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// =========================================================================
// Scenario 6 — no tier field: denies READS too
// =========================================================================
test('Scenario 6: an environment with no tier denies READ as well as write', () => {
  withPortfolio([project([{ name: 'production' }])], (path) => {
    for (const operation of OPS) {
      const r = checkAccess({ project: 'demo', environment: 'production', operation, portfolioPath: path });
      assert.equal(r.allowed, false, `${operation} must be denied when tier is absent`);
      assert.match(r.reason, /no tier/);
      assert.match(r.reason, /no default/);
      assert.equal(r.tier, null, 'no tier may be reported when none was established');
    }
  });
});

// =========================================================================
// Scenario 7 — unrecognized tier strings, exact matching
// =========================================================================
test('Scenario 7: near-miss tiers are denied — no case-folding, trimming, or prefix matching', () => {
  const nearMisses = ['prod', 'Production', 'CUSTOMER-PRODUCTION', 'Scratch', 'scratch ', ' scratch',
    'internal', 'internal_production', '', null, 0, false, [], {}];
  for (const tier of nearMisses) {
    withPortfolio([project([{ name: 'e', tier }])], (path) => {
      const r = checkAccess({ project: 'demo', environment: 'e', operation: 'read', portfolioPath: path });
      assert.equal(r.allowed, false, `tier ${JSON.stringify(tier)} must be denied`);
    });
  }
});

test('decision table: only the three exact tier literals are ever permissive', () => {
  for (const tier of ['scratch', 'internal-production', 'customer-production']) {
    withPortfolio([project([{ name: 'e', tier }])], (path) => {
      const r = checkAccess({ project: 'demo', environment: 'e', operation: 'read', portfolioPath: path });
      assert.equal(r.allowed, true, `${tier} should permit a read`);
      assert.equal(r.tier, tier);
    });
  }
});

// =========================================================================
// Scenario 8 — unknown project vs unknown environment
// =========================================================================
test('Scenario 8: unknown project and unknown environment deny, and are distinguishable', () => {
  withPortfolio([project([{ name: 'dev', tier: 'scratch' }])], (path) => {
    const noProj = checkAccess({ project: 'ghost', environment: 'dev', operation: 'read', portfolioPath: path });
    assert.equal(noProj.allowed, false);
    assert.match(noProj.reason, /unknown project "ghost"/);

    const noEnv = checkAccess({ project: 'demo', environment: 'ghost', operation: 'read', portfolioPath: path });
    assert.equal(noEnv.allowed, false);
    assert.match(noEnv.reason, /unknown environment "ghost"/);

    assert.notEqual(noProj.reason, noEnv.reason, 'the two cases must be distinguishable');
  });
});

test('a project with no environments array denies rather than defaulting', () => {
  withPortfolio([{ name: 'demo', owner: 'self', stage: 'build' }], (path) => {
    const r = checkAccess({ project: 'demo', environment: 'production', operation: 'read', portfolioPath: path });
    assert.equal(r.allowed, false);
  });
});

// =========================================================================
// Scenario 9 — missing or unrecognized operation
// =========================================================================
test('Scenario 9: an invalid operation denies even on scratch', () => {
  withPortfolio([project([{ name: 'dev', tier: 'scratch' }])], (path) => {
    for (const operation of [undefined, null, '', 'READ', 'drop', 'delete', 'truncate', 42, {}]) {
      const r = checkAccess({ project: 'demo', environment: 'dev', operation, portfolioPath: path });
      assert.equal(r.allowed, false, `operation ${JSON.stringify(operation)} must be denied`);
      assert.match(r.reason, /invalid operation/);
    }
  });
});

test('a missing project or environment argument denies', () => {
  withPortfolio([project([{ name: 'dev', tier: 'scratch' }])], (path) => {
    assert.equal(checkAccess({ environment: 'dev', operation: 'read', portfolioPath: path }).allowed, false);
    assert.equal(checkAccess({ project: 'demo', operation: 'read', portfolioPath: path }).allowed, false);
    assert.equal(checkAccess({}).allowed, false);
    assert.equal(checkAccess().allowed, false);
  });
});

// =========================================================================
// Scenarios 10 & 11 — approval replay and sha binding
// =========================================================================
function withApprovedProject(sha8, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'envguard-proj-'));
  const projectPath = join(dir, 'proj');
  mkdirSync(join(projectPath, 'pm'), { recursive: true });
  if (sha8) writeFileSync(join(projectPath, 'pm', `.deploy-approved-${sha8}`), 'ok\n');
  const p = join(dir, 'portfolio.json');
  writeFileSync(p, JSON.stringify({ version: 1, projects: [
    { name: 'demo', owner: 'self', stage: 'live', path: projectPath,
      environments: [{ name: 'production', tier: 'customer-production' }] },
  ] }));
  try { return fn(p, projectPath); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('a valid, unspent, sha-bound approval permits the customer-production write', () => {
  withApprovedProject('abc12345', (path) => {
    const r = checkAccess({ project: 'demo', environment: 'production', operation: 'write',
      approval: 'abc12345', portfolioPath: path });
    assert.equal(r.allowed, true);
    assert.equal(r.notify.level, 'approved');
    assert.equal(r.notify.sha8, 'abc12345');
  });
});

test('Scenario 10: a consumed approval is refused on replay', () => {
  withApprovedProject('abc12345', (path, projectPath) => {
    const first = checkAccess({ project: 'demo', environment: 'production', operation: 'write',
      approval: 'abc12345', portfolioPath: path });
    assert.equal(first.allowed, true);

    // Spend it, as a caller must after acting.
    const verdict = verifyApproval({ project: { path: projectPath }, approval: 'abc12345' });
    assert.equal(consumeApproval(verdict), true);

    const replay = checkAccess({ project: 'demo', environment: 'production', operation: 'write',
      approval: 'abc12345', portfolioPath: path });
    assert.equal(replay.allowed, false, 'tokens are single-use');
    assert.match(replay.reason, /already used/);
  });
});

test('Scenario 11: an approval bound to a different sha is refused', () => {
  withApprovedProject('abc12345', (path) => {
    const r = checkAccess({ project: 'demo', environment: 'production', operation: 'write',
      approval: 'deadbeef', portfolioPath: path });
    assert.equal(r.allowed, false);
    assert.match(r.reason, /no approval token on disk for deadbeef/);
  });
});

test('malformed approvals are refused, including a REJECT and a non-sha', () => {
  withApprovedProject('abc12345', (path) => {
    for (const approval of ['REJECT abc12345', 'yes', 'APPROVE zzzz', 'abc123', '', null, 12345, {}]) {
      const r = checkAccess({ project: 'demo', environment: 'production', operation: 'write',
        approval, portfolioPath: path });
      assert.equal(r.allowed, false, `approval ${JSON.stringify(approval)} must be refused`);
    }
  });
});

test('an approval for a project with no path on disk is refused', () => {
  withPortfolio([project([{ name: 'production', tier: 'customer-production' }])], (path) => {
    const r = checkAccess({ project: 'demo', environment: 'production', operation: 'write',
      approval: 'abc12345', portfolioPath: path });
    assert.equal(r.allowed, false);
    assert.match(r.reason, /no path/);
  });
});

// =========================================================================
// Scenario 12 — sibling isolation
// =========================================================================
test('Scenario 12: one mis-tiered environment never widens OR narrows access to a sibling', () => {
  withPortfolio([project([
    { name: 'staging', tier: 'scratch' },
    { name: 'production' },              // no tier — broken
  ])], (path) => {
    const staging = checkAccess({ project: 'demo', environment: 'staging', operation: 'write', portfolioPath: path });
    assert.equal(staging.allowed, true, 'a healthy sibling keeps working');
    assert.equal(staging.tier, 'scratch');

    const production = checkAccess({ project: 'demo', environment: 'production', operation: 'read', portfolioPath: path });
    assert.equal(production.allowed, false, 'the broken environment is denied');
  });
});

test('a mis-tiered environment in one project does not affect another project', () => {
  withPortfolio([
    { name: 'broken', owner: 'self', stage: 'build', environments: [{ name: 'p' }] },
    { name: 'healthy', owner: 'self', stage: 'build', environments: [{ name: 'p', tier: 'scratch' }] },
  ], (path) => {
    assert.equal(checkAccess({ project: 'broken', environment: 'p', operation: 'read', portfolioPath: path }).allowed, false);
    assert.equal(checkAccess({ project: 'healthy', environment: 'p', operation: 'read', portfolioPath: path }).allowed, true);
  });
});

// =========================================================================
// agentWritable — an explicit false is honored on top of the tier
// =========================================================================
test('agentWritable:false blocks mutation even on scratch, but never blocks a read', () => {
  withPortfolio([project([{ name: 'dev', tier: 'scratch', agentWritable: false }])], (path) => {
    assert.equal(checkAccess({ project: 'demo', environment: 'dev', operation: 'read', portfolioPath: path }).allowed, true);
    for (const operation of MUTATING) {
      const r = checkAccess({ project: 'demo', environment: 'dev', operation, portfolioPath: path });
      assert.equal(r.allowed, false, `${operation} must respect agentWritable:false`);
      assert.match(r.reason, /agentWritable:false/);
    }
  });
});

// =========================================================================
// REQ-004 — parser identity, not a duplicated regex
// =========================================================================
test('REQ-004: env-guard uses deploy-runner\'s approval parser, not a copy', () => {
  assert.equal(parseApprovalCommand, runnerParser,
    'a second regex is a second thing to get wrong; they must be the same function');
});

// =========================================================================
// Invariant — checkAccess never throws
// =========================================================================
test('invariant: checkAccess never throws, for any input', () => {
  const nasties = [
    undefined, null, {}, { project: 1, environment: 2, operation: 3 },
    { project: 'demo', environment: 'dev', operation: 'read', portfolioPath: '/dev/null/nope' },
    { project: {}, environment: [], operation: 'read' },
    { project: 'demo', environment: 'dev', operation: 'read', approval: Symbol('x') },
  ];
  for (const args of nasties) {
    let r;
    assert.doesNotThrow(() => { r = checkAccess(args); }, `threw on ${JSON.stringify(String(args))}`);
    assert.equal(r.allowed, false, 'and every such result must be a denial');
  }
});

test('invariant: the guard never returns a credential value', () => {
  withPortfolio([project([{ name: 'dev', tier: 'scratch', credentialVars: ['SECRET_URL'] }])], (path) => {
    const r = checkAccess({ project: 'demo', environment: 'dev', operation: 'read', portfolioPath: path });
    assert.equal(JSON.stringify(r).includes('SECRET_URL'), false,
      'the guard reasons over names and must not echo even those back');
  });
});

test('OPERATIONS is exactly the four documented verbs', () => {
  assert.deepEqual([...OPERATIONS], OPS);
});

// =========================================================================
// T-204 — recording is separate from deciding, and cannot change a decision
// =========================================================================
import { recordAccess } from '../env-guard.mjs';

test('recordAccess emits for internal-production writes, denials, and approvals', async () => {
  const sent = [];
  const notifyFn = (msg, n) => { sent.push({ msg, n }); return true; };

  await withPortfolio([project([{ name: 'production', tier: 'internal-production' }])], async (path) => {
    const r = checkAccess({ project: 'demo', environment: 'production', operation: 'write', portfolioPath: path });
    assert.equal(await recordAccess(r, { notifyFn }), true);
    assert.match(sent.at(-1).msg, /ALLOWED write on demo\/production/);
    assert.match(sent.at(-1).msg, /tier: internal-production/);
  });

  await withPortfolio([project([{ name: 'production', tier: 'customer-production' }])], async (path) => {
    const r = checkAccess({ project: 'demo', environment: 'production', operation: 'write', portfolioPath: path });
    assert.equal(await recordAccess(r, { notifyFn }), true);
    assert.match(sent.at(-1).msg, /DENIED write on demo\/production/);
  });
});

test('recordAccess stays silent for scratch activity', async () => {
  const sent = [];
  await withPortfolio([project([{ name: 'dev', tier: 'scratch' }])], async (path) => {
    const r = checkAccess({ project: 'demo', environment: 'dev', operation: 'write', portfolioPath: path });
    assert.equal(await recordAccess(r, { notifyFn: (m) => { sent.push(m); return true; } }), false);
    assert.equal(sent.length, 0);
  });
});

test('a notifier that throws never upgrades a denial to an allow', async () => {
  await withPortfolio([project([{ name: 'production', tier: 'customer-production' }])], async (path) => {
    const r = checkAccess({ project: 'demo', environment: 'production', operation: 'write', portfolioPath: path });
    assert.equal(r.allowed, false);
    const boom = () => { throw new Error('telegram is down'); };
    await assert.doesNotReject(async () => recordAccess(r, { notifyFn: boom }));
    assert.equal(r.allowed, false, 'the decision object is unchanged by recording');
  });
});
