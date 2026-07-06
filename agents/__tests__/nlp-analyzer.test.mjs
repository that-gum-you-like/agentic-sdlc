/**
 * nlp-analyzer.test.mjs — Semantic identifier near-miss detection (Layer 2.5).
 *
 * Implements the archived nlp-code-analysis spec: edit distance <= 3 AND
 * similarity >= 0.80 flags; exact matches and dissimilar names never flag;
 * works WITHOUT spaCy via the deterministic lexical fallback.
 *
 * Run with:
 *   node --test agents/__tests__/nlp-analyzer.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');

const {
  identifierWords, editDistance, lexicalSimilarity, findNearMisses,
  extractDeclarations, extractAccesses,
} = await import('../nlp-analyzer.mjs');

describe('identifier primitives', () => {
  it('identifierWords splits camelCase, snake_case, and kebab-case', () => {
    assert.deepEqual(identifierWords('fullName'), ['full', 'name']);
    assert.deepEqual(identifierWords('full_name'), ['full', 'name']);
    assert.deepEqual(identifierWords('full-name'), ['full', 'name']);
    assert.deepEqual(identifierWords('HTTPServerError'), ['http', 'server', 'error']);
  });

  it('editDistance is a real Levenshtein', () => {
    assert.equal(editDistance('fullname', 'full_name'), 1);
    assert.equal(editDistance('same', 'same'), 0);
    assert.equal(editDistance('abc', 'xyz'), 3);
  });

  it('lexicalSimilarity: same words = 1, disjoint words = 0', () => {
    assert.equal(lexicalSimilarity('fullName', 'full_name'), 1);
    assert.equal(lexicalSimilarity('timeout', 'userAvatar'), 0);
    assert.ok(lexicalSimilarity('getUsers', 'fetchUsers') < 0.8, 'different verb = below the flag threshold lexically');
  });
});

describe('extraction heuristics', () => {
  const src = `
    const fullName = user.first + user.last;
    function computeTotal(items) { return items.length; }
    export { fullName, computeTotal };
    const result = record.fullNmae; // typo access
  `;

  it('extractDeclarations finds const/function/export names', () => {
    const d = extractDeclarations(src);
    assert.ok(d.has('fullName'));
    assert.ok(d.has('computeTotal'));
  });

  it('extractAccesses finds member accesses', () => {
    const a = extractAccesses(src);
    assert.ok(a.has('fullNmae'));
    assert.ok(a.has('first'));
  });
});

describe('findNearMisses — the spec scenarios (lexical fallback, no spaCy needed)', () => {
  it('flags fullName vs full_name (edit distance 1, similarity 1)', () => {
    const findings = findNearMisses([{
      file: 'a.mjs',
      source: `const full_name = 'x';\nexport { full_name };\nconsole.log(user.fullName);`,
    }], { useSpacy: false });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].accessed, 'fullName');
    assert.equal(findings[0].suggestion, 'full_name');
    assert.ok(findings[0].editDistance <= 3);
    assert.ok(findings[0].similarity >= 0.8);
    assert.equal(findings[0].engine, 'lexical');
  });

  it('never flags exact matches', () => {
    const findings = findNearMisses([{
      file: 'a.mjs',
      source: `const fullName = 'x';\nexport { fullName };\nconsole.log(user.fullName);`,
    }], { useSpacy: false });
    assert.equal(findings.length, 0);
  });

  it('never flags dissimilar names (config.timeout with no near neighbour)', () => {
    const findings = findNearMisses([{
      file: 'a.mjs',
      source: `const userAvatar = 'x';\nexport { userAvatar };\nconsole.log(config.timeout);`,
    }], { useSpacy: false });
    assert.equal(findings.length, 0);
  });

  it('skips platform builtins (res.json, arr.length are never near-misses)', () => {
    const findings = findNearMisses([{
      file: 'a.mjs',
      source: `const jsonish = 1;\nexport { jsonish };\nres.json(arr.length);`,
    }], { useSpacy: false });
    assert.equal(findings.length, 0);
  });
});

describe('integration wiring', () => {
  it('four-layer-validate includes the optional Layer 2.5 between Critique and Code', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'four-layer-validate.mjs'), 'utf8');
    assert.ok(src.includes('runLayer2_5_NLP'), 'Layer 2.5 must exist');
    const l25 = src.indexOf('runLayer2_5_NLP(targetFiles)');
    const l3 = src.indexOf('runLayer3(targetFiles)');
    assert.ok(l25 > 0 && l3 > l25, 'Layer 2.5 runs before Layer 3 in the report order');
  });

  it('nlp-analyze.py is local-only (no network, no cloud SDKs)', () => {
    const py = readFileSync(resolve(AGENTS_DIR, 'nlp-analyze.py'), 'utf8');
    for (const banned of ['requests', 'urllib', 'http.client', 'openai', 'anthropic', 'boto3']) {
      assert.ok(!new RegExp(`import ${banned}|from ${banned}`).test(py), `${banned} must not be imported`);
    }
    assert.ok(py.includes('import spacy'), 'spaCy is the only analysis engine');
  });

  it('nlp-analyzer degrades gracefully: exits 0 and reports the engine when spaCy is absent', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'nlp-analyzer.mjs'), 'utf8');
    assert.ok(src.includes('process.exit(0)'), 'advisory layer always exits 0');
    assert.ok(src.includes('lexical fallback'), 'fallback engine is reported');
    assert.ok(src.includes('__isMainModule'), 'CLI guard present');
  });
});
