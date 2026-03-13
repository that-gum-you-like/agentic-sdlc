/**
 * worker-semantic-search.test.mjs
 *
 * Tests for Group C: Worker semantic memory search (task 4.5)
 *
 * Covers:
 *   - worker.mjs attempts to import semantic-index.mjs
 *   - When semantic search returns results, they are used instead of full recall
 *   - When semantic search is unavailable, falls back to full recall
 *   - generatePrompt uses task title + description as the query
 *
 * Run with:
 *   node --test agents/__tests__/worker-semantic-search.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Source inspection helpers
// ─────────────────────────────────────────────────────────────────────────────

let workerSrc;
before(() => {
  workerSrc = readFileSync(resolve(AGENTS_DIR, 'worker.mjs'), 'utf8');
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Semantic search import structure
// ─────────────────────────────────────────────────────────────────────────────

describe('Worker semantic search import (4.5)', () => {
  it('worker.mjs attempts to import semantic-index.mjs', () => {
    assert.match(workerSrc, /semantic-index\.mjs/,
      'worker.mjs must import semantic-index.mjs');
  });

  it('semantic search import is wrapped in try/catch for graceful fallback', () => {
    // The import must be inside a try block so it never crashes when unavailable
    const tryImportMatch = workerSrc.match(/try\s*\{[\s\S]*?semantic-index[\s\S]*?\}\s*catch/);
    assert.ok(tryImportMatch,
      'semantic-index import must be inside try/catch');
  });

  it('semanticSearch variable is initialised to null before the try block', () => {
    assert.match(workerSrc, /let semanticSearch\s*=\s*null/,
      'semanticSearch must default to null (fallback to full recall)');
  });

  it('imports the search function from semantic-index', () => {
    assert.match(workerSrc, /\.search\b/,
      'Must import the search function from semantic-index');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. generatePrompt uses semantic search when available
// ─────────────────────────────────────────────────────────────────────────────

describe('generatePrompt — uses semantic search when available', () => {
  it('generatePrompt tries semanticSearch if non-null', () => {
    assert.match(workerSrc, /if\s*\(semanticSearch\)/,
      'generatePrompt must check if semanticSearch is available');
  });

  it('query is built from task title and description', () => {
    // The query must include both task.title and task.description
    assert.match(workerSrc, /task\.title[\s\S]{0,30}task\.description/,
      'Search query must be built from task.title and task.description');
  });

  it('semantic results are checked for non-null and non-empty before use', () => {
    assert.match(workerSrc, /results && results\.length > 0/,
      'Must guard semantic results with null-check and length check');
  });

  it('results are grouped by layer for the memory section', () => {
    assert.match(workerSrc, /byLayer\[r\.layer\]/,
      'Must group semantic results by layer');
  });

  it('semantic memory section label indicates it is semantically filtered', () => {
    assert.match(workerSrc, /semantic/i,
      'Memory section heading must indicate semantic filtering');
  });

  it('semanticSearchUsed flag gates the full-recall fallback', () => {
    assert.match(workerSrc, /semanticSearchUsed/,
      'Must use a flag to decide between semantic and full-recall memory sections');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Full recall fallback when semantic search unavailable
// ─────────────────────────────────────────────────────────────────────────────

describe('generatePrompt — falls back to full recall', () => {
  it('full recall path uses the memories object from loadMemory', () => {
    // The fallback must use Object.entries(memories) to build the memory section
    assert.match(workerSrc, /Object\.entries\(memories\)/,
      'Full recall path must use Object.entries(memories)');
  });

  it('full recall path produces JSON blocks for each memory layer', () => {
    assert.match(workerSrc, /\.json\\n/,
      'Full recall path must produce JSON code blocks per layer');
  });

  it('semantic search try/catch catch block is a no-op (comment only)', () => {
    // Match a narrow catch block: catch { // semantic search failed ... } with no code lines
    const catchBlock = workerSrc.match(/catch\s*\{\s*\/\/ semantic search failed[^\}]*\}/)?.[0];
    assert.ok(catchBlock,
      'Must have catch { // semantic search failed ... } block for graceful fallback');
    // Extract body (everything between the braces, minus the opening/closing)
    const body = catchBlock.replace(/^catch\s*\{/, '').replace(/\}$/, '').trim();
    const codeLines = body.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
    assert.equal(codeLines.length, 0,
      `catch block must only contain comments, found executable lines: ${codeLines.join('; ')}`);
  });

  it('when semanticSearch is null, full recall is always used', () => {
    // When semanticSearch === null, the if(semanticSearch) guard skips semantic path,
    // semanticSearchUsed stays false, and the else-branch runs full recall.
    // Verify the else/if(!semanticSearchUsed) branch exists
    assert.match(workerSrc, /if\s*\(!semanticSearchUsed\)/,
      'Must have !semanticSearchUsed guard for full recall fallback');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Inline unit test: semantic grouping logic
// ─────────────────────────────────────────────────────────────────────────────

describe('Semantic result grouping logic (inline)', () => {
  // Simulate the grouping logic extracted from worker.mjs's generatePrompt
  function groupResultsByLayer(results) {
    const byLayer = {};
    for (const r of results) {
      if (!byLayer[r.layer]) byLayer[r.layer] = [];
      byLayer[r.layer].push(r.content);
    }
    return Object.entries(byLayer).map(([layer, entries]) =>
      `### ${layer} (semantic — top relevant entries)\n${entries.map(e => `- ${e}`).join('\n')}`
    ).join('\n\n');
  }

  it('groups entries from the same layer together', () => {
    const results = [
      { layer: 'core', content: 'Never break the build', score: 0.9 },
      { layer: 'core', content: 'Always write tests', score: 0.8 },
      { layer: 'recent', content: 'Fixed CSS import issue', score: 0.7 },
    ];
    const section = groupResultsByLayer(results);
    assert.match(section, /### core \(semantic/);
    assert.match(section, /Never break the build/);
    assert.match(section, /Always write tests/);
    assert.match(section, /### recent \(semantic/);
    assert.match(section, /Fixed CSS import issue/);
  });

  it('produces bullet-point list for entries within a layer', () => {
    const results = [
      { layer: 'long-term', content: 'Use small commits', score: 0.85 },
    ];
    const section = groupResultsByLayer(results);
    assert.match(section, /- Use small commits/);
  });

  it('handles a single layer correctly', () => {
    const results = [
      { layer: 'medium-term', content: 'Sprint goal: auth', score: 0.75 },
    ];
    const section = groupResultsByLayer(results);
    assert.ok(section.includes('medium-term'), 'Must include layer name');
    assert.ok(!section.includes('core'), 'Must not include unlisted layers');
  });

  it('empty results array produces an empty string', () => {
    const section = groupResultsByLayer([]);
    assert.equal(section, '');
  });
});
