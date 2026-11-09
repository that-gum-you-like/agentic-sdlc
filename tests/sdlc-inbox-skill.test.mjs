/**
 * tests/sdlc-inbox-skill.test.mjs — sdlc-inbox SKILL.md content assertions.
 *
 * WHY: the sdlc-inbox skill is used by Hermes agents to capture non-code items
 * as queue tasks. It must include a prompt-injection screening step (CV-206 /
 * D5-06) that runs red-team-tester.mjs --screen on pasted text before filing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = resolve(ROOT, 'skills/sdlc-inbox/SKILL.md');

test('sdlc-inbox SKILL.md exists', () => {
  const content = readFileSync(SKILL, 'utf8');
  assert.ok(content.length > 0, 'SKILL.md should not be empty');
});

test('SKILL.md references red-team-tester.mjs --screen', () => {
  const content = readFileSync(SKILL, 'utf8');
  assert.ok(
    content.includes('red-team-tester.mjs --screen'),
    'SKILL.md must reference red-team-tester.mjs --screen for injection screening'
  );
});

test('SKILL.md documents what to do when screen flags text', () => {
  const content = readFileSync(SKILL, 'utf8');
  assert.ok(
    content.includes('flagged: true'),
    'SKILL.md must mention the flagged: true condition'
  );
  assert.ok(
    content.includes('Do NOT file it'),
    'SKILL.md must instruct not to file flagged text'
  );
});
