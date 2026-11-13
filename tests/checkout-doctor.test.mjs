import test from 'node:test';
import assert from 'node:assert/strict';
import { checkContainerMounts, diagnose, formatReport } from '../agents/checkout-doctor.mjs';

const HOME = '/home/tester';
const base = { home: HOME, checkouts: [`${HOME}/agentic-sdlc`] };
const ctr = (id, mounts) => ({ Id: id.padEnd(64, '0'), Name: `/hermes-${id}`, Mounts: mounts });

test('rw home mount reported', () => {
  const r = checkContainerMounts({ ...base, run: () => [ctr('a08d6519', [{ Source: HOME, Destination: '/workspace', RW: true }])] });
  assert.equal(r.exposed.length, 1);
  assert.equal(r.exposed[0].container, 'a08d65190000');
  assert.match(r.exposed[0].fix, /stop and recreate with a dedicated workspace/);
  assert.equal(r.exposed[0].source, HOME);
});
test('dedicated workspace mount clean', () => {
  const r = checkContainerMounts({ ...base, run: () => [ctr('3ea76145', [
    { Source: `${HOME}/.hermes/sandboxes/docker/x/workspace`, Destination: '/workspace', RW: true },
    { Source: HOME, Destination: '/ro', RW: false }]) ] });
  assert.equal(r.exposed.length, 0);
  assert.equal(r.containers.length, 1);
});
test('docker missing is a note', () => {
  const r = checkContainerMounts({ ...base, run: () => { throw new Error('spawn docker ENOENT'); } });
  assert.deepEqual(r.exposed, []);
  assert.match(r.notes[0], /docker unavailable/);
});
test('no containers is a note', () => {
  assert.match(checkContainerMounts({ ...base, run: () => [] }).notes[0], /no hermes containers/);
});

import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, lstatSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';


let repo;
const sh = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: 'pipe' });
function snapshot(dir) {
  const out = [];
  const walk = d => { for (const n of readdirSync(d).sort()) { const p = join(d, n); const st = lstatSync(p);
    if (n === '.git') continue; if (st.isDirectory()) walk(p); else out.push(p + createHash('sha1').update(readFileSync(p)).digest('hex')); } };
  walk(dir); return out.join('|');
}
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'rs-doc-'));
  sh('init', '-q', '-b', 'main');
  sh('config', 'user.email', 't@t'); sh('config', 'user.name', 't');
  mkdirSync(join(repo, 'agents'));
  writeFileSync(join(repo, 'agents/a.mjs'), 'x');
  sh('add', '-A'); sh('commit', '-qm', 'init');
  sh('update-ref', 'refs/remotes/origin/main', 'HEAD');
});
afterEach(() => { try { chmodSync(join(repo, 'locked'), 0o755); } catch { /* none */ } rmSync(repo, { recursive: true, force: true }); });

const me = process.getuid();
// ownership simulated: paths under these prefixes are "owned" by uid 0
const fakeFs = rootOwned => ({
  lstat: p => { const st = lstatSync(p); return { uid: rootOwned.some(r => p.startsWith(join(repo, r))) ? 0 : st.uid, isDirectory: () => st.isDirectory() }; },
  readdir: readdirSync,
});

describe('checkout-doctor', () => {
  it('clean tree exits 0 with no findings', () => {
    const r = diagnose({ repo, uid: me });
    assert.equal(r.findings, 0);
    assert.equal(r.branch, 'main');
    assert.equal(r.behind, 0);
    assert.match(formatReport(r), /No findings/);
  });

  it('root-owned dir and untracked secrets.mjs reported with owner and command', () => {
    mkdirSync(join(repo, 'tasks/completed'), { recursive: true });
    writeFileSync(join(repo, 'tasks/completed/x.json'), '{}');
    writeFileSync(join(repo, 'agents/secrets.mjs'), 's');
    const r = diagnose({ repo, uid: me, fs: fakeFs(['tasks/completed', 'agents/secrets.mjs']), passwdText: `root:x:0:0::/root:/bin/sh\nbob:x:${me}:${me}::/h:/bin/sh\n` });
    const paths = r.foreign.map(f => f.path).sort();
    assert.deepEqual(paths, ['agents/secrets.mjs', 'tasks/completed']);
    assert.equal(r.foreign[0].owner, 'root');
    assert.match(r.foreign[0].command, /^sudo chown -R bob:bob /);
    assert.ok(r.untracked.includes('agents/secrets.mjs'));
    assert.ok(r.findings >= 2);
    assert.match(formatReport(r), /human fix: sudo chown/);
  });

  it('never modifies anything (fixture hash before/after)', () => {
    writeFileSync(join(repo, 'agents/a.mjs'), 'changed');
    writeFileSync(join(repo, 'new.txt'), 'n');
    const before = snapshot(repo), idx = readFileSync(join(repo, '.git/index')).toString('hex');
    diagnose({ repo, uid: me });
    assert.equal(snapshot(repo), before);
    assert.equal(readFileSync(join(repo, '.git/index')).toString('hex'), idx);
  });

  it('reports tracked modifications and untracked', () => {
    writeFileSync(join(repo, 'agents/a.mjs'), 'changed');
    writeFileSync(join(repo, 'new.txt'), 'n');
    const r = diagnose({ repo, uid: me });
    assert.deepEqual(r.trackedModified, ['agents/a.mjs']);
    assert.deepEqual(r.untracked, ['new.txt']);
  });

  it('unreadable path reported', { skip: me === 0 }, () => {
    mkdirSync(join(repo, 'locked')); writeFileSync(join(repo, 'locked/f'), '1'); chmodSync(join(repo, 'locked'), 0o000);
    const r = diagnose({ repo, uid: me });
    assert.ok(r.unreadable.some(u => u.path === 'locked'));
    assert.ok(r.findings > 0);
  });
});
