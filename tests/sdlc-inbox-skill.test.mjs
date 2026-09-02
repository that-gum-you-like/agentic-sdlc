/**
 * sdlc-inbox skill — the Telegram-facing skill that captures a dictated
 * non-code item (chore/note) as a schema-valid task file in tasks/queue/.
 * Spec: openspec/changes/business-os/specs/personal-task-lane.md REQ-003
 * Task: OS-business-os-12 (T-503)
 *
 * The property under test: following the skill produces a task file that is
 * schema-valid with kind + title + project, requires no files[]/test_status/
 * estimatedTokens, and routes unknown projects to `personal` with the
 * original text preserved — so a Telegram agent that follows the skill never
 * writes a broken or misrouted capture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SKILL_PATH = join(REPO_ROOT, 'skills', 'sdlc-inbox', 'SKILL.md');
const SCHEMA_DIR = join(REPO_ROOT, 'agents', 'schemas');
const QUEUE_DIR = join(REPO_ROOT, 'tasks', 'queue');

let validate;

test('the sdlc-inbox skill file exists with valid frontmatter', () => {
  assert.ok(existsSync(SKILL_PATH), 'skills/sdlc-inbox/SKILL.md must exist');

  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /^---\n/, 'SKILL.md must start with YAML frontmatter');
  assert.match(raw, /^name:\s*sdlc-inbox\s*$/m, 'frontmatter name must be sdlc-inbox');
  assert.match(raw, /^version:\s*\S+\s*$/m, 'frontmatter must carry a version');
  assert.match(raw, /^description:\s*"/m, 'frontmatter must have a quoted description');
  assert.match(raw, /^---\n/m, 'frontmatter must close');
});

test('the skill teaches capture as a schema-valid chore/note with kind + title + project', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');

  // The skill must point at the queue, the schema, and the portfolio roster.
  assert.match(raw, /tasks\/queue/, 'skill must reference the tasks/queue/ ledger');
  assert.match(raw, /task\.schema\.json/, 'skill must reference the task schema');
  assert.match(raw, /portfolio\.mjs list --json/, 'skill must look projects up in the real roster');
  assert.match(raw, /kind/, 'skill must mandate setting kind');
  assert.match(raw, /chore/, 'skill must teach the chore kind');
  assert.match(raw, /note/, 'skill must teach the note kind');
  assert.match(raw, /"title"/, 'skill must document the title field');
  assert.match(raw, /"source"/, 'skill must document the source field carrying the project');
  assert.match(raw, /inbox:<project>|inbox:/, 'skill must document the inbox:<project> source convention');
});

test('the skill explicitly forbids files[], test_status, and estimatedTokens on captures', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');

  assert.match(raw, /no `files\[\]`, no `test_status`, no `estimatedTokens`/,
    'skill must state the absent fields verbatim');
  assert.match(raw, /files\[\]/, 'skill must mention files[]');
  assert.match(raw, /test_status/, 'skill must mention test_status');
  assert.match(raw, /estimatedTokens/, 'skill must mention estimatedTokens');
  assert.match(raw, /NEVER add `files\[\]`, `test_status`, or `estimatedTokens`/,
    'guardrail must forbid adding the optional fields');
});

test('the documented capture template is schema-valid against task.schema.json', async () => {
  validate = validate || (await import(resolve(SCHEMA_DIR, '..', 'schema-validator.mjs'))).validate;
  const raw = readFileSync(SKILL_PATH, 'utf8');

  // Extract the JSON example block from the skill and validate it for real.
  const m = raw.match(/```json\n([\s\S]*?)```/);
  assert.ok(m, 'skill must embed a JSON capture example');
  const template = JSON.parse(m[1]);

  const result = await validate('task', template);
  assert.equal(result.valid, true, `embedded capture must validate: ${JSON.stringify(result.errors)}`);

  assert.equal(template.kind, 'chore', 'example kind must be set');
  assert.ok(template.title, 'example must carry a title');
  assert.ok(template.description, 'example must carry the original text');
  assert.ok(template.source.startsWith('inbox:'), 'example source must carry the project');
  assert.ok(!('files' in template), 'example must not require files[]');
  assert.ok(!('test_status' in template), 'example must not require test_status');
  assert.ok(!('estimatedTokens' in template), 'example must not require estimatedTokens');
});

test('an unknown project falls back to personal preserving the original text', async () => {
  validate = validate || (await import(resolve(SCHEMA_DIR, '..', 'schema-validator.mjs'))).validate;
  const raw = readFileSync(SKILL_PATH, 'utf8');

  // The skill must document the fallback rule, not just the happy path.
  assert.match(raw, /not.*in the roster|not registered|unknown project/i,
    'skill must cover the unknown-project case');
  assert.match(raw, /`personal`/, 'skill must name personal as the fallback lane');
  assert.match(raw, /original text/i, 'skill must preserve the original text on fallback');
  assert.match(raw, /never invent a project|never invent/, 'skill must forbid inventing projects');

  // Simulating an agent following the skill: "tally summary for Acme call"
  // with an unknown project "acme-call" → routed to personal, text intact.
  const capture = {
    id: 'INBOX-20991231.235959',
    title: 'tally summary for Acme call',
    description: 'tally summary for Acme call',
    priority: 'MEDIUM',
    status: 'pending',
    kind: 'note',
    source: 'inbox:personal',
    tags: ['inbox'],
    createdAt: '2099-12-31T23:59:59.000Z',
  };
  const result = await validate('task', capture);
  assert.equal(result.valid, true, `fallback capture must be schema-valid: ${JSON.stringify(result.errors)}`);
  assert.equal(capture.source, 'inbox:personal', 'unknown project must route to personal');
  assert.equal(capture.description, 'tally summary for Acme call', 'original text must be preserved verbatim');
  assert.equal(capture.kind, 'note', 'kind must survive the fallback');
});

test('the skill forbids capturing code work as a chore/note', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  assert.match(raw, /never.*code|code work goes through|not this skill/i,
    'skill must steer code work away from the inbox');
  assert.match(raw, /never set `kind: code`|NEVER set `kind: code`/i,
    'skill must forbid kind: code on captures');
});