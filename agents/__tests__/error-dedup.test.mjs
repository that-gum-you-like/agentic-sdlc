/**
 * error-dedup.test.mjs — Curriculum Phase 5: error deduplication by hash signature.
 *
 * notify.mjs must give the same normalized error the same signature, count
 * occurrences in pm/error-signatures.json, and suppress duplicate
 * failure-class notifications inside the suppression window.
 *
 * Run with:
 *   node --test agents/__tests__/error-dedup.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');
const TMP_PROJECT = join(tmpdir(), `sdlc-error-dedup-test-${process.pid}`);

function runInTempProject(script) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, SDLC_PROJECT_DIR: TMP_PROJECT },
  });
}

describe('notify — error signature + dedup (curriculum Ph5)', () => {
  before(() => {
    mkdirSync(join(TMP_PROJECT, 'agents'), { recursive: true });
    writeFileSync(join(TMP_PROJECT, 'agents', 'project.json'), JSON.stringify({
      name: 'dedup-fixture', projectDir: TMP_PROJECT, appDir: '.', testCmd: 'true',
      agents: ['tester'],
      notification: { provider: 'none', triggers: { highSeverityFailure: true } },
    }));
  });

  after(() => {
    rmSync(TMP_PROJECT, { recursive: true, force: true });
  });

  it('errorSignature is stable across volatile details (paths, numbers, hashes, timestamps)', () => {
    const out = runInTempProject(`
      import { errorSignature } from ${JSON.stringify(join(AGENTS_DIR, 'notify.mjs'))};
      const a = errorSignature('Deploy failed at /home/bryce/app/dist/main.js line 412 (commit 9ff710a2bc1) 2026-07-06T01:02:03Z');
      const b = errorSignature('Deploy failed at /var/ci/build/other.js line 7 (commit a6be191ffff) 2026-07-07T09:08:07Z');
      const c = errorSignature('Totally different failure: tests timed out');
      console.log(JSON.stringify({ same: a === b, different: a !== c, len: a.length }));
    `);
    const r = JSON.parse(out.trim().split('\n').pop());
    assert.equal(r.same, true, 'volatile details must not change the signature');
    assert.equal(r.different, true, 'different errors get different signatures');
    assert.equal(r.len, 12);
  });

  it('recordErrorOccurrence counts occurrences and suppresses repeats inside the window', () => {
    const out = runInTempProject(`
      import { recordErrorOccurrence } from ${JSON.stringify(join(AGENTS_DIR, 'notify.mjs'))};
      const first = recordErrorOccurrence('Build exploded: OOM in worker 3');
      const second = recordErrorOccurrence('Build exploded: OOM in worker 7');
      console.log(JSON.stringify({ first, second }));
    `);
    const r = JSON.parse(out.trim().split('\n').pop());
    assert.equal(r.first.suppressed, false, 'first occurrence surfaces');
    assert.equal(r.second.suppressed, true, 'repeat inside the window is suppressed');
    assert.equal(r.second.count, 2);
    assert.equal(r.first.sig, r.second.sig);

    const ledger = JSON.parse(readFileSync(join(TMP_PROJECT, 'pm', 'error-signatures.json'), 'utf8'));
    assert.equal(ledger[r.first.sig].count, 2);
    assert.ok(ledger[r.first.sig].sample.includes('Build exploded'));
  });

  it('triggerNotification suppresses duplicate failure-class notifications', () => {
    const out = runInTempProject(`
      import { triggerNotification } from ${JSON.stringify(join(AGENTS_DIR, 'notify.mjs'))};
      const a = triggerNotification('highSeverityFailure', 'Smoke test failed on step 4 of 9');
      const b = triggerNotification('highSeverityFailure', 'Smoke test failed on step 8 of 9');
      console.log(JSON.stringify({ a: a !== false, b: b !== false }));
    `);
    const r = JSON.parse(out.trim().split('\n').pop());
    assert.equal(r.b, false, 'the duplicate must be suppressed (returns false)');
    assert.match(out, /duplicate highSeverityFailure suppressed/);
  });

  it('non-failure triggers are never dedup-suppressed', () => {
    const src = readFileSync(resolve(AGENTS_DIR, 'notify.mjs'), 'utf8');
    assert.ok(/FAILURE_TRIGGERS\s*=\s*new Set\(\[/.test(src), 'dedup applies to an explicit failure-trigger set only');
    assert.ok(!/FAILURE_TRIGGERS[^\n]*deployComplete/.test(src), 'success notifications must not be suppressed');
  });
});
