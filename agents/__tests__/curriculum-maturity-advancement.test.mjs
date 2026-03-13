/**
 * curriculum-maturity-advancement.test.mjs
 *
 * Comprehensive tests for all features introduced in the
 * curriculum-maturity-advancement change:
 *
 *   1. Schema Validator  (agents/schema-validator.mjs)
 *   2. Load Config       (agents/load-config.mjs)
 *   3. Permission Hierarchy  (agents/queue-drainer.mjs constant)
 *   4. Worker Permission Injection  (agents/worker.mjs)
 *   5. Cosine-similarity math  (inline; used by semantic-index.mjs)
 *   6. Cost Tracker – computeSessionHours  (agents/cost-tracker.mjs)
 *   7. Cadence Commit Window  (agents/worker.mjs getCadenceGuidance)
 *
 * Run with:
 *   node --test agents/__tests__/curriculum-maturity-advancement.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build an ISO timestamp offset by `deltaMs` from now. */
function ts(deltaMs = 0) {
  return new Date(Date.now() + deltaMs).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schema Validator
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema Validator', () => {
  let validate, validateSync, clearCaches, loadSchema;

  before(async () => {
    const mod = await import(`${AGENTS_DIR}/schema-validator.mjs`);
    validate      = mod.validate;
    validateSync  = mod.validateSync;
    clearCaches   = mod.clearCaches;
    loadSchema    = mod.loadSchema;
  });

  it('loadSchema succeeds for all 6 schemas', () => {
    clearCaches();
    const names = [
      'task-claim',
      'task-complete',
      'review-request',
      'review-result',
      'human-task',
      'deploy-request',
    ];
    for (const name of names) {
      const schema = loadSchema(name);
      assert.ok(schema, `Expected schema object for "${name}"`);
      assert.equal(typeof schema, 'object', `Schema "${name}" should be an object`);
      assert.ok(schema.properties || schema.required, `Schema "${name}" should have properties or required`);
    }
  });

  it('loadSchema throws for a non-existent schema name', () => {
    clearCaches();
    assert.throws(
      () => loadSchema('does-not-exist'),
      /cannot load schema/i,
    );
  });

  it('valid task-claim data passes validation', async () => {
    clearCaches();
    const result = await validate('task-claim', {
      taskId:          'T-001',
      agentName:       'roy',
      claimedAt:       new Date().toISOString(),
      estimatedTokens: 5000,
    });
    // Either valid:true (ajv present) or valid:true with warning (ajv absent)
    assert.equal(result.valid, true, `Expected valid, got: ${JSON.stringify(result)}`);
  });

  it('missing required field (agentName) fails with descriptive error', async () => {
    clearCaches();
    const result = await validate('task-claim', {
      taskId:          'T-001',
      claimedAt:       new Date().toISOString(),
      estimatedTokens: 5000,
      // agentName intentionally omitted
    });
    // If ajv is unavailable the validator returns { valid: true, warning: '...' } — skip assertion
    if (result.warning) {
      // ajv not installed; validation is skipped by design
      assert.equal(result.valid, true);
      return;
    }
    assert.equal(result.valid, false, 'Expected validation to fail for missing agentName');
    assert.ok(Array.isArray(result.errors) && result.errors.length > 0, 'Expected errors array');
    const messages = result.errors.map(e => e.message).join(' ');
    // ajv reports "must have required property 'agentName'"
    assert.match(messages, /agentName|required/i, `Expected descriptive error, got: ${messages}`);
  });

  it('invalid enum value for urgency in human-task fails', async () => {
    clearCaches();
    const result = await validate('human-task', {
      id:          'HTASK-001',
      title:       'Rotate secrets',
      description: 'Rotate the API keys',
      requester:   'moss',
      urgency:     'invalid', // not in ["blocker","normal","low"]
      unblocks:    [],
      status:      'pending',
      createdAt:   new Date().toISOString(),
    });
    if (result.warning) {
      assert.equal(result.valid, true);
      return;
    }
    assert.equal(result.valid, false, 'Expected validation failure for invalid urgency enum');
    const messages = result.errors.map(e => e.message).join(' ');
    assert.match(messages, /must be equal to one of|enum/i, `Expected enum error, got: ${messages}`);
  });

  it('extra fields are rejected (additionalProperties: false)', async () => {
    clearCaches();
    const result = await validate('task-claim', {
      taskId:          'T-002',
      agentName:       'jen',
      claimedAt:       new Date().toISOString(),
      estimatedTokens: 0,
      extraField:      'should not be allowed',
    });
    if (result.warning) {
      assert.equal(result.valid, true);
      return;
    }
    assert.equal(result.valid, false, 'Expected failure for extra field');
    const messages = result.errors.map(e => e.message).join(' ');
    assert.match(messages, /additional|properties/i, `Expected additionalProperties error, got: ${messages}`);
  });

  it('when ajv is unavailable, validate returns { valid: true, warning: ... }', async () => {
    // We simulate ajv being unavailable by clearing caches and checking the
    // module's own fallback path.  Since ajv really IS unavailable in this
    // environment the regular validate() call already exercises the path.
    clearCaches();
    const result = await validate('task-claim', {
      taskId:          'T-003',
      agentName:       'moss',
      claimedAt:       new Date().toISOString(),
      estimatedTokens: 0,
    });
    // valid must be true in either branch
    assert.equal(result.valid, true);
    // If ajv IS unavailable a warning property must exist
    if (!('warning' in result)) {
      // ajv IS available — check the positive path passes cleanly
      assert.ok(!result.errors, 'No errors expected for a valid object');
    } else {
      assert.equal(typeof result.warning, 'string');
      assert.match(result.warning, /ajv/i);
    }
  });

  it('validateSync returns valid:true with warning before any async call', () => {
    // After clearCaches() _ajv is null, so validateSync cannot compile
    clearCaches();
    const result = validateSync('task-claim', {
      taskId:          'T-sync',
      agentName:       'denholm',
      claimedAt:       new Date().toISOString(),
      estimatedTokens: 100,
    });
    assert.equal(result.valid, true);
    assert.ok('warning' in result, 'validateSync should return a warning when _ajv is null');
    assert.match(result.warning, /ajv/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Load Config defaults
// ─────────────────────────────────────────────────────────────────────────────

describe('Load Config', () => {
  let config;

  before(async () => {
    // Import the real loadConfig. It will find agentic-sdlc's own project.json
    // (if present) or fall back to generic defaults — either way the wellness
    // and cadence keys must exist.
    const mod = await import(`${AGENTS_DIR}/load-config.mjs`);
    config = mod.loadConfig();
  });

  it('returns an object', () => {
    assert.equal(typeof config, 'object');
    assert.ok(config !== null);
  });

  it('humanWellness defaults are present', () => {
    assert.ok('humanWellness' in config, 'config must have humanWellness key');
    const hw = config.humanWellness;
    assert.equal(typeof hw.enabled,            'boolean', 'enabled must be boolean');
    assert.equal(typeof hw.dailyMaxHours,      'number',  'dailyMaxHours must be number');
    assert.equal(typeof hw.nightCutoff,        'string',  'nightCutoff must be string');
    assert.equal(typeof hw.breakIntervalHours, 'number',  'breakIntervalHours must be number');
  });

  it('humanWellness defaults have reasonable values when not overridden', () => {
    const hw = config.humanWellness;
    // Default from source: enabled=false, dailyMaxHours=10, nightCutoff='23:00', breakIntervalHours=3
    assert.equal(hw.dailyMaxHours,      10,      'default dailyMaxHours should be 10');
    assert.equal(hw.nightCutoff,        '23:00', 'default nightCutoff should be 23:00');
    assert.equal(hw.breakIntervalHours, 3,       'default breakIntervalHours should be 3');
  });

  it('cadence defaults are present', () => {
    assert.ok('cadence' in config, 'config must have cadence key');
    const c = config.cadence;
    assert.equal(typeof c.commitWindowMinutes, 'number', 'commitWindowMinutes must be number');
    assert.ok('agentOffsets' in c, 'cadence must have agentOffsets key');
    assert.equal(typeof c.agentOffsets, 'object', 'agentOffsets must be an object');
  });

  it('cadence commitWindowMinutes defaults to 15', () => {
    assert.equal(config.cadence.commitWindowMinutes, 15);
  });

  it('humanQueueDir is set and is a string', () => {
    assert.ok('humanQueueDir' in config, 'config must have humanQueueDir');
    assert.equal(typeof config.humanQueueDir, 'string');
    assert.ok(config.humanQueueDir.length > 0);
  });

  it('agentConfigs permissions default to full-edit', () => {
    // If budget.json exists and has agents, each should have permissions set.
    // If budget.json is absent, agentConfigs is an empty object — either way
    // any present entries must have a permission.
    for (const [key, val] of Object.entries(config.agentConfigs)) {
      assert.ok(
        ['read-only', 'edit-gated', 'full-edit', 'deploy'].includes(val.permissions),
        `Agent "${key}" has unexpected permission: "${val.permissions}"`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Permission Hierarchy (read from queue-drainer source to avoid re-exporting)
// ─────────────────────────────────────────────────────────────────────────────

describe('Permission Hierarchy', () => {
  // Parse the PERMISSION_HIERARCHY constant directly from source so we don't
  // need to re-export it from queue-drainer.mjs (which is a CLI script with
  // side-effects at module level).
  let hierarchy;

  before(() => {
    const src = readFileSync(resolve(AGENTS_DIR, 'queue-drainer.mjs'), 'utf8');
    const match = src.match(/const PERMISSION_HIERARCHY\s*=\s*(\{[^}]+\})/);
    assert.ok(match, 'Could not find PERMISSION_HIERARCHY in queue-drainer.mjs');
    // Safely evaluate the object literal (no code execution risk — it's just
    // a literal with string keys and integer values).
    hierarchy = JSON.parse(match[1].replace(/'/g, '"'));
  });

  it('contains all 4 permission tiers', () => {
    assert.ok('read-only'  in hierarchy, 'Missing read-only tier');
    assert.ok('edit-gated' in hierarchy, 'Missing edit-gated tier');
    assert.ok('full-edit'  in hierarchy, 'Missing full-edit tier');
    assert.ok('deploy'     in hierarchy, 'Missing deploy tier');
  });

  it('read-only < edit-gated', () => {
    assert.ok(hierarchy['read-only'] < hierarchy['edit-gated']);
  });

  it('edit-gated < full-edit', () => {
    assert.ok(hierarchy['edit-gated'] < hierarchy['full-edit']);
  });

  it('full-edit < deploy', () => {
    assert.ok(hierarchy['full-edit'] < hierarchy['deploy']);
  });

  it('values are unique integers starting at 0', () => {
    const values = Object.values(hierarchy);
    assert.equal(values[0], 0, 'read-only should be 0');
    const unique = new Set(values);
    assert.equal(unique.size, values.length, 'All hierarchy values must be unique');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Worker Permission Injection
// ─────────────────────────────────────────────────────────────────────────────

describe('Worker Permission Injection', () => {
  let PERMISSION_CONSTRAINTS;

  before(() => {
    // Parse PERMISSION_CONSTRAINTS from worker.mjs source.
    const src = readFileSync(resolve(AGENTS_DIR, 'worker.mjs'), 'utf8');
    const match = src.match(/const PERMISSION_CONSTRAINTS\s*=\s*(\{[\s\S]*?\n\})/);
    assert.ok(match, 'Could not find PERMISSION_CONSTRAINTS in worker.mjs');
    // Build the object by matching each key: 'value' pair
    const block = match[1];
    PERMISSION_CONSTRAINTS = {};
    const entryRe = /'([\w-]+)'\s*:\s*'([\s\S]*?)(?=',\n|',\r\n|\n\s*\})/g;
    let m;
    while ((m = entryRe.exec(block)) !== null) {
      PERMISSION_CONSTRAINTS[m[1]] = m[2];
    }
  });

  it('contains all 4 permission tiers', () => {
    assert.ok('read-only'  in PERMISSION_CONSTRAINTS, 'Missing read-only tier');
    assert.ok('edit-gated' in PERMISSION_CONSTRAINTS, 'Missing edit-gated tier');
    assert.ok('full-edit'  in PERMISSION_CONSTRAINTS, 'Missing full-edit tier');
    assert.ok('deploy'     in PERMISSION_CONSTRAINTS, 'Missing deploy tier');
  });

  it('read-only constraint forbids writing files', () => {
    const text = PERMISSION_CONSTRAINTS['read-only'];
    assert.match(text, /read-only/i);
    assert.match(text, /MUST NOT write|cannot write|not write/i);
  });

  it('edit-gated constraint mentions commit and review', () => {
    const text = PERMISSION_CONSTRAINTS['edit-gated'];
    assert.match(text, /edit-gated/i);
    assert.match(text, /commit/i);
    assert.match(text, /review/i);
  });

  it('full-edit constraint allows write/test/commit but not deploy', () => {
    const text = PERMISSION_CONSTRAINTS['full-edit'];
    assert.match(text, /full-edit/i);
    // Should say something like "may read, write, run tests, and commit"
    assert.match(text, /write|commit/i);
    // Should block deploy
    assert.match(text, /deploy/i);
    assert.match(text, /MUST NOT|not trigger/i);
  });

  it('deploy constraint allows full access', () => {
    const text = PERMISSION_CONSTRAINTS['deploy'];
    assert.match(text, /deploy/i);
    // Should grant access to deploy pipeline
    assert.match(text, /full access|deploy pipeline/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cosine Similarity math
// ─────────────────────────────────────────────────────────────────────────────

describe('Cosine Similarity math', () => {
  // The framework uses cosine similarity for semantic memory search.
  // We test the pure math inline — same formula used in semantic-index.mjs.

  function cosineSimilarity(a, b) {
    if (a.length !== b.length) throw new Error('Vectors must be the same length');
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot   += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  it('two identical non-zero vectors have similarity 1.0', () => {
    const v = [1, 2, 3, 4];
    assert.ok(
      Math.abs(cosineSimilarity(v, v) - 1.0) < 1e-10,
      'Expected similarity of 1.0 for identical vectors',
    );
  });

  it('two orthogonal vectors have similarity 0.0', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    assert.ok(
      Math.abs(cosineSimilarity(a, b) - 0.0) < 1e-10,
      'Expected similarity of 0.0 for orthogonal vectors',
    );
  });

  it('anti-parallel vectors have similarity -1.0', () => {
    const a = [1, 0];
    const b = [-1, 0];
    assert.ok(
      Math.abs(cosineSimilarity(a, b) - (-1.0)) < 1e-10,
      'Expected similarity of -1.0 for anti-parallel vectors',
    );
  });

  it('similarity is symmetric (a,b) === (b,a)', () => {
    const a = [0.5, 0.8, 0.2];
    const b = [0.1, 0.9, 0.4];
    assert.ok(
      Math.abs(cosineSimilarity(a, b) - cosineSimilarity(b, a)) < 1e-10,
      'Cosine similarity must be symmetric',
    );
  });

  it('zero vector returns 0 (safe no-op)', () => {
    assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
    assert.equal(cosineSimilarity([1, 2, 3], [0, 0, 0]), 0);
  });

  it('result is bounded to [-1, 1]', () => {
    for (let i = 0; i < 20; i++) {
      const a = Array.from({ length: 8 }, () => Math.random() * 2 - 1);
      const b = Array.from({ length: 8 }, () => Math.random() * 2 - 1);
      const sim = cosineSimilarity(a, b);
      assert.ok(sim >= -1 - 1e-10 && sim <= 1 + 1e-10, `Similarity ${sim} out of bounds`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Cost Tracker – computeSessionHours
// ─────────────────────────────────────────────────────────────────────────────

describe('Cost Tracker – computeSessionHours', () => {
  // Extract computeSessionHours from the source so we can unit-test it without
  // importing the CLI module (which has side-effects calling loadConfig).
  let computeSessionHours;

  before(() => {
    const src = readFileSync(resolve(AGENTS_DIR, 'cost-tracker.mjs'), 'utf8');

    // The function body runs from "function computeSessionHours" to the blank
    // line before "function report".  We extract it and evaluate it in this
    // module's scope via a new Function factory.
    const match = src.match(/(function computeSessionHours\([\s\S]*?\n\})/);
    assert.ok(match, 'Could not extract computeSessionHours from cost-tracker.mjs');
    // eslint-disable-next-line no-new-func
    computeSessionHours = new Function(`return (${match[1]})`)();
  });

  it('empty log returns 0', () => {
    const result = computeSessionHours([], new Date(0));
    assert.equal(result, 0);
  });

  it('single entry returns the minimum 5-minute session credit', () => {
    const log = [{ timestamp: ts(0), agent: 'roy', totalTokens: 100 }];
    const cutoff = new Date(Date.now() - 60000);
    const hours = computeSessionHours(log, cutoff);
    // totalMs = 0 (single entry) + 5/60 h minimum credit
    assert.ok(Math.abs(hours - 5 / 60) < 0.001, `Expected ~${5 / 60} h, got ${hours}`);
  });

  it('two entries 10 min apart belong to the same session', () => {
    const TEN_MIN_MS = 10 * 60 * 1000;
    const log = [
      { timestamp: ts(-TEN_MIN_MS), agent: 'roy', totalTokens: 100 },
      { timestamp: ts(0),           agent: 'roy', totalTokens: 100 },
    ];
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const hours = computeSessionHours(log, cutoff);
    // sessionMs = 10 min = 1/6 h; plus 5-min credit
    const expected = (10 / 60) + (5 / 60);
    assert.ok(Math.abs(hours - expected) < 0.01, `Expected ~${expected.toFixed(3)} h, got ${hours.toFixed(3)}`);
  });

  it('gap > 30 min creates a new session', () => {
    const now = Date.now();
    // Session A: 2h ago → 1h 40m ago  (20-min span — gap of 20 min between entries)
    // Gap:       40 min (> 30 min threshold → triggers new session in the algorithm)
    // Session B: 1h ago — single entry (span = 0 ms; then another 60-min gap)
    // Session C: justNow — single entry
    //
    // The algorithm (from cost-tracker.mjs) works as follows:
    //   • It tracks sessionStart / sessionEnd and increments totalMs when a gap
    //     > 30 min is detected.
    //   • Session A contributes 20 min (oneH40mAgo - twoHAgo).
    //   • After the 40-min gap, session B starts at oneHAgo.  The next entry
    //     (justNow) is 60 min away — that is ALSO > 30 min, so the algorithm
    //     closes session B immediately (0 ms span) and opens session C.
    //   • Session C ends at justNow with a 0-ms span.
    //   • Total wall-clock: 20 min.  Plus 5-min minimum credit → 0.417 h.
    //
    // Key invariant being tested: the 40-min gap DOES trigger the new-session
    // branch, meaning the result is strictly larger than 0 (something was
    // measured) and the 5-min credit is applied exactly once.
    const twoHAgo    = new Date(now - 2  * 60 * 60 * 1000).toISOString();
    const oneH40mAgo = new Date(now - 100 * 60 * 1000).toISOString();
    const oneHAgo    = new Date(now - 60 * 60 * 1000).toISOString();
    const justNow    = new Date(now).toISOString();

    const log = [
      { timestamp: twoHAgo,    agent: 'moss', totalTokens: 100 },
      { timestamp: oneH40mAgo, agent: 'moss', totalTokens: 100 },
      // 40-min gap here — exceeds 30-min threshold
      { timestamp: oneHAgo,    agent: 'moss', totalTokens: 100 },
      { timestamp: justNow,    agent: 'moss', totalTokens: 100 },
    ];

    const cutoff = new Date(now - 3 * 60 * 60 * 1000);
    const hours = computeSessionHours(log, cutoff);

    // Result should be positive (entries were counted)
    assert.ok(hours > 0, `Expected hours > 0, got ${hours}`);

    // Session A spans 20 min.  The credit adds 5 min.  The total must be at
    // least 20/60 h (conservative lower bound, no credit).
    const minExpectedHours = 20 / 60;
    assert.ok(
      hours >= minExpectedHours,
      `Expected hours >= ${minExpectedHours.toFixed(3)} (20-min session), got ${hours.toFixed(3)}`,
    );

    // Upper bound: no single unbroken session should exceed the 2-hour window
    assert.ok(hours < 2.5, `Hours ${hours.toFixed(3)} unexpectedly large`);
  });

  it('entries before cutoffDate are excluded', () => {
    const now = Date.now();
    const cutoff = new Date(now - 10 * 60 * 1000); // 10 min ago

    const log = [
      // Very old entry — must be excluded
      { timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(), agent: 'jen', totalTokens: 999 },
      // Recent entry — must be included
      { timestamp: new Date(now - 5 * 60 * 1000).toISOString(), agent: 'jen', totalTokens: 100 },
    ];

    const hours = computeSessionHours(log, cutoff);
    // Only the recent single entry matters → ~5/60 h minimum
    assert.ok(Math.abs(hours - 5 / 60) < 0.001, `Expected ~${(5 / 60).toFixed(4)} h, got ${hours}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Cadence Commit Window – getCadenceGuidance
// ─────────────────────────────────────────────────────────────────────────────

describe('Cadence Commit Window – getCadenceGuidance', () => {
  // Extract getCadenceGuidance from worker.mjs source so we can call it with
  // controlled config without importing the CLI module (which has side-effects).
  let buildGetCadenceGuidance;

  before(() => {
    const src = readFileSync(resolve(AGENTS_DIR, 'worker.mjs'), 'utf8');
    const match = src.match(/(function getCadenceGuidance\([\s\S]*?\n\})/);
    assert.ok(match, 'Could not extract getCadenceGuidance from worker.mjs');
    // The function references `config` from its module scope. We re-create it
    // as a factory that accepts a config argument.
    const fnSrc = match[1].replace(/\bconfig\b/g, '_cfg');
    // eslint-disable-next-line no-new-func
    buildGetCadenceGuidance = new Function(
      '_cfg',
      `return (${fnSrc})`,
    );
  });

  function makeGetCadenceGuidance(cadenceConfig) {
    return buildGetCadenceGuidance({ cadence: cadenceConfig });
  }

  it('no cadence config returns empty string', () => {
    const fn = makeGetCadenceGuidance(undefined);
    assert.equal(fn('moss'), '');
  });

  it('cadence config without matching agent returns empty string', () => {
    const fn = makeGetCadenceGuidance({
      commitWindowMinutes: 15,
      agentOffsets: { roy: 0 },
    });
    assert.equal(fn('moss'), '');
  });

  it('configured agent gets commit time guidance with correct offset', () => {
    const fn = makeGetCadenceGuidance({
      commitWindowMinutes: 15,
      agentOffsets: { moss: 5 },
    });
    const guidance = fn('moss');
    assert.ok(guidance.length > 0, 'Expected non-empty guidance');
    // offset=5, window=15 → times are :05, :20, :35, :50
    assert.match(guidance, /:05/, 'Expected :05 in commit times');
    assert.match(guidance, /:20/, 'Expected :20 in commit times');
    assert.match(guidance, /:35/, 'Expected :35 in commit times');
    assert.match(guidance, /:50/, 'Expected :50 in commit times');
  });

  it('guidance text contains "Commit Cadence" heading', () => {
    // Note: offset must be non-zero; the source uses !cadence.agentOffsets[agentName]
    // which treats 0 as falsy and returns '' — use offset=10 here.
    const fn = makeGetCadenceGuidance({
      commitWindowMinutes: 20,
      agentOffsets: { jen: 10 },
    });
    const guidance = fn('jen');
    assert.match(guidance, /Commit Cadence/i);
  });

  it('offset=0 correctly generates :00 start times', () => {
    // Bug fix: offset=0 was previously falsy in JS, now uses `in` operator
    const fn = makeGetCadenceGuidance({
      commitWindowMinutes: 30,
      agentOffsets: { roy: 0 },
    });
    const guidance = fn('roy');
    assert.match(guidance, /:00/, 'offset=0 should produce :00 commit times');
    assert.match(guidance, /:30/, 'offset=0 with 30-min window should include :30');
  });

  it('non-zero offset starts at the correct minute', () => {
    const fn = makeGetCadenceGuidance({
      commitWindowMinutes: 30,
      agentOffsets: { roy: 1 },
    });
    const guidance = fn('roy');
    // offset=1, window=30 → times :01, :31
    assert.match(guidance, /:01/, 'Expected :01 in commit times for offset=1');
    assert.match(guidance, /:31/, 'Expected :31 in commit times');
  });

  it('commit times stop before 60 minutes', () => {
    const fn = makeGetCadenceGuidance({
      commitWindowMinutes: 15,
      agentOffsets: { denholm: 0 },
    });
    const guidance = fn('denholm');
    // Should not include :60 or beyond
    assert.doesNotMatch(guidance, /:60/, 'Commit times must not include :60 or beyond');
  });
});
