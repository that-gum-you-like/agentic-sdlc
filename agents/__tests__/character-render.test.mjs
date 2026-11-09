/**
 * character-render.test.mjs
 *
 * Tests for the optional character block (CV-REQ-070, task CV-242):
 *   - renderCharacter(core) returns '' when core has no character
 *   - renderCharacter(core) renders a block capped at 400 chars when present
 *   - recall output is byte-identical without a character (no extra section)
 *   - recall output contains the character block (<= 400 chars) when present
 *
 * Also tests failure schema optional field rendering (CV-REQ-071, task CV-244):
 *   - failures without feeling/impact/whatIDoNow render byte-identical to before
 *   - failures with those fields render them
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
  workerModule = await import('../../agents/worker.mjs');
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

// ─────────────────────────────────────────────────────────────────────────────
// 3. worker.mjs generatePrompt integration tests (CV-243)
// ─────────────────────────────────────────────────────────────────────────────

const TASK_FIXTURE = { id: 'CV-243-TEST', title: 'Test task', description: 'Test' };
const AGENT_MD_FIXTURE = '# Test Agent\n\nSimple test agent.';

let workerModule;

describe('generatePrompt — absent character', () => {
  it('does NOT include 🎭 CHARACTER: in the prompt when core has no character', () => {
    const memories = { core: PLAIN_CORE, 'long-term': { entries: [] }, 'medium-term': { entries: [] }, recent: { entries: [] } };
    const prompt = workerModule.generatePrompt('plain-agent', TASK_FIXTURE, AGENT_MD_FIXTURE, memories);
    assert.doesNotMatch(prompt, /🎭 CHARACTER/);
  });

  it('does NOT include 🎭 CHARACTER: when core has an empty character', () => {
    const memories = { core: { identity: { name: 'x' }, character: {} }, 'long-term': { entries: [] }, 'medium-term': { entries: [] }, recent: { entries: [] } };
    const prompt = workerModule.generatePrompt('plain-agent', TASK_FIXTURE, AGENT_MD_FIXTURE, memories);
    assert.doesNotMatch(prompt, /🎭 CHARACTER/);
  });
});

describe('generatePrompt — character present', () => {
  it('includes 🎭 CHARACTER: in the prompt when core has a character', () => {
    const memories = { core: CHAR_CORE, 'long-term': { entries: [] }, 'medium-term': { entries: [] }, recent: { entries: [] } };
    const prompt = workerModule.generatePrompt('char-agent', TASK_FIXTURE, AGENT_MD_FIXTURE, memories);
    assert.match(prompt, /🎭 CHARACTER:/);
    assert.match(prompt, /Personality: Curious and methodical\./);
    assert.match(prompt, /Communication style: Direct but warm\./);
    assert.match(prompt, /In their own words: I turn ambiguity into certainty\./);
  });

  it('places the character block before ## Your Memory', () => {
    const memories = { core: CHAR_CORE, 'long-term': { entries: [] }, 'medium-term': { entries: [] }, recent: { entries: [] } };
    const prompt = workerModule.generatePrompt('char-agent', TASK_FIXTURE, AGENT_MD_FIXTURE, memories);
    const charIdx = prompt.indexOf('🎭 CHARACTER:');
    const memoryIdx = prompt.indexOf('## Your Memory');
    assert.ok(charIdx !== -1, 'character block must be present');
    assert.ok(memoryIdx !== -1, 'memory section must be present');
    assert.ok(charIdx < memoryIdx, 'character block must appear before memory section');
  });

  it('capped at 400 characters in the prompt', () => {
    const bigChar = {
      character: {
        personality: 'p'.repeat(300),
        communicationStyle: 'c'.repeat(300),
        quirks: ['q'.repeat(200)],
        relationships: [{ name: 'r'.repeat(150), nature: 'n'.repeat(150), notes: 'o'.repeat(150) }],
        inTheirOwnWords: 'w'.repeat(400),
        growthJourney: ['g'.repeat(300)],
      },
    };
    const memories = { core: bigChar, 'long-term': { entries: [] }, 'medium-term': { entries: [] }, recent: { entries: [] } };
    const prompt = workerModule.generatePrompt('char-agent', TASK_FIXTURE, AGENT_MD_FIXTURE, memories);
    const start = prompt.indexOf('🎭 CHARACTER:');
    const end = prompt.indexOf('\n## Your Memory', start);
    const block = end === -1 ? prompt.slice(start) : prompt.slice(start, end);
    assert.ok(block.length <= 400, `character block must be <= 400 chars, got ${block.length}`);
    assert.ok(block.length > 0, 'block must be non-empty');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. recall failure schema rendering (CV-244 / CV-REQ-071)
// ─────────────────────────────────────────────────────────────────────────────

describe('recall output — failure schema fields', () => {
  const FAILURE_BARE = {
    id: 'F-1',
    description: 'old failure',
    date: '2026-01-01',
  };

  const FAILURE_FULL = {
    id: 'F-2',
    description: 'used await in non-async function',
    date: '2026-04-07',
    feeling: 'frustrated — should have checked the function signature',
    impact: 'would have caused syntax error at runtime if deployed',
    whatIDoNow: 'always verify async context before using await',
  };

  it('renders byte-identical to baseline when failures lack feeling/impact/whatIDoNow', () => {
    writeCore('plain-agent', PLAIN_CORE);
    const output = captureRecall('plain-agent');
    assert.match(output, /❌ old failure \(2026-01-01\)/);
    assert.doesNotMatch(output, /💭 Feeling/);
    assert.doesNotMatch(output, /⚡ Impact/);
    assert.doesNotMatch(output, /✅ What I do now/);
  });

  it('renders feeling, impact, and whatIDoNow when present on failure entries', () => {
    const core = {
      identity: { name: 'plain-agent', role: 'test fixture' },
      values: ['value one'],
      non_negotiable_rules: ['rule one'],
      failures: [FAILURE_FULL],
    };
    writeCore('plain-agent', core);
    const output = captureRecall('plain-agent');
    assert.match(output, /❌ used await in non-async function \(2026-04-07\)/);
    assert.match(output, /💭 Feeling: frustrated/);
    assert.match(output, /⚡ Impact: would have caused syntax error/);
    assert.match(output, /✅ What I do now: always verify async context/);
  });

  it('renders each field independently when only some are present', () => {
    const core = {
      identity: { name: 'plain-agent', role: 'test fixture' },
      values: ['value one'],
      non_negotiable_rules: ['rule one'],
      failures: [
        { ...FAILURE_BARE, feeling: 'just embarrassed' },
        { ...FAILURE_BARE, impact: 'blocked the release' },
        { ...FAILURE_BARE, whatIDoNow: 'add a pre-commit hook' },
      ],
    };
    writeCore('plain-agent', core);
    const output = captureRecall('plain-agent');
    assert.match(output, /💭 Feeling: just embarrassed/);
    assert.match(output, /⚡ Impact: blocked the release/);
    assert.match(output, /✅ What I do now: add a pre-commit hook/);
  });

  it('interleaves correctly with character block when both are present', () => {
    const core = {
      identity: { name: 'char-agent', role: 'test fixture' },
      values: ['value one'],
      non_negotiable_rules: ['rule one'],
      failures: [FAILURE_FULL],
      character: CHAR_CORE.character,
    };
    writeCore('char-agent', core);
    const output = captureRecall('char-agent');
    assert.match(output, /📌 CORE/);
    assert.match(output, /🎭 CHARACTER/);
    assert.match(output, /❌ used await in non-async function/);
    assert.match(output, /💭 Feeling: frustrated/);
    assert.match(output, /⚡ Impact: would have caused syntax error/);
    assert.match(output, /✅ What I do now: always verify async context/);
    assert.match(output, /📚 LONG-TERM/);
    const coreIdx = output.indexOf('📌 CORE');
    const charIdx = output.indexOf('🎭 CHARACTER:');
    const failIdx = output.indexOf('❌ used await');
    const longTermIdx = output.indexOf('📚 LONG-TERM');
    // Failures are printed inside the CORE section, so order is:
    //   CORE header > failure line > CHARACTER > LONG-TERM
    assert.ok(coreIdx < failIdx && failIdx < charIdx && charIdx < longTermIdx,
      'order must be CORE > FAILURE > CHARACTER > LONG-TERM');
  });
});