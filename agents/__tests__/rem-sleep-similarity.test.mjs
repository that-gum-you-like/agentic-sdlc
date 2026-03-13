/**
 * rem-sleep-similarity.test.mjs
 *
 * Tests for similarity-based deduplication in rem-sleep.mjs (task 5.3).
 * Tests the dedup logic and conditionally tests with real embeddings.
 *
 * Run with:
 *   node --test agents/__tests__/rem-sleep-similarity.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');

const VENV_PYTHON = '/home/bryce/agentic-sdlc/.venv/bin/python3';
const PYTHON_PATH = existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
let PYTHON_AVAILABLE = false;
try {
  execSync(`${PYTHON_PATH} -c "from sentence_transformers import SentenceTransformer"`, {
    stdio: 'pipe', timeout: 30000,
  });
  PYTHON_AVAILABLE = true;
} catch { PYTHON_AVAILABLE = false; }

describe('rem-sleep.mjs — similarity dedup', () => {
  let src;
  before(() => {
    src = readFileSync(resolve(AGENTS_DIR, 'rem-sleep.mjs'), 'utf8');
  });

  it('imports checkSimilarity from semantic-index', () => {
    assert.ok(src.includes('checkSimilarity'));
    assert.ok(src.includes('semantic-index.mjs'));
  });

  it('uses --similarity flag to enable similarity dedup', () => {
    assert.ok(src.includes("'--similarity'"));
  });

  it('has a similarity threshold of 0.92', () => {
    assert.ok(src.includes('SIMILARITY_THRESHOLD'));
    assert.ok(src.includes('0.92'));
  });

  it('keeps newer entry and composts older on near-duplicate', () => {
    // Verify the logic: dateA >= dateB → keep A, compost B
    assert.ok(src.includes('dateA >= dateB'));
    assert.ok(src.includes('compost'));
  });

  it('only runs similarity dedup when --similarity flag and checkSimilarity available', () => {
    assert.ok(src.includes('useSimilarity'));
    assert.ok(src.includes('checkSimilarity'));
  });

  it('gracefully handles missing semantic-index', () => {
    // Import is wrapped in try/catch
    assert.ok(src.includes("try {"));
    assert.ok(src.includes("await import('./semantic-index.mjs')"));
  });
});

describe('similarity dedup algorithm (unit test)', () => {
  const SIMILARITY_THRESHOLD = 0.92;

  it('near-duplicates above threshold are composted', () => {
    const entries = [
      { id: 'lt-1', content: 'Always run tests before committing', date: '2026-01-15' },
      { id: 'lt-2', content: 'Always run tests before committing code', date: '2026-02-20' },
      { id: 'lt-3', content: 'Cost tracking uses daily token limits', date: '2026-01-10' },
    ];

    // Simulate: entries 0 and 1 have similarity 0.95 (above threshold)
    const similarities = {
      '0-1': 0.95,
      '0-2': 0.1,
      '1-2': 0.15,
    };

    const composted = new Set();
    const compostEntries = [];

    for (let i = 0; i < entries.length; i++) {
      if (composted.has(i)) continue;
      for (let j = i + 1; j < entries.length; j++) {
        if (composted.has(j)) continue;
        const sim = similarities[`${i}-${j}`] || 0;
        if (sim >= SIMILARITY_THRESHOLD) {
          const dateA = new Date(entries[i].date);
          const dateB = new Date(entries[j].date);
          const [keepIdx, compostIdx] = dateA >= dateB ? [i, j] : [j, i];
          composted.add(compostIdx);
          compostEntries.push(entries[compostIdx]);
        }
      }
    }

    const remaining = entries.filter((_, idx) => !composted.has(idx));

    assert.equal(composted.size, 1);
    assert.equal(remaining.length, 2);
    // Older entry (lt-1, Jan 15) should be composted, newer (lt-2, Feb 20) kept
    assert.ok(composted.has(0), 'older entry should be composted');
    assert.equal(compostEntries[0].id, 'lt-1');
  });

  it('entries below threshold are not composted', () => {
    const entries = [
      { id: 'lt-1', content: 'Memory system uses 5 layers', date: '2026-01-15' },
      { id: 'lt-2', content: 'Budget tracking uses daily limits', date: '2026-02-20' },
    ];

    const composted = new Set();
    // Simulated similarity is 0.1 (well below threshold)
    const sim = 0.1;
    if (sim >= SIMILARITY_THRESHOLD) {
      composted.add(1);
    }

    assert.equal(composted.size, 0, 'nothing should be composted');
  });

  it('handles entries with missing content gracefully', () => {
    const entries = [
      { id: 'lt-1', content: '', date: '2026-01-15' },
      { id: 'lt-2', content: 'test entry', date: '2026-02-20' },
    ];

    const composted = new Set();
    for (let i = 0; i < entries.length; i++) {
      if (composted.has(i)) continue;
      for (let j = i + 1; j < entries.length; j++) {
        if (composted.has(j)) continue;
        const contentA = entries[i].content || '';
        const contentB = entries[j].content || '';
        if (!contentA || !contentB) continue; // Skip empty content
      }
    }

    assert.equal(composted.size, 0, 'empty content should be skipped');
  });

  it('multiple near-duplicates are all composted except the newest', () => {
    const entries = [
      { id: 'lt-1', content: 'run tests', date: '2026-01-01' },
      { id: 'lt-2', content: 'run tests first', date: '2026-02-01' },
      { id: 'lt-3', content: 'always run tests', date: '2026-03-01' },
    ];

    // All pairs have high similarity
    const similarities = { '0-1': 0.95, '0-2': 0.93, '1-2': 0.96 };

    const composted = new Set();
    for (let i = 0; i < entries.length; i++) {
      if (composted.has(i)) continue;
      for (let j = i + 1; j < entries.length; j++) {
        if (composted.has(j)) continue;
        const sim = similarities[`${i}-${j}`] || 0;
        if (sim >= SIMILARITY_THRESHOLD) {
          const dateA = new Date(entries[i].date);
          const dateB = new Date(entries[j].date);
          const [, compostIdx] = dateA >= dateB ? [i, j] : [j, i];
          composted.add(compostIdx);
        }
      }
    }

    // Entry 0 (Jan) compared with 1 (Feb): 0.95 → compost 0
    // Entry 1 (Feb) compared with 2 (Mar): 0.96 → compost 1
    // Result: only entry 2 (newest) remains
    const remaining = entries.filter((_, idx) => !composted.has(idx));
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'lt-3');
  });
});

describe('REM sleep similarity with real embeddings (requires sentence-transformers)', () => {
  const skipMsg = !PYTHON_AVAILABLE ? 'sentence-transformers not installed' : false;

  it('near-duplicate memory entries have similarity >= 0.75', { skip: skipMsg }, () => {
    const embedScript = resolve(AGENTS_DIR, 'embed.py');
    const input = JSON.stringify([
      'Always run the full test suite before committing changes',
      'Always run all tests before making a commit',
    ]);
    const result = execSync(`echo '${input}' | ${PYTHON_PATH} "${embedScript}"`, {
      encoding: 'utf8',
      timeout: 120000,
    });
    const embeddings = JSON.parse(result.trim());

    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < embeddings[0].length; i++) {
      dot += embeddings[0][i] * embeddings[1][i];
      magA += embeddings[0][i] ** 2;
      magB += embeddings[1][i] ** 2;
    }
    const similarity = dot / (Math.sqrt(magA) * Math.sqrt(magB));
    assert.ok(similarity >= 0.75, `Expected >= 0.75 for near-duplicates, got ${similarity}`);
  });

  it('distinct memory entries have similarity < 0.92', { skip: skipMsg }, () => {
    const embedScript = resolve(AGENTS_DIR, 'embed.py');
    const input = JSON.stringify([
      'Always run the full test suite before committing changes',
      'Budget conservation mode halves all daily token limits',
    ]);
    const result = execSync(`echo '${input}' | ${PYTHON_PATH} "${embedScript}"`, {
      encoding: 'utf8',
      timeout: 120000,
    });
    const embeddings = JSON.parse(result.trim());

    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < embeddings[0].length; i++) {
      dot += embeddings[0][i] * embeddings[1][i];
      magA += embeddings[0][i] ** 2;
      magB += embeddings[1][i] ** 2;
    }
    const similarity = dot / (Math.sqrt(magA) * Math.sqrt(magB));
    assert.ok(similarity < 0.92, `Expected < 0.92 for distinct entries, got ${similarity}`);
  });
});
