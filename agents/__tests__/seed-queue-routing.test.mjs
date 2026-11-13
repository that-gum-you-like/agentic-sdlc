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
import { readFileSync, existsSync, mkdirSync, cpSync, mkdtempSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');

const { assignAgent, patternMatches, estimateTokens } = await import('../seed-queue-from-openspec.mjs');
const { scaffoldBugChange } = await import('../seed-queue.mjs');

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

describe('scaffoldBugChange — bug change scaffolding (CV-308 / CV-REQ-036)', () => {
  const templatesDir = resolve(__dirname, '../../openspec/templates');
  const task = {
    id: 'CV-999',
    title: 'Test bug: something broke',
    description: 'The test task failed because the widget did not render.\nError: WidgetError at line 42',
    agent: 'sdlc-developer',
  };

  it('creates bug-<id>/ directory with proposal.md, tasks.md, status.json with readiness draft', () => {
    const tmpChangesDir = join(tmpdir(), `scaffold-test-${Date.now()}`);
    mkdirSync(tmpChangesDir, { recursive: true });

    const resultDir = scaffoldBugChange(task, { templatesDir, changesDir: tmpChangesDir });

    assert.ok(existsSync(resultDir), 'bug change dir must exist');
    assert.ok(existsSync(join(resultDir, 'proposal.md')), 'proposal.md must exist');
    assert.ok(existsSync(join(resultDir, 'tasks.md')), 'tasks.md must exist');
    assert.ok(existsSync(join(resultDir, 'status.json')), 'status.json must exist');

    const status = JSON.parse(readFileSync(join(resultDir, 'status.json'), 'utf8'));
    assert.equal(status.readiness, 'draft', 'readiness must be draft');
    assert.equal(status.status, 'proposed', 'status must be proposed');

    // Verify task id and title are embedded in proposal
    const proposal = readFileSync(join(resultDir, 'proposal.md'), 'utf8');
    assert.ok(proposal.includes('CV-999'), 'proposal must include task id');
    assert.ok(proposal.includes('Test bug: something broke'), 'proposal must include task title');
    assert.ok(proposal.includes('WidgetError'), 'proposal must include failure text');

    // Verify task id embedded in tasks.md
    const tasks = readFileSync(join(resultDir, 'tasks.md'), 'utf8');
    assert.ok(tasks.includes('CV-999'), 'tasks.md must include task id');
    assert.ok(tasks.includes('Test bug: something broke'), 'tasks.md must include task title');
  });

  it('is idempotent — second call leaves files byte-identical', () => {
    const tmpChangesDir = join(tmpdir(), `scaffold-idempotent-${Date.now()}`);
    mkdirSync(tmpChangesDir, { recursive: true });

    // First call
    const resultDir = scaffoldBugChange(task, { templatesDir, changesDir: tmpChangesDir });

    const proposalFirst = readFileSync(join(resultDir, 'proposal.md'), 'utf8');
    const tasksFirst = readFileSync(join(resultDir, 'tasks.md'), 'utf8');
    const statusFirst = readFileSync(join(resultDir, 'status.json'), 'utf8');

    // Second call
    scaffoldBugChange(task, { templatesDir, changesDir: tmpChangesDir });

    const proposalSecond = readFileSync(join(resultDir, 'proposal.md'), 'utf8');
    const tasksSecond = readFileSync(join(resultDir, 'tasks.md'), 'utf8');
    const statusSecond = readFileSync(join(resultDir, 'status.json'), 'utf8');

    assert.equal(proposalFirst, proposalSecond, 'proposal.md must be byte-identical on second call');
    assert.equal(tasksFirst, tasksSecond, 'tasks.md must be byte-identical on second call');
    assert.equal(statusFirst, statusSecond, 'status.json must be byte-identical on second call');
  });

  it('throws on a missing template and creates no directory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'sbc-'));
    const changesDir = join(tmp, 'changes');
    mkdirSync(changesDir);
    assert.throws(() => scaffoldBugChange({ id: 'T-1', title: 't' }, { templatesDir: join(tmp, 'nope'), changesDir }), /missing template/);
    assert.equal(existsSync(join(changesDir, 'bug-T-1')), false);
  });

  it('throws when templatesDir or changesDir are missing', () => {
    assert.throws(() => scaffoldBugChange(task, {}), /templatesDir/);
    assert.throws(() => scaffoldBugChange(task, { templatesDir: '/tmp' }), /changesDir/);
  });

  it('handles task without description', () => {
    const tmpChangesDir = join(tmpdir(), `scaffold-nodecription-${Date.now()}`);
    mkdirSync(tmpChangesDir, { recursive: true });

    const noDescTask = { id: 'FIX-001', title: 'No description task' };
    const resultDir = scaffoldBugChange(noDescTask, { templatesDir, changesDir: tmpChangesDir });

    assert.ok(existsSync(join(resultDir, 'proposal.md')));
    assert.ok(existsSync(join(resultDir, 'status.json')));
    const status = JSON.parse(readFileSync(join(resultDir, 'status.json'), 'utf8'));
    assert.equal(status.readiness, 'draft');
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
