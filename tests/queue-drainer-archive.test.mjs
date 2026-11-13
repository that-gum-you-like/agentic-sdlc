/**
 * RS-101/RS-102 — archive stamps archived_at in place; readers honour it.
 * Run: node --test tests/queue-drainer-archive.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DRAINER = resolve(here, '../agents/queue-drainer.mjs');
const fileBased = await import('../agents/adapters/orchestration/file-based.mjs');

let proj;
const q = () => join(proj, 'tasks/queue');
function put(id, extra = {}) {
  writeFileSync(join(q(), `${id}.json`), JSON.stringify({ id, title: id, status: 'pending', kind: 'code', ...extra }, null, 2));
}
const read = id => JSON.parse(readFileSync(join(q(), `${id}.json`), 'utf8'));
const run = (...args) => execFileSync(process.execPath, [DRAINER, ...args], {
  encoding: 'utf8', env: { ...process.env, SDLC_PROJECT_DIR: proj },
});

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), 'rs-arch-'));
  mkdirSync(join(proj, 'agents'), { recursive: true });
  mkdirSync(q(), { recursive: true });
  writeFileSync(join(proj, 'agents/project.json'), JSON.stringify({ name: 'fx', projectDir: proj, appDir: '.', testCmd: 'true', agents: [] }));
});
afterEach(() => rmSync(proj, { recursive: true, force: true }));

describe('RS-101 archive in place', () => {
  it('3 completed + 2 pending -> 3 stamped, 0 moved, no completed dir', () => {
    for (const id of ['A', 'B', 'C']) put(id, { status: 'completed' });
    for (const id of ['D', 'E']) put(id);
    run('archive');
    assert.equal(readdirSync(q()).length, 5);
    for (const id of ['A', 'B', 'C']) assert.ok(read(id).archived_at);
    for (const id of ['D', 'E']) assert.equal(read(id).archived_at, undefined);
    assert.equal(existsSync(join(proj, 'tasks/completed')), false);
  });

  it('re-run does not restamp', () => {
    put('A', { status: 'completed', archived_at: '2026-01-01T00:00:00.000Z' });
    run('archive');
    assert.equal(read('A').archived_at, '2026-01-01T00:00:00.000Z');
    run('archive');
    assert.equal(read('A').archived_at, '2026-01-01T00:00:00.000Z');
  });

  it('root-owned queue reports and writes nothing', () => {
    put('A', { status: 'completed' });
    let err = '';
    try {
      execFileSync(process.execPath, [DRAINER, 'archive'], {
        encoding: 'utf8', stdio: 'pipe', env: { ...process.env, SDLC_PROJECT_DIR: proj, SDLC_TEST_UID: String(process.getuid() + 1) },
      });
    } catch (e) { err = String(e.stderr); assert.equal(e.status, 1); }
    assert.match(err, /owned by uid .*sudo chown/);
    assert.equal(read('A').archived_at, undefined);
  });

  it('default status hides archived, --all shows them', () => {
    put('A', { status: 'completed', archived_at: '2026-01-01T00:00:00.000Z' });
    put('B', { status: 'completed' });
    assert.match(run('status'), /Completed:\s+1 \(\+ 1 archived\)/);
    assert.match(run('status', '--all'), /Completed:\s+2 \(\+ 1 archived\)/);
  });
});

describe('RS-102 readers', () => {
  it('dependency on archived task is satisfied', () => {
    put('A', { status: 'completed', archived_at: '2026-01-01T00:00:00.000Z' });
    put('B', { blockedBy: ['A'] });
    const next = JSON.parse(run('next'));
    assert.equal(next.id, 'B');
  });

  it('counts = queue-archived + legacy', () => {
    put('A', { status: 'completed', archived_at: 'x' });
    const legacy = join(proj, 'tasks/completed');
    mkdirSync(legacy);
    writeFileSync(join(legacy, 'old1.json'), '{}');
    writeFileSync(join(legacy, 'old2.json'), '{}');
    assert.equal(fileBased.loadCompletedCount(legacy, q()), 3);
    assert.equal(fileBased.loadArchivedTasks(q(), legacy).length, 3);
  });

  it('no writer to completedDir', () => {
    for (const f of ['agents/queue-drainer.mjs', 'agents/adapters/orchestration/file-based.mjs', 'agents/capability-monitor.mjs']) {
      const src = readFileSync(resolve(here, '..', f), 'utf8');
      assert.doesNotMatch(src, /renameSync|mkdirSync\(completedDir|writeFileSync\([^)]*completedDir/, f);
    }
  });
});
