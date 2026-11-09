/**
 * character-render.test.mjs
 *
 * Tests for the optional character block (CV-REQ-070, task CV-242):
 *   - renderCharacter(core) returns '' when core has no character
 *   - renderCharacter(core) renders a block capped at 400 chars when present
 *   - recall output is byte-identical without a character (no extra section)
 *   - recall output contains the character block (<= 400 chars) when present
 *
 * Runs against a temporary fixture project (via SDLC_PROJECT_DIR) so the tests
 * never read or write real agent memory.
 *
 * Run with:
 *   node --test agents/__tests__/character-render.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture project: plain-agent (no character) and char-agent (full character).
// Import memory-manager AFTER setting SDLC_PROJECT_DIR so loadConfig resolves
// against the fixture.
// ─────────────────────────────────────────────────────────────────────────────

let fixtureRoot;
let memoryManager;

const PLAIN_CORE = {
  identity: { name: 'plain-agent', role: 'test fixture' },
  values: ['value one'],
  non_negotiable_rules: ['rule one'],
  failures: [{ id: 'F-1', description: 'old failure', date: '2026-01-01' }],
};

const EMPTY_CHARACTER = { personality: '', quirks: [], relationships: [], growthJourney: [] };

const CHAR_CORE = {
  identity: { name: 'char-agent', role: 'test fixture' },
  values: ['value one'],
  non_negotiable_rules: ['rule one'],
  failures: [{ id: 'F-1', description: 'old failure', date: '2026-01-01' }],
  character: {
    personality: 'Curious and methodical.',
    communicationStyle: 'Direct but warm.',
    quirks: ['double-checks dates', 'signs off with an emoji'],
    relationships: [
      { name: 'sdlc-reviewer', nature: 'friendly rival', notes: 'respects the rigor' },
    ],
    inTheirOwnWords: 'I turn ambiguity into certainty.',
    growthJourney: ['learned to write tests first'],
  },
};

function writeMemory(agent, layer, data) {
  const dir = join(fixtureRoot, 'agents', agent, 'memory');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${layer}.json`), JSON.stringify(data, null, 2));
}

function writeCore(agent, core) {
  writeMemory(agent, 'core', core);
}

before(async () => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'character-render-test-'));
  mkdirSync(join(fixtureRoot, 'agents'), { recursive: true });
  writeFileSync(
    join(fixtureRoot, 'agents', 'project.json'),
    JSON.stringify({ name: 'character-render-fixture', testCmd: 'node --test', agents: ['plain-agent', 'char-agent'] }, null, 2)
  );

  for (const agent of ['plain-agent', 'char-agent']) {
    writeMemory(agent, 'long-term', { entries: [{ id: 'L-1', content: 'pattern learned', date: '2026-01-01' }] });
    writeMemory(agent, 'medium-term', { entries: [{ id: 'M-1', content: 'sprint context', date: '2026-01-01' }] });
    writeMemory(agent, 'recent', { entries: [{ id: 'R-1', content: 'recent work', date: '2026-01-01' }] });
  }

  writeCore('plain-agent', PLAIN_CORE);
  writeCore('char-agent', CHAR_CORE);

  process.env.SDLC_PROJECT_DIR = fixtureRoot;
  memoryManager = await import('../../agents/memory-manager.mjs');
});

after(() => {
  delete process.env.SDLC_PROJECT_DIR;
  rmSync(fixtureRoot, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function captureRecall(agent) {
  const chunks = [];
  const orig = console.log;
  console.log = (...args) => chunks.push(args.join(' '));
  try {
    memoryManager.recall(agent);
  } finally {
    console.log = orig;
  }
  return chunks.join('\n');
}

const CHARACTER_MARKERS = /🎭 CHARACTER|Personality:|Communication style|Quirks:|Relationships:|In their own words|Growth journey/;

// ─────────────────────────────────────────────────────────────────────────────
// 1. renderCharacter unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('renderCharacter(core) — absent character', () => {
  it('returns "" for undefined or null core', () => {
    assert.equal(memoryManager.renderCharacter(undefined), '');
    assert.equal(memoryManager.renderCharacter(null), '');
  });

  it('returns "" when core has no character key', () => {
    assert.equal(memoryManager.renderCharacter(PLAIN_CORE), '');
    assert.equal(memoryManager.renderCharacter({ identity: { name: 'x' } }), '');
  });

  it('returns "" when every character field is empty', () => {
    assert.equal(memoryManager.renderCharacter({ character: EMPTY_CHARACTER }), '');
  });
});

describe('renderCharacter(core) — present character', () => {
  it('renders a block with all six fields', () => {
    const block = memoryManager.renderCharacter(CHAR_CORE);
    assert.ok(block.length > 0, 'block must be non-empty');
    assert.match(block, /🎭 CHARACTER:/);
    assert.match(block, /Personality: Curious and methodical\./);
    assert.match(block, /Communication style: Direct but warm\./);
    assert.match(block, /Quirks: double-checks dates; signs off with an emoji/);
    assert.match(block, /Relationships: sdlc-reviewer \(friendly rival\) — respects the rigor/);
    assert.match(block, /In their own words: I turn ambiguity into certainty\./);
    assert.match(block, /Growth journey: learned to write tests first/);
  });

  it('is capped at 400 characters', () => {
    const overflow = {
      character: {
        personality: 'p'.repeat(300),
        communicationStyle: 'c'.repeat(300),
        quirks: ['q'.repeat(200)],
        relationships: [{ name: 'r'.repeat(150), nature: 'n'.repeat(150), notes: 'o'.repeat(150) }],
        inTheirOwnWords: 'w'.repeat(400),
        growthJourney: ['g'.repeat(300)],
      },
    };
    const block = memoryManager.renderCharacter(overflow);
    assert.ok(block.length <= 400, `block must be <= 400 chars, got ${block.length}`);
    assert.ok(block.length > 0, 'overflowing block must still be non-empty');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. recall integration tests
// ─────────────────────────────────────────────────────────────────────────────

describe('recall output — no character', () => {
  it('is byte-identical whether character is absent or renders empty', () => {
    writeCore('plain-agent', PLAIN_CORE);
    const plain = captureRecall('plain-agent');
    writeCore('plain-agent', { ...PLAIN_CORE, character: EMPTY_CHARACTER });
    const blank = captureRecall('plain-agent');
    assert.equal(plain, blank);
  });

  it('contains no character markers and keeps the standard section order', () => {
    writeCore('plain-agent', PLAIN_CORE);
    const output = captureRecall('plain-agent');
    assert.doesNotMatch(output, CHARACTER_MARKERS);
    const coreIdx = output.indexOf('📌 CORE');
    const longTermIdx = output.indexOf('📚 LONG-TERM');
    const mediumTermIdx = output.indexOf('📋 MEDIUM-TERM');
    const recentIdx = output.indexOf('🕐 RECENT');
    assert.ok(coreIdx !== -1 && longTermIdx !== -1 && mediumTermIdx !== -1 && recentIdx !== -1,
      'all four standard sections must be present');
    assert.ok(coreIdx < longTermIdx && longTermIdx < mediumTermIdx && mediumTermIdx < recentIdx,
      'standard sections must keep their pre-character order');
  });
});

describe('recall output — character present', () => {
  it('renders the character block under CORE and before LONG-TERM', () => {
    writeCore('char-agent', CHAR_CORE);
    const output = captureRecall('char-agent');
    const charIdx = output.indexOf('🎭 CHARACTER:');
    const coreIdx = output.indexOf('📌 CORE');
    const longTermIdx = output.indexOf('📚 LONG-TERM');
    assert.ok(charIdx !== -1, 'character block must be present');
    assert.ok(coreIdx < charIdx && charIdx < longTermIdx, 'character block must sit between CORE and LONG-TERM');
  });

  it('prints a character block of at most 400 characters', () => {
    writeCore('char-agent', CHAR_CORE);
    const output = captureRecall('char-agent');
    const start = output.indexOf('🎭 CHARACTER:');
    const end = output.indexOf('\n📚 LONG-TERM', start);
    const block = end === -1 ? output.slice(start) : output.slice(start, end);
    assert.ok(block.length <= 400, `character block must be <= 400 chars, got ${block.length}`);
    assert.match(block, /In their own words: I turn ambiguity into certainty\./);
  });
});
