/**
 * latent-bug-sweep.test.mjs — Regression tests for the REQ-H4 hardening sweep.
 *
 * Covers:
 *   1. autonomous-launcher.sh captures the agent's exit code (PIPESTATUS), not tee's
 *   2. daily-review.mjs does not reference fs./path. namespaces it never imports
 *   3. logCapabilityUsage is called with the positional signature (never an object)
 *   4. __isMainModule guards on ast-analyzer, version-snapshot, migrate-memory,
 *      rem-sleep, garden-roadmap, alignment-monitor — importing them must not
 *      trigger CLI side effects
 *   5. semantic-index.mjs: stdin-based python invocation (E2BIG-safe) and a real
 *      lexical cosine fallback
 *
 * Run with:
 *   node --test agents/__tests__/latent-bug-sweep.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');

const src = (rel) => readFileSync(resolve(AGENTS_DIR, rel), 'utf8');

describe('autonomous-launcher.sh — exit code capture', () => {
  it('uses PIPESTATUS[0], not $?, after the tee pipeline', () => {
    const launcher = src('autonomous-launcher.sh');
    assert.ok(launcher.includes('EXIT_CODE=${PIPESTATUS[0]}'),
      'launcher must capture the agent exit code via PIPESTATUS[0]');
    assert.ok(!/EXIT_CODE=\$\?/.test(launcher),
      'EXIT_CODE=$? after a pipe captures tee, not the agent');
  });
});

describe('daily-review.mjs — no phantom fs./path. namespaces', () => {
  it('never references fs.<member> or path.<member> (only named imports exist)', () => {
    const review = src('cycles/daily-review.mjs');
    // Strip comments before scanning
    const code = review.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/\bfs\.[a-zA-Z]/.test(code), 'fs.<member> would be a ReferenceError — fs is not imported as a namespace');
    assert.ok(!/\bpath\.[a-zA-Z]/.test(code), 'path.<member> would be a ReferenceError — path is not imported as a namespace');
  });
});

describe('logCapabilityUsage — positional signature', () => {
  it('is never called with an object literal', () => {
    for (const file of ['garden-roadmap.mjs', 'alignment-monitor.mjs', 'semantic-index.mjs', 'rem-sleep.mjs']) {
      const code = src(file);
      assert.ok(!/logCapabilityUsage\(\s*\{/.test(code),
        `${file}: logCapabilityUsage takes (capability, agent, taskId, script, command) — not an object`);
    }
  });
});

describe('__isMainModule guards — importing must not run the CLI', () => {
  const guarded = [
    'ast-analyzer.mjs',
    'version-snapshot.mjs',
    'migrate-memory.mjs',
    'rem-sleep.mjs',
    'garden-roadmap.mjs',
    'alignment-monitor.mjs',
  ];

  for (const file of guarded) {
    it(`${file} declares an __isMainModule guard`, () => {
      assert.ok(src(file).includes('__isMainModule'), `${file} must guard its CLI entry point`);
    });
  }

  it('importing the guarded modules triggers no CLI side effects', async () => {
    // ast-analyzer previously loaded the target app's TypeScript compiler and
    // walked its source tree at import time; the others ran their full CLI.
    // A clean import (no throw, expected exports present) proves the guard.
    const vs = await import('../version-snapshot.mjs');
    assert.equal(typeof vs.snapshot, 'function');

    const mm = await import('../migrate-memory.mjs');
    assert.equal(typeof mm.runMigration, 'function');

    const rs = await import('../rem-sleep.mjs');
    assert.equal(typeof rs.runRemSleep, 'function');

    const gr = await import('../garden-roadmap.mjs');
    assert.equal(typeof gr.gardenRoadmap, 'function');

    const am = await import('../alignment-monitor.mjs');
    assert.equal(typeof am.runAlignmentCheck, 'function');

    // ast-analyzer exports nothing — importing it without a throw is the test
    // (unguarded it would require typescript from the app dir and exit(1)).
    await import('../ast-analyzer.mjs');
  });
});

describe('semantic-index.mjs — stdin invocation + lexical fallback', () => {
  it('passes python payloads via stdin, not `echo | python`', () => {
    const code = src('semantic-index.mjs');
    assert.ok(!/execSync\(\s*`[^`]*echo/.test(code), 'payload must go over stdin (echo overflows ARG_MAX and mis-escapes quotes)');
    assert.ok(/input,/.test(code) || /input:/.test(code), 'execSync must receive the payload via the input option');
  });

  it('termFrequencies tokenizes, lowercases, and drops stopwords', async () => {
    const { termFrequencies } = await import('../semantic-index.mjs');
    const freq = termFrequencies('The Budget budget circuit-breaker and the breaker');
    assert.equal(freq.budget, 2);
    assert.equal(freq.breaker, 2);
    assert.equal(freq.circuit, 1);
    assert.equal(freq.the, undefined, 'stopwords must be dropped');
    assert.equal(freq.and, undefined, 'stopwords must be dropped');
  });

  it('lexicalRank returns relevant entries best-first and drops zero-score entries', async () => {
    const { lexicalRank } = await import('../semantic-index.mjs');
    const entries = [
      { id: 'a', content: 'budget circuit breaker blocks task assignment' },
      { id: 'b', content: 'browser screenshots verify production deploys' },
      { id: 'c', content: 'budget limits and budget conservation mode' },
    ];
    const ranked = lexicalRank('agent budget circuit breaker', entries, 5);
    assert.ok(ranked.length >= 1 && ranked.length <= 2, 'only budget-related entries should match');
    assert.equal(ranked[0].id, 'a', 'entry sharing the most terms ranks first');
    assert.ok(ranked.every(r => r.id !== 'b'), 'unrelated entry must not appear');
    assert.ok(ranked.every(r => r.score > 0));
    for (let i = 1; i < ranked.length; i++) {
      assert.ok(ranked[i - 1].score >= ranked[i].score, 'results must be sorted best-first');
    }
  });

  it('lexicalRank returns [] when nothing matches (search() then signals full recall)', async () => {
    const { lexicalRank } = await import('../semantic-index.mjs');
    const ranked = lexicalRank('zzz qqq xyzzy', [{ id: 'a', content: 'budget circuit breaker' }]);
    assert.deepEqual(ranked, []);
  });
});
