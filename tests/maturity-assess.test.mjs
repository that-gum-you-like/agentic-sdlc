/**
 * maturity-assess.mjs — evidence polarity + deploy detection
 * (maturity-reconciliation REQ-002, REQ-003, REQ-005).
 *
 * The polarity helpers are unit-tested directly. Deploy detection is exercised
 * through the CLI with `--dir`, because PROJECT_DIR is resolved once at import
 * time — a subprocess is the only honest way to point the assessor at a
 * fixture tree.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evidenceOk, evidenceText, evidenceIcon } from '../agents/maturity-assess.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO, 'agents', 'maturity-assess.mjs');

// --- REQ-002: polarity is recorded, not inferred ---------------------------

test('a positive finding whose text starts with "No " is still a pass', () => {
  // This is the exact regression: the old renderer substring-matched 'No ' and
  // reported both of these — which are good news — as failures.
  for (const text of [
    'No dependency vulnerabilities possible (zero attack surface)',
    'No lock file needed (nothing to lock)',
    'No critical/high vulnerabilities in dependencies',
  ]) {
    const record = { text, ok: true };
    assert.equal(evidenceOk(record), true, text);
    assert.equal(evidenceIcon(record), '✅', text);
  }
});

test('a genuine failure renders as a gap', () => {
  const record = { text: 'No CI/CD pipeline detected', ok: false };
  assert.equal(evidenceOk(record), false);
  assert.equal(evidenceIcon(record), '❌');
});

test('an informational finding is neither credit nor gap', () => {
  const record = { text: 'Dimension caps at 4.0/5 for zero-dependency repos', ok: null };
  assert.equal(evidenceOk(record), null);
  assert.equal(evidenceIcon(record), '•');
});

test('plain-string evidence still works via the legacy heuristic', () => {
  // Backward compatibility for any external consumer of assessProject().
  assert.equal(evidenceOk('Rules file: CLAUDE.md'), true);
  assert.equal(evidenceOk('No rules file (CLAUDE.md or .cursorrules)'), false);
  assert.equal(evidenceText('Rules file: CLAUDE.md'), 'Rules file: CLAUDE.md');
  assert.equal(evidenceText({ text: 'x', ok: true }), 'x');
});

// --- REQ-003: deploy detection ---------------------------------------------

function assessFixture(build) {
  const dir = mkdtempSync(join(tmpdir(), 'maturity-fixture-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'f', version: '1.0.0', type: 'module' }));
    build(dir);
    const out = execFileSync('node', [SCRIPT, '--dir', dir, '--json'], { encoding: 'utf8' });
    const report = JSON.parse(out);
    return report.dimensions.find(d => d.dimension === 'Deployment & Release');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const deployEvidence = (dim) => dim.evidence.map(evidenceText).join(' | ');

test('a framework-owned deploy runner counts as a deploy pipeline', () => {
  const dim = assessFixture((dir) => {
    mkdirSync(join(dir, 'agents'));
    writeFileSync(join(dir, 'agents', 'deploy-runner.mjs'), '// approval-gated deploy runner\n');
  });
  assert.match(deployEvidence(dim), /Deploy script\/command exists/);
});

test('a project.json deploy block counts as a deploy pipeline', () => {
  const dim = assessFixture((dir) => {
    mkdirSync(join(dir, 'agents'));
    writeFileSync(join(dir, 'agents', 'project.json'), JSON.stringify({ deploy: { enabled: true } }));
  });
  assert.match(deployEvidence(dim), /Deploy script\/command exists/);
});

test('a tree with no deploy evidence at all still reports the gap', () => {
  const dim = assessFixture(() => {});
  assert.match(deployEvidence(dim), /No deploy script found/);
});

// --- REQ-005: no invented credit -------------------------------------------

test('absence of a container is still reported as a gap, not credited', () => {
  // The honest position: "we do not need Docker" is a design stance, not
  // deployment maturity. It must never earn a point.
  const dim = assessFixture((dir) => {
    mkdirSync(join(dir, 'agents'));
    writeFileSync(join(dir, 'agents', 'deploy-runner.mjs'), '// runner\n');
  });
  const docker = dim.evidence.find(e => /container/i.test(evidenceText(e)));
  assert.ok(docker, 'containerization is reported one way or the other');
  assert.equal(evidenceOk(docker), false, 'missing container must read as a gap');
  assert.ok(dim.score < 5, `Deployment must not reach 5.0 without a container (got ${dim.score})`);
});

test('this repo scores below 5.0 on Deployment & Release — the gap is real', () => {
  const out = execFileSync('node', [SCRIPT, '--dir', REPO, '--json'], { encoding: 'utf8' });
  const dim = JSON.parse(out).dimensions.find(d => d.dimension === 'Deployment & Release');
  assert.ok(dim.score > 2.0, `detection fix should lift this above the old 2.0 (got ${dim.score})`);
  assert.ok(dim.score < 5.0, `but it must not reach 5.0 (got ${dim.score})`);
});

// --- report quality ---------------------------------------------------------

test('every dimension below 5.0 explains why', () => {
  // Otherwise the Top-3 recommendations degrade to "Room for improvement",
  // which is what the silent-non-emission bug produced. An explanation is
  // either a stated gap (ok:false) or an informational note (ok:null) — e.g.
  // the zero-dependency scoring ceiling, which is not a gap but does account
  // for the missing point.
  const out = execFileSync('node', [SCRIPT, '--dir', REPO, '--json'], { encoding: 'utf8' });
  const { dimensions } = JSON.parse(out);
  const unexplained = dimensions
    .filter(d => d.score < 5.0 && !d.evidence.some(e => evidenceOk(e) !== true))
    .map(d => d.dimension);
  assert.deepEqual(unexplained, [], `dimensions scoring <5 with nothing explaining it: ${unexplained.join(', ')}`);
});

test('assessing a bare project without agents/ does not crash', () => {
  // Regression: assessSDLC readdirSync'd agents/ unconditionally and died with
  // ENOENT on exactly the greenfield trees the assessor exists to grade.
  const dim = assessFixture(() => {});
  assert.ok(dim, 'a bare tree still produces a Deployment & Release dimension');
});
