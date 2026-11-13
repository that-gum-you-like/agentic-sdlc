import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findHostPathJobs } from '../agents/hermes-cron-guard.mjs';

const drain = { id: 'a', name: 'drain', enabled: true, state: 'scheduled', prompt: 'cd /home/bryce/agentic-sdlc and run node ~/agentic-sdlc/agents/queue-drainer.mjs' };

test('flags enabled agent jobs whose prompt uses host paths', () => {
  const bad = findHostPathJobs([drain]);
  assert.equal(bad.length, 1);
  assert.ok(bad[0].paths.includes('/home/bryce/agentic-sdlc'));
});
test('ignores paused, disabled, script and no-agent jobs', () => {
  assert.deepEqual(findHostPathJobs([
    { ...drain, state: 'paused' }, { ...drain, enabled: false },
    { ...drain, script: 'x.sh' }, { ...drain, no_agent: true },
  ]), []);
});
test('ignores prompts without host paths', () => {
  assert.deepEqual(findHostPathJobs([{ ...drain, prompt: 'say hello' }]), []);
});
