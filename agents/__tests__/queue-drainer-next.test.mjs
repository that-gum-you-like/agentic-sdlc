import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const DRAINER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'queue-drainer.mjs');
let dir;
const put = (t) => writeFileSync(join(dir, 'tasks', 'queue', `${t.id}.json`),
  JSON.stringify({ title: t.id, description: '', ...t }));
const next = (...extra) => execFileSync('node', [DRAINER, 'next', ...extra],
  { encoding: 'utf8', env: { ...process.env, SDLC_PROJECT_DIR: dir } });

describe('queue-drainer next (CV-REQ-120)', () => {
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'qd-next-'));
    mkdirSync(join(dir, 'tasks', 'queue'), { recursive: true });
    mkdirSync(join(dir, 'agents'), { recursive: true });
    writeFileSync(join(dir, 'agents', 'project.json'), JSON.stringify({ name: 'fixture', agents: [] }));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('empty queue prints nothing and exits 0', () => {
    assert.equal(next(), '');
  });

  it('orders by priority then id; skips blocked and non-pending', () => {
    put({ id: 'T-2', status: 'pending', priority: 'HIGH' });
    put({ id: 'T-1', status: 'pending', priority: 'HIGH' });
    put({ id: 'T-0', status: 'pending', priority: 'LOW' });
    put({ id: 'T-9', status: 'pending', priority: 'CRITICAL', blockedBy: ['T-0'] });
    put({ id: 'T-8', status: 'completed', priority: 'CRITICAL' });
    assert.equal(JSON.parse(next()).id, 'T-1');
  });

  it('--exclude skips the listed ids', () => {
    assert.equal(JSON.parse(next('--exclude', 'T-1')).id, 'T-2');
    assert.equal(JSON.parse(next('--exclude', 'T-1,T-2')).id, 'T-0');
  });

  it('FIX tasks come first and are never excluded', () => {
    put({ id: 'FIX-5', status: 'pending', priority: 'LOW' });
    assert.equal(JSON.parse(next('--exclude', 'FIX-5')).id, 'FIX-5');
  });

  it('prints the full task object', () => {
    const t = JSON.parse(next());
    assert.equal(t.status, 'pending');
    assert.ok('title' in t);
  });
});
