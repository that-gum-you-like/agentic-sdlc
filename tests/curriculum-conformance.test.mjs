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
