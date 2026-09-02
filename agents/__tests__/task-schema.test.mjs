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