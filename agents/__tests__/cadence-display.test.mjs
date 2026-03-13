/**
 * cadence-display.test.mjs
 *
 * Tests for Group B: Cadence display in queue-drainer status (tasks 10.3–10.4)
 *
 * Covers:
 *   - Worker generates correct commit times for offset 0 with 15-min windows
 *   - Worker generates correct commit times for offset 5 with 15-min windows
 *   - No cadence shown when not configured
 *   - queue-drainer status showStatus includes cadence display when configured
 *
 * Run with:
 *   node --test agents/__tests__/cadence-display.test.mjs
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
// Helper: extract getCadenceGuidance from worker.mjs source
// ─────────────────────────────────────────────────────────────────────────────

function buildGetCadenceGuidance(cadenceConfig) {
  const src = readFileSync(resolve(AGENTS_DIR, 'worker.mjs'), 'utf8');
  const match = src.match(/(function getCadenceGuidance\([\s\S]*?\n\})/);
  if (!match) throw new Error('Could not extract getCadenceGuidance from worker.mjs');
  // Replace `config` references with `_cfg` so we can inject our own config
  const fnSrc = match[1].replace(/\bconfig\b/g, '_cfg');
  // eslint-disable-next-line no-new-func
  const factory = new Function('_cfg', `return (${fnSrc})`);
  return factory({ cadence: cadenceConfig });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Worker commit times — offset 0, 15-min windows
// ─────────────────────────────────────────────────────────────────────────────

describe('Worker getCadenceGuidance — offset 0, 15-min window', () => {
  let fn;

  before(() => {
    fn = buildGetCadenceGuidance({
      commitWindowMinutes: 15,
      agentOffsets: { roy: 0 },
    });
  });

  it('returns non-empty guidance for agent with offset 0', () => {
    const guidance = fn('roy');
    assert.ok(guidance.length > 0, 'Expected non-empty guidance for offset 0');
  });

  it('contains :00 start time (offset 0)', () => {
    assert.match(fn('roy'), /:00/, 'offset=0 must produce :00 commit time');
  });

  it('contains :15 (second window)', () => {
    assert.match(fn('roy'), /:15/, 'Must include :15 window');
  });

  it('contains :30 (third window)', () => {
    assert.match(fn('roy'), /:30/, 'Must include :30 window');
  });

  it('contains :45 (fourth window)', () => {
    assert.match(fn('roy'), /:45/, 'Must include :45 window');
  });

  it('does not contain :60 or beyond', () => {
    assert.doesNotMatch(fn('roy'), /:60/, 'Commit times must stop before :60');
  });

  it('contains "Commit Cadence" heading', () => {
    assert.match(fn('roy'), /Commit Cadence/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Worker commit times — offset 5, 15-min windows
// ─────────────────────────────────────────────────────────────────────────────

describe('Worker getCadenceGuidance — offset 5, 15-min window', () => {
  let fn;

  before(() => {
    fn = buildGetCadenceGuidance({
      commitWindowMinutes: 15,
      agentOffsets: { moss: 5 },
    });
  });

  it('returns non-empty guidance for agent with offset 5', () => {
    assert.ok(fn('moss').length > 0, 'Expected non-empty guidance for offset 5');
  });

  it('starts at :05 (offset 5)', () => {
    assert.match(fn('moss'), /:05/, 'offset=5 must produce :05 start time');
  });

  it('contains :20 (second window)', () => {
    assert.match(fn('moss'), /:20/, 'Must include :20 window');
  });

  it('contains :35 (third window)', () => {
    assert.match(fn('moss'), /:35/, 'Must include :35 window');
  });

  it('contains :50 (fourth window)', () => {
    assert.match(fn('moss'), /:50/, 'Must include :50 window');
  });

  it('does not produce :00 (starts at offset 5, not 0)', () => {
    // offset=5 means the first window is at :05, not :00
    const guidance = fn('moss');
    // :00 should not appear as a standalone commit time
    assert.doesNotMatch(guidance, /:00\b/, 'offset=5 should not produce :00');
  });

  it('does not contain :60 or beyond', () => {
    assert.doesNotMatch(fn('moss'), /:60/, 'Commit times must stop before :60');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. No cadence shown when not configured
// ─────────────────────────────────────────────────────────────────────────────

describe('No cadence shown when not configured', () => {
  it('returns empty string when cadence is undefined', () => {
    const fn = buildGetCadenceGuidance(undefined);
    assert.equal(fn('moss'), '', 'Expected empty string for undefined cadence');
  });

  it('returns empty string when agentOffsets is empty', () => {
    const fn = buildGetCadenceGuidance({
      commitWindowMinutes: 15,
      agentOffsets: {},
    });
    assert.equal(fn('moss'), '', 'Expected empty string when agent not in offsets');
  });

  it('returns empty string for an agent not in agentOffsets', () => {
    const fn = buildGetCadenceGuidance({
      commitWindowMinutes: 15,
      agentOffsets: { roy: 0 },
    });
    assert.equal(fn('moss'), '', 'moss not in offsets — must return empty string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. queue-drainer status includes cadence display when configured (10.3)
// ─────────────────────────────────────────────────────────────────────────────

describe('queue-drainer showStatus cadence display (10.3)', () => {
  let src;

  before(() => {
    src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');
  });

  it('showStatus contains cadence display code', () => {
    assert.match(src, /Commit Cadence/,
      'showStatus must include cadence display text');
  });

  it('cadence display uses agentOffsets from config', () => {
    assert.match(src, /cadence\.agentOffsets/,
      'showStatus must read agentOffsets from cadence config');
  });

  it('cadence display shows next commit window per agent', () => {
    assert.match(src, /next window/,
      'showStatus must display "next window" text per agent');
  });

  it('cadence display is conditional on agentOffsets being non-empty', () => {
    // Must check that agentOffsets has entries before displaying
    assert.match(src, /Object\.keys\(.*agentOffsets.*\)\.length/,
      'Must guard cadence display with Object.keys(agentOffsets).length > 0');
  });

  it('cadence display computes minutes until next window', () => {
    // Must calculate how many minutes until next window
    assert.match(src, /minsUntil|in \$\{/,
      'Must show minutes until next commit window');
  });
});
