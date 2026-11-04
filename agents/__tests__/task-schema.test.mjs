/**
 * task.schema.json — tasks/queue/*.json data contract.
 * Spec: openspec/changes/business-os/specs/personal-task-lane.md REQ-001
 *
 * kind ∈ {code, chore, note} is optional; ABSENT means "code". Every existing
 * task file must keep validating unchanged, and an unrecognized kind value
 * must fail closed rather than defaulting.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync, readdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENTS_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(__dirname, '../..');
const SCHEMA_PATH = resolve(AGENTS_DIR, 'schemas/task.schema.json');
const QUEUE_DIR = resolve(REPO_ROOT, 'tasks/queue');

let validate;
let schema;

const baseTask = (overrides = {}) => ({
  id: 'T-TEST-1',
  title: 'a task',
  description: 'a description',
  priority: 'MEDIUM',
  status: 'pending',
  ...overrides,
});

before(async () => {
  const sv = await import(resolve(AGENTS_DIR, 'schema-validator.mjs'));
  validate = sv.validate;
  schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
});

// ── REQ-001: kind is optional and absent means code ─────────────────────────

test('kind accepts all three values: code, chore, note', async () => {
  for (const kind of ['code', 'chore', 'note']) {
    const result = await validate('task', baseTask({ kind }));
    assert.equal(result.valid, true, `kind ${kind} must be accepted: ${JSON.stringify(result.errors)}`);
  }
});

test('kind absence is accepted', async () => {
  const result = await validate('task', baseTask());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('kind is NOT a required field', () => {
  assert.ok(Array.isArray(schema.required), 'schema must declare required');
  assert.ok(!schema.required.includes('kind'), 'kind must not be required');
});

// ── REQ-001: existing task files keep validating unchanged ──────────────────

test('every task file in tasks/queue/ validates unchanged', async () => {
  const files = readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 13, `expected at least the original 13 task files, found ${files.length}`);

  for (const f of files) {
    const task = JSON.parse(readFileSync(resolve(QUEUE_DIR, f), 'utf8'));
    const result = await validate('task', task);
    assert.equal(
      result.valid,
      true,
      `${f} must validate unchanged against task.schema.json: ${JSON.stringify(result.errors)}`
    );
  }
});

// ── REQ-001: unrecognized kind fails closed ──────────────────────────────────

test('an unrecognized kind value fails validation', async () => {
  for (const bad of ['urgent', 'CODE', 'code ', '']) {
    const result = await validate('task', baseTask({ kind: bad }));
    assert.equal(result.valid, false, `kind ${JSON.stringify(bad)} must be rejected`);
    assert.ok(
      result.errors.some((e) => String(e.field).endsWith('/kind') || /kind/.test(e.field + e.message)),
      `kind error must name the kind field: ${JSON.stringify(result.errors)}`
    );
  }
});

test('kind defaults to code by absence — a valid task may omit it entirely', async () => {
  const absent = baseTask();
  assert.ok(!('kind' in absent));
  const result = await validate('task', absent);
  assert.equal(result.valid, true);
});

test('invalid values for required fields still fail (schema is not a no-op)', async () => {
  const noId = baseTask();
  delete noId.id;
  const result = await validate('task', noId);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /id/.test(e.field + ' ' + e.message)),
    `id error must name the id field: ${JSON.stringify(result.errors)}`
  );
});

// ── CV-REQ-100 / CV-501: claude-review-queue.schema.json ─────────────────────
//
// pm/claude-review-queue.json is a runtime file (gitignored) written by
// pr-auto-review.mjs when a PR touches FLAG_PATHS. The schema describes ONE
// entry, keyed by (pr, headSha) so a force-push re-queues exactly once.

const QUEUE_SCHEMA_PATH = resolve(AGENTS_DIR, 'schemas/claude-review-queue.schema.json');

const baseQueueEntry = (overrides = {}) => ({
  pr: 70,
  branch: 'agent/drain/OS-business-os-10',
  headSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  reasons: ['touches agents/hermes-drain.sh (FLAG_PATHS)'],
  flaggedAt: '2026-11-03T20:15:00.000Z',
  notifiedAt: '2026-11-03T20:15:04.000Z',
  status: 'open',
  ...overrides,
});

test('claude-review-queue schema file exists, is valid JSON, and declares its required fields', () => {
  const queueSchema = JSON.parse(readFileSync(QUEUE_SCHEMA_PATH, 'utf8'));
  assert.equal(queueSchema.type, 'object');
  assert.deepEqual(
    [...queueSchema.required].sort(),
    ['branch', 'flaggedAt', 'headSha', 'pr', 'reasons', 'status'],
    'only notifiedAt may be optional — it is unset until a notice is delivered'
  );
  assert.deepEqual(queueSchema.properties.status.enum, ['open', 'resolved', 'superseded']);
  assert.equal(queueSchema.additionalProperties, false, 'the queue entry contract is closed');
});

test('a valid open queue entry passes validation', async () => {
  const result = await validate('claude-review-queue', baseQueueEntry());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('resolved and superseded entries pass validation', async () => {
  for (const status of ['resolved', 'superseded']) {
    const result = await validate('claude-review-queue', baseQueueEntry({ status }));
    assert.equal(result.valid, true, `status ${status} must be accepted: ${JSON.stringify(result.errors)}`);
  }
});

test('notifiedAt is optional: absent means "no notice sent yet"', async () => {
  const entry = baseQueueEntry();
  delete entry.notifiedAt;
  const result = await validate('claude-review-queue', entry);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('notifiedAt may be explicitly null (notification failed, retry next pass)', async () => {
  const result = await validate('claude-review-queue', baseQueueEntry({ notifiedAt: null }));
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('an unknown status is rejected', async () => {
  for (const bad of ['pending', 'OPEN', 'merged', 'closed', '']) {
    const result = await validate('claude-review-queue', baseQueueEntry({ status: bad }));
    assert.equal(result.valid, false, `status ${JSON.stringify(bad)} must be rejected`);
    assert.ok(
      result.errors.some((e) => /status/.test(e.field + ' ' + e.message)),
      `status error must name the status field: ${JSON.stringify(result.errors)}`
    );
  }
});

test('a missing headSha is rejected', async () => {
  const entry = baseQueueEntry();
  delete entry.headSha;
  const result = await validate('claude-review-queue', entry);
  assert.equal(result.valid, false, 'headSha is the other half of the queue key and must be required');
  assert.ok(
    result.errors.some((e) => /headSha/.test(e.field + ' ' + e.message)),
    `error must name headSha: ${JSON.stringify(result.errors)}`
  );
});

test('every required field is individually required', async () => {
  for (const field of ['pr', 'branch', 'reasons', 'flaggedAt', 'status']) {
    const entry = baseQueueEntry();
    delete entry[field];
    const result = await validate('claude-review-queue', entry);
    assert.equal(result.valid, false, `${field} must be required`);
    assert.ok(
      result.errors.some((e) => String(e.field + ' ' + e.message).includes(field)),
      `${field} error must name the field: ${JSON.stringify(result.errors)}`
    );
  }
});

test('headSha must look like a git SHA, not an arbitrary string', async () => {
  for (const bad of ['not-a-sha', 'ZZZZZZZ', 'abc12', 1234567]) {
    const result = await validate('claude-review-queue', baseQueueEntry({ headSha: bad }));
    assert.equal(result.valid, false, `headSha ${JSON.stringify(bad)} must be rejected`);
  }
});

test('pr must be a positive integer', async () => {
  for (const bad of ['70', 0, -1, 70.5, null]) {
    const result = await validate('claude-review-queue', baseQueueEntry({ pr: bad }));
    assert.equal(result.valid, false, `pr ${JSON.stringify(bad)} must be rejected`);
  }
});

test('reasons must be an array of strings', async () => {
  const notAnArray = await validate('claude-review-queue', baseQueueEntry({ reasons: 'touches FLAG_PATHS' }));
  assert.equal(notAnArray.valid, false, 'a bare string is not a reasons list');

  const notStrings = await validate('claude-review-queue', baseQueueEntry({ reasons: [{ path: 'agents/hermes-drain.sh' }] }));
  assert.equal(notStrings.valid, false, 'reasons items must be strings');
});

test('an entry with fields outside the contract is rejected', async () => {
  const result = await validate('claude-review-queue', baseQueueEntry({ title: 'some PR title' }));
  assert.equal(result.valid, false, 'unknown keys must fail closed so the writer cannot drift silently');
});
