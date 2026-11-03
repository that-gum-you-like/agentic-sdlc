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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evidenceOk, evidenceText, evidenceIcon, renderReport } from '../agents/maturity-assess.mjs';

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

// --- CV-112 / CV-REQ-013: --report writes a dated maturity report ----------

// UTC date, matching the assessor's own date stamp. Offset in days so the
// overwrite test can seed a neighbour without caring where midnight falls.
const utcDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().split('T')[0];

function reportFixture(build = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'maturity-report-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', type: 'module' }));
  build(dir);
  return dir;
}

test('--report writes pm/maturity-reports/<YYYY-MM-DD>.md containing the dimension table', () => {
  const dir = reportFixture();
  try {
    const consoleOut = execFileSync('node', [SCRIPT, '--dir', dir, '--report'], { encoding: 'utf8' });

    const reportsDir = join(dir, 'pm', 'maturity-reports');
    assert.ok(existsSync(reportsDir), '--report creates the directory when it is absent');

    const files = readdirSync(reportsDir).filter(f => f.endsWith('.md'));
    assert.deepEqual(files, [`${utcDate()}.md`], 'one file, named for the assessment date');

    const body = readFileSync(join(reportsDir, files[0]), 'utf8');
    // The title names the assessed directory, not the manifest's "name".
    assert.match(body, new RegExp(`^# Platform Maturity Assessment — ${basename(dir)}$`, 'm'));
    assert.match(body, /\| Dimension \| Score \| Bar \|/);
    assert.match(body, /\| Testing & Quality\s+\| \d\.\d\/5 \|/);
    assert.match(body, /## Detailed Findings/);

    // "the same table the console shows": every table row in the file was
    // printed as well. A second, hand-copied renderer would fail this.
    const rows = body.split('\n').filter(l => l.startsWith('| '));
    assert.ok(rows.length >= 9, `expected header + 8 dimension rows, got ${rows.length}`);
    for (const row of rows) assert.ok(consoleOut.includes(row), `console output is missing the row: ${row}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('re-running --report on the same day overwrites that day\'s file', () => {
  const dir = reportFixture();
  try {
    const reportsDir = join(dir, 'pm', 'maturity-reports');
    mkdirSync(reportsDir, { recursive: true });
    // Seed today *and* tomorrow: a run that straddles UTC midnight then still
    // exercises an overwrite rather than tripping over a missing file.
    for (const name of [utcDate(), utcDate(1)]) {
      writeFileSync(join(reportsDir, `${name}.md`), 'STALE REPORT\n');
    }

    execFileSync('node', [SCRIPT, '--dir', dir, '--report'], { encoding: 'utf8' });

    const body = readFileSync(join(reportsDir, `${utcDate()}.md`), 'utf8');
    assert.doesNotMatch(body, /STALE REPORT/, 'the stale same-day file was overwritten');
    assert.equal(body.match(/\| Dimension \| Score \| Bar \|/g).length, 1, 'exactly one table — overwritten, not appended');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('without --report the assessor still writes nothing', () => {
  const dir = reportFixture();
  try {
    execFileSync('node', [SCRIPT, '--dir', dir], { encoding: 'utf8' });
    assert.equal(existsSync(join(dir, 'pm')), false, 'the default run stays read-only');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed report write exits nonzero instead of silently reporting success', () => {
  // pm/ exists as a file, so mkdir -p fails. A monthly cycle that logged a
  // report but delivered no file must not look like a passing step.
  const dir = reportFixture((d) => writeFileSync(join(d, 'pm'), 'not a directory\n'));
  try {
    assert.throws(
      () => execFileSync('node', [SCRIPT, '--dir', dir, '--report'], { encoding: 'utf8' }),
      (err) => {
        assert.equal(err.status, 1, 'exit code is nonzero');
        assert.match(String(err.stderr), /Could not write maturity report/);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('renderReport is the single source of the table', () => {
  // The console and the --report file are rendered by the same function, so
  // this pins its shape: header, date, one row per dimension, real gaps only.
  const text = renderReport({
    projectName: 'demo',
    date: '2026-01-02',
    results: [{ dimension: 'Testing & Quality', score: 2.5, evidence: [{ text: 'gap one', ok: false }] }],
    avgScore: 2.5,
    label: 'Established',
  });
  assert.match(text, /^# Platform Maturity Assessment — demo$/m);
  assert.match(text, /^\*\*Date\*\*: 2026-01-02$/m);
  assert.match(text, /Overall Score: \*\*2\.5\/5\.0\*\* \(Established\)/);
  assert.match(text, /\| Testing & Quality\s+\| 2\.5\/5 \|/);
  assert.match(text, /1\. \*\*Testing & Quality\*\* \(2\.5\/5\): gap one/);
});
