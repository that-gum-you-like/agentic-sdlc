/**
 * Notification policy (Bryce, 2026-09-02): deploys + failures ONLY. Task completion was
 * sent under the `deployComplete` trigger, so every completed task paged him (2026-11-03).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('task completion uses its own trigger, never deployComplete', () => {
  const src = read('agents/queue-drainer.mjs');
  assert.match(src, /triggerNotification\('taskComplete', `✅ Task/);
  assert.doesNotMatch(src, /triggerNotification\('deployComplete', `✅ Task/);
});

test('the framework project keeps routine-success triggers off', () => {
  const t = JSON.parse(read('agents/project.json')).notification.triggers;
  for (const k of ['taskComplete', 'drainComplete', 'mergeComplete']) assert.equal(t[k], false, k);
  for (const k of ['deployComplete', 'deployFailed', 'highSeverityFailure', 'blocker']) assert.equal(t[k], true, k);
});
