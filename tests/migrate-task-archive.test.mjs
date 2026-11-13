import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { migrateTaskArchive } from '../agents/migrate-task-archive.mjs';

let root, queue, legacy, state;
const hashDir = d => readdirSync(d).sort().map(f => f + createHash('sha1').update(readFileSync(join(d, f))).digest('hex')).join();
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rs-mig-'));
  queue = join(root, 'queue'); legacy = join(root, 'completed'); state = join(root, 'state');
  mkdirSync(queue); mkdirSync(legacy);
});
afterEach(() => { try { chmodSync(legacy, 0o755); } catch { /* best effort */ } rmSync(root, { recursive: true, force: true }); });
const run = (o = {}) => migrateTaskArchive({ queueDir: queue, legacyDir: legacy, stateDir: state, ...o });

describe('migrate-task-archive', () => {
  it('146 files: 144 no-op, 2 conflicts saved, queue unchanged', () => {
    for (let i = 0; i < 146; i++) {
      const f = `T-${i}.json`;
      writeFileSync(join(legacy, f), JSON.stringify({ id: i, status: 'completed' }));
      writeFileSync(join(queue, f), JSON.stringify({ id: i, status: 'completed', ...(i < 2 ? { note: 'diff' } : {}) }));
    }
    const before = hashDir(queue), legacyBefore = hashDir(legacy);
    const r = run();
    assert.equal(r.identical.length, 144);
    assert.deepEqual(r.conflicts, ['T-0.json', 'T-1.json']);
    assert.equal(r.restored.length, 0);
    assert.equal(hashDir(queue), before);
    assert.equal(hashDir(legacy), legacyBefore);
    assert.equal(readdirSync(join(state, 'migration/task-archive-conflicts')).length, 2);
  });

  it('restores missing files and is idempotent', () => {
    writeFileSync(join(legacy, 'A.json'), JSON.stringify({ id: 'A', status: 'completed' }));
    const r1 = run();
    assert.deepEqual(r1.restored, ['A.json']);
    assert.ok(JSON.parse(readFileSync(join(queue, 'A.json'), 'utf8')).archived_at);
    const snap = hashDir(queue);
    const r2 = run();
    assert.equal(r2.restored.length, 0);
    assert.equal(r2.conflicts.length, 0);
    assert.equal(r2.identical.length, 1);
    assert.equal(hashDir(queue), snap);
    assert.ok(r1.removeCommand.includes(legacy));
  });

  it('unreadable dir reports, writes nothing', { skip: process.getuid?.() === 0 }, () => {
    writeFileSync(join(legacy, 'A.json'), '{}');
    chmodSync(join(legacy, 'A.json'), 0o000);
    const r = run();
    chmodSync(join(legacy, 'A.json'), 0o644);
    assert.equal(r.unreadable, true);
    assert.equal(readdirSync(queue).length, 0);
    assert.equal(existsSync(state), false);
  });

  it('dry-run writes nothing', () => {
    writeFileSync(join(legacy, 'A.json'), '{}');
    writeFileSync(join(legacy, 'B.json'), '{"x":1}'); writeFileSync(join(queue, 'B.json'), '{"x":2}');
    const r = run({ dryRun: true });
    assert.deepEqual(r.restored, ['A.json']);
    assert.equal(r.conflicts.length, 1);
    assert.equal(readdirSync(queue).length, 1);
    assert.equal(existsSync(state), false);
  });
});
