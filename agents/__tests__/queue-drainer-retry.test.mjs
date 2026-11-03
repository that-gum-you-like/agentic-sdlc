import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const DRAINER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'queue-drainer.mjs');

function fixture(task) {
  const dir = mkdtempSync(join(tmpdir(), 'qd-retry-'));
  mkdirSync(join(dir, 'agents'), { recursive: true });
  mkdirSync(join(dir, 'tasks/queue'), { recursive: true });
  writeFileSync(join(dir, 'agents/project.json'), JSON.stringify({ name: 't', notification: { provider: 'none' } }));
  writeFileSync(join(dir, 'tasks/queue', `${task.id}.json`), JSON.stringify(task));
  return dir;
}
const run = (dir, ...a) => spawnSync('node', [DRAINER, ...a, '--project-dir', dir], { encoding: 'utf8', env: { ...process.env, SDLC_PROJECT_DIR: dir } });
const read = (dir, id) => JSON.parse(readFileSync(join(dir, 'tasks/queue', `${id}.json`), 'utf8'));
const humans = (dir) => { const d = join(dir, 'tasks/human-queue'); return existsSync(d) ? readdirSync(d) : []; };

describe('registerFailure retry cap', () => {
  it('first two failures stay pending, third blocks with one human task', () => {
    const dir = fixture({ id: 'T1', title: 'x', status: 'in_progress', priority: 'LOW' });
    try {
      for (let i = 1; i <= 2; i++) {
        run(dir, 'complete', 'T1', 'failing');
        const t = read(dir, 'T1');
        assert.equal(t.status, 'pending');
        assert.equal(t.retryCount, i);
      }
      assert.equal(humans(dir).length, 0);
      run(dir, 'complete', 'T1', 'failing');
      const t = read(dir, 'T1');
      assert.equal(t.status, 'blocked');
      assert.equal(t.blockedReason, 'retry-cap');
      assert.equal(t.retryCount, 3);
      assert.equal(humans(dir).length, 1);
      run(dir, 'complete', 'T1', 'failing'); // replay on blocked task
      assert.equal(read(dir, 'T1').retryCount, 3);
      assert.equal(humans(dir).length, 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('stale-claim release counts once; replay does not double count', () => {
    const old = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const dir = fixture({ id: 'T2', title: 'x', status: 'in_progress', claimedBy: 'a', claimedAt: old, priority: 'LOW' });
    try {
      run(dir, 'release', 'T2');
      assert.equal(read(dir, 'T2').retryCount, 1);
      run(dir, 'release', 'T2');
      assert.equal(read(dir, 'T2').retryCount, 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('non-stale release does not count a failure', () => {
    const dir = fixture({ id: 'T3', title: 'x', status: 'in_progress', claimedBy: 'a', claimedAt: new Date().toISOString(), priority: 'LOW' });
    try {
      run(dir, 'release', 'T3');
      assert.equal(read(dir, 'T3').retryCount, undefined);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
