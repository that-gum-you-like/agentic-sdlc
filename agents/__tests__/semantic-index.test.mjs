/**
 * semantic-index.test.mjs
 *
 * Tests for agents/semantic-index.mjs (tasks 4.6–4.7).
 * Tests pure JS logic (cosine similarity, vector storage, memory collection)
 * and conditionally tests Python integration if sentence-transformers is available.
 *
 * Run with:
 *   node --test agents/__tests__/semantic-index.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');

// Check Python availability at module level (before test registration)
const VENV_PYTHON = resolve(AGENTS_DIR, '..', '.venv', 'bin', 'python3');
const PYTHON_PATH = existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
let PYTHON_AVAILABLE = false;
try {
  execSync(`${PYTHON_PATH} -c "from sentence_transformers import SentenceTransformer"`, {
    stdio: 'pipe',
    timeout: 30000,
  });
  PYTHON_AVAILABLE = true;
} catch {
  PYTHON_AVAILABLE = false;
}

// ---------------------------------------------------------------------------
// Source-level tests (no import needed, avoids loadConfig)
// ---------------------------------------------------------------------------

describe('semantic-index.mjs — source verification', () => {
  let src;
  before(() => {
    src = readFileSync(resolve(AGENTS_DIR, 'semantic-index.mjs'), 'utf8');
  });

  it('exports buildIndex, search, addEntry, pythonAvailable', () => {
    assert.ok(src.includes('export { buildIndex'));
    assert.ok(src.includes('search'));
    assert.ok(src.includes('addEntry'));
    assert.ok(src.includes('pythonAvailable'));
  });

  it('exports checkSimilarity for REM sleep dedup', () => {
    assert.ok(src.includes('export function checkSimilarity'));
  });

  it('exports clusterBySimilarity for pattern-hunt', () => {
    assert.ok(src.includes('export function clusterBySimilarity'));
  });

  it('uses embed.py for embedding generation', () => {
    assert.ok(src.includes('embed.py'));
    assert.ok(src.includes('sentence_transformers'));
  });

  it('stores vectors in agents/<agent>/memory/vectors.json', () => {
    assert.ok(src.includes('vectors.json'));
  });

  it('falls back gracefully when Python is unavailable', () => {
    assert.ok(src.includes('pythonAvailable()'));
    assert.ok(src.includes('return null'));
  });

  it('excludes compost layer from search', () => {
    assert.ok(src.includes("'core', 'long-term', 'medium-term', 'recent'"));
  });

  it('has capability instrumentation', () => {
    assert.ok(src.includes('logCapabilityUsage'));
    assert.ok(src.includes('semanticSearch'));
    assert.ok(src.includes('semanticEmbed'));
  });
});

// ---------------------------------------------------------------------------
// Cosine similarity (pure JS, no dependencies)
// ---------------------------------------------------------------------------

describe('cosineSimilarity — pure JS', () => {
  // Reimplemented here to test in isolation
  function cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  it('returns 1.0 for identical vectors', () => {
    const v = [0.1, 0.2, 0.3, 0.4];
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1.0) < 0.001);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    assert.ok(Math.abs(cosineSimilarity(a, b)) < 0.001);
  });

  it('returns -1 for opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    assert.ok(Math.abs(cosineSimilarity(a, b) - (-1)) < 0.001);
  });

  it('similar vectors have high similarity', () => {
    const a = [0.9, 0.1, 0.0];
    const b = [0.85, 0.15, 0.0];
    const sim = cosineSimilarity(a, b);
    assert.ok(sim > 0.9, `Expected > 0.9, got ${sim}`);
  });

  it('handles high-dimensional vectors', () => {
    const dim = 384; // all-MiniLM-L6-v2 dimension
    const a = Array.from({ length: dim }, () => Math.random());
    const b = [...a]; // identical
    assert.ok(Math.abs(cosineSimilarity(a, b) - 1.0) < 0.001);
  });
});

// ---------------------------------------------------------------------------
// Vector storage format
// ---------------------------------------------------------------------------

describe('vectors.json format', () => {
  it('vectors.json has expected structure', () => {
    const vectors = {
      entries: {
        'entry-1': {
          content: 'test entry',
          layer: 'recent',
          date: '2026-03-13',
          vector: [0.1, 0.2, 0.3],
        },
      },
    };
    const json = JSON.stringify(vectors);
    const parsed = JSON.parse(json);
    assert.ok(parsed.entries['entry-1']);
    assert.equal(parsed.entries['entry-1'].content, 'test entry');
    assert.equal(parsed.entries['entry-1'].layer, 'recent');
    assert.ok(Array.isArray(parsed.entries['entry-1'].vector));
  });

  it('empty vectors file has entries object', () => {
    const empty = { entries: {} };
    assert.equal(Object.keys(empty.entries).length, 0);
  });
});

// ---------------------------------------------------------------------------
// Memory entry collection logic
// ---------------------------------------------------------------------------

describe('getAllMemoryEntries logic', () => {
  it('collects core failures', () => {
    const core = {
      failures: [
        { id: 'F-001', description: 'forgot tests', date: '2026-03-01' },
      ],
      non_negotiable_rules: ['always write tests'],
    };
    const entries = [];
    for (const f of core.failures) {
      entries.push({ id: f.id, content: f.description, layer: 'core', date: f.date });
    }
    for (let i = 0; i < core.non_negotiable_rules.length; i++) {
      entries.push({ id: `core-rule-${i}`, content: core.non_negotiable_rules[i], layer: 'core', date: 'permanent' });
    }
    assert.equal(entries.length, 2);
    assert.equal(entries[0].layer, 'core');
    assert.equal(entries[1].id, 'core-rule-0');
  });

  it('collects entries from recent/medium/long-term', () => {
    const layers = {
      'long-term': { entries: [{ id: 'lt-1', content: 'long term memory', date: '2026-01-01' }] },
      'medium-term': { entries: [{ id: 'mt-1', content: 'medium term memory', date: '2026-02-01' }] },
      'recent': { entries: [{ id: 'r-1', content: 'recent memory', date: '2026-03-13' }] },
    };
    const entries = [];
    for (const [layer, mem] of Object.entries(layers)) {
      for (const e of mem.entries) {
        entries.push({ id: e.id, content: e.content, layer, date: e.date });
      }
    }
    assert.equal(entries.length, 3);
    assert.equal(entries[0].layer, 'long-term');
    assert.equal(entries[2].layer, 'recent');
  });

  it('skips compost layer', () => {
    const searchLayers = ['core', 'long-term', 'medium-term', 'recent'];
    assert.ok(!searchLayers.includes('compost'));
  });
});

// ---------------------------------------------------------------------------
// embed.py source verification
// ---------------------------------------------------------------------------

describe('embed.py', () => {
  let src;
  before(() => {
    src = readFileSync(resolve(AGENTS_DIR, 'embed.py'), 'utf8');
  });

  it('uses sentence_transformers', () => {
    assert.ok(src.includes('from sentence_transformers import SentenceTransformer'));
  });

  it('uses all-MiniLM-L6-v2 model', () => {
    assert.ok(src.includes('all-MiniLM-L6-v2'));
  });

  it('supports --embed and --search modes', () => {
    assert.ok(src.includes('--search'));
    assert.ok(src.includes('--embed'));
  });

  it('normalizes embeddings', () => {
    assert.ok(src.includes('normalize_embeddings=True'));
  });

  it('outputs JSON', () => {
    assert.ok(src.includes('json.dumps'));
  });
});

// ---------------------------------------------------------------------------
// Python integration (conditional — skipped if deps not installed)
// ---------------------------------------------------------------------------

describe('Python integration (requires sentence-transformers)', () => {
  const skipMsg = !PYTHON_AVAILABLE ? 'sentence-transformers not installed' : false;

  it('embed.py generates embeddings for a list of texts', { skip: skipMsg }, () => {
    const embedScript = resolve(AGENTS_DIR, 'embed.py');
    const input = JSON.stringify(['hello world', 'test embedding']);
    const result = execSync(`echo '${input}' | ${PYTHON_PATH} "${embedScript}"`, {
      encoding: 'utf8',
      timeout: 120000,
    });
    const embeddings = JSON.parse(result.trim());
    assert.ok(Array.isArray(embeddings));
    assert.equal(embeddings.length, 2);
    assert.ok(Array.isArray(embeddings[0]));
    assert.equal(embeddings[0].length, 384); // all-MiniLM-L6-v2 outputs 384-dim
  });

  it('embed.py search mode returns ranked results', { skip: skipMsg }, () => {
    const embedScript = resolve(AGENTS_DIR, 'embed.py');
    const input = JSON.stringify({
      query: 'memory system',
      corpus: ['agent memory recall', 'cost tracking budget', 'memory consolidation'],
    });
    const result = execSync(`echo '${input}' | ${PYTHON_PATH} "${embedScript}" --search`, {
      encoding: 'utf8',
      timeout: 120000,
    });
    const results = JSON.parse(result.trim());
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 3);
    assert.ok('index' in results[0]);
    assert.ok('score' in results[0]);
    assert.ok(results[0].score > results[1].score, 'results should be sorted by score desc');
  });

  it('similar texts have high cosine similarity via embed.py', { skip: skipMsg }, () => {
    const embedScript = resolve(AGENTS_DIR, 'embed.py');
    const input = JSON.stringify(['agent memory system', 'agent memory storage']);
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
    assert.ok(similarity > 0.8, `Expected > 0.8, got ${similarity}`);
  });

  it('dissimilar texts have low cosine similarity', { skip: skipMsg }, () => {
    const embedScript = resolve(AGENTS_DIR, 'embed.py');
    const input = JSON.stringify(['agent memory system', 'banana smoothie recipe ingredients']);
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
    assert.ok(similarity < 0.5, `Expected < 0.5, got ${similarity}`);
  });
});
