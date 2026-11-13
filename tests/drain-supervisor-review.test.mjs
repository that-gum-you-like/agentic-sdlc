/**
 * The supervisor reviews after every drain (2026-11-03: back-to-back drains starved the
 * timer-driven reviewer of the shared mutex; PRs sat unreviewed).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runReview, rootRefusal } from '../agents/drain-supervisor.mjs';

test('runReview runs pr-auto-review for the drained project', () => {
  const calls = [];
  const ok = runReview({ path: '/tmp/proj' }, (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { status: 0 }; });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'node');
  assert.match(calls[0].args[0], /pr-auto-review\.mjs$/);
  assert.equal(calls[0].opts.env.SDLC_PROJECT_DIR, '/tmp/proj');
  assert.equal(runReview({ path: '/x' }, () => ({ status: 1 })), false);
});

test('pass() reviews immediately after each drain', () => {
  const src = readFileSync(new URL('../agents/drain-supervisor.mjs', import.meta.url), 'utf8');
  const drainAt = src.indexOf('const ok = runDrain(p);');
  const reviewAt = src.indexOf('runReview(p)', drainAt);
  assert.ok(drainAt > 0 && reviewAt > drainAt && reviewAt - drainAt < 200, 'review must follow drain in pass()');
});

test('uid 0 -> refusal message naming the user-level unit; non-root -> null (RS-REQ-042)', () => {
  assert.match(rootRefusal(0), /rc 98.*systemctl --user/);
  assert.equal(rootRefusal(1000), null);
});

test('supervisor exits 98 as root, dry-run included, before logging a start', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const a of [[], ['--dry-run']]) {
    const r = spawnSync(process.execPath, [new URL('../agents/drain-supervisor.mjs', import.meta.url).pathname, ...a], { encoding: 'utf8', env: { ...process.env, SDLC_TEST_UID: '0' } });
    assert.equal(r.status, 98);
    assert.doesNotMatch(r.stdout, /starting/);
  }
});
