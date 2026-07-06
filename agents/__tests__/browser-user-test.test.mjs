/**
 * browser-user-test.test.mjs — Curriculum Ph7: Playwright autonomous
 * user-testing with per-step screenshots, generated from OpenSpec changes.
 *
 * Run with:
 *   node --test agents/__tests__/browser-user-test.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');
const SCRIPT = join(AGENTS_DIR, 'browser-user-test.mjs');
const TMP_PROJECT = join(tmpdir(), `sdlc-usertest-${process.pid}`);

const { extractScenarios, buildSpecSource } = await import('../browser-user-test.mjs');

const PROPOSAL = `# Proposal: photo-upload

## Problem
Users cannot share photos.

## Proposed Solution
Add an upload flow.

#### Scenario: user uploads a photo from the gallery
- **WHEN** the user taps the upload button
- **THEN** the gallery picker opens
- **AND** the selected photo appears in the feed

#### Scenario: upload failure shows a retry state
- **WHEN** the network drops mid-upload
- **THEN** a retry button is shown

- As a creator, I want my drafts saved automatically so that I never lose work.
`;

describe('extractScenarios — OpenSpec → user journeys', () => {
  it('extracts Scenario blocks with their WHEN/THEN steps', () => {
    const scenarios = extractScenarios(PROPOSAL);
    const upload = scenarios.find(s => s.title.includes('uploads a photo'));
    assert.ok(upload);
    assert.equal(upload.steps.length, 3);
    assert.match(upload.steps[0], /^WHEN the user taps/);
    assert.match(upload.steps[2], /^AND the selected photo/);
  });

  it('extracts user-story lines as journeys', () => {
    const scenarios = extractScenarios(PROPOSAL);
    assert.ok(scenarios.some(s => s.title.startsWith('As a creator')));
  });

  it('returns [] for markdown with no user-facing content', () => {
    assert.deepEqual(extractScenarios('# Internal refactor\nJust code moves.'), []);
  });
});

describe('buildSpecSource — per-step screenshot discipline', () => {
  const source = buildSpecSource('photo-upload', extractScenarios(PROPOSAL));

  it('emits one test per scenario, importing @playwright/test', () => {
    assert.ok(source.includes("from '@playwright/test'"));
    assert.ok(source.includes('user uploads a photo from the gallery'));
    assert.ok(source.includes('upload failure shows a retry state'));
  });

  it('screenshots EVERY step plus entry and final proof', () => {
    const proofCalls = (source.match(/await proof\(page,/g) || []).length;
    // 3 scenarios: entry+final each (6) + steps (3 + 2 + 2 default steps for the story)
    assert.ok(proofCalls >= 10, `expected per-step screenshots, got ${proofCalls} proof calls`);
    assert.ok(source.includes('SCREENSHOT_DIR'), 'screenshots go to the archived run dir');
  });

  it('bakes in the navigation-completeness final assertion', () => {
    assert.ok(source.includes('not.toBeEmpty'), 'final state must never be a blank page');
  });
});

describe('CLI — generate + run against a fixture project', () => {
  before(() => {
    mkdirSync(join(TMP_PROJECT, 'agents'), { recursive: true });
    mkdirSync(join(TMP_PROJECT, 'openspec', 'changes', 'photo-upload'), { recursive: true });
    writeFileSync(join(TMP_PROJECT, 'agents', 'project.json'), JSON.stringify({
      name: 'usertest-fixture', projectDir: TMP_PROJECT, appDir: '.', testCmd: 'true',
      agents: ['tester'],
    }));
    writeFileSync(join(TMP_PROJECT, 'openspec', 'changes', 'photo-upload', 'proposal.md'), PROPOSAL);
  });

  after(() => {
    rmSync(TMP_PROJECT, { recursive: true, force: true });
  });

  function runCli(args) {
    return execFileSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8', cwd: TMP_PROJECT,
      env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
    });
  }

  it('generate writes the spec into e2e/user-tests/ (no LLM call by default)', () => {
    const out = runCli(['generate', 'photo-upload']);
    assert.match(out, /Generated .*photo-upload\.spec\.ts — 3 user-journey test/);
    const spec = readFileSync(join(TMP_PROJECT, 'e2e', 'user-tests', 'photo-upload.spec.ts'), 'utf8');
    assert.ok(spec.includes('proof(page,'));
  });

  it('run skips gracefully (exit 0) when Playwright is not installed', () => {
    const out = runCli(['run']);
    assert.match(out, /Playwright not installed .* skipped/);
    assert.ok(!existsSync(join(TMP_PROJECT, 'pm', 'user-tests')), 'no empty archive dirs on skip');
  });

  it('never selects the openai adapter for LLM fill-in (privacy)', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    assert.ok(/loadLlmAdapter\(config, 'openrouter'\)/.test(src), 'LLM path must use OpenRouter');
    assert.ok(!/['"]openai['"]/.test(src));
    assert.ok(src.includes('__isMainModule'), 'CLI guard present');
  });
});
