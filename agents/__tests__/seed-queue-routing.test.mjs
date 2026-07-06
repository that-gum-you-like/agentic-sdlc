/**
 * seed-queue-routing.test.mjs — Regression tests for REQ-H7 (de-coupled bindings).
 *
 * seed-queue-from-openspec.mjs must route tasks from domains.json patterns,
 * not hardcoded LinguaFlow agent names; paperclip-sync.mjs must read model
 * IDs/urlKeys from config, not stale literals.
 *
 * Run with:
 *   node --test agents/__tests__/seed-queue-routing.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');

const { assignAgent, patternMatches, estimateTokens } = await import('../seed-queue-from-openspec.mjs');

describe('seed-queue-from-openspec — domain-driven routing', () => {
  const domains = {
    'sdlc-developer': {
      name: 'SDLC Developer',
      role: 'Framework Developer',
      patterns: ['agents/*.mjs', 'setup.mjs', 'queue drainer', 'adapter'],
    },
    'sdlc-documentarian': {
      name: 'SDLC Documentarian',
      role: 'Documentarian',
      patterns: ['docs/', 'README', 'documentation', 'guide'],
    },
  };

  it('routes by matching domains.json patterns (keyword)', () => {
    assert.equal(assignAgent('Update the documentation guide', 'rewrite docs', domains), 'sdlc-documentarian');
    assert.equal(assignAgent('Fix the queue drainer claim logic', 'in agents/queue-drainer.mjs', domains), 'sdlc-developer');
  });

  it('routes file-glob patterns via their non-glob segments', () => {
    assert.ok(patternMatches('agents/*.mjs', 'touch agents/cost-tracker.mjs today'));
    assert.ok(!patternMatches('agents/*.mjs', 'update the readme'));
    assert.equal(assignAgent('Refactor', 'edit agents/model-manager.mjs', domains), 'sdlc-developer');
  });

  it('weights title matches over description matches', () => {
    // Title says documentation; description mentions an agents/ path once.
    const agent = assignAgent('Write the adapter guide documentation', 'see agents/adapters/load-adapter.mjs', domains);
    assert.equal(agent, 'sdlc-documentarian');
  });

  it('falls back to the first configured agent when nothing matches', () => {
    const agent = assignAgent('Completely unrelated task', 'nothing matching here', domains);
    assert.equal(agent, 'sdlc-developer', 'first domains key is the fallback');
  });

  it('contains no hardcoded LinguaFlow agent names', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'seed-queue-from-openspec.mjs'), 'utf8');
    for (const name of ["'roy'", "'jen'", "'moss'", "'richmond'", "'denholm'", "'douglas'"]) {
      assert.ok(!src.includes(name), `hardcoded agent literal ${name} must not appear`);
    }
  });

  it('estimateTokens scales with subtask count', () => {
    assert.ok(estimateTokens(2) < estimateTokens(5));
    assert.ok(estimateTokens(5) < estimateTokens(10));
  });
});

describe('paperclip-sync — config-driven bindings', () => {
  // Scan code only — the config examples in doc comments are allowed.
  const src = readFileSync(resolve(AGENTS_DIR, 'paperclip-sync.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('contains no hardcoded Claude model IDs', () => {
    assert.ok(!/claude-(opus|sonnet|haiku)-[\w.-]+/.test(src),
      'model IDs must come from budget.json modelAliases + the model-intel catalog');
  });

  it('contains no hardcoded IT-Crowd urlKeys', () => {
    for (const key of ['roy-trenneman', 'maurice-moss', 'jen-barber', 'richmond-avenal']) {
      assert.ok(!src.includes(key), `urlKey literal ${key} must come from project.json paperclip.urlKeys`);
    }
  });

  it('derives per-model cost from the model-intel catalog', () => {
    assert.ok(src.includes('loadModelIntel'), 'cost math must read the catalog, not literal $/M constants');
    assert.ok(!/COST_PER_MILLION_TOKENS\s*=\s*\{\s*opus/.test(src));
  });
});
