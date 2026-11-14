/**
 * docs/curriculum-conformance.md drift guard (maturity-reconciliation REQ-004).
 *
 * WHY: this document is the framework's authoritative rubric. For three weeks
 * it advertised nine shipped capabilities as unbuilt — including a section
 * headed "close ONLY these, in this order" — because nothing checked its claims
 * against the filesystem. A framework that detects documentation drift
 * everywhere else should detect it in its own rubric.
 *
 * The guard is deliberately narrow, so it stays trustworthy rather than noisy:
 *   - Missing + owner path exists  -> fail (the drift that actually bit us)
 *   - Solid   + no owner exists    -> fail (credit for something not there)
 *   - Partial                      -> not asserted; "exists but incomplete" is
 *                                     a judgement the filesystem can't settle
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(REPO, 'docs', 'curriculum-conformance.md');

const KNOWN_EXTENSIONS = /\.(mjs|js|ts|py|sh|json|md|jsonl|template)$/;

/** A backticked token is an owner reference if it looks like a repo path. */
export function isOwnerPath(token) {
  if (/\s/.test(token)) return false;                 // prose, not a path
  if (token.startsWith('--') || token.startsWith('#')) return false;
  if (token.includes('(') || token.includes(')')) return false;
  return token.includes('/') || KNOWN_EXTENSIONS.test(token);
}

/** Parse `| capability | status | owner |` rows out of the markdown tables. */
export function parseRows(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 3) continue;
    if (/^-+$/.test(cells[0].replace(/[\s:-]/g, '') || '-')) continue; // separator
    const statusCell = cells[1];
    // Tolerate decoration: **Solid (new)**, Solid (fixed), **Missing**
    const m = statusCell.replace(/\*/g, '').trim().match(/^(Solid|Partial|Missing)\b/i);
    if (!m) continue;
    const owners = [...cells[2].matchAll(/`([^`]+)`/g)].map(x => x[1]).filter(isOwnerPath);
    rows.push({ capability: cells[0].replace(/\*/g, '').trim(), status: m[1].toLowerCase(), owners, line });
  }
  return rows;
}

const rows = parseRows(readFileSync(DOC, 'utf8'));

// Owner cells cite paths the way a human writes them in prose: sometimes
// repo-relative (`agents/notify.mjs`), often just the filename
// (`pattern-hunt.mjs`, `AGENT.md.template`) or relative to agents/
// (`cycles/daily-review.mjs`). Resolving only against the repo root would
// report most of the doc as broken, which would get the guard disabled. So
// build a basename index once and fall back to it.
const BASENAMES = new Map();
(function index(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.venv') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) index(full);
    else if (!BASENAMES.has(entry.name)) BASENAMES.set(entry.name, full);
  }
})(REPO);

export function exists(rel) {
  const clean = rel.replace(/\/$/, '');
  if (existsSync(join(REPO, clean))) return true;
  // Common implicit prefixes used in the doc's prose.
  for (const prefix of ['agents', 'openspec', 'framework', 'docs', 'agents/templates']) {
    if (existsSync(join(REPO, prefix, clean))) return true;
  }
  return BASENAMES.has(basename(clean));
}
// Archived specs describe work that may have been re-homed; their presence
// proves nothing either way, so rows citing only the archive are skipped.
const archiveOnly = (r) => r.owners.length > 0 && r.owners.every(o => o.startsWith('openspec/changes/archive/'));

test('the doc actually parses into capability rows', () => {
  assert.ok(rows.length >= 30, `expected the capability tables to parse, got ${rows.length} rows`);
  assert.ok(rows.some(r => r.status === 'solid'), 'at least one Solid row');
});

test('no capability is marked Missing while its owner exists on disk', () => {
  const contradictions = rows
    .filter(r => r.status === 'missing' && !archiveOnly(r))
    .filter(r => r.owners.some(exists))
    .map(r => `${r.capability} → ${r.owners.filter(exists).join(', ')}`);
  assert.deepEqual(contradictions, [],
    `marked Missing but present on disk:\n  ${contradictions.join('\n  ')}`);
});

test('no capability is marked Solid while none of its owners exist', () => {
  const contradictions = rows
    .filter(r => r.status === 'solid' && r.owners.length > 0 && !archiveOnly(r))
    .filter(r => !r.owners.some(exists))
    .map(r => `${r.capability} → ${r.owners.join(', ')}`);
  assert.deepEqual(contradictions, [],
    `marked Solid but absent from disk:\n  ${contradictions.join('\n  ')}`);
});

test('the obsolete "close ONLY these" gap list is gone', () => {
  // It instructed a reader to rebuild nine shipped capabilities.
  const doc = readFileSync(DOC, 'utf8');
  assert.ok(!/Remaining gap list to Level-6 completion/.test(doc),
    'the stale gap-list heading must not return');
  assert.ok(!/close ONLY these, in this order/.test(doc),
    'the stale "close ONLY these" instruction must not return');
});

// --- schedule-honesty guards ------------------------------------------------

const SCHEDULE_RE = /\b(scheduled|weekly|daily|monthly|timer|cron)\b/i;

/**
 * A row is "scheduled" if its capability name or full line mentions any
 * scheduling keyword: scheduled, weekly, daily, monthly, timer, or cron.
 */
export function isScheduledRow(row) {
  const text = row.capability + ' ' + row.line;
  return SCHEDULE_RE.test(text);
}

/**
 * A row has schedule evidence if its owner list contains the canonical
 * schedule definition (agents/cron-schedule.json) or a path under
 * agents/cycles/, or if the row text mentions a systemd timer unit
 * (sdlc-sched-).
 */
export function hasScheduleEvidence(row) {
  const hasOwner = row.owners.some(o => {
    // Try raw path, then with implicit agents/ prefix (common in prose)
    const variants = [o];
    if (!o.startsWith('agents/') && !o.startsWith('/')) {
      variants.push('agents/' + o);
    }
    return variants.some(v =>
      v === 'agents/cron-schedule.json' || v.startsWith('agents/cycles/')
    );
  });
  if (hasOwner) return true;
  const text = row.capability + ' ' + row.line;
  return /sdlc-sched-/i.test(text);
}

test('a Solid scheduled row without schedule evidence fails', () => {
  const violations = rows
    .filter(r => r.status === 'solid')
    .filter(r => isScheduledRow(r))
    .filter(r => !hasScheduleEvidence(r))
    .map(r => `${r.capability} → scheduled but no schedule evidence`);
  assert.deepEqual(violations, [],
    `Solid scheduled rows without schedule evidence:\n  ${violations.join('\n  ')}`);
});

test('isScheduledRow detects scheduling keywords', () => {
  const r = (capability, line) => ({ capability, line, owners: [] });
  assert.ok(isScheduledRow(r('Weekly report', '| Weekly report | Solid | `x` |')));
  assert.ok(isScheduledRow(r('Daily build', '| Daily build | Solid | `x` |')));
  assert.ok(isScheduledRow(r('Monthly audit', '| Monthly audit | Solid | `x` |')));
  assert.ok(isScheduledRow(r('Timer job', '| Timer job | Solid | `x` |')));
  assert.ok(isScheduledRow(r('Cron task', '| Cron task | Solid | `x` |')));
  assert.ok(isScheduledRow(r('Scheduled maintenance', '| Scheduled maintenance | Solid | `x` |')));
  assert.ok(!isScheduledRow(r('Pattern hunt', '| Pattern hunt | Solid | `x` |')));
  assert.ok(!isScheduledRow(r('Static analysis', '| Static analysis | Solid | `x` |')));
});

test('hasScheduleEvidence detects schedule evidence', () => {
  const r = (owners, line) => ({ capability: 'Test', line, owners });
  // cron-schedule.json counts
  assert.ok(hasScheduleEvidence(r(['agents/cron-schedule.json'], '| Test | Solid | ... |')));
  // agents/cycles/ path counts
  assert.ok(hasScheduleEvidence(r(['agents/cycles/daily-review.mjs'], '| Test | Solid | ... |')));
  // implicit agents/ prefix: cycles/daily-review.mjs → agents/cycles/daily-review.mjs
  assert.ok(hasScheduleEvidence(r(['cycles/daily-review.mjs'], '| Test | Solid | ... |')));
  // sdlc-sched- in text counts
  assert.ok(hasScheduleEvidence(r(['agents/pattern-hunt.mjs'], '| Test | Solid | sdlc-sched-backlog |')));
  // pattern-hunt.mjs alone is NOT evidence
  assert.ok(!hasScheduleEvidence(r(['agents/pattern-hunt.mjs'], '| Test | Solid | ... |')));
  // agents/templates/cron-schedule.json.template is NOT evidence (it's a template)
  assert.ok(!hasScheduleEvidence(r(['agents/templates/cron-schedule.json.template'], '| Test | Solid | ... |')));
});

test('fixture: Solid + weekly + only pattern-hunt.mjs owner fails hasScheduleEvidence', () => {
  const row = { capability: 'Weekly pattern hunt', line: '| Weekly pattern hunt | Solid | `agents/pattern-hunt.mjs` |', owners: ['agents/pattern-hunt.mjs'] };
  assert.ok(isScheduledRow(row), 'fixture must be a scheduled row');
  assert.ok(!hasScheduleEvidence(row), 'pattern-hunt.mjs alone must not provide schedule evidence');
});

test('fixture: Solid + weekly + cron-schedule.json owner passes hasScheduleEvidence', () => {
  const row = { capability: 'Weekly pattern hunt', line: '| Weekly pattern hunt | Solid | `agents/pattern-hunt.mjs` + `agents/cron-schedule.json` |', owners: ['agents/pattern-hunt.mjs', 'agents/cron-schedule.json'] };
  assert.ok(isScheduledRow(row), 'fixture must be a scheduled row');
  assert.ok(hasScheduleEvidence(row), 'cron-schedule.json must provide schedule evidence');
});

// --- parser coverage --------------------------------------------------------

test('decorated statuses parse', () => {
  const parsed = parseRows([
    '| Cap A | **Solid (new)** | `agents/notify.mjs` |',
    '| Cap B | Solid (fixed) | `agents/pattern-hunt.mjs` |',
    '| Cap C | **Missing** | `agents/nope.mjs` |',
    '| Cap D | Partial | `agents/cost-tracker.mjs` |',
  ].join('\n'));
  assert.deepEqual(parsed.map(r => r.status), ['solid', 'solid', 'missing', 'partial']);
});

test('prose in the owner cell is not mistaken for a path', () => {
  const [row] = parseRows('| Cap | Partial | Documented; CLOSE: `one doc section` and see `docs/x.md` |');
  assert.deepEqual(row.owners, ['docs/x.md']);
});

test('a Missing row whose owner exists is exactly what fails', () => {
  // Guard the guard: prove it catches the drift it was written for.
  const parsed = parseRows('| Regression | **Missing** | `agents/notify.mjs` |');
  assert.equal(parsed[0].status, 'missing');
  assert.ok(parsed[0].owners.some(exists), 'fixture owner must really exist');
});
