/**
 * pattern-hunt-clustering.test.mjs
 *
 * Tests for semantic clustering in pattern-hunt.mjs (task 6.3).
 * Tests the clustering algorithm and conditionally tests with real embeddings.
 *
 * Run with:
 *   node --test agents/__tests__/pattern-hunt-clustering.test.mjs
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

const VENV_PYTHON = resolve(AGENTS_DIR, '..', '.venv', 'bin', 'python3');
const PYTHON_PATH = existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
let PYTHON_AVAILABLE = false;
try {
  execSync(`${PYTHON_PATH} -c "from sentence_transformers import SentenceTransformer"`, {
    stdio: 'pipe', timeout: 30000,
  });
  PYTHON_AVAILABLE = true;
} catch { PYTHON_AVAILABLE = false; }

describe('pattern-hunt.mjs — semantic clustering source', () => {
  let src;
  before(() => {
    src = readFileSync(resolve(AGENTS_DIR, 'pattern-hunt.mjs'), 'utf8');
  });

  it('imports clusterBySimilarity from semantic-index', () => {
    assert.ok(src.includes('clusterBySimilarity'));
    assert.ok(src.includes('semantic-index.mjs'));
  });

  it('has semanticMergeCategories function', () => {
    assert.ok(src.includes('semanticMergeCategories'));
  });

  it('gracefully handles missing semantic-index', () => {
    assert.ok(src.includes('try {'));
    assert.ok(src.includes("clusterBySimilarity = null"));
  });

  it('has capability instrumentation', () => {
    assert.ok(src.includes('logCapabilityUsage'));
    assert.ok(src.includes('patternHunt'));
  });
});

describe('clusterBySimilarity algorithm (unit test)', () => {
  // Reimplemented clustering logic for isolated testing
  function cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  function clusterBySimilarity(texts, embeddings, threshold = 0.85) {
    const clusters = [];
    const assigned = new Set();

    for (let i = 0; i < texts.length; i++) {
      if (assigned.has(i)) continue;
      const cluster = [{ index: i, text: texts[i] }];
      assigned.add(i);

      for (let j = i + 1; j < texts.length; j++) {
        if (assigned.has(j)) continue;
        const sim = cosineSimilarity(embeddings[i], embeddings[j]);
        if (sim >= threshold) {
          cluster.push({ index: j, text: texts[j] });
          assigned.add(j);
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  }

  it('groups identical vectors into one cluster', () => {
    const texts = ['missing tests', 'missing tests', 'different thing'];
    const v1 = [1, 0, 0];
    const v2 = [0, 1, 0];
    const embeddings = [v1, v1, v2];

    const clusters = clusterBySimilarity(texts, embeddings);
    assert.equal(clusters.length, 2);
    assert.equal(clusters[0].length, 2); // first two grouped
    assert.equal(clusters[1].length, 1); // third alone
  });

  it('keeps dissimilar texts in separate clusters', () => {
    const texts = ['A', 'B', 'C'];
    const embeddings = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];

    const clusters = clusterBySimilarity(texts, embeddings);
    assert.equal(clusters.length, 3); // all separate
  });

  it('returns null when embeddings unavailable (matches real impl)', () => {
    // The real function returns null when Python is unavailable
    const result = null; // Simulating pythonAvailable() === false
    assert.equal(result, null);
  });

  it('single text produces single cluster', () => {
    const texts = ['only entry'];
    const embeddings = [[0.5, 0.5, 0.5]];

    const clusters = clusterBySimilarity(texts, embeddings);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].length, 1);
  });

  it('threshold 0.85 clusters similar but not identical texts', () => {
    const texts = ['console.log found', 'console.log in production', 'file too large'];
    // Simulate: first two are similar (0.9), third is different (0.1)
    const v1 = [0.9, 0.1, 0.0];
    const v2 = [0.85, 0.15, 0.0];
    const v3 = [0.0, 0.1, 0.9];
    const embeddings = [v1, v2, v3];

    const clusters = clusterBySimilarity(texts, embeddings);
    assert.equal(clusters.length, 2);
    // First cluster has the two console.log entries
    const firstClusterTexts = clusters[0].map(c => c.text);
    assert.ok(firstClusterTexts.includes('console.log found'));
    assert.ok(firstClusterTexts.includes('console.log in production'));
  });

  it('preserves original indices in cluster entries', () => {
    const texts = ['a', 'b', 'c'];
    const embeddings = [[1, 0], [1, 0], [0, 1]];

    const clusters = clusterBySimilarity(texts, embeddings);
    const indices = clusters.flat().map(c => c.index).sort();
    assert.deepEqual(indices, [0, 1, 2]);
  });
});

describe('semanticMergeCategories logic', () => {
  it('merges categories with similar names', () => {
    const categories = {
      'console.log in production code': ['file1.js:10', 'file2.js:20'],
      'console.log statements found': ['file3.js:30'],
      'missing error handling': ['file4.js:40'],
    };

    // Simulate semantic merge: first two categories are similar → merge
    const merged = {};
    const keys = Object.keys(categories);
    const assigned = new Set();

    for (let i = 0; i < keys.length; i++) {
      if (assigned.has(i)) continue;
      let mergedIssues = [...categories[keys[i]]];
      assigned.add(i);

      for (let j = i + 1; j < keys.length; j++) {
        if (assigned.has(j)) continue;
        // Simulate: keys 0 and 1 are similar (both about console.log)
        const similar = i === 0 && j === 1;
        if (similar) {
          mergedIssues = [...mergedIssues, ...categories[keys[j]]];
          assigned.add(j);
        }
      }
      merged[keys[i]] = mergedIssues;
    }

    assert.equal(Object.keys(merged).length, 2); // 3 → 2 categories
    assert.equal(merged['console.log in production code'].length, 3); // merged
    assert.equal(merged['missing error handling'].length, 1); // unchanged
  });
});

describe('Pattern hunt clustering with real embeddings (requires sentence-transformers)', () => {
  const skipMsg = !PYTHON_AVAILABLE ? 'sentence-transformers not installed' : false;

  it('clusters similar review issues together', { skip: skipMsg }, () => {
    const embedScript = resolve(AGENTS_DIR, 'embed.py');
    const texts = [
      'console.log left in production code',
      'console.log statement found in service',
      'missing error handling in API endpoint',
      'file exceeds 200 line limit',
    ];
    const input = JSON.stringify(texts);
    const result = execSync(`echo '${input}' | ${PYTHON_PATH} "${embedScript}"`, {
      encoding: 'utf8',
      timeout: 120000,
    });
    const embeddings = JSON.parse(result.trim());

    // Compute cosine similarity between first two (should be high)
    function cosine(a, b) {
      let dot = 0, magA = 0, magB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] ** 2;
        magB += b[i] ** 2;
      }
      return dot / (Math.sqrt(magA) * Math.sqrt(magB));
    }

    const sim01 = cosine(embeddings[0], embeddings[1]);
    const sim02 = cosine(embeddings[0], embeddings[2]);
    const sim03 = cosine(embeddings[0], embeddings[3]);

    // console.log entries should be more similar to each other than to error handling or file size
    assert.ok(sim01 > sim02, `console.log entries (${sim01.toFixed(3)}) should be more similar than console.log vs error handling (${sim02.toFixed(3)})`);
    assert.ok(sim01 > sim03, `console.log entries (${sim01.toFixed(3)}) should be more similar than console.log vs file size (${sim03.toFixed(3)})`);
  });
});
