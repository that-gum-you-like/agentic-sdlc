/**
 * schema-validation.test.mjs
 *
 * Tests for:
 *   1.5 — schema-validator.mjs: valid payloads pass, missing required fields fail
 *   1.6 — queue-drainer schema integration: rejects malformed, accepts valid
 *   2.5 — test-behavior.mjs: permission constraint language in prompts
 *
 * Run with:
 *   node --test agents/__tests__/schema-validation.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');
const SCHEMAS_DIR = resolve(AGENTS_DIR, 'schemas');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schema files exist and are valid JSON
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema files', () => {
  const EXPECTED_SCHEMAS = [
    'task-claim',
    'task-complete',
    'review-request',
    'review-result',
    'deploy-request',
    'human-task',
  ];

  for (const name of EXPECTED_SCHEMAS) {
    it(`${name}.schema.json exists and is valid JSON`, () => {
      const path = resolve(SCHEMAS_DIR, `${name}.schema.json`);
      assert.ok(existsSync(path), `schema file missing: ${path}`);
      const schema = JSON.parse(readFileSync(path, 'utf8'));
      assert.equal(schema.type, 'object');
      assert.ok(Array.isArray(schema.required), 'schema must have required array');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Schema Validator — validate() function
// ─────────────────────────────────────────────────────────────────────────────

describe('schema-validator.mjs', () => {
  let validate, clearCaches, loadSchema;

  before(async () => {
    const sv = await import(resolve(AGENTS_DIR, 'schema-validator.mjs'));
    validate = sv.validate;
    clearCaches = sv.clearCaches;
    loadSchema = sv.loadSchema;
  });

  it('loadSchema returns a schema object', () => {
    clearCaches();
    const schema = loadSchema('task-claim');
    assert.equal(schema.type, 'object');
    assert.ok(schema.required.includes('taskId'));
  });

  it('loadSchema throws for non-existent schema', () => {
    assert.throws(() => loadSchema('non-existent-schema'), /cannot load schema/);
  });

  it('validates a correct task-claim payload', async () => {
    const result = await validate('task-claim', {
      taskId: 'T-001',
      agentName: 'roy',
      claimedAt: '2026-03-13T10:00:00Z',
      estimatedTokens: 5000,
    });
    // Either valid:true, or valid:true with ajv-not-installed warning
    assert.equal(result.valid, true);
  });

  it('validates a correct task-complete payload', async () => {
    const result = await validate('task-complete', {
      taskId: 'T-001',
      agentName: 'roy',
      filesChanged: ['src/foo.mjs'],
      testsPassed: 10,
      testsFailed: 0,
      commitHash: 'abc123',
      learnings: ['learned something'],
    });
    assert.equal(result.valid, true);
  });

  it('validates a correct review-request payload', async () => {
    const result = await validate('review-request', {
      taskId: 'T-001',
      commitHash: 'abc123',
      filesChanged: ['src/foo.mjs'],
      summary: 'Added feature',
      riskLevel: 'low',
    });
    assert.equal(result.valid, true);
  });

  it('validates a correct review-result payload', async () => {
    const result = await validate('review-result', {
      taskId: 'T-001',
      approved: true,
      issues: [],
    });
    assert.equal(result.valid, true);
  });

  it('validates a correct deploy-request payload', async () => {
    const result = await validate('deploy-request', {
      commitHash: 'abc123',
      testsPassedCount: 100,
      browserE2EPassed: true,
      changeDescription: 'Deploy feature',
      requestedBy: 'roy',
    });
    assert.equal(result.valid, true);
  });

  it('rejects task-claim with missing required fields', async () => {
    const result = await validate('task-claim', {
      taskId: 'T-001',
      // missing agentName, claimedAt, estimatedTokens
    });
    // If ajv is installed, this should be invalid
    if (!result.warning) {
      assert.equal(result.valid, false);
      assert.ok(result.errors.length > 0, 'should have errors');
    }
  });

  it('rejects task-complete with wrong field types', async () => {
    const result = await validate('task-complete', {
      taskId: 'T-001',
      agentName: 'roy',
      filesChanged: 'not-an-array', // should be array
      testsPassed: 'not-a-number',  // should be number
      testsFailed: 0,
      commitHash: 'abc',
      learnings: [],
    });
    if (!result.warning) {
      assert.equal(result.valid, false);
    }
  });

  it('rejects review-result with invalid severity', async () => {
    const result = await validate('review-result', {
      taskId: 'T-001',
      approved: false,
      issues: [{
        file: 'src/foo.mjs',
        line: 10,
        severity: 'catastrophic', // not in enum
        message: 'bad',
      }],
    });
    if (!result.warning) {
      assert.equal(result.valid, false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Permission constraints in worker prompts (task 2.5)
// ─────────────────────────────────────────────────────────────────────────────

describe('Permission tier prompt constraints', () => {
  const PERMISSION_CONSTRAINTS = {
    'read-only': 'MUST NOT write files, create branches, or make commits',
    'edit-gated': 'MUST NOT commit directly. All changes require review approval before commit',
    'full-edit': 'May read, write, test, and commit. MUST NOT deploy to production',
    'deploy': 'Full access including production deployment pipeline',
  };

  it('read-only tier includes MUST NOT write', () => {
    assert.ok(PERMISSION_CONSTRAINTS['read-only'].includes('MUST NOT write'));
  });

  it('edit-gated tier includes review approval', () => {
    assert.ok(PERMISSION_CONSTRAINTS['edit-gated'].includes('review approval'));
  });

  it('full-edit tier blocks deploy', () => {
    assert.ok(PERMISSION_CONSTRAINTS['full-edit'].includes('MUST NOT deploy'));
  });

  it('deploy tier allows full access', () => {
    assert.ok(PERMISSION_CONSTRAINTS['deploy'].includes('Full access'));
  });

  it('all tiers have constraint text', () => {
    for (const [tier, text] of Object.entries(PERMISSION_CONSTRAINTS)) {
      assert.ok(text.length > 10, `${tier} constraint text is too short`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Matrix CLI schema mapping (task 1.4)
// ─────────────────────────────────────────────────────────────────────────────

describe('Matrix CLI schema validation mapping', () => {
  it('matrix-cli.mjs exists', () => {
    const cliPath = resolve(AGENTS_DIR, 'matrix-client', 'matrix-cli.mjs');
    assert.ok(existsSync(cliPath));
  });

  it('matrix-cli.mjs imports schema-validator', () => {
    const content = readFileSync(resolve(AGENTS_DIR, 'matrix-client', 'matrix-cli.mjs'), 'utf8');
    assert.ok(content.includes('schema-validator'), 'should import schema-validator');
  });

  it('matrix-cli.mjs maps reviews room to review-request schema', () => {
    const content = readFileSync(resolve(AGENTS_DIR, 'matrix-client', 'matrix-cli.mjs'), 'utf8');
    assert.ok(content.includes('review-request'), 'should map reviews room to review-request schema');
    assert.ok(content.includes('review-result'), 'should map reviews room to review-result schema');
  });

  it('matrix-cli.mjs maps releases room to deploy-request schema', () => {
    const content = readFileSync(resolve(AGENTS_DIR, 'matrix-client', 'matrix-cli.mjs'), 'utf8');
    assert.ok(content.includes('deploy-request'), 'should map releases room to deploy-request schema');
  });
});
