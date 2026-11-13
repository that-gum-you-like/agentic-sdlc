import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { shouldNotifyOnce, shellEscapeDq } from '../agents/notify.mjs';

test('shouldNotifyOnce fires once per key within the window, again after it', () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'once-')), 's.json');
  const t0 = 1_000_000;
  assert.equal(shouldNotifyOnce('stale-claim:T1:a', { statePath, now: t0 }), true);
  assert.equal(shouldNotifyOnce('stale-claim:T1:a', { statePath, now: t0 + 60_000 }), false);
  assert.equal(shouldNotifyOnce('stale-claim:T1:a', { statePath, now: t0 + 120_000 }), false);
  assert.equal(shouldNotifyOnce('stale-claim:T2:a', { statePath, now: t0 + 60_000 }), true);
  assert.equal(shouldNotifyOnce('stale-claim:T1:b', { statePath, now: t0 + 60_000 }), true, 'new claim episode re-notifies');
  assert.equal(shouldNotifyOnce('stale-claim:T1:a', { statePath, now: t0 + 7 * 3600_000 }), true);
});

test('shellEscapeDq keeps backticks, $ and quotes intact through a shell', () => {
  const title = 'add `## Foo` and `bar` sections "q" $HOME \\ end';
  const out = execSync(`printf %s "${shellEscapeDq(title)}"`, { shell: '/bin/bash' }).toString();
  assert.equal(out, title);
});
